#!/usr/bin/env node
/**
 * Checks the RankX AI connection user against a real WordPress: the approval
 * screen, what the user can and cannot do, and its removal on disconnect.
 *
 * Run: npx wp-env start, then node probe/verify-connector.mjs
 */
import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const APP_ID = 'a3f1c07e-6d4b-4f2a-9c85-1b7e0d3a5f42'
const RETURN = 'https://app.rankxai.com/api/wp/connect?state=probe'
const env = { ...process.env, MSYS_NO_PATHCONV: '1' }
const wp = (...args) => execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', env }).trim()
const wpSoft = (...args) => { try { return wp(...args) } catch { return null } }

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

// --- wp-admin session for the administrator ---------------------------------
async function login(user, pass) {
  const res = await fetch(`${BASE}/wp-login.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body: new URLSearchParams({ log: user, pwd: pass, testcookie: '1', 'redirect_to': `${BASE}/wp-admin/` }),
  })
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
  return cookies.some((c) => c.startsWith('wordpress_logged_in_')) ? cookies.join('; ') : null
}

function approvalUrl(overrides = {}) {
  const q = new URLSearchParams({ app_name: 'RankX AI', app_id: APP_ID, success_url: RETURN, reject_url: RETURN, ...overrides })
  return `${BASE}/wp-admin/admin.php?page=rankxai-authorize&${q}`
}

async function openApproval(cookie, overrides) {
  const res = await fetch(approvalUrl(overrides), { headers: { Cookie: cookie }, redirect: 'manual' })
  return { status: res.status, html: await res.text() }
}

async function decide(cookie, html, decision) {
  const field = (name) => (html.match(new RegExp(`name="${name}" value="([^"]*)"`)) ?? [])[1]
  const body = new URLSearchParams({ action: 'rankxai_authorize', decision })
  for (const k of ['_wpnonce', '_wp_http_referer', 'app_id', 'app_name', 'success_url', 'reject_url']) {
    const v = field(k)
    if (v !== undefined) body.set(k, v.replace(/&amp;/g, '&').replace(/&#038;/g, '&'))
  }
  const res = await fetch(`${BASE}/wp-admin/admin-post.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Referer: approvalUrl() },
    body,
  })
  return { status: res.status, location: res.headers.get('location') ?? '' }
}

// --- REST as the connection user --------------------------------------------
let creds = null
const basic = () => 'Basic ' + Buffer.from(`${creds.user}:${creds.password}`).toString('base64')
async function call(method, route, body, query = '', auth = basic()) {
  const started = Date.now()
  const res = await fetch(`${BASE}/?rest_route=${encodeURIComponent(route)}${query}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90_000),
  })
  if (Date.now() - started > 15_000) console.log(`    (slow: ${method} ${route} ${Math.round((Date.now() - started) / 1000)}s)`)
  const json = await res.json().catch(() => null)
  return { status: res.status, code: json?.code ?? null, json }
}
const ok = (r) => r.status >= 200 && r.status < 300
const denied = (r) => r.status === 401 || r.status === 403

const personalBefore = wpSoft('option', 'get', 'rankxai_share_personal_data')
wpSoft('option', 'delete', 'rankxai_share_personal_data')
wpSoft('plugin', 'activate', 'woocommerce')
wpSoft('plugin', 'activate', 'redirection')
const adminId = Number(wp('user', 'get', 'admin', '--field=ID'))
// Start clean: no connection user from an earlier run.
wpSoft('eval', 'RankXAI_Connector::remove_user();')
const leftover = wpSoft('user', 'get', 'rankxai', '--field=ID')
if (leftover) wp('user', 'delete', leftover, '--yes', `--reassign=${adminId}`)
const cleanup = []

