#!/usr/bin/env node
/**
 * Plan 90d D1 and D2 — connecting RankX AI from wp-admin, and the Store page,
 * against a real WordPress.
 *
 * Run:  node probe/verify-store-app.mjs      (wp-env running, WooCommerce installed,
 *                                             `node build-zip.mjs --local` first)
 *
 * RankX AI is never contacted: probe/mu-plugins/rankxai-outbound-witness.php
 * records every outbound request and answers app.rankxai.com from a stub, so
 * the plugin's side is proven alone. The platform's side, and the two together,
 * are proven by the platform repo's scripts/eval/plan90d harnesses.
 *
 *   A  unconnected, WooCommerce active: a Store item, an explainer with Connect,
 *      nothing loaded, nothing sent
 *   B  the Connect button: a one-time state, stored hashed, and the redirect
 *   C  PUT rankxai/v1/connection: the state is required to replace a token, and
 *      works once; a token is accepted without one only on an unconnected site
 *   D  connected: the mount contract (configuration, React handles, the module)
 *   E  POST rankxai/v1/session: cookie and nonce only; the answer; the cache;
 *      renew; rotation; a dead token forgotten
 *   F  disconnect and deactivation: RankX AI told, the token and RankX AI's
 *      Application Passwords removed, a hand-made one kept
 *   G  WooCommerce inactive: no Store item, nothing fatal, Connect still in Settings
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const APP_ID = 'a3f1c07e-6d4b-4f2a-9c85-1b7e0d3a5f42'
const TOKEN_A = 'rxwp_' + 'A'.repeat(43)
const TOKEN_B = 'rxwp_' + 'B'.repeat(43)
const SESSION = 'rxws_' + 'S'.repeat(43)
const SESSION_2 = 'rxws_' + 'T'.repeat(43)
const LINK = '11111111-2222-4333-8444-555555555555'

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(detail ? `${m} — ${detail}` : m))

function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim()
}
function wpSoft(...args) {
  try { return wp(...args) } catch { return null }
}
const optJson = (name) => {
  const v = wpSoft('option', 'get', name, '--format=json')
  return v ? JSON.parse(v) : null
}
const setJson = (name, value) => wp('option', 'update', name, JSON.stringify(value), '--format=json')

async function http(url, init = {}, attempt = 0) {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (attempt >= 2) throw e
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    return http(url, init, attempt + 1)
  }
}
async function login(user, password) {
  const body = new URLSearchParams({ log: user, pwd: password, 'wp-submit': 'Log In', testcookie: '1' })
  const res = await http(`${BASE}/wp-login.php`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' }, body })
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
  if (!cookies.some((c) => c.startsWith('wordpress_logged_in_'))) throw new Error(`login failed for ${user} (${res.status})`)
  return cookies.join('; ')
}
async function page(jar, path) {
  const res = await http(`${BASE}${path}`, { headers: { Cookie: jar }, redirect: 'manual' })
  return { status: res.status, location: res.headers.get('location') ?? '', html: await res.text() }
}
async function restNonce(jar) {
  const res = await http(`${BASE}/wp-admin/admin-ajax.php?action=rest-nonce`, { headers: { Cookie: jar } })
  return (await res.text()).trim()
}
async function rest(method, route, { jar, nonce, basic, body, headers = {} } = {}) {
  const h = { ...headers }
  if (jar) h.Cookie = jar
  if (nonce) h['X-WP-Nonce'] = nonce
  if (basic) h.Authorization = 'Basic ' + Buffer.from(basic).toString('base64')
  if (body !== undefined) h['Content-Type'] = 'application/json'
  const res = await http(`${BASE}/?rest_route=${encodeURIComponent(route)}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, json, text }
}
const witness = () => optJson('rankxai_outbound_witness') ?? []
const clearWitness = () => setJson('rankxai_outbound_witness', [])
const stub = (answers) => setJson('rankxai_app_stub', answers)
const sha256 = async (s) => {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(s).digest('hex')
}
/** debug.log's size, so the end of the run reads only what the run added (it keeps every earlier probe's lines). */
const debugLogSize = () => {
  try {
    return Number(execFileSync('docker', ['exec', cliContainer(), 'sh', '-c', 'wc -c < /var/www/html/wp-content/debug.log 2>/dev/null || echo 0'], { encoding: 'utf8' }).trim()) || 0
  } catch { return 0 }
}
const LOG_START = debugLogSize()
const debugLog = () => {
  try {
    return execFileSync('docker', ['exec', cliContainer(), 'sh', '-c', `tail -c +${LOG_START + 1} /var/www/html/wp-content/debug.log 2>/dev/null || true`], { encoding: 'utf8' })
  } catch { return '' }
}

