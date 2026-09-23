#!/usr/bin/env node
/**
 * Plan 80 Phase 7 — AI crawler visit counts, against a real WordPress.
 *
 * Run:  node probe/verify-crawlers.mjs      (wp-env must be running)
 *
 * Self-provisioning: it makes its own application passwords and an editor,
 * records the crawler options the rig had, and puts everything back, asserting
 * the cleanup.
 *
 *   A  off by default: nothing is counted and no table exists
 *   B  switched on from the settings screen, which needs a real nonce
 *   C  what is counted — a crawler's GET/HEAD, with the status actually sent,
 *      the path without its query — and what is not
 *   D  the pushed configuration: refusals store nothing; a pushed range marks a
 *      visit in range; CF-Connecting-IP is believed only from a trusted proxy
 *   E  who may read and push
 *   F  the daily cap folds new addresses into (other)
 *   G  retention
 *   H  the settings screen: the disclosure, the page-cache note, the summary
 *   I  what one write costs
 *   J  uninstall drops the table and every option
 */

import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const MARK = `rx-crawler-probe-${Date.now()}`

const GPTBOT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot'
const CLAUDEBOT = 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'
const BYTESPIDER = 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)'
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36'

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m) => (cond ? ok(m) : bad(m))

function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  }).trim()
}
function wpSoft(...args) {
  try { return wp(...args) } catch { return null }
}
const evalPhp = (code) => wp('eval', code)

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
async function api(route, init = {}, auth = AUTH, query = '') {
  const res = await http(`${BASE}/?rest_route=${encodeURIComponent(route)}${query}`, {
    ...init,
    headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  let json = null
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json }
}

/** A visit, as a crawler would make it. Not followed, so its own status is what is counted. */
async function visit(path, agent, extra = {}) {
  const res = await http(`${BASE}${path}`, { redirect: 'manual', ...extra, headers: { 'User-Agent': agent, ...(extra.headers ?? {}) } })
  await res.arrayBuffer().catch(() => undefined)
  return res.status
}

const readCounts = async (query = '') => api('/rankxai/v1/crawlers', { method: 'GET' }, AUTH, query)
const pushConfig = (body, auth = AUTH) => api('/rankxai/v1/crawlers/config', { method: 'PUT', body: JSON.stringify(body) }, auth)

function rowsFor(json, bot, path) {
  return (json?.rows ?? []).filter((r) => r.bot === bot && (path === undefined || r.path === path))
}
const hitsOf = (rows) => rows.reduce((n, r) => n + r.hits, 0)

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
async function screen(jar) {
  return (await http(`${BASE}/wp-admin/options-general.php?page=rankxai`, { headers: { Cookie: jar } })).text()
}

const CRAWLER_OPTIONS = ['rankxai_crawlers_enabled', 'rankxai_crawler_tokens', 'rankxai_crawler_ranges', 'rankxai_crawlers_pruned', 'rankxai_crawlers_table']
const SAVE_NONCE = /name="action" value="rankxai_save_settings"[^]*?name="_wpnonce" value="([a-f0-9]+)"/
const TABLE_EXISTS_PHP = 'echo RankXAI_Crawlers::table_exists() ? "yes" : "no";'
const COLUMNS_PHP = 'global $wpdb; echo implode(",", $wpdb->get_col("SHOW COLUMNS FROM " . RankXAI_Crawlers::table()));'

async function run() {
  // ── Provision ───────────────────────────────────────────────────────────
  const originalOptions = Object.fromEntries(CRAWLER_OPTIONS.map((o) => [o, wpSoft('option', 'get', o, '--format=json')]))
  const originalTwins = wpSoft('option', 'get', 'rankxai_twins', '--format=json')
  const originalGenerate = wpSoft('option', 'get', 'rankxai_documents_local', '--format=json')
  const appPass = wp('user', 'application-password', 'create', 'admin', MARK, '--porcelain')
  AUTH = 'Basic ' + Buffer.from(`admin:${appPass}`).toString('base64')
  const editorId = wp('user', 'create', `${MARK}-ed`, `${MARK}-ed@example.com`, '--role=editor', '--porcelain')
  const editorPass = wp('user', 'application-password', 'create', editorId, MARK, '--porcelain')
  const EDITOR = 'Basic ' + Buffer.from(`${MARK}-ed:${editorPass}`).toString('base64')
  for (const o of CRAWLER_OPTIONS) wpSoft('option', 'delete', o)
  evalPhp('global $wpdb; $wpdb->query("DROP TABLE IF EXISTS " . RankXAI_Crawlers::table());')
  wp('rewrite', 'structure', '/%postname%/', '--hard')

  try {
    // ── A  off by default ─────────────────────────────────────────────────
    console.log('\n== A  off by default ==')
    const a0 = await readCounts()
    check(a0.status === 200 && a0.json?.enabled === false && a0.json?.total === 0, `GET /crawlers answers, switched off, empty (${a0.status}, enabled=${a0.json?.enabled})`)
    check(await visit('/sample-page/', GPTBOT) === 200, 'CONTROL — a crawler visit is answered')
    check(evalPhp(TABLE_EXISTS_PHP) === 'no', 'switched off, no table was created by a visit')
    check(a0.json?.retentionDays === 35 && a0.json?.maxRowsPerDay === 2000, 'retention and the daily cap are reported')

    // ── B  switched on from the settings screen ───────────────────────────
    console.log('\n== B  the switch ==')
    const jar = await login('admin', 'password')
    const s0 = await screen(jar)
    check(s0.includes('AI crawler visits') && s0.includes('name="rankxai_crawlers_enabled"'), 'the settings screen has the section and the switch')
    check(!/name="rankxai_crawlers_enabled" value="1"\s+checked/.test(s0), 'and the box is unticked')
    const nonce = SAVE_NONCE.exec(s0)?.[1] ?? ''
    check(nonce.length > 0, 'CONTROL — the settings form carries a nonce')
    const forged = await adminPost(jar, { action: 'rankxai_save_settings', _wpnonce: 'deadbeef00', rankxai_crawlers_enabled: '1' })
    check(forged.status === 403 && (await readCounts()).json?.enabled === false, `a forged nonce is refused (${forged.status}) and counting stays off`)
    const saved = await adminPost(jar, { action: 'rankxai_save_settings', _wpnonce: nonce, rankxai_crawlers_enabled: '1' })
    check(saved.status === 302 && (await readCounts()).json?.enabled === true, `saving with the box ticked switches it on (${saved.status})`)
    check(evalPhp(TABLE_EXISTS_PHP) === 'yes', 'and creates the table')
    const cols = evalPhp(COLUMNS_PHP).split(',')
    check(cols.join(',') === 'day,bot,in_range,status,path_hash,path,hits,last_seen', `the table holds no IP and no user agent: ${cols.join(', ')}`)

    // ── C  what is counted ────────────────────────────────────────────────
    console.log('\n== C  what is counted ==')
    await visit('/sample-page/', GPTBOT)
    await visit('/sample-page/', GPTBOT)
    let c = await readCounts()
    const sp = rowsFor(c.json, 'gptbot', '/sample-page/')
    check(sp.length === 1 && sp[0].hits === 2 && sp[0].status === 200 && sp[0].inRange === false,
      `two GPTBot visits are one row with 2 hits, status 200, not in range (${JSON.stringify(sp)})`)
    check(sp[0]?.day === c.json?.today && typeof sp[0]?.lastSeen === 'string' && sp[0].lastSeen.length > 10, 'dated today (UTC) with a last-seen time')

    await visit('/sample-page/', GPTBOT, { method: 'HEAD' })
    await visit('/sample-page/?email=someone%40example.com&utm_source=x', GPTBOT)
    await visit('/sample-page/', 'gptbot/1.3 lowercase')
    c = await readCounts()
    check(hitsOf(rowsFor(c.json, 'gptbot', '/sample-page/')) === 5, 'a HEAD, a visit with a query string and a lowercase agent all count against the same address')
    check(!JSON.stringify(c.json).includes('someone'), 'the query string is not stored anywhere in the answer')

    const before = c.json.total
    await visit('/sample-page/', BROWSER)
    await visit('/sample-page/', GPTBOT, { method: 'POST', body: 'x=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    await visit('/?rest_route=/', GPTBOT)
    await visit('/wp-login.php', GPTBOT)
    c = await readCounts()
    check(hitsOf(rowsFor(c.json, 'gptbot', '/sample-page/')) === 5 && c.json.total === before,
      'a browser, a crawler POST, a REST request and wp-login.php are not counted')

    const s404 = await visit(`/${MARK}-missing`, GPTBOT)
    const sGuess = await visit('/sample-pag', GPTBOT)
    const sRobots = await visit('/robots.txt', GPTBOT)
    const sMd = await visit('/sample-page/?format=md', GPTBOT)
    c = await readCounts()
    const r404 = rowsFor(c.json, 'gptbot', `/${MARK}-missing`)[0]
    const rGuess = rowsFor(c.json, 'gptbot', '/sample-pag')[0]
    const rRobots = rowsFor(c.json, 'gptbot', '/robots.txt')[0]
    const rMd = rowsFor(c.json, 'gptbot', '/sample-page/?format=md')[0]
    check(s404 === 404 && r404?.status === 404, `a 404 is counted as a 404 (${r404?.status})`)
    check(sGuess === 301 && rGuess?.status === 301, `a redirect is counted as what was sent (${sGuess} → row ${rGuess?.status})`)
    check(sRobots === 200 && rRobots?.status === 200, 'robots.txt is counted')
    check(rMd?.status === sMd, `the markdown-copy address keeps its ?format=md (${sMd})`)

    await visit('/sample-page/', BYTESPIDER)
    c = await readCounts()
    check(hitsOf(rowsFor(c.json, 'bytespider')) === 1, 'a crawler whose operator publishes no ranges is still counted with the default list')

    // ── D  configuration ──────────────────────────────────────────────────
    console.log('\n== D  configuration pushed by RankX AI ==')
    check(c.json?.config?.version === '' && c.json?.config?.prefixes === 0, 'CONTROL — nothing has been pushed yet')
    const REFUSALS = [
      [{}, 'an empty body'],
      [{ version: 'v1', bots: [] }, 'no crawlers'],
      [{ version: 'bad version!', bots: [{ id: 'gptbot', tokens: ['GPTBot'] }] }, 'a malformed version'],
      [{ version: 'v1', bots: [{ id: 'GPT Bot', tokens: ['GPTBot'] }] }, 'a malformed id'],
      [{ version: 'v1', bots: [{ id: 'gptbot', tokens: [] }] }, 'a crawler with no tokens'],
      [{ version: 'v1', bots: [{ id: 'gptbot', tokens: ['GPT\nBot'] }] }, 'a token with a control character'],
      [{ version: 'v1', bots: [{ id: 'gptbot', tokens: ['GPTBot'], prefixes: ['300.1.1.1/24'] }] }, 'an invalid IPv4 range'],
      [{ version: 'v1', bots: [{ id: 'gptbot', tokens: ['GPTBot'], prefixes: ['2001:db8::/129'] }] }, 'an IPv6 prefix length over 128'],
      [{ version: 'v1', bots: [{ id: 'gptbot', tokens: ['GPTBot'], prefixes: ['10.0.0.1'] }] }, 'a range with no prefix length'],
      [{ version: 'v1', bots: [{ id: 'gptbot', tokens: ['GPTBot'] }, { id: 'gptbot', tokens: ['x'] }] }, 'a duplicate id'],
      [{ version: 'v1', bots: [{ id: 'gptbot', tokens: ['GPTBot'] }], proxies: ['nope'] }, 'an invalid proxy range'],
      [{ version: 'v1', bots: [{ id: 'gptbot', tokens: ['GPTBot'], prefixes: Array.from({ length: 8001 }, (_, i) => `10.${i >> 8 & 255}.${i & 255}.0/24`) }] }, 'more than 8,000 ranges'],
    ]
    for (const [body, label] of REFUSALS) {
      const r = await pushConfig(body)
      check(r.status === 400, `refused 400: ${label}`)
    }
    check((await readCounts()).json?.config?.version === '', 'and none of those stored anything')

    const ALL4 = '0.0.0.0/0'
    const ALL6 = '::/0'
    const good = {
      version: `probe-${MARK}`,
      bots: [
        { id: 'gptbot', tokens: ['GPTBot'], prefixes: [ALL4, ALL6] },
        { id: 'claudebot', tokens: ['ClaudeBot'], prefixes: ['203.0.113.0/24'] },
        { id: 'probebot', tokens: ['RxProbeBot'] },
      ],
      proxies: [],
    }
    const pushed = await pushConfig(good)
    check(pushed.status === 200 && pushed.json?.version === good.version && pushed.json?.bots === 3 && pushed.json?.prefixes === 3,
      `a valid push is stored and summarised (${JSON.stringify(pushed.json)})`)

    await visit(`/${MARK}-range`, GPTBOT)
    await visit(`/${MARK}-range`, CLAUDEBOT)
    await visit(`/${MARK}-range`, CLAUDEBOT, { headers: { 'CF-Connecting-IP': '203.0.113.9' } })
    await visit(`/${MARK}-range`, 'Mozilla/5.0 (compatible; RxProbeBot/1.0)')
    await visit(`/${MARK}-range`, BYTESPIDER)
    c = await readCounts()
    check(rowsFor(c.json, 'gptbot', `/${MARK}-range`)[0]?.inRange === true, 'an address inside a pushed range is counted in range')
    check(rowsFor(c.json, 'claudebot', `/${MARK}-range`).every((r) => r.inRange === false) && hitsOf(rowsFor(c.json, 'claudebot', `/${MARK}-range`)) === 2,
      'outside the range it is not — and CF-Connecting-IP is IGNORED with no trusted proxy')
    check(hitsOf(rowsFor(c.json, 'probebot', `/${MARK}-range`)) === 1, 'a crawler added by the push is counted')
    check(rowsFor(c.json, 'bytespider', `/${MARK}-range`).length === 0, 'a crawler the push left out is no longer counted — the pushed list replaces the default')

    await pushConfig({ ...good, proxies: [ALL4, ALL6] })
    await visit(`/${MARK}-cf`, CLAUDEBOT, { headers: { 'CF-Connecting-IP': '203.0.113.9' } })
    await visit(`/${MARK}-cf`, CLAUDEBOT, { headers: { 'CF-Connecting-IP': '198.51.100.1' } })
    await visit(`/${MARK}-cf`, CLAUDEBOT, { headers: { 'CF-Connecting-IP': 'not-an-ip' } })
    c = await readCounts()
    const cf = rowsFor(c.json, 'claudebot', `/${MARK}-cf`)
    check(cf.find((r) => r.inRange)?.hits === 1, 'from a trusted proxy, a forwarded address in range is counted in range')
    check(hitsOf(cf.filter((r) => !r.inRange)) === 2, 'a forwarded address out of range, or not an address at all, is not')

    // ── E  who may read and push ──────────────────────────────────────────
    console.log('\n== E  permissions ==')
    check((await readCounts.call(null)).status === 200, 'CONTROL — the administrator reads')
    const edRead = await api('/rankxai/v1/crawlers', { method: 'GET' }, EDITOR)
    const edPush = await pushConfig(good, EDITOR)
    const anonRead = await api('/rankxai/v1/crawlers', { method: 'GET' }, '')
    const anonPush = await pushConfig(good, '')
    check(edRead.status === 403 && edPush.status === 403, `an editor is refused (${edRead.status}, ${edPush.status})`)
    check(anonRead.status === 401 && anonPush.status === 401, `an anonymous request is refused (${anonRead.status}, ${anonPush.status})`)
    const noSwitch = await api('/rankxai/v1/crawlers', { method: 'PUT', body: JSON.stringify({ enabled: false }) })
    check(noSwitch.status === 404 && (await readCounts()).json?.enabled === true, `there is no remote switch (${noSwitch.status})`)
    const badSince = await readCounts('&since=yesterday')
    check(badSince.status === 400, 'a malformed since is refused')

    // ── F  the daily cap ──────────────────────────────────────────────────
    console.log('\n== F  the daily cap, and what one write costs ==')
    const fill = evalPhp(`$d = gmdate("Y-m-d"); global $wpdb; $n = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM " . RankXAI_Crawlers::table() . " WHERE day = %s", $d)); $t = microtime(true); for ($i = $n; $i < RankXAI_Crawlers::MAX_ROWS_PER_DAY; $i++) { RankXAI_Crawlers::count($d, "probebot", false, 200, "/cap-" . $i); } $new = microtime(true) - $t; $t = microtime(true); for ($i = 0; $i < 500; $i++) { RankXAI_Crawlers::count($d, "probebot", false, 200, "/cap-" . $n); } $upd = microtime(true) - $t; echo json_encode(array("inserted" => RankXAI_Crawlers::MAX_ROWS_PER_DAY - $n, "insertMs" => $new * 1000, "updateMs" => $upd * 1000));`)
    const cost = JSON.parse(fill)
    const perNew = cost.insertMs / cost.inserted
    const perUpd = cost.updateMs / 500
    console.log(`        measured: a new address ${perNew.toFixed(3)} ms per visit (insert + cap check), a repeat visit ${perUpd.toFixed(3)} ms (one upsert), over ${cost.inserted} and 500 writes`)
    check(perUpd < 20 && perNew < 40, 'a counted visit costs milliseconds, not more')
    await visit(`/${MARK}-over-cap`, 'Mozilla/5.0 (compatible; RxProbeBot/1.0)')
    await visit(`/${MARK}-over-cap-2`, 'Mozilla/5.0 (compatible; RxProbeBot/1.0)')
    const all = []
    for (let off = 0; ; off += 2000) {
      const page = await readCounts(`&offset=${off}&limit=2000`)
      all.push(...(page.json?.rows ?? []))
      if (!page.json?.rows?.length || all.length >= page.json.total) break
    }
    const today = (await readCounts('&limit=0')).json?.today
    const todays = all.filter((r) => r.day === today)
    const extra = todays.filter((r) => !r.path.startsWith('/cap-'))
    check(todays.length === 2001, `today holds the cap plus one (other) row: ${todays.length} — the non-fill rows: ${JSON.stringify(extra.map((r) => [r.bot, r.status, r.inRange, r.path, r.hits]))}`)
    check(!todays.some((r) => r.path.includes('over-cap')), 'an address past the cap is not stored')
    check(rowsFor({ rows: todays }, 'probebot', '(other)').find((r) => r.status === 404)?.hits === 2 && rowsFor({ rows: todays }, 'probebot', '(other)').length === 1, 'and both visits past the cap are counted in (other)')
    check(all.length === (await readCounts('&limit=0')).json?.total, `paging with offset and limit returns every row (${all.length})`)

    // ── G  retention ──────────────────────────────────────────────────────
    console.log('\n== G  retention ==')
    evalPhp(`RankXAI_Crawlers::count(gmdate("Y-m-d", time() - 40 * DAY_IN_SECONDS), "gptbot", false, 200, "/old-40"); RankXAI_Crawlers::count(gmdate("Y-m-d", time() - 34 * DAY_IN_SECONDS), "gptbot", false, 200, "/old-34");`)
    const kept = (await readCounts(`&since=${new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)}&limit=2000`)).json?.rows ?? []
    check(!kept.some((r) => r.path === '/old-40'), 'a counter older than 35 days is gone')
    check(kept.some((r) => r.path === '/old-34'), 'one 34 days old is kept')

    // ── H  the settings screen ────────────────────────────────────────────
    console.log('\n== H  the settings screen ==')
    wp('option', 'update', 'rankxai_probe_fake_litespeed', '1')
    const s1 = await screen(jar)
    check(s1.includes('No IP address, browser details or anything about human visitors is stored'), 'the disclosure sentence is on the screen')
    check(s1.includes('This site runs LiteSpeed Cache') && s1.includes('the real numbers are higher'), 'a page cache is named, with what it means for the count')
    check(s1.includes('From its published addresses') && s1.includes('<code>probebot</code>'), 'the 7-day summary lists the crawlers')
    const cachesApi = (await readCounts('&limit=0')).json?.pageCaches ?? []
    check(cachesApi.includes('LiteSpeed Cache'), `and the API reports it too (${JSON.stringify(cachesApi)})`)
    wpSoft('option', 'delete', 'rankxai_probe_fake_litespeed')
    const privacy = await (await http(`${BASE}/wp-admin/options-privacy.php?tab=policyguide`, { headers: { Cookie: jar } })).text()
    check(privacy.includes('does not store IP addresses'), 'suggested privacy-policy text is offered to the site owner')

    const nonce2 = SAVE_NONCE.exec(s1)?.[1] ?? ''
    const off = await adminPost(jar, { action: 'rankxai_save_settings', _wpnonce: nonce2 })
    const offState = await readCounts('&limit=0')
    check(off.status === 302 && offState.json?.enabled === false, 'unticking the box switches it off')
    const totalOff = offState.json?.total
    await visit('/sample-page/', GPTBOT)
    check((await readCounts('&limit=0')).json?.total === totalOff && hitsOf(rowsFor((await readCounts()).json, 'gptbot', '/sample-page/')) === 5, 'switched off, nothing more is counted — and what was counted stays readable')

    // ── J  uninstall ──────────────────────────────────────────────────────
    console.log('\n== J  uninstall ==')
    evalPhp('define("WP_UNINSTALL_PLUGIN", true); include WP_PLUGIN_DIR . "/rankxai-wp-plugin/uninstall.php";')
    check(evalPhp(TABLE_EXISTS_PHP) === 'no', 'uninstall dropped the table')
    const left = CRAWLER_OPTIONS.filter((o) => wpSoft('option', 'get', o) !== null)
    check(left.length === 0, `and every crawler option (${left.join(', ') || 'none left'})`)
  } finally {
    // ── Restore ───────────────────────────────────────────────────────────
    wpSoft('option', 'delete', 'rankxai_probe_fake_litespeed')
    evalPhp('global $wpdb; $wpdb->query("DROP TABLE IF EXISTS " . RankXAI_Crawlers::table());')
    for (const [o, v] of Object.entries(originalOptions)) {
      if (v === null) wpSoft('option', 'delete', o)
      else wpSoft('option', 'update', o, v, '--format=json')
    }
    if (originalTwins === null) wpSoft('option', 'delete', 'rankxai_twins')
    else wpSoft('option', 'update', 'rankxai_twins', originalTwins, '--format=json')
    if (originalGenerate === null) wpSoft('option', 'delete', 'rankxai_documents_local')
    else wpSoft('option', 'update', 'rankxai_documents_local', originalGenerate, '--format=json')
    wpSoft('user', 'delete', editorId, '--yes')
    wpSoft('user', 'application-password', 'delete', 'admin', '--all')
  }

  check(wpSoft('user', 'get', `${MARK}-ed`) === null, 'CLEANUP — the probe user is gone')
  check(CRAWLER_OPTIONS.every((o) => wpSoft('option', 'get', o, '--format=json') === originalOptions[o]), 'CLEANUP — the crawler options are as the rig had them')

  console.log(`\n================================================\nPASSED ${pass}   FAILED ${fail}`)
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