try {
  console.log('Advertised in the REST index')
  const index = await (await fetch(`${BASE}/?rest_route=/`)).json()
  const endpoint = index?.authentication?.rankxai?.endpoints?.authorization ?? ''
  check('the index names the approval screen', endpoint.endsWith('admin.php?page=rankxai-authorize'), endpoint)
  check('WordPress’s own screen is still listed', !!index?.authentication?.['application-passwords'])

  console.log('Approval screen')
  const cookie = await login('admin', 'password')
  check('administrator signed in', !!cookie)
  const bad = await openApproval(cookie, { success_url: 'https://evil.example/cb' })
  check('a return address off RankX AI is refused', bad.html.includes('does not return to RankX AI') && !bad.html.includes('rankxai_authorize'))
  const badApp = await openApproval(cookie, { app_id: '00000000-0000-0000-0000-000000000000' })
  check('another application id is refused', badApp.html.includes('only approves RankX AI'))
  const page = await openApproval(cookie)
  check('the screen lists what the user cannot do', page.html.includes('install, change or remove plugins or themes') && page.html.includes('change site settings'))

  const rejected = await decide(cookie, page.html, 'reject')
  check('Don’t connect returns success=false', rejected.location.startsWith(RETURN) && rejected.location.includes('success=false'), rejected.location)
  check('rejecting creates no user', !wpSoft('user', 'get', 'rankxai', '--field=ID'))

  const approved = await decide(cookie, page.html, 'approve')
  const back = new URL(approved.location || 'https://none.invalid/')
  creds = { user: back.searchParams.get('user_login'), password: back.searchParams.get('password') }
  check('approving returns to RankX AI', back.origin === 'https://app.rankxai.com' && back.searchParams.get('state') === 'probe', approved.location.slice(0, 60))
  check('it returns the site URL', !!back.searchParams.get('site_url'))
  check('the login is the RankX AI user, not the administrator', creds.user === 'rankxai', creds.user)
  const roles = wp('user', 'get', creds.user, '--field=roles')
  check('that user has only the RankX AI role', roles === 'rankxai_connector', roles)
  const userId = Number(wp('user', 'get', creds.user, '--field=ID'))
  check('the administrator holds no RankX AI password', !wp('user', 'application-password', 'list', 'admin', '--format=json').includes(APP_ID))

  console.log('What the user can do')
  const conn = await call('GET', '/rankxai/v1/connection')
  check('plugin routes accept it, as RankX AI’s password', ok(conn) && conn.json?.rankxaiPassword === true, String(conn.status))
  check('manifest', ok(await call('GET', '/rankxai/v1/manifest')))
  const docs = await call('GET', '/rankxai/v1/documents/llms_txt')
  check('site documents route (was administrator-only)', docs.status !== 401 && docs.status !== 403, String(docs.status))
  check('fill status', ok(await call('GET', '/rankxai/v1/fill')))
  const post = await call('POST', '/wp/v2/posts', { title: 'Connector probe', status: 'draft', content: '<p>x</p>' })
  check('create a draft post', post.status === 201, String(post.status))
  if (post.json?.id) cleanup.push(['post', post.json.id])
  check('the post is credited to the administrator', post.json?.author === adminId, String(post.json?.author))
  check('edit it', ok(await call('POST', `/wp/v2/posts/${post.json?.id}`, { title: 'Connector probe 2' })))
  const page2 = await call('POST', '/wp/v2/pages', { title: 'Connector probe page', status: 'draft' })
  check('create a draft page', page2.status === 201, String(page2.status))
  if (page2.json?.id) cleanup.push(['post', page2.json.id])
  const cat = await call('POST', '/wp/v2/categories', { name: `connector-probe-${Date.now()}` })
  check('create a category', cat.status === 201, String(cat.status))
  if (cat.json?.id) cleanup.push(['term', 'category', cat.json.id])
  check('list products', ok(await call('GET', '/wc/v3/products')))
  const product = await call('POST', '/wc/v3/products', { name: 'Connector probe product', status: 'draft' })
  check('create a draft product', product.status === 201, String(product.status))
  if (product.json?.id) cleanup.push(['post', product.json.id])
  check('read store system status', ok(await call('GET', '/wc/v3/system_status', null, '&_fields=environment')))
  check('read store settings', ok(await call('GET', '/wc/v3/settings/general')))
  const hook = await call('POST', '/wc/v3/webhooks', { topic: 'product.updated', delivery_url: 'https://app.rankxai.com/api/webhooks/woocommerce?probe=1', status: 'paused' })
  check('create its own product webhook', hook.status === 201, `${hook.status} ${hook.code ?? ''}`)
  if (hook.json?.id) {
    check('read its own webhook', ok(await call('GET', `/wc/v3/webhooks/${hook.json.id}`)))
    check('delete its own webhook', ok(await call('DELETE', `/wc/v3/webhooks/${hook.json.id}`, null, '&force=true')))
  }
  check('list redirects (Redirection)', ok(await call('GET', '/redirection/v1/redirect')))
  const red = await call('POST', '/redirection/v1/redirect', { url: '/connector-probe-old', action_data: { url: '/connector-probe-new' }, action_type: 'url', match_type: 'url', group_id: 1, regex: false })
  check('add a plain redirect (Redirection)', ok(red), `${red.status} ${red.code ?? ''}`)
  const redId = (red.json?.items ?? []).find((i) => i.url === '/connector-probe-old')?.id
  if (redId) check('delete it (Redirection)', ok(await call('POST', '/redirection/v1/bulk/redirect/delete', { items: [redId] })))

  console.log('What the user cannot do')
  check('read site settings', denied(await call('GET', '/wp/v2/settings')))
  check('change site settings', denied(await call('POST', '/wp/v2/settings', { title: 'x' })))
  check('list plugins', denied(await call('GET', '/wp/v2/plugins')))
  check('install a plugin', denied(await call('POST', '/wp/v2/plugins', { slug: 'hello-dolly' })))
  check('switch theme', denied(await call('POST', '/wp/v2/themes/twentytwentyfive', { status: 'active' })))
  check('create a user', denied(await call('POST', '/wp/v2/users', { username: 'x', email: 'x@example.com', password: 'x' })))
  check('change a user', denied(await call('POST', `/wp/v2/users/${adminId}`, { first_name: 'x' })))
  check('read orders while the switch is off', denied(await call('GET', '/wc/v3/orders')))
  check('list users while the switch is off', denied(await call('GET', '/wp/v2/users')))
  check('change store settings', denied(await call('PUT', '/wc/v3/settings/general/woocommerce_store_city', { value: 'x' })))
  check('list every webhook', denied(await call('GET', '/wc/v3/webhooks')))
  check('change Redirection settings', denied(await call('POST', '/redirection/v1/setting', { expire_redirect: 1 })))
  check('delete a post permanently', denied(await call('DELETE', `/wp/v2/posts/${post.json?.id}`, null, '&force=true')))

  console.log('Customer data switch')
  wp('option', 'update', 'rankxai_share_personal_data', '1')
  check('orders readable when the owner allows it', ok(await call('GET', '/wc/v3/orders')))
  check('users readable when the owner allows it', ok(await call('GET', '/wp/v2/users')))
  check('still cannot create a user', denied(await call('POST', '/wp/v2/users', { username: 'y', email: 'y@example.com', password: 'y' })))
  wp('option', 'delete', 'rankxai_share_personal_data')
  check('orders refused again when switched off', denied(await call('GET', '/wc/v3/orders')))

  console.log('Signing in')
  wp('user', 'update', creds.user, '--user_pass=Connector-probe-1', '--skip-email')
  check('the user cannot sign in to wp-admin', !(await login(creds.user, 'Connector-probe-1')))
  const xml = await fetch(`${BASE}/xmlrpc.php`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: `<?xml version="1.0"?><methodCall><methodName>wp.getUsersBlogs</methodName><params><param><value><string>${creds.user}</string></value></param><param><value><string>${creds.password}</string></value></param></params></methodCall>` })
  check('nor through XML-RPC', (await xml.text()).includes('<fault>'))
  check('the REST password still works', ok(await call('GET', '/rankxai/v1/manifest')))

  console.log('Approving again')
  const old = basic()
  const again = await decide(cookie, (await openApproval(cookie)).html, 'approve')
  const back2 = new URL(again.location)
  creds = { user: back2.searchParams.get('user_login'), password: back2.searchParams.get('password') }
  check('same user', creds.user === 'rankxai')
  check('the old password stops working', denied(await call('GET', '/rankxai/v1/manifest', null, '', old)))
  check('the new one works', ok(await call('GET', '/rankxai/v1/manifest')))
  const count = JSON.parse(wp('user', 'application-password', 'list', creds.user, '--format=json')).length
  check('one password at a time', count === 1, String(count))

  console.log('Disconnecting')
  wp('eval', "RankXAI_Connection::disconnect( 'disconnected' );")
  check('the user is removed', !wpSoft('user', 'get', String(userId), '--field=ID'))
  check('its password stops working', denied(await call('GET', '/rankxai/v1/manifest')))
  const author = Number(wpSoft('post', 'get', String(post.json?.id), '--field=post_author') ?? 0)
  check('content it made stays, with the administrator', author === adminId, String(author))
  const editable = wp('eval', "require_once ABSPATH . 'wp-admin/includes/user.php'; echo implode( ',', array_keys( get_editable_roles() ) );")
  check('the role is not offered when adding or editing people', !editable.split(',').includes('rankxai_connector') && editable.includes('editor'), editable)
} finally {
  for (const item of cleanup) {
    if (item[0] === 'post') wpSoft('post', 'delete', String(item[1]), '--force')
    if (item[0] === 'term') wpSoft('term', 'delete', item[1], String(item[2]))
    if (item[0] === 'user') wpSoft('user', 'delete', String(item[1]), '--yes')
  }
  wpSoft('eval', "RankXAI_Connector::remove_user();")
  if (personalBefore !== null) wpSoft('option', 'update', 'rankxai_share_personal_data', personalBefore)
}

console.log(`\nPASSED ${pass}   FAILED ${fail}`)
process.exit(fail ? 1 : 0)
