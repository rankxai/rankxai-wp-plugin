#!/usr/bin/env node
/**
 * Checks the limits on RankX AI's Application Password against a real WordPress.
 *
 * Run: npx wp-env start, then node probe/verify-access-scope.mjs
 */
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const APP_ID = 'a3f1c07e-6d4b-4f2a-9c85-1b7e0d3a5f42'
const env = { ...process.env, MSYS_NO_PATHCONV: '1' }
const wp = (...args) => execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', env }).trim()
const wpSoft = (...args) => { try { return wp(...args) } catch { return null } }

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const active = JSON.parse(wp('plugin', 'list', '--status=active', '--field=name', '--format=json'))
const wooWasActive = active.includes('woocommerce')
if (!wooWasActive) wp('plugin', 'activate', 'woocommerce')
const personalBefore = wpSoft('option', 'get', 'rankxai_share_personal_data')
const frontBefore = wpSoft('option', 'get', 'page_on_front')
const showOnFrontBefore = wpSoft('option', 'get', 'show_on_front')
wpSoft('option', 'delete', 'rankxai_share_personal_data')

const ours = wp('user', 'application-password', 'create', 'admin', 'scope-probe-rankxai', `--app-id=${APP_ID}`, '--porcelain')
const other = wp('user', 'application-password', 'create', 'admin', 'scope-probe-other', '--porcelain')
const auth = (pw) => 'Basic ' + Buffer.from(`admin:${pw}`).toString('base64')

