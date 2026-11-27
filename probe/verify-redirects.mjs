#!/usr/bin/env node
/**
 * Checks redirects in the plugin's own store and through Rank Math, the 404-only
 * rule, cache purges, the settings screen and uninstall; that the connection can
 * only read redirects; and that the site's administrator, signed in to wp-admin,
 * adds and removes them through the browser-only routes.
 *
 * Run:  node probe/verify-redirects.mjs      (wp-env must be running)
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

/** Retry a transport error only, never an HTTP status. */
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

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64')
/** A fixture redirect, written through the plugin's own PHP: no remote route writes one any more. */
function create(body) {
  const out = JSON.parse(evalPhp(`$b = json_decode( base64_decode( '${b64(body)}' ), true ); $r = RankXAI_Redirects::create( $b['backend'], $b['from'], $b['to'], (int) $b['code'] ); $p = '' === $r['error'] ? RankXAI_Redirects::purge( RankXAI_Redirects::normalise( $b['from'] ) ) : array(); echo wp_json_encode( array( 'item' => $r['item'], 'error' => $r['error'], 'purged' => $p ) );`))
  return { status: out.error === '' ? 200 : 409, json: { item: out.item, code: out.error ? `rankxai_redirect_${out.error}` : null, purged: out.purged } }
}
const list = (from = '') => api('/rankxai/v1/redirects', { method: 'GET' }, AUTH, from ? `&from=${encodeURIComponent(from)}` : '')
/** Remove a fixture through the plugin's own PHP, as `create`. */
function remove(backend, id) {
  const out = JSON.parse(evalPhp(`$r = RankXAI_Redirects::delete( '${backend}', '${id}' ); $p = '' === $r['error'] && '' !== $r['from'] ? RankXAI_Redirects::purge( $r['from'] ) : array(); echo wp_json_encode( array( 'from' => $r['from'], 'error' => $r['error'], 'purged' => $p, 'remaining' => '' === $r['from'] ? array() : RankXAI_Redirects::items( $r['from'] )['items'] ) );`))
  return { status: out.error === '' ? 200 : out.error === 'not_found' ? 404 : 409, json: out }
}

