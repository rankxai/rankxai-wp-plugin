#!/usr/bin/env node
/**
 * Plan 80 Phase 6 — redirects, against a real WordPress.
 *
 * Run:  node probe/verify-redirects.mjs      (wp-env must be running)
 *
 * Self-provisioning: it makes its own application password, a subscriber and
 * an editor, records which plugins and Rank Math settings the rig had, and puts
 * all of it back, asserting the cleanup.
 *
 * What it proves, backend by backend:
 *
 *   A  our own store — create, list, follow, hits, duplicate, shape refusals,
 *      capability refusals, delete, and the source 404s again afterwards
 *   B  the 404-only rule — a rule planted for a LIVE page never fires, and
 *      core's own 404 guess still wins over a rule we planted for it
 *   C  Rank Math — ready only with its setup done and its module on; refused
 *      otherwise with nothing written; create, follow, hits, delete
 *   D  the Redirection plugin is REPORTED and never written through here
 *   E  cache purges are requested for the right URL, on create and delete
 *   F  Rank Math's 404 Monitor log is read with its hit counts
 *   G  the settings screen lists our redirects, and its Remove button works
 *      only with a real nonce and `manage_options`
 *   H  uninstall removes our store and leaves Rank Math's redirects alone
 */

import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const MARK = `rx-redirect-probe-${Date.now()}`

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m) => (cond ? ok(m) : bad(m))

/** wp-cli inside the rig. Throws: a fixture that was not made proves nothing. */
function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  }).trim()
}
/** wp-cli that may legitimately fail (an unset option). */
function wpSoft(...args) {
  try { return wp(...args) } catch { return null }
}
function evalPhp(code) {
  return wp('eval', code)
}

/** Retry a TRANSPORT error only; a status is a result and is never retried. */
async function http(url, init = {}, attempt = 0) {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (attempt >= 2) throw e
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    return http(url, init, attempt + 1)
  }
}

