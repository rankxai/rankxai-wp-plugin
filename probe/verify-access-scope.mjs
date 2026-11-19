#!/usr/bin/env node
/**
 * Checks the limits on RankX AI's Application Password against a real WordPress.
 *
 * Run: npx wp-env start, then node probe/verify-access-scope.mjs
 */
import { execFileSync } from 'node:child_process'
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

const title = wp('option', 'get', 'blogname')
const created = []
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
  wp('option', 'delete', 'rankxai_share_personal_data')

  console.log('Allowed for the RankX AI password')
  const post = await call(ours, 'POST', '/wp/v2/posts', { title: 'Scope probe', status: 'draft', content: '<p>Hello</p><script>alert(1)</script>' })
  if (post.json?.id) created.push(post.json.id)
  check('create a draft post', post.status === 201, String(post.status))
  const stored = post.json?.id ? wp('post', 'get', String(post.json.id), '--field=post_content') : ''
  check('its <script> was filtered (no unfiltered_html)', stored.includes('Hello') && !stored.includes('<script'), stored.slice(0, 80))
  check('permanent delete is refused', refused(await call(ours, 'DELETE', `/wp/v2/posts/${post.json?.id}`, { force: true })))
  check('move to trash', (await call(ours, 'DELETE', `/wp/v2/posts/${post.json?.id}`)).status === 200)
  check('read plugins', (await call(ours, 'GET', '/wp/v2/plugins')).status === 200)
  check('read the site root', (await call(ours, 'GET', '/')).status === 200)
  check('change the site title', (await call(ours, 'POST', '/wp/v2/settings', { title: `${title} (probe)` })).status === 200)
  check('read products', (await call(ours, 'GET', '/wc/v3/products')).status === 200)
  check("use the plugin's own routes", (await call(ours, 'GET', '/rankxai/v1/manifest')).status === 200)

  console.log('Control: any other Application Password is untouched')
  const u = await call(other, 'POST', '/wp/v2/users/1', { first_name: 'Admin' })
  check('another password may change a user', u.status === 200, String(u.status))
  const p2 = await call(other, 'POST', '/wp/v2/posts', { title: 'Scope probe control', status: 'draft', content: '<p>Hi</p><script>alert(1)</script>' })
  if (p2.json?.id) created.push(p2.json.id)
  const stored2 = p2.json?.id ? wp('post', 'get', String(p2.json.id), '--field=post_content') : ''
  check("and keeps the administrator's unfiltered_html", stored2.includes('<script'), stored2.slice(0, 80))
} finally {
  wp('option', 'update', 'blogname', title)
  for (const id of created) wpSoft('post', 'delete', String(id), '--force')
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