/** A cookie-signed-in browser call to a plugin route, with the REST nonce a wp-admin page carries. */
async function browser(cookie, route, body, nonce) {
  const res = await http(`${BASE}/?rest_route=${encodeURIComponent(route)}`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(nonce ? { 'X-WP-Nonce': nonce } : {}) },
    body: JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json }
}
/** The REST nonce wp-admin hands a signed-in user. */
async function restNonce(cookie) {
  const res = await http(`${BASE}/wp-admin/admin-ajax.php?action=rest-nonce`, { headers: { Cookie: cookie } })
  return (await res.text()).trim()
}

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
    // Start with no redirect manager.
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

    // A non-ASCII address: `sanitize_text_field` would strip its percent-encoded
    // octets, so it would be stored but never matched.
    const encodedFrom = `/caf%C3%A9-${MARK}`
    const ce = await create({ backend: 'own_store', from: encodedFrom, to: '/sample-page/', code: 301 })
    check(ce.status === 200, 'a percent-encoded source is stored')
    const fe = await follow(encodedFrom)
    check(fe.status === 301 && fe.by === 'RankX AI', `and it SERVES when requested encoded (${fe.status})`)
    await remove('own_store', ce.json?.item?.id ?? 'x')

    const dup = await create({ backend: 'own_store', from, to: '/', code: 301 })
    check(dup.status === 409 && dup.json?.code === 'rankxai_redirect_exists', 'a second redirect for the same source is refused 409')

    const asEditor = await api('/rankxai/v1/redirects', { method: 'GET' }, EDITOR)
    check(asEditor.status === 403, `an editor is refused (${asEditor.status})`)
    const anon = await api('/rankxai/v1/redirects', { method: 'GET' }, '')
    check(anon.status === 401, `an anonymous request is refused (${anon.status})`)

    // ── E  purge, on create ───────────────────────────────────────────────
    console.log('\n== E  page-cache purge ==')
    check(Array.isArray(c1.json?.purged) && c1.json.purged.includes('litespeed'), `create reported the cache it asked (${JSON.stringify(c1.json?.purged)})`)
    const purgedOnCreate = JSON.parse(wpSoft('option', 'get', 'rankxai_probe_purged', '--format=json') ?? '[]')
    check(purgedOnCreate.some((u) => u.endsWith(from)), `the purge named the source URL (${purgedOnCreate.at(-1)})`)

    // ── I  the connection reads redirects and never changes one ───────────
    console.log('\n== I  the connection cannot change redirects ==')
    check(st0.json?.writes === 'site_admin', `GET /redirects says only the site's administrator changes them (${st0.json?.writes})`)
    const remoteCreate = await api('/rankxai/v1/redirects', { method: 'POST', body: JSON.stringify({ backend: 'own_store', from: `/${MARK}-remote`, to: '/', code: 301 }) })
    const remoteDelete = await api(`/rankxai/v1/redirects/own_store/${id}`, { method: 'DELETE' })
    const remotePurge = await api('/rankxai/v1/redirects/purge', { method: 'POST', body: JSON.stringify({ path: '/anything' }) })
    check(remoteCreate.status === 404 && remoteDelete.status === 404 && remotePurge.status === 404,
      `no remote route adds, removes or purges (${remoteCreate.status}, ${remoteDelete.status}, ${remotePurge.status})`)
    const viaPassword = await api('/rankxai/v1/admin/redirects', { method: 'POST', body: JSON.stringify({ from: `/${MARK}-remote`, to: '/sample-page/' }) })
    check(viaPassword.status === 403 && viaPassword.json?.code === 'rankxai_browser_only', `an administrator's Application Password is refused the browser-only route (${viaPassword.status} ${viaPassword.json?.code})`)
    check((await list(`/${MARK}-remote`)).json?.items?.length === 0, 'and nothing was added')

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
    // Planted directly, bypassing the refusal of a live source, to check the
    // plugin would still not act on it.
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
    // Rank Math's `update_modules` can leave gaps in the keys, so the list may
    // arrive as a JSON object; read the values either way.
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

    // Free AIOSEO has no redirect manager, so it must not be reported as one, or
    // the site would be refused our own store.
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

    // ── J  the site's administrator, in wp-admin ──────────────────────────
    console.log("\n== J  the site's administrator adds and removes redirects in the browser ==")
    wpSoft('plugin', 'deactivate', 'seo-by-rank-math', 'redirection')
    const adminJar = await login('admin', 'password')
    const adminNonce = await restNonce(adminJar)
    check(/^[a-f0-9]{10}$/.test(adminNonce), 'CONTROL — wp-admin hands the administrator a REST nonce')
    const localFrom = `/${MARK}-local`
    const noNonce = await browser(adminJar, '/rankxai/v1/admin/redirects', { from: localFrom, to: '/sample-page/' }, '')
    check(noNonce.status === 401 || noNonce.status === 403, `a cookie without the page's nonce is refused (${noNonce.status})`)
    const subNonceJar = await login(`${MARK}-sub`, 'probe-sub-pass')
    const asSubscriber = await browser(subNonceJar, '/rankxai/v1/admin/redirects', { from: localFrom, to: '/sample-page/' }, await restNonce(subNonceJar))
    check(asSubscriber.status === 403, `a signed-in subscriber is refused (${asSubscriber.status})`)
    const liveSource = await browser(adminJar, '/rankxai/v1/admin/redirects', { from: '/sample-page/', to: '/' }, adminNonce)
    check(liveSource.status === 409 && liveSource.json?.data?.field === 'path', `a live page is never redirected (${liveSource.status} ${liveSource.json?.data?.field})`)
    const offSite = await browser(adminJar, '/rankxai/v1/admin/redirects', { from: localFrom, to: 'https://evil.example/' }, adminNonce)
    check(offSite.status === 409 && offSite.json?.data?.field === 'target', `a target off the site is refused (${offSite.status})`)
    const added = await browser(adminJar, '/rankxai/v1/admin/redirects', { from: localFrom, to: '/sample-page/' }, adminNonce)
    check(added.status === 201 && /^own_store:[a-z0-9]+$/.test(added.json?.id ?? ''), `the administrator adds one (${added.status} ${added.json?.id})`)
    const servedLocal = await follow(localFrom)
    check(servedLocal.status === 301 && servedLocal.location === '/sample-page/', `and it serves (${servedLocal.status} → ${servedLocal.location})`)
    const again = await browser(adminJar, '/rankxai/v1/admin/redirects', { from: localFrom, to: '/' }, adminNonce)
    check(again.status === 409, `a second one for the same address is refused: it no longer answers "not found" (${again.status})`)
    const removed = await browser(adminJar, '/rankxai/v1/admin/redirects/delete', { id: added.json?.id ?? '' }, adminNonce)
    check(removed.status === 200, `the administrator removes it (${removed.status})`)
    check((await follow(localFrom)).status === 404, 'and the address answers "not found" again')
    const removedTwice = await browser(adminJar, '/rankxai/v1/admin/redirects/delete', { id: added.json?.id ?? '' }, adminNonce)
    check(removedTwice.status === 404, `removing it again is a 404, not a pretend success (${removedTwice.status})`)
    const badId = await browser(adminJar, '/rankxai/v1/admin/redirects/delete', { id: 'nope' }, adminNonce)
    check(badId.status === 400, `an id that is not one is refused (${badId.status})`)

    wp('plugin', 'activate', 'redirection')
    const redFrom = `/${MARK}-red`
    const viaRed = await browser(adminJar, '/rankxai/v1/admin/redirects', { from: redFrom, to: '/sample-page/' }, adminNonce)
    check(viaRed.status === 201 && /^redirection:\d+$/.test(viaRed.json?.id ?? ''), `with Redirection active it goes into Redirection (${viaRed.status} ${viaRed.json?.id})`)
    const servedRed = await follow(redFrom)
    check(servedRed.status === 301 && servedRed.by.toLowerCase().includes('redirection'), `Redirection serves it (${servedRed.status}, ${servedRed.by})`)
    const removedRed = await browser(adminJar, '/rankxai/v1/admin/redirects/delete', { id: viaRed.json?.id ?? '' }, adminNonce)
    check(removedRed.status === 200 && (await follow(redFrom)).status === 404, `and is removed from Redirection (${removedRed.status})`)
    wp('plugin', 'deactivate', 'redirection')

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