async function main() {
  const assetMap = (() => { try { return readFileSync('admin-app/build/store-app.asset.php', 'utf8') } catch { return '' } })()
  if (!assetMap.includes("'file'")) throw new Error('admin-app/build is missing: run `node build-zip.mjs --local` first')
  const entry = /'file'\s*=>\s*'([^']+)'/.exec(assetMap)[1]

  const plugin = (wpSoft('plugin', 'list', '--field=name') ?? '').split('\n').find((n) => n === 'rankxai-wp-plugin' || n === 'rankxai') ?? 'rankxai-wp-plugin'
  const wooWasActive = wpSoft('plugin', 'is-active', 'woocommerce') !== null
  const rigWasActive = wpSoft('plugin', 'is-active', 'rankxai-store-rig') !== null
  if (rigWasActive) wp('plugin', 'deactivate', 'rankxai-store-rig')
  if (!wooWasActive) wp('plugin', 'activate', 'woocommerce')
  wp('option', 'update', 'rankxai_outbound_witness_on', '1')
  wpSoft('option', 'delete', 'rankxai_store_link')
  wpSoft('option', 'delete', 'rankxai_connect_states')
  clearWitness()
  stub([])
  const madePasswords = []

  try {
    const jar = await login('admin', 'password')

    console.log('\n== A  unconnected, WooCommerce active ==')
    const settings = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    check(settings.status === 200 && settings.html.includes('rankxai_connect') && settings.html.includes('target="_blank"'), 'Settings offers Connect RankX AI, opening in a new tab')
    check(/page=rankxai-store['"]/.test(settings.html), 'the RankX AI menu has a Store item on a WooCommerce site')
    const store = await page(jar, '/wp-admin/admin.php?page=rankxai-store')
    check(store.status === 200 && store.html.includes('Connect RankX AI') && store.html.includes('rankxai_connect'), 'the Store page explains and offers Connect')
    // The header never reads connected above a Connect button (the walk on cfc, 2026-10-29): that badge is the plugin's own connection.
    check(!store.html.includes('rankxai-pill--success') && /Not connected to RankX AI|Receiving updates from RankX AI/.test(store.html), 'and its header does not say connected before the plugin is')
    check(!store.html.includes('rx-store-config') && !store.html.includes('id="rx-store"'), 'no configuration and no mount point are printed before connecting (R4-D08)')
    // Not "no React": WooCommerce's own admin loads WordPress's React on every screen. The store app is ours.
    check(!store.html.includes('admin-app/build') && !store.html.includes('rankxai-store-js-module'), 'the store app is not loaded before connecting')
    for (const p of ['/wp-admin/admin.php?page=rankxai', '/wp-admin/admin.php?page=rankxai-crawlers', '/wp-admin/admin.php?page=rankxai-checks']) await page(jar, p)
    const quiet = witness().filter((w) => w.host !== 'localhost' && w.host !== 'api.wordpress.org' && w.host !== 'downloads.wordpress.org' && !w.host.endsWith('github.com'))
    check(quiet.filter((w) => w.host === 'app.rankxai.com').length === 0, 'no request to RankX AI while an unconnected administrator browses every page (G7)', JSON.stringify(quiet).slice(0, 200))

    console.log('\n== B  the Connect button ==')
    const form = /<form[^>]*target="_blank"[^>]*>[^]*?name="_wpnonce" value="([0-9a-f]+)"[^]*?<\/form>/.exec(store.html)
    check(Boolean(form), 'CONTROL — found the Connect form and its nonce')
    const click = await http(`${BASE}/wp-admin/admin-post.php`, { method: 'POST', redirect: 'manual', headers: { Cookie: jar, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ action: 'rankxai_connect', _wpnonce: form?.[1] ?? '' }) })
    const to = click.headers.get('location') ?? ''
    const toUrl = to ? new URL(to) : null
    check(click.status === 302 && toUrl?.origin === 'https://app.rankxai.com' && toUrl.pathname === '/connect/wordpress', 'it sends the administrator to app.rankxai.com/connect/wordpress', to.slice(0, 120))
    const state = toUrl?.searchParams.get('state') ?? ''
    check(/^rxcs_[A-Za-z0-9_-]{43}$/.test(state) && toUrl?.searchParams.get('site') && toUrl?.searchParams.get('admin') && toUrl?.searchParams.get('wpUser') === '1', 'with a fresh state, the site, its dashboard and the WordPress user')
    const states = optJson('rankxai_connect_states') ?? {}
    check(Object.keys(states).includes(await sha256(state)) && !JSON.stringify(states).includes(state), 'the state is stored as its SHA-256 only')
    const noNonce = await http(`${BASE}/wp-admin/admin-post.php`, { method: 'POST', redirect: 'manual', headers: { Cookie: jar, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ action: 'rankxai_connect' }) })
    check(noNonce.status !== 302 || !(noNonce.headers.get('location') ?? '').includes('app.rankxai.com'), 'without its nonce the button does nothing')
    check(witness().filter((w) => w.host === 'app.rankxai.com').length === 0, 'and clicking it sends nothing from the server (the browser is redirected)')

    console.log('\n== C  PUT rankxai/v1/connection ==')
    const pw = wp('user', 'application-password', 'create', 'admin', `rx-store-probe-${Date.now()}`, '--porcelain')
    madePasswords.push(pw)
    const basic = `admin:${pw}`
    const bad1 = await rest('PUT', '/rankxai/v1/connection', { basic, body: { token: 'nope', linkId: LINK } })
    check(bad1.status === 400, 'a malformed token is refused (400)')
    const wrongState = await rest('PUT', '/rankxai/v1/connection', { basic, body: { token: TOKEN_A, linkId: LINK, state: 'rxcs_' + 'z'.repeat(43) } })
    check(wrongState.status === 403, 'a state this plugin did not make is refused (403)')
    const first = await rest('PUT', '/rankxai/v1/connection', { basic, body: { token: TOKEN_A, linkId: LINK, state, projectName: 'Probe store', isStore: true, appUrl: 'https://app.rankxai.com' } })
    check(first.status === 200 && first.json?.connected === true && first.json?.linkId === LINK, 'the token is accepted with the plugin’s own state', first.text.slice(0, 160))
    check(optJson('rankxai_store_link')?.token === TOKEN_A, 'and stored')
    const replay = await rest('PUT', '/rankxai/v1/connection', { basic, body: { token: TOKEN_B, linkId: LINK, state } })
    check(replay.status === 403, 'the same state does not work twice')
    const noState = await rest('PUT', '/rankxai/v1/connection', { basic, body: { token: TOKEN_B, linkId: LINK } })
    check(noState.status === 409 && optJson('rankxai_store_link')?.token === TOKEN_A, 'without a state, a token held is never replaced (an Application Password alone is not enough, R3-D05)')
    const editor = wpSoft('user', 'get', 'rx-probe-editor', '--field=ID') ?? wp('user', 'create', 'rx-probe-editor', 'rx-probe-editor@example.test', '--role=editor', '--porcelain')
    const epw = wp('user', 'application-password', 'create', editor, `rx-store-probe-ed-${Date.now()}`, '--porcelain')
    const asEditor = await rest('PUT', '/rankxai/v1/connection', { basic: `rx-probe-editor:${epw}`, body: { token: TOKEN_B, linkId: LINK } })
    check(asEditor.status === 401 || asEditor.status === 403, 'an editor cannot set the connection')

    console.log('\n== D  connected: the mount contract ==')
    const mounted = await page(jar, '/wp-admin/admin.php?page=rankxai-store')
    // Attribute order is WordPress's (id before type), so the tag is found by its id and then read.
    const cfgTag = /<script\b[^>]*\bid="rx-store-config"[^>]*>([^]*?)<\/script>/.exec(mounted.html)
    const cfg = cfgTag && /type="application\/json"/.test(cfgTag[0].slice(0, cfgTag[0].indexOf('>'))) ? cfgTag : null
    let config = null
    try { config = cfg ? JSON.parse(cfg[1]) : null } catch { config = null }
    check(Boolean(config), 'the configuration is printed as JSON in #rx-store-config')
    check(config?.apiBase === 'https://app.rankxai.com/api/store-app' && /rankxai\/v1\/session/.test(config?.sessionUrl ?? '') && /^[0-9a-f]{10}$/.test(config?.nonce ?? '') && /page=rankxai-store$/.test(config?.pageUrl ?? '') && /\/wp-admin\/$/.test(config?.adminUrl ?? ''), 'with apiBase, sessionUrl, nonce, pageUrl and adminUrl', JSON.stringify(config))
    check('locale' in (config ?? {}), 'and the user’s locale')
    check(!mounted.html.includes(TOKEN_A), 'the site token is never in the page')
    // The connected Store page is the store app's own shell; the plugin's header is on its other pages.
    const settingsConnected = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    check(settingsConnected.html.includes('rankxai-pill--success') && settingsConnected.html.includes('Connected to RankX AI'), 'once connected, the header on the plugin pages says so')
    check(/<div class="wrap"><h1 class="screen-reader-text">[^<]+<\/h1><hr class="wp-header-end">/.test(mounted.html) && mounted.html.includes('<div id="rx-store"></div>'), 'the mount point inside .wrap with a screen-reader heading')
    const moduleTag = /<script\b[^>]*\bid="rankxai-store-js-module"[^>]*>/.exec(mounted.html)
    check(Boolean(moduleTag) && /type="module"/.test(moduleTag[0]) && moduleTag[0].includes(`admin-app/build/${entry}`), 'the entry is a script module, from this plugin’s own files (R4-D03)')
    // The lazily loaded chunks import the entry by its bare file name. A `?ver=` on the tag makes the browser load
    // it a second time under the other address: two React roots, two routers, and a blank page (live walk, run 3).
    const entryName = entry.split('/').pop()
    const importers = readdirSync('admin-app/build/assets').filter((f) => f.endsWith('.js') && readFileSync(`admin-app/build/assets/${f}`, 'utf8').includes(`"./${entryName}"`))
    check(importers.length > 0, 'CONTROL — the build has chunks that import the entry by its bare file name', String(importers.length))
    const tagSrc = /\bsrc="([^"]+)"/.exec(moduleTag?.[0] ?? '')?.[1] ?? ''
    check(tagSrc !== '' && !tagSrc.includes('?') && tagSrc.endsWith(`/${entryName}`), 'so the entry is printed with no query string, the same address the chunks import', tagSrc)
    // WordPress prints admin script modules in the footer, before or after the classic scripts depending on the
    // version. Either is fine: a module is deferred, so it runs after the document is parsed, when every classic
    // script (React included) has run. The live browser pass proves the app mounts.
    const reactHandles = ['react-js', 'react-dom-js', 'react-jsx-runtime-js'].every((id) => mounted.html.includes(`id="${id}"`))
    check(reactHandles && Boolean(moduleTag) && !/\b(async|defer)\b/.test(moduleTag?.[0] ?? ''), 'WordPress’s React handles are enqueued, and the entry is a plain (deferred) module, so React is defined first')
    check(/admin-app\/build\/assets\/[^"']+\.css/.test(mounted.html), 'and the entry’s stylesheet')
    const ourScripts = [...mounted.html.matchAll(/<script\b[^>]*\bsrc="([^"]*(?:rankxai|admin-app)[^"]*)"/g)].map((m) => m[1])
    check(ourScripts.length > 0 && ourScripts.every((src) => src.startsWith(BASE)), 'every script of ours is served from this site (G8)', ourScripts.join(' '))

    console.log('\n== H  WooCommerce’s own product screens (D4) ==')
    const productId = (wpSoft('post', 'list', '--post_type=product', '--post_status=publish', '--field=ID', '--posts_per_page=1') ?? '').split('\n')[0] || wp('wc', 'product', 'create', '--name=RankX probe product', '--status=publish', '--regular_price=10', '--user=admin', '--porcelain')
    clearWitness()
    const list = await page(jar, '/wp-admin/edit.php?post_type=product')
    check(list.html.includes(`page=rankxai-store#/products/${productId}`) && list.html.includes('AI search and data gaps'), 'each product in the list links to its page in the Store app')
    const edit = await page(jar, `/wp-admin/post.php?post=${productId}&action=edit`)
    const box = /<div id="rankxai-product" class="([^"]*)"/.exec(edit.html)
    check(Boolean(box) && box[1].split(/\s+/).includes('closed'), 'the product screen has a RankX AI panel, and it starts closed (R3-D18)', box?.[1] ?? 'no panel')
    check(/assets\/product-panel\.js/.test(edit.html) && edit.html.includes('window.rankxaiProductPanel'), 'its script loads on the product’s edit screen')
    check(!list.html.includes('product-panel.js') && !store.html.includes('product-panel.js'), 'and nowhere else')
    check(witness().filter((w) => w.host === 'app.rankxai.com').length === 0, 'opening the product screens sends nothing to RankX AI (the panel waits to be opened)')

    console.log('\n== E  POST rankxai/v1/session ==')
    const nonce = await restNonce(jar)
    clearWitness()
    const viaPassword = await rest('POST', '/rankxai/v1/session', { basic })
    check(viaPassword.status === 403, 'an Application Password cannot start a session (R3-D11)', viaPassword.text.slice(0, 120))
    const noNonceRest = await rest('POST', '/rankxai/v1/session', { jar })
    check(noNonceRest.status === 401 || noNonceRest.status === 403, 'a cookie without the page’s nonce cannot either')
    check(witness().filter((w) => w.host === 'app.rankxai.com').length === 0, 'and neither refusal contacted RankX AI')
    stub([{ path: '/api/store-app/wp/session', status: 200, body: { token: SESSION, expiresAt: new Date(Date.now() + 600_000).toISOString(), expiresIn: 600, canSpend: true, linkId: LINK } }])
    const s1 = await rest('POST', '/rankxai/v1/session', { jar, nonce })
    check(s1.status === 200 && s1.json?.token === SESSION && s1.json?.expiresIn === 600 && typeof s1.json?.expiresAt === 'string', 'a signed-in administrator gets { token, expiresAt, expiresIn } (90c’s contract)', s1.text.slice(0, 160))
    check(!s1.text.includes(TOKEN_A), 'the answer carries no site token')
    const calls = witness().filter((w) => w.host === 'app.rankxai.com')
    check(calls.length === 1 && calls[0].method === 'POST' && calls[0].path === '/api/store-app/wp/session' && calls[0].auth === 'Bearer rxwp_', 'exactly one server-to-server call, to the session path, signed with the site token')
    const sent = calls[0] ? JSON.parse(calls[0].body) : {}
    check(sent.wpUserId === 1 && typeof sent.wpUserName === 'string' && sent.origin === 'http://localhost:8888' && sent.siteUrl === 'http://localhost:8888' && typeof sent.rotate === 'boolean', 'carrying the WordPress user, the wp-admin origin and the site address', JSON.stringify(sent))
    const s2 = await rest('POST', '/rankxai/v1/session', { jar, nonce })
    check(s2.status === 200 && s2.json?.token === SESSION && witness().filter((w) => w.host === 'app.rankxai.com').length === 1, 'a second ask is answered from the cache, with no call')
    stub([{ path: '/api/store-app/wp/session', status: 200, body: { token: SESSION_2, expiresAt: new Date(Date.now() + 600_000).toISOString(), expiresIn: 600, canSpend: false, linkId: LINK, siteToken: TOKEN_B } }])
    const s3 = await rest('POST', '/rankxai/v1/session', { jar, nonce, headers: { 'X-RankXAI-Renew': '1' } })
    check(s3.status === 200 && s3.json?.token === SESSION_2 && s3.json?.canSpend === false, 'Renew skips the cache and asks again')
    check(optJson('rankxai_store_link')?.token === TOKEN_B && wpSoft('option', 'get', 'rankxai_site_token_rotating') === null, 'a rotated site token is kept, and the rotation lock released')
    stub([{ path: '/api/store-app/wp/session', status: 409, body: { code: 'site_moved', error: 'This site is not at the address it was connected from.' } }])
    const moved = await rest('POST', '/rankxai/v1/session', { jar, nonce, headers: { 'X-RankXAI-Renew': '1' } })
    check(moved.status === 409 && /not at the address/.test(moved.json?.message ?? '') && optJson('rankxai_store_link') !== null, 'a refusal is passed on in RankX AI’s words, and the token kept when it is not dead')
    stub([{ path: '/api/store-app/wp/session', status: 401, body: { code: 'link_ended', error: 'This site is no longer connected.' } }])
    const dead = await rest('POST', '/rankxai/v1/session', { jar, nonce, headers: { 'X-RankXAI-Renew': '1' } })
    check(dead.status === 401 && optJson('rankxai_store_link') === null, 'a dead site token is forgotten, so Settings offers Connect again')
    const settingsAfter = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    check(settingsAfter.html.includes('rankxai_connect') && !settingsAfter.html.includes('rankxai_disconnect'), 'and it does')
    const unconnected = await rest('POST', '/rankxai/v1/session', { jar, nonce })
    check(unconnected.status === 409, 'with no token there is no session, and no call')

    console.log('\n== F  disconnect and deactivation ==')
    const created = () => wp('eval', `$r = WP_Application_Passwords::create_new_application_password( 1, array( 'name' => 'RankX AI', 'app_id' => '${APP_ID}' ) ); echo is_wp_error( $r ) ? 'error' : $r[1]['uuid'];`)
    const listIds = () => JSON.parse(wp('eval', `echo wp_json_encode( array_values( array_map( function ( $p ) { return array( 'uuid' => $p['uuid'], 'app_id' => $p['app_id'] ); }, WP_Application_Passwords::get_user_application_passwords( 1 ) ) ) );`))
    setJson('rankxai_store_link', { token: TOKEN_A, link_id: LINK, connection_id: 'c', project_name: 'Probe', app_url: 'https://app.rankxai.com', is_store: true, connected_at: new Date().toISOString(), connected_by: 1 })
    const ours = created()
    const handMade = wp('user', 'application-password', 'create', 'admin', 'RankX AI by hand', '--porcelain', '--porcelain')
    madePasswords.push(handMade)
    stub([{ path: '/api/store-app/wp/connection', status: 200, body: { disconnected: true } }])
    clearWitness()
    const connectedSettings = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    const dForm = /<input type="hidden" name="action" value="rankxai_disconnect" \/><input type="hidden" id="_wpnonce" name="_wpnonce" value="([0-9a-f]+)"/.exec(connectedSettings.html)
    check(Boolean(dForm), 'CONTROL — found the Disconnect form')
    await http(`${BASE}/wp-admin/admin-post.php`, { method: 'POST', redirect: 'manual', headers: { Cookie: jar, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ action: 'rankxai_disconnect', _wpnonce: dForm?.[1] ?? '' }) })
    const told = witness().filter((w) => w.host === 'app.rankxai.com')
    check(told.length === 1 && told[0].method === 'DELETE' && told[0].path === '/api/store-app/wp/connection' && JSON.parse(told[0].body).reason === 'disconnected', 'Disconnect tells RankX AI, once', JSON.stringify(told))
    const after = listIds()
    check(optJson('rankxai_store_link') === null && !after.some((p) => p.uuid === ours) && after.some((p) => p.app_id === ''), 'the token and RankX AI’s Application Password are gone; a hand-made one stays', JSON.stringify(after))
    setJson('rankxai_store_link', { token: TOKEN_A, link_id: LINK, connection_id: 'c', project_name: 'Probe', app_url: 'https://app.rankxai.com', is_store: true, connected_at: new Date().toISOString(), connected_by: 1 })
    const ours2 = created()
    stub([{ path: '/api/store-app/wp/connection', status: 200, body: { disconnected: true } }])
    clearWitness()
    wp('plugin', 'deactivate', plugin)
    const toldOff = witness().filter((w) => w.host === 'app.rankxai.com')
    check(toldOff.length === 1 && JSON.parse(toldOff[0].body).reason === 'deactivated', 'deactivating tells RankX AI', JSON.stringify(toldOff))
    check(optJson('rankxai_store_link') === null && !listIds().some((p) => p.uuid === ours2), 'and removes the token and RankX AI’s Application Password (R3-D12)')
    wp('plugin', 'activate', plugin)
    clearWitness()
    stub([])
    wp('plugin', 'deactivate', plugin)
    check(witness().filter((w) => w.host === 'app.rankxai.com').length === 0, 'an unconnected plugin is deactivated with no call at all')
    wp('plugin', 'activate', plugin)

    console.log('\n== G  WooCommerce inactive ==')
    wp('plugin', 'deactivate', 'woocommerce')
    const noWoo = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    check(noWoo.status === 200 && !/page=rankxai-store['"]/.test(noWoo.html), 'no Store item without WooCommerce')
    check(noWoo.html.includes('rankxai_connect'), 'Connect is still in Settings on every site (R3-D19)')
    const storeNoWoo = await page(jar, '/wp-admin/admin.php?page=rankxai-store')
    check(storeNoWoo.status === 403 || /not allowed|Sorry/.test(storeNoWoo.html), 'the Store address is refused by WordPress, not a fatal error')
    const noRoute = await rest('POST', '/rankxai/v1/session', { jar, nonce: await restNonce(jar) })
    check(noRoute.status === 404, 'and the session route does not exist')
    const log = debugLog()
    check(!/PHP Fatal error[^\n]*rankxai/i.test(log), 'nothing fatal in the debug log')
  } finally {
    if (!wooWasActive) wpSoft('plugin', 'deactivate', 'woocommerce')
    else wpSoft('plugin', 'activate', 'woocommerce')
    if (rigWasActive) wpSoft('plugin', 'activate', 'rankxai-store-rig')
    wpSoft('option', 'delete', 'rankxai_outbound_witness_on')
    wpSoft('option', 'delete', 'rankxai_outbound_witness')
    wpSoft('option', 'delete', 'rankxai_app_stub')
    wpSoft('option', 'delete', 'rankxai_store_link')
    wpSoft('option', 'delete', 'rankxai_connect_states')
    for (const p of madePasswords) void p
    wpSoft('eval', "foreach ( WP_Application_Passwords::get_user_application_passwords( 1 ) as $p ) { if ( 0 === strpos( $p['name'], 'rx-store-probe' ) || 'RankX AI by hand' === $p['name'] ) { WP_Application_Passwords::delete_application_password( 1, $p['uuid'] ); } }")
    wpSoft('user', 'delete', 'rx-probe-editor', '--yes')
  }

  console.log('\n================================================')
  console.log(`PASSED ${pass}   FAILED ${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
