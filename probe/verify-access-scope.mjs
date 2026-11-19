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

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const ours = wp('user', 'application-password', 'create', 'admin', 'scope-probe-rankxai', `--app-id=${APP_ID}`, '--porcelain')
const other = wp('user', 'application-password', 'create', 'admin', 'scope-probe-other', '--porcelain')
const auth = (pw) => 'Basic ' + Buffer.from(`admin:${pw}`).toString('base64')

async function call(pw, method, route, body) {
  const res = await fetch(`${BASE}/?rest_route=${encodeURIComponent(route)}`, {
    method,
    headers: { Authorization: auth(pw), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, code: json?.code ?? null, json }
}
const refused = (r) => r.status === 403 && r.code === 'rankxai_not_allowed'

const title = wp('option', 'get', 'blogname')
let post = 0
try {
  console.log('Refused for the RankX AI password')
  check('create a user', refused(await call(ours, 'POST', '/wp/v2/users', { username: 'x', email: 'x@example.com', password: 'x' })))
  check('change a user', refused(await call(ours, 'POST', '/wp/v2/users/1', { first_name: 'x' })))
  check('list Application Passwords', refused(await call(ours, 'GET', '/wp/v2/users/1/application-passwords')))
  check('install a plugin', refused(await call(ours, 'POST', '/wp/v2/plugins', { slug: 'hello-dolly' })))
  check('switch theme', refused(await call(ours, 'POST', '/wp/v2/themes/twentytwentyfive', { status: 'active' })))
  check('change a WooCommerce customer', refused(await call(ours, 'POST', '/wc/v3/customers/1', { first_name: 'x' })))
  check('issue a refund', refused(await call(ours, 'POST', '/wc/v3/orders/1/refunds', { amount: '1' })))
  check('send a batch', refused(await call(ours, 'POST', '/batch/v1', { requests: [] })))
  check('change the site address', refused(await call(ours, 'POST', '/wp/v2/settings', { siteurl: 'https://example.com' })))

  console.log('Allowed for the RankX AI password')
  const created = await call(ours, 'POST', '/wp/v2/posts', { title: 'Scope probe', status: 'draft' })
  post = created.json?.id ?? 0
  check('create a draft post', created.status === 201, String(created.status))
  check('permanent delete is refused', refused(await call(ours, 'DELETE', `/wp/v2/posts/${post}`, { force: true })))
  check('move to trash', (await call(ours, 'DELETE', `/wp/v2/posts/${post}`)).status === 200)
  check('read users', (await call(ours, 'GET', '/wp/v2/users')).status === 200)
  check('read plugins', (await call(ours, 'GET', '/wp/v2/plugins')).status === 200)
  check('change the site title', (await call(ours, 'POST', '/wp/v2/settings', { title: `${title} (probe)` })).status === 200)
  check("use the plugin's own routes", (await call(ours, 'GET', '/rankxai/v1/manifest')).status === 200)

  console.log('Control: any other Application Password is untouched')
  const u = await call(other, 'POST', '/wp/v2/users/1', { first_name: 'Admin' })
  check('another password may change a user', u.status === 200 && u.code !== 'rankxai_not_allowed', String(u.status))
} finally {
  wp('option', 'update', 'blogname', title)
  if (post) wp('post', 'delete', String(post), '--force')
  for (const name of ['scope-probe-rankxai', 'scope-probe-other']) {
    const uuid = wp('user', 'application-password', 'list', 'admin', `--name=${name}`, '--field=uuid')
    if (uuid) wp('user', 'application-password', 'delete', 'admin', uuid)
  }
}

console.log(`\nPASSED ${pass}   FAILED ${fail}`)
process.exit(fail ? 1 : 0)