let AUTH = ''
const api = async (route, init = {}, auth = AUTH, query = '') => {
  const res = await http(`${BASE}/?rest_route=${encodeURIComponent(route)}${query}`, {
    ...init,
    headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  let json = null
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json }
}

/** One hop, no following, so the redirect itself is what we read. */
async function follow(path) {
  const res = await http(`${BASE}${path}`, { redirect: 'manual' })
  await res.arrayBuffer().catch(() => undefined)
  return { status: res.status, location: res.headers.get('location') ?? '', by: res.headers.get('x-redirect-by') ?? '' }
}

const create = (body) => api('/rankxai/v1/redirects', { method: 'POST', body: JSON.stringify(body) })
const list = (from = '') => api('/rankxai/v1/redirects', { method: 'GET' }, AUTH, from ? `&from=${encodeURIComponent(from)}` : '')
const remove = (backend, id) => api(`/rankxai/v1/redirects/${backend}/${id}`, { method: 'DELETE' })

const RM_CONFIG = 'echo json_encode(array("skip" => get_option("rank_math_registration_skip"), "modules" => get_option("rank_math_modules")));'

async function run() {
  // ── Provision ───────────────────────────────────────────────────────────
  const originalPlugins = JSON.parse(wp('plugin', 'list', '--status=active', '--field=name', '--format=json'))
  const originalRm = JSON.parse(evalPhp(RM_CONFIG))
  const appPass = wp('user', 'application-password', 'create', 'admin', MARK, '--porcelain')
  AUTH = 'Basic ' + Buffer.from(`admin:${appPass}`).toString('base64')
  const editorId = wp('user', 'create', `${MARK}-ed`, `${MARK}-ed@example.com`, '--role=editor', '--porcelain')
  const editorPass = wp('user', 'application-password', 'create', editorId, MARK, '--porcelain')
  const EDITOR = 'Basic ' + Buffer.from(`${MARK}-ed:${editorPass}`).toString('base64')
  const subscriberId = wp('user', 'create', `${MARK}-sub`, `${MARK}-sub@example.com`, '--role=subscriber', '--user_pass=probe-sub-pass', '--porcelain')
  wp('option', 'delete', 'rankxai_redirects')
  wp('option', 'delete', 'rankxai_redirect_hits')
  wpSoft('option', 'delete', 'rankxai_probe_purged')
  wp('option', 'update', 'rankxai_probe_fake_litespeed', '1')
  wp('rewrite', 'structure', '/%postname%/', '--hard')

  try {
    // Start from NO redirect manager.
    wpSoft('plugin', 'deactivate', 'redirection', 'seo-by-rank-math', 'wordpress-seo', 'wp-seopress', 'all-in-one-seo-pack', 'autodescription')

    const livePage = await follow('/sample-page/')
    check(livePage.status === 200, `CONTROL — /sample-page/ is a live page on this rig (${livePage.status})`)
    const missing = await follow(`/${MARK}-gone`)
    check(missing.status === 404, `CONTROL — /${MARK}-gone is a 404 before any redirect (${missing.status})`)

    // ── A  our own store ──────────────────────────────────────────────────
    console.log('\n== A  our own store ==')
    const st0 = await list()
    check(st0.status === 200 && st0.json?.managers?.rank_math?.active === false && st0.json?.managers?.redirection?.active === false,
      'no redirect manager is reported on a bare site')
    check(st0.json?.store?.max === 500 && st0.json?.homePath === '/', `store cap and home path reported (${st0.json?.store?.max}, ${st0.json?.homePath})`)

    const from = `/${MARK}-gone`
    const c1 = await create({ backend: 'own_store', from, to: '/sample-page/', code: 301 })
    check(c1.status === 200 && c1.json?.item?.backend === 'own_store' && c1.json?.item?.from === from, 'create on our store returns the STORED item')
    const id = c1.json?.item?.id ?? ''
    const l1 = await list(from)
    check(l1.json?.items?.length === 1 && l1.json.items[0].to === '/sample-page/', 'it reads back from the list, filtered by source')

    const f1 = await follow(from)
    check(f1.status === 301 && f1.location === '/sample-page/' && f1.by === 'RankX AI', `it serves: ${f1.status} → ${f1.location} (${f1.by})`)
    const f1b = await follow(`${from}/`)
    check(f1b.status === 301, 'a trailing slash on the request still matches')
    const l1b = await list(from)
    check(l1b.json?.items?.[0]?.hits === 2 && l1b.json.items[0].lastHit !== '', `hits are counted (${l1b.json?.items?.[0]?.hits})`)

    // A non-ASCII address. The first build ran the request path through
    // `sanitize_text_field`, which strips percent-encoded octets, so this was
    // stored correctly and never matched.
    const encodedFrom = `/caf%C3%A9-${MARK}`
    const ce = await create({ backend: 'own_store', from: encodedFrom, to: '/sample-page/', code: 301 })
    check(ce.status === 200, 'a percent-encoded source is stored')
    const fe = await follow(encodedFrom)
    check(fe.status === 301 && fe.by === 'RankX AI', `and it SERVES when requested encoded (${fe.status})`)
    await remove('own_store', ce.json?.item?.id ?? 'x')

    const dup = await create({ backend: 'own_store', from, to: '/', code: 301 })
    check(dup.status === 409 && dup.json?.code === 'rankxai_redirect_exists', 'a second redirect for the same source is refused 409')

    const SHAPES = [
      ['//evil.example/x', 'protocol-relative source'],
      ['http://evil.example/x', 'absolute source'],
      ['/has space', 'source with a space'],
      ['/q?x=1', 'source with a query'],
      [`/${String.fromCharCode(92)}evil`, 'source with a backslash'],
    ]
    for (const [bad0, label] of SHAPES) {
      const r = await create({ backend: 'own_store', from: bad0, to: '/', code: 301 })
      check(r.status === 400, `refused 400: ${label}`)
    }
    const badTo = await create({ backend: 'own_store', from: `/${MARK}-x`, to: 'https://evil.example/', code: 301 })
    check(badTo.status === 400, 'refused 400: an absolute target (targets are root-relative only)')
    const badCode = await create({ backend: 'own_store', from: `/${MARK}-x`, to: '/', code: 307 })
    check(badCode.status === 400, 'refused 400: a status other than 301/302')
    const badBackend = await create({ backend: 'redirection', from: `/${MARK}-x`, to: '/', code: 301 })
    check(badBackend.status === 400, 'refused 400: the Redirection plugin is never written through this route')

    const asEditor = await api('/rankxai/v1/redirects', { method: 'GET' }, EDITOR)
    check(asEditor.status === 403, `an editor is refused (${asEditor.status})`)
    const anon = await api('/rankxai/v1/redirects', { method: 'GET' }, '')
    check(anon.status === 401, `an anonymous request is refused (${anon.status})`)

    // ── E  purge, on create ───────────────────────────────────────────────
    console.log('\n== E  page-cache purge ==')
    check(Array.isArray(c1.json?.purged) && c1.json.purged.includes('litespeed'), `create reported the cache it asked (${JSON.stringify(c1.json?.purged)})`)
    const purgedOnCreate = JSON.parse(wpSoft('option', 'get', 'rankxai_probe_purged', '--format=json') ?? '[]')
    check(purgedOnCreate.some((u) => u.endsWith(from)), `the purge named the source URL (${purgedOnCreate.at(-1)})`)
    const p1 = await api('/rankxai/v1/redirects/purge', { method: 'POST', body: JSON.stringify({ path: '/anything' }) })
    check(p1.status === 200 && p1.json?.purged?.includes('litespeed'), 'the purge-only route works for a redirect written elsewhere')

    // ── A (cont.)  delete ─────────────────────────────────────────────────
    const d1 = await remove('own_store', id)
    check(d1.status === 200 && d1.json?.from === from && d1.json?.remaining?.length === 0, 'delete returns what REMAINS for that source: nothing')
    check(d1.json?.purged?.includes('litespeed'), 'and delete purges too')
    const f1c = await follow(from)
    check(f1c.status === 404, `after delete the source 404s again (${f1c.status})`)
    const d1b = await remove('own_store', id)
    check(d1b.status === 404, 'deleting it again is a 404, not a pretend success')
    const hitsAfter = JSON.parse(wpSoft('option', 'get', 'rankxai_redirect_hits', '--format=json') ?? '{}')
    check(!(id in hitsAfter), 'its hit counter went with it')

    // ── B  404-only, and core first ───────────────────────────────────────
    console.log('\n== B  the 404-only rule ==')
    // Planted directly, bypassing the platform's refusal of a live source, to
    // prove the SERVER would not act on it even if one got through.
    evalPhp(`update_option("rankxai_redirects", array("live1" => array("from" => "/sample-page", "to" => "/", "code" => 301), "guess1" => array("from" => "/sample-pag", "to" => "/", "code" => 301)), false);`)
    const liveAfter = await follow('/sample-page/')
    check(liveAfter.status === 200, `a rule planted for a LIVE page never fires (${liveAfter.status})`)
    const guess = await follow('/sample-pag')
    check(guess.status === 301 && guess.location.endsWith('/sample-page/') && guess.by !== 'RankX AI',
      `core's own 404 guess still wins (${guess.status} → ${guess.location}, by "${guess.by || 'WordPress'}")`)
    wp('option', 'delete', 'rankxai_redirects')

    // ── C  Rank Math ──────────────────────────────────────────────────────
    console.log('\n== C  Rank Math ==')
    wp('plugin', 'activate', 'seo-by-rank-math')
    wpSoft('option', 'delete', 'rank_math_registration_skip')
    const rmNoSetup = await list()
    check(rmNoSetup.json?.managers?.rank_math?.active === true && rmNoSetup.json.managers.rank_math.reason === 'setup_incomplete',
      `setup not done → reason setup_incomplete (${rmNoSetup.json?.managers?.rank_math?.reason})`)

    wp('option', 'update', 'rank_math_registration_skip', '1')
    evalPhp('\\RankMath\\Helper::update_modules(array("redirections" => "off"));')
    const rmOff = await list()
    check(rmOff.json?.managers?.rank_math?.reason === 'module_off' && rmOff.json.managers.rank_math.ready === false,
      `module off → reason module_off (${rmOff.json?.managers?.rank_math?.reason})`)
    const rmOffCreate = await create({ backend: 'rank_math', from: `/${MARK}-rm`, to: '/sample-page/', code: 301 })
    check(rmOffCreate.status === 409 && rmOffCreate.json?.code === 'rankxai_redirect_unavailable', 'a write to Rank Math with its module off is refused 409')
    // Rank Math's own `update_modules` can leave gaps in the keys, and PHP then
    // encodes the list as an OBJECT — read the values either way.
    const modulesAfterRefusal = Object.values(JSON.parse(evalPhp('echo json_encode(get_option("rank_math_modules"));')) ?? {})
    check(!modulesAfterRefusal.includes('redirections'), 'and the refusal did NOT switch the module on')
    check(evalPhp('echo count(get_option("rankxai_redirects", array()));') === '0', 'and nothing fell back into our own store')

    evalPhp('\\RankMath\\Helper::update_modules(array("redirections" => "on", "404-monitor" => "on"));')
    const rmOn = await list()
    check(rmOn.json?.managers?.rank_math?.ready === true, 'setup done + module on → ready')

    const rmFrom = `/${MARK}-rm`
    const rc = await create({ backend: 'rank_math', from: rmFrom, to: '/sample-page/', code: 301 })
    check(rc.status === 200 && rc.json?.item?.backend === 'rank_math' && rc.json.item.from === rmFrom, 'create in Rank Math returns the stored row')
    const rmId = rc.json?.item?.id ?? ''
    const inRm = evalPhp(`$r = \\RankMath\\Redirections\\DB::get_redirection_by_id(${Number(rmId) || 0}); echo $r ? $r["url_to"] : "none";`)
    check(inRm.endsWith('/sample-page/'), `it is in Rank Math's OWN table, read through Rank Math (${inRm})`)
    const rf = await follow(rmFrom)
    check(rf.status === 301 && rf.by === 'Rank Math' && rf.location.endsWith('/sample-page/'), `Rank Math serves it (${rf.status}, ${rf.by})`)
    const rl = await list(rmFrom)
    check(rl.json?.items?.some((i) => i.backend === 'rank_math' && i.hits >= 1), `Rank Math's own hit count is reported (${rl.json?.items?.[0]?.hits})`)

    // ── F  Rank Math's 404 log ────────────────────────────────────────────
    console.log('\n== F  visitor 404s ==')
    const missPath = `/${MARK}-visitor-miss`
    await follow(missPath)
    await follow(missPath)
    const nf = await api('/rankxai/v1/redirects/not-found', { method: 'GET' }, AUTH, '&limit=50')
    const row = nf.json?.items?.find((i) => i.path === missPath)
    check(nf.json?.available === true && nf.json.source === 'rank_math', 'the 404 Monitor log is available')
    check(row && row.hits >= 2, `a missing page visited twice shows ${row?.hits ?? 0} hits`)

    const rd = await remove('rank_math', rmId)
    check(rd.status === 200 && rd.json?.remaining?.length === 0, 'delete from Rank Math leaves nothing for that source')
    const rf2 = await follow(rmFrom)
    check(rf2.status === 404, `and the source 404s again (${rf2.status})`)

    // ── D  Redirection is reported, not written ───────────────────────────
    console.log('\n== D  the Redirection plugin ==')
    wp('plugin', 'activate', 'redirection')
    const withRed = await list()
    check(withRed.json?.managers?.redirection?.active === true && typeof withRed.json.managers.redirection.version === 'string',
      `the Redirection plugin is reported (${withRed.json?.managers?.redirection?.version})`)
    wp('plugin', 'deactivate', 'redirection')

    // Free AIOSEO has NO redirect manager and creates no redirect tables, so it
    // must not be reported as one — a false positive would refuse a site that
    // should get our own store.
    wp('plugin', 'deactivate', 'seo-by-rank-math')
    wp('plugin', 'activate', 'all-in-one-seo-pack')
    const withAioseo = await list()
    check(withAioseo.json?.managers?.aioseo?.active === false, 'free AIOSEO is not mistaken for a redirect manager')
    wp('plugin', 'deactivate', 'all-in-one-seo-pack')

    // ── G  the settings screen ────────────────────────────────────────────
    console.log('\n== G  the settings screen ==')
    wpSoft('plugin', 'deactivate', 'seo-by-rank-math')
    const own = await create({ backend: 'own_store', from: `/${MARK}-screen`, to: '/sample-page/', code: 301 })
    const ownId = own.json?.item?.id ?? ''
    check(own.status === 200, 'CONTROL — a redirect exists for the screen to show')

    const jar = await login('admin', 'password')
    const screen = await (await http(`${BASE}/wp-admin/admin.php?page=rankxai-settings`, { headers: { Cookie: jar } })).text()
    check(screen.includes(`/${MARK}-screen`), 'the settings screen lists our redirect')
    const NONCE_RE = new RegExp('name="rankxai_redirect_id" value="' + ownId + '"[^]*?name="_wpnonce" value="([a-f0-9]+)"')
    const nonce = NONCE_RE.exec(screen)?.[1] ?? ''
    check(nonce.length > 0, 'CONTROL — the Remove form carries a nonce')

    const forged = await adminPost(jar, { action: 'rankxai_delete_redirect', rankxai_redirect_id: ownId, _wpnonce: 'deadbeef00' })
    check(forged.status === 403 && (await list(`/${MARK}-screen`)).json?.items?.length === 1, `a forged nonce is refused (${forged.status}) and the redirect stays`)

    const subJar = await login(`${MARK}-sub`, 'probe-sub-pass')
    const asSub = await adminPost(subJar, { action: 'rankxai_delete_redirect', rankxai_redirect_id: ownId, _wpnonce: nonce })
    check(asSub.status === 403 && (await list(`/${MARK}-screen`)).json?.items?.length === 1, `a subscriber is refused (${asSub.status}) and the redirect stays`)

    const real = await adminPost(jar, { action: 'rankxai_delete_redirect', rankxai_redirect_id: ownId, _wpnonce: nonce })
    check(real.status === 302 && (real.location ?? '').includes('rankxai-redirect-removed=1'), `Remove redirects back with a notice (${real.status})`)
    check((await list(`/${MARK}-screen`)).json?.items?.length === 0, 'and the redirect is gone')

    // ── H  uninstall ──────────────────────────────────────────────────────
    console.log('\n== H  uninstall ==')
    wp('plugin', 'activate', 'seo-by-rank-math')
    const keepRm = await create({ backend: 'rank_math', from: `/${MARK}-keep`, to: '/sample-page/', code: 301 })
    await create({ backend: 'own_store', from: `/${MARK}-drop`, to: '/sample-page/', code: 301 })
    check(keepRm.status === 200, 'CONTROL — one redirect in Rank Math and one in our store before uninstall')
    evalPhp('define("WP_UNINSTALL_PLUGIN", true); include WP_PLUGIN_DIR . "/rankxai-wp-plugin/uninstall.php";')
    check(wpSoft('option', 'get', 'rankxai_redirects') === null && wpSoft('option', 'get', 'rankxai_redirect_hits') === null, 'uninstall removed our store and its hit counts')
    const stillInRm = evalPhp(`$r = \\RankMath\\Redirections\\DB::get_redirection_by_id(${Number(keepRm.json?.item?.id) || 0}); echo $r ? "yes" : "no";`)
    check(stillInRm === 'yes', 'and left the redirect it had added to Rank Math, which is Rank Math’s data')
    evalPhp(`\\RankMath\\Redirections\\DB::delete(array(${Number(keepRm.json?.item?.id) || 0}));`)
  } finally {
    // ── Restore ───────────────────────────────────────────────────────────
    wpSoft('option', 'delete', 'rankxai_probe_fake_litespeed')
    wpSoft('option', 'delete', 'rankxai_probe_purged')
    wpSoft('option', 'delete', 'rankxai_redirects')
    wpSoft('option', 'delete', 'rankxai_redirect_hits')
    wpSoft('user', 'delete', editorId, '--yes')
    wpSoft('user', 'delete', subscriberId, '--yes')
    wpSoft('user', 'application-password', 'delete', 'admin', '--all')
    const now = JSON.parse(wp('plugin', 'list', '--status=active', '--field=name', '--format=json'))
    const toActivate = originalPlugins.filter((p) => !now.includes(p))
    const toDeactivate = now.filter((p) => !originalPlugins.includes(p))
    if (toActivate.length) wpSoft('plugin', 'activate', ...toActivate)
    if (toDeactivate.length) wpSoft('plugin', 'deactivate', ...toDeactivate)
    if (originalRm.skip) wpSoft('option', 'update', 'rank_math_registration_skip', String(originalRm.skip))
    else wpSoft('option', 'delete', 'rank_math_registration_skip')
    if (Array.isArray(originalRm.modules)) evalPhp(`update_option("rank_math_modules", json_decode('${JSON.stringify(originalRm.modules)}', true));`)
  }

  const after = JSON.parse(wp('plugin', 'list', '--status=active', '--field=name', '--format=json'))
  check(JSON.stringify([...after].sort()) === JSON.stringify([...originalPlugins].sort()), 'CLEANUP — the rig has exactly the plugins it started with')
  check(wpSoft('user', 'get', `${MARK}-ed`) === null && wpSoft('user', 'get', `${MARK}-sub`) === null, 'CLEANUP — the probe users are gone')

  console.log(`\n================================================\nPASSED ${pass}   FAILED ${fail}`)
  process.exit(fail === 0 ? 0 : 1)
}

/** Log in through wp-login.php and return the cookie header. */
async function login(user, password) {
  const body = new URLSearchParams({ log: user, pwd: password, 'wp-submit': 'Log In', testcookie: '1' })
  const res = await http(`${BASE}/wp-login.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body,
  })
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
  if (!cookies.some((c) => c.startsWith('wordpress_logged_in_'))) throw new Error(`login failed for ${user} (${res.status})`)
  return cookies.join('; ')
}

/** Submit an admin-post form without following the redirect. */
async function adminPost(cookie, fields) {
  const res = await http(`${BASE}/wp-admin/admin-post.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams(fields),
  })
  await res.arrayBuffer().catch(() => undefined)
  return { status: res.status, location: res.headers.get('location') }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