async function call(pw, method, route, body, query = '') {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/?rest_route=${encodeURIComponent(route)}${query}`, {
        method,
        headers: { Authorization: auth(pw), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json().catch(() => null)
      return { status: res.status, code: json?.code ?? null, json }
    } catch (e) {
      if (attempt >= 2) throw e
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}
const refused = (r) => r.status === 403 && r.code === 'rankxai_not_allowed'

// XML-RPC answers 200 with a fault on a refused login.
async function xmlrpc(pw) {
  const body = `<?xml version="1.0"?><methodCall><methodName>wp.getUsersBlogs</methodName><params><param><value><string>admin</string></value></param><param><value><string>${pw}</string></value></param></params></methodCall>`
  const res = await fetch(`${BASE}/xmlrpc.php`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body })
  const text = await res.text()
  return { status: res.status, fault: text.includes('<fault>'), text }
}

// A private post type that is in the REST API, for the content check.
const PRIVATE_TYPE = join(dirname(fileURLToPath(import.meta.url)), 'mu-plugins', 'rankxai-scope-private-type.php')
writeFileSync(
  PRIVATE_TYPE,
  "<?php\nadd_action( 'init', function () {\n\tregister_post_type( 'rxprobe_private', array( 'public' => false, 'show_ui' => true, 'show_in_rest' => true, 'rest_base' => 'rxprobe-private', 'label' => 'Probe' ) );\n\tregister_post_type( 'rxprobe_layout', array( 'public' => true, 'show_in_rest' => true, 'rest_base' => 'rxprobe-layouts', 'label' => 'Probe layouts' ) );\n} );\n",
)

const title = wp('option', 'get', 'blogname')
const created = []
const createdTerms = []
try {
  console.log('Never allowed for the RankX AI password')
  check('create a user', refused(await call(ours, 'POST', '/wp/v2/users', { username: 'x', email: 'x@example.com', password: 'x' })))
  check('change a user', refused(await call(ours, 'POST', '/wp/v2/users/1', { first_name: 'x' })))
  check('list Application Passwords', refused(await call(ours, 'GET', '/wp/v2/users/1/application-passwords')))
  check('install a plugin', refused(await call(ours, 'POST', '/wp/v2/plugins', { slug: 'hello-dolly' })))
  check('switch theme', refused(await call(ours, 'POST', '/wp/v2/themes/twentytwentyfive', { status: 'active' })))
  check('edit global styles', refused(await call(ours, 'POST', '/wp/v2/global-styles/1', { settings: {} })))
  check('edit a template', refused(await call(ours, 'POST', '/wp/v2/templates/twentytwentyfive//index', { content: 'x' })))
  check('change a payment gateway', refused(await call(ours, 'PUT', '/wc/v3/payment_gateways/cod', { enabled: true })))
  check('create a coupon', refused(await call(ours, 'POST', '/wc/v3/coupons', { code: 'probe' })))
  check('change a WooCommerce customer', refused(await call(ours, 'POST', '/wc/v3/customers/1', { first_name: 'x' })))
  check('issue a refund', refused(await call(ours, 'POST', '/wc/v3/orders/1/refunds', { amount: '1' })))
  check('send a batch', refused(await call(ours, 'POST', '/batch/v1', { requests: [] })))
  check('batch-edit products', refused(await call(ours, 'POST', '/wc/v3/products/batch', { update: [] })))
  check('change the site address (url)', refused(await call(ours, 'POST', '/wp/v2/settings', { url: 'https://example.com' })))
  check('change the admin email (email)', refused(await call(ours, 'POST', '/wp/v2/settings', { email: 'x@example.com' })))
  check('a title change smuggling the site address', refused(await call(ours, 'POST', '/wp/v2/settings', { title: 'x', url: 'https://example.com' })))
  check('a route another plugin registered', refused(await call(ours, 'GET', '/wp-site-health/v1/tests/background-updates')))
  check('a webhook to another address', refused(await call(ours, 'POST', '/wc/v3/webhooks', { topic: 'product.updated', delivery_url: 'https://evil.example/hook' })))
  check('an order webhook', refused(await call(ours, 'POST', '/wc/v3/webhooks', { topic: 'order.created', delivery_url: 'https://app.rankxai.com/api/webhooks/woocommerce' })))
  check('even a product webhook to RankX AI (the plugin reports product changes itself)', refused(await call(ours, 'POST', '/wc/v3/webhooks', { topic: 'product.updated', delivery_url: 'https://app.rankxai.com/api/webhooks/woocommerce' })))
  check('listing webhooks', refused(await call(ours, 'GET', '/wc/v3/webhooks')))
  check('a plain redirect through Redirection (only the site administrator adds redirects)', refused(await call(ours, 'POST', '/redirection/v1/redirect', { url: '/old-probe', match_type: 'url', action_type: 'url', regex: false, action_data: { url: '/new-probe' }, group_id: 1 })))
  check('a Redirection bulk delete', refused(await call(ours, 'POST', '/redirection/v1/bulk/redirect/delete', { items: [1] })))
  check('a redirect through this plugin', (await call(ours, 'POST', '/rankxai/v1/redirects', { backend: 'own_store', from: '/old-probe', to: '/' })).status === 404)
  check('the browser-only redirect route', (await call(ours, 'POST', '/rankxai/v1/admin/redirects', { from: '/old-probe', to: '/' })).status === 403)
  check('pushing crawler ranges', (await call(ours, 'PUT', '/rankxai/v1/crawlers/config', { version: 'v1', bots: [] })).status === 404)
  check('the site address sent in the query string', refused(await call(ours, 'POST', '/wp/v2/settings', null, '&url=https%3A%2F%2Fexample.com')))
  check('the admin email sent in the query string', refused(await call(ours, 'POST', '/wp/v2/settings', { title: 'x' }, '&email=x%40example.com')))
  const commentId = wp('comment', 'list', '--number=1', '--field=comment_ID') || wp('comment', 'create', '--comment_post_ID=1', '--comment_content=Probe', '--porcelain')
  check("a comment's text sent in the query string", refused(await call(ours, 'POST', `/wp/v2/comments/${commentId}`, { status: 'approved' }, '&content=changed')))
  check('a private post type', refused(await call(ours, 'GET', '/wp/v2/rxprobe-private')))
  check('a public post type that is not on the content list (a theme or builder layout)', refused(await call(ours, 'POST', '/wp/v2/rxprobe-layouts', { title: 'x', status: 'draft' })))
  check('change the site title', refused(await call(ours, 'POST', '/wp/v2/settings', { title: `${title} (probe)` })))
  check('change the time zone', refused(await call(ours, 'POST', '/wp/v2/settings', { timezone: 'UTC' })))
  check('moderate a comment', refused(await call(ours, 'POST', `/wp/v2/comments/${commentId}`, { status: 'hold' })))
  check('switch a missing SEO tag on', (await call(ours, 'PUT', '/rankxai/v1/fill', { features: { open_graph: true } })).status === 404)
  check('switch markdown copies on', (await call(ours, 'PUT', '/rankxai/v1/twins', { enabled: true })).code === 'rankxai_twins_site_only')
  check('a Redirection group change', refused(await call(ours, 'POST', '/redirection/v1/group', { name: 'x', moduleId: 1 })))
  check('a regex redirect', refused(await call(ours, 'POST', '/redirection/v1/redirect', { url: '/a.*', regex: true, match_type: 'url', action_type: 'url', action_data: { url: '/b' }, group_id: 1 })))
  check('a redirect to another site', refused(await call(ours, 'POST', '/redirection/v1/redirect', { url: '/a', match_type: 'url', action_type: 'url', action_data: { url: 'https://evil.example/' }, group_id: 1 })))
  check('a redirect to //host', refused(await call(ours, 'POST', '/redirection/v1/redirect', { url: '/a', match_type: 'url', action_type: 'url', action_data: { url: '//evil.example/' }, group_id: 1 })))
  const rpc = await xmlrpc(ours)
  check('XML-RPC', rpc.fault && !rpc.text.includes('isAdmin'), rpc.text.slice(0, 120))
  const putOther = await call(other, 'PUT', '/rankxai/v1/connection', { token: 'x' })
  check('another password cannot place the site token', putOther.status === 403 && putOther.code === 'rankxai_password_required', `${putOther.status} ${putOther.code}`)

  console.log('Personal data, switch off (the default)')
  check('orders are refused', refused(await call(ours, 'GET', '/wc/v3/orders')))
  check('customers are refused', refused(await call(ours, 'GET', '/wc/v3/customers')))
  check('the user list is refused', refused(await call(ours, 'GET', '/wp/v2/users')))
  check('comments in full are refused', refused(await call(ours, 'GET', '/wp/v2/comments', null, '&context=edit')))
  check('its own user is still readable', (await call(ours, 'GET', '/wp/v2/users/me')).status === 200)
  wp('option', 'update', 'rankxai_share_personal_data', '1')
  console.log('Personal data, switch on')
  check('orders are readable', (await call(ours, 'GET', '/wc/v3/orders')).status === 200)
  check('the user list is readable', (await call(ours, 'GET', '/wp/v2/users')).status === 200)
  check('writing to a customer is still refused', refused(await call(ours, 'POST', '/wc/v3/customers/1', { first_name: 'x' })))
  check('product reviews are readable', (await call(ours, 'GET', '/wc/v3/products/reviews')).status === 200)
  check('writing a product review is still refused', refused(await call(ours, 'POST', '/wc/v3/products/reviews', { product_id: 1, review: 'x', reviewer: 'x', reviewer_email: 'x@example.com' })))
  wp('option', 'delete', 'rankxai_share_personal_data')

  console.log('Allowed for the RankX AI password')
  const post = await call(ours, 'POST', '/wp/v2/posts', { title: 'Scope probe', status: 'draft', content: '<p>Hello</p><script>alert(1)</script>' })
  if (post.json?.id) created.push(post.json.id)
  check('create a draft post', post.status === 201, String(post.status))
  const stored = post.json?.id ? wp('post', 'get', String(post.json.id), '--field=post_content') : ''
  check('its <script> was filtered (no unfiltered_html)', stored.includes('Hello') && !stored.includes('<script'), stored.slice(0, 80))
  check('permanent delete is refused', refused(await call(ours, 'DELETE', `/wp/v2/posts/${post.json?.id}`, { force: true })))
  check('move to trash', (await call(ours, 'DELETE', `/wp/v2/posts/${post.json?.id}`)).status === 200)
  check('read the site root', (await call(ours, 'GET', '/')).status === 200)
  check('reading plugins is refused (not content)', refused(await call(ours, 'GET', '/wp/v2/plugins')))
  check('reading the site settings is refused (the public index has the name and address)', refused(await call(ours, 'GET', '/wp/v2/settings')))
  check('read shipping classes', (await call(ours, 'GET', '/wc/v3/products/shipping_classes')).status === 200)
  check('creating a shipping class is refused (store configuration)', refused(await call(ours, 'POST', '/wc/v3/products/shipping_classes', { name: 'Scope probe' })))
  check('creating a global attribute is refused', refused(await call(ours, 'POST', '/wc/v3/products/attributes', { name: 'Scope probe' })))
  const cat = await call(ours, 'POST', '/wc/v3/products/categories', { name: 'Scope probe cat' })
  if (cat.json?.id) createdTerms.push(cat.json.id)
  check('a product category is still writable', cat.status === 201, String(cat.status))
  const pattern = wp('post', 'create', '--post_type=wp_block', '--post_status=publish', '--post_title=Scope probe pattern', '--post_content=<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->', '--porcelain')
  const hidden = wp('post', 'create', '--post_type=rxprobe_private', '--post_status=publish', '--post_title=Scope probe private', '--porcelain')
  created.push(pattern, hidden)
  const layout = wp('post', 'create', '--post_type=rxprobe_layout', '--post_status=publish', '--post_title=Scope probe layout', '--porcelain')
  created.push(layout)
  for (const [label, id] of [['a synced pattern (wp_block)', pattern], ['a private post type', hidden], ['a public layout post type', layout]]) {
    const r = await call(ours, 'POST', `/rankxai/v1/seo/${id}`, { fields: { title: 'x' } })
    check(`the plugin's own SEO route refuses ${label}`, r.status === 403 && r.code === 'rankxai_not_content', `${r.status} ${r.code}`)
  }
  check('listing redirects (Redirection) is let through', !refused(await call(ours, 'GET', '/redirection/v1/redirect')))
  const mine = await call(ours, 'GET', '/rankxai/v1/connection')
  check('the plugin knows its own password', mine.status === 200 && mine.json?.rankxaiPassword === true, JSON.stringify(mine.json))
  const putOurs = await call(ours, 'PUT', '/rankxai/v1/connection', { token: 'x' })
  check('its own password reaches the token check', putOurs.status === 400 && putOurs.code === 'rankxai_bad_token', `${putOurs.status} ${putOurs.code}`)
  check('read products', (await call(ours, 'GET', '/wc/v3/products')).status === 200)
  check("read WooCommerce's namespace root", (await call(ours, 'GET', '/wc/v3')).status === 200)
  check("another plugin's namespace root is refused", refused(await call(ours, 'GET', '/wp-site-health/v1')))

  console.log("The site's own pages")
  const front = wp('post', 'create', '--post_type=page', '--post_status=publish', '--post_title=Scope probe front', '--post_name=scope-probe-front', '--porcelain')
  created.push(front)
  wp('option', 'update', 'show_on_front', 'page')
  wp('option', 'update', 'page_on_front', front)
  check('its text can still be edited', (await call(ours, 'POST', `/wp/v2/pages/${front}`, { title: 'Scope probe front (edited)', status: 'publish' })).status === 200)
  check('it cannot be moved to the trash', refused(await call(ours, 'DELETE', `/wp/v2/pages/${front}`)))
  check('it cannot be unpublished', refused(await call(ours, 'POST', `/wp/v2/pages/${front}`, { status: 'draft' })))
  check('its address cannot change', refused(await call(ours, 'POST', `/wp/v2/pages/${front}`, { slug: 'moved' })))
  check('it cannot be given a password', refused(await call(ours, 'POST', `/wp/v2/pages/${front}`, { password: 'x' })))
  check('it is still published', wp('post', 'get', front, '--field=post_status') === 'publish')
  const viaContent = await call(ours, 'POST', `/rankxai/v1/content/${front}`, { fields: { slug: 'moved-by-content-route' } })
  check("its address cannot change through the plugin's content route", viaContent.status === 400 && viaContent.code === 'rankxai_invalid_field', `${viaContent.status} ${viaContent.code}`)
  check("its text can be edited through the plugin's content route", (await call(ours, 'POST', `/rankxai/v1/content/${front}`, { fields: { title: 'Scope probe front (content route)' } })).status === 200)
  check('its slug is unchanged', wp('post', 'get', front, '--field=post_name') === 'scope-probe-front')
  const hide = await call(ours, 'POST', `/rankxai/v1/seo/${front}`, { fields: { noindex: '1' } })
  check('it cannot be hidden from search engines', hide.status === 400 && hide.code === 'rankxai_invalid_field', `${hide.status} ${hide.code}`)
  const plain = wp('post', 'create', '--post_type=page', '--post_status=draft', '--post_title=Scope probe plain page', '--porcelain')
  created.push(plain)
  check("no page's template can change", refused(await call(ours, 'POST', `/wp/v2/pages/${plain}`, { template: 'page-no-title' })))
  check('an ordinary page can still be unpublished', (await call(ours, 'POST', `/wp/v2/pages/${plain}`, { status: 'pending' })).status === 200)

  console.log('Canonical addresses from the connection')
  const seoPost = await call(ours, 'POST', '/wp/v2/posts', { title: 'Scope probe canonical', status: 'draft' })
  if (seoPost.json?.id) created.push(seoPost.json.id)
  const offSite = await call(ours, 'POST', `/rankxai/v1/seo/${seoPost.json?.id}`, { fields: { canonical: 'https://evil.example/page' } })
  check('a canonical on another site is refused', offSite.status >= 400 && offSite.status < 500, `${offSite.status} ${offSite.code}`)
  const onSite = await call(ours, 'POST', `/rankxai/v1/seo/${seoPost.json?.id}`, { fields: { canonical: `${BASE}/scope-probe-canonical/` } })
  check('a canonical on this site is accepted', onSite.status === 200, `${onSite.status} ${onSite.code}`)

  console.log('The connector user signed in some other way')
  const viaUser = wp('eval', [
    "RankXAI_Connector::ensure_role(); $id = RankXAI_Connector::ensure_user();",
    "wp_set_current_user( $id );",
    "$a = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/plugins' ) );",
    "$b = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/settings' ) );",
    "echo wp_json_encode( array( $a->get_status(), $a->as_error() ? $a->as_error()->get_error_code() : '', $b->get_status(), current_user_can( 'unfiltered_html' ) ) );",
    "RankXAI_Connector::remove_user();",
  ].join(' '))
  const [aStatus, aCode, bStatus, unfiltered] = JSON.parse(viaUser || '[]')
  check('the allow list still applies', aStatus === 403 && aCode === 'rankxai_not_allowed' && bStatus === 403, viaUser)
  check('and it still has no unfiltered_html', unfiltered === false, viaUser)
  check("use the plugin's own routes", (await call(ours, 'GET', '/rankxai/v1/manifest')).status === 200)

  console.log('Control: any other Application Password is untouched')
  const u = await call(other, 'POST', '/wp/v2/users/1', { first_name: 'Admin' })
  check('another password may change a user', u.status === 200, String(u.status))
  const p2 = await call(other, 'POST', '/wp/v2/posts', { title: 'Scope probe control', status: 'draft', content: '<p>Hi</p><script>alert(1)</script>' })
  if (p2.json?.id) created.push(p2.json.id)
  const stored2 = p2.json?.id ? wp('post', 'get', String(p2.json.id), '--field=post_content') : ''
  check("and keeps the administrator's unfiltered_html", stored2.includes('<script'), stored2.slice(0, 80))
  check('another password reads the private post type', (await call(other, 'GET', '/wp/v2/rxprobe-private')).status === 200)
  const rpcOther = await xmlrpc(other)
  check('another password still works over XML-RPC', !rpcOther.fault && rpcOther.text.includes('isAdmin'), rpcOther.text.slice(0, 120))
  const theirs = await call(other, 'GET', '/rankxai/v1/connection')
  check('and the plugin says it is not RankX AI’s', theirs.status === 200 && theirs.json?.rankxaiPassword === false, JSON.stringify(theirs.json))
} finally {
  rmSync(PRIVATE_TYPE, { force: true })
  wp('option', 'update', 'blogname', title)
  wpSoft('option', 'update', 'page_on_front', frontBefore ?? '0')
  wpSoft('option', 'update', 'show_on_front', showOnFrontBefore ?? 'posts')
  for (const id of created) wpSoft('post', 'delete', String(id), '--force')
  for (const id of createdTerms) wpSoft('term', 'delete', 'product_cat', String(id))
  for (const name of ['scope-probe-rankxai', 'scope-probe-other']) {
    const uuid = wpSoft('user', 'application-password', 'list', 'admin', `--name=${name}`, '--field=uuid')
    if (uuid) wpSoft('user', 'application-password', 'delete', 'admin', uuid)
  }
  if (personalBefore !== null) wp('option', 'update', 'rankxai_share_personal_data', personalBefore)
  else wpSoft('option', 'delete', 'rankxai_share_personal_data')
  if (!wooWasActive) wp('plugin', 'deactivate', 'woocommerce')
}

console.log(`\nPASSED ${pass}   FAILED ${fail}`)
process.exit(fail ? 1 : 0)
