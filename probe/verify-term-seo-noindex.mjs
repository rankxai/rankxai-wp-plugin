#!/usr/bin/env node
/**
 * A product category's search title and description, and "keep search engines
 * out" on a product, through every supported SEO plugin, proven against a real
 * WordPress (plan 90b B4: category SEO and R3-B19).
 *
 * Run:  npx wp-env start   then   node probe/verify-term-seo-noindex.mjs
 *
 * For each scenario (no SEO plugin, then each SEO plugin alone):
 *   - writes a category's title and description through `/term-seo`, reads them
 *     back, checks the SEO plugin's own term storage holds them (the mirror),
 *     renders the category's archive page as a visitor and looks for them, then
 *     clears them and checks the page again;
 *   - sets `noindex` on a product through `/seo`, checks the read reports it as
 *     the page renders, renders the product page and reads its robots tag, then
 *     clears it and checks the tag is gone.
 * Plus the refusals: a bad value, an unknown taxonomy, an anonymous read.
 * It provisions everything itself and removes all of it. Run one probe at a time.
 */

import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const MARK = `rxtermseo${Date.now().toString(36)}`
const ALL = ['wordpress-seo', 'seo-by-rank-math', 'all-in-one-seo-pack', 'wp-seopress', 'autodescription', 'slim-seo', 'siteseo', 'surerank']
// Which SEO plugins keep term SEO in storage of their own (measured from each plugin's source in wp-env). All in One
// SEO Lite has no term model, and Slim SEO is not a target plugin, so neither has a mirror to check.
const MIRRORS = new Set(['wordpress-seo', 'seo-by-rank-math', 'wp-seopress', 'autodescription', 'siteseo', 'surerank'])

let pass = 0
let fail = 0
const notes = []
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(detail ? `${m} — ${detail}` : m))
const note = (m) => { console.log(`  NOTE  ${m}`); notes.push(m) }

// Rank Math's AI-visibility module exhausts WP-CLI's 128 MB on this rig, so the CLI never loads it; the site does.
function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', '--skip-plugins=seo-by-rank-math', ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 240_000 }).replace(/\n$/, '')
}
function wpQuiet(...args) {
  try { return wp(...args) } catch { return null }
}

async function http(url, init = {}, attempt = 0) {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (attempt >= 3) throw e
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    return http(url, init, attempt + 1)
  }
}

let AUTH = ''
async function api(route, init = {}) {
  const [path, query = ''] = route.split(/[?&](.*)/s)
  const res = await http(`${BASE}/?rest_route=${encodeURIComponent(path)}${query ? `&${query}` : ''}&cb=${Date.now()}`, {
    ...init,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  let json = null
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json }
}

async function page(url) {
  const res = await http(`${url}${url.includes('?') ? '&' : '?'}probe=${Date.now()}`)
  return { status: res.status, html: await res.text(), xRobots: res.headers.get('x-robots-tag') }
}

const decode = (s) => s.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
function titleOf(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? decode(m[1].trim()) : null
}
function descriptionsOf(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /\bname\s*=\s*["']description["']/i.test(t))
    .map((t) => decode((/\bcontent\s*=\s*"([^"]*)"/i.exec(t) ?? /\bcontent\s*=\s*'([^']*)'/i.exec(t) ?? [])[1] ?? ''))
}
function noindexOf(html, header) {
  const says = (c) => c.toLowerCase().split(/[\s,]+/).some((d) => d === 'noindex' || d === 'none')
  if (header && says(header)) return true
  return [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
    .filter((t) => /\bname\s*=\s*["'](robots|googlebot)["']/i.test(t))
    .some((t) => says((/\bcontent\s*=\s*["']([^"']*)["']/i.exec(t) ?? [])[1] ?? ''))
}

function activateOnly(plugins) {
  wpQuiet('plugin', 'deactivate', ...ALL, '--quiet')
  if (plugins.length) wpQuiet('plugin', 'activate', ...plugins, '--quiet')
  const active = wp('plugin', 'list', '--status=active', '--field=name').split(/\r?\n/).filter((n) => ALL.includes(n)).sort()
  if (JSON.stringify(active) !== JSON.stringify([...plugins].sort())) {
    throw new Error(`could not switch plugins: wanted ${plugins.join(',') || 'none'}, active ${active.join(',') || 'none'}`)
  }
  if (plugins.includes('seo-by-rank-math')) wpQuiet('option', 'update', 'rank_math_wizard_completed', '1')
}

const made = { product: null, cat: null }

async function termScenario(plugin, catUrl) {
  const title = `${MARK} category title ${plugin ?? 'none'}`
  const description = `${MARK} category description ${plugin ?? 'none'}, with an ampersand & a quote ’.`
  const before = await api(`/rankxai/v1/term-seo/product_cat/${made.cat}`)
  check(before.status === 200, 'GET /term-seo answers', `${before.status} ${JSON.stringify(before.json).slice(0, 160)}`)
  const w = await api(`/rankxai/v1/term-seo/product_cat/${made.cat}`, { method: 'POST', body: JSON.stringify({ fields: { title, description } }) })
  check(w.status === 200 && w.json?.stored?.title === title && w.json?.stored?.description === description.replace(/\s+/g, ' ').trim(),
    'POST /term-seo stores the title and description', `${w.status} ${JSON.stringify(w.json?.stored ?? w.json).slice(0, 200)}`)
  const read = await api(`/rankxai/v1/term-seo/product_cat/${made.cat}`)
  if (plugin && MIRRORS.has(plugin)) {
    check(read.json?.pluginStored?.title === title && typeof read.json?.pluginStored?.description === 'string' && read.json.pluginStored.description.startsWith(MARK),
      `the SEO plugin's own term storage holds them (${read.json?.targetPlugin})`, JSON.stringify(read.json?.pluginStored))
  }
  const rendered = await page(catUrl)
  const t = titleOf(rendered.html)
  const ds = descriptionsOf(rendered.html)
  if (plugin === 'slim-seo') {
    // Slim SEO is not a target plugin: it prints its own head from its own data, which we do not mirror into.
    note(`slim-seo: the archive shows title "${t?.slice(0, 60)}" and ${ds.length} description tag(s); ours are stored but Slim SEO prints its own`)
  } else {
    check(rendered.status === 200 && !!t && t.includes(title), 'the archive page\'s <title> shows it', `${rendered.status} ${t}`)
    check(ds.some((d) => d.startsWith(MARK)), 'the archive page\'s meta description shows it', JSON.stringify(ds).slice(0, 200))
    check(ds.length <= 1, 'the archive page carries one meta description, not two', String(ds.length))
  }
  const c = await api(`/rankxai/v1/term-seo/product_cat/${made.cat}`, { method: 'POST', body: JSON.stringify({ fields: { title: '', description: '' } }) })
  check(c.status === 200 && Object.keys(c.json?.stored ?? {}).length === 0, 'an empty value clears both', JSON.stringify(c.json?.stored))
  if (plugin && MIRRORS.has(plugin)) check(!c.json?.pluginStored?.title, 'and the mirror is cleared too', JSON.stringify(c.json?.pluginStored))
  // The written strings themselves, not MARK: the fixture category is NAMED with MARK, so its default title carries it.
  const after = await page(catUrl)
  check(!(titleOf(after.html) ?? '').includes(title) && !descriptionsOf(after.html).some((d) => d.startsWith(description.slice(0, 40))), 'the archive no longer shows them', titleOf(after.html) ?? '')
}

async function noindexScenario(plugin, productUrl) {
  const start = await api(`/rankxai/v1/seo/${made.product}`)
  check(start.status === 200 && start.json?.rankxai?.noindex === undefined, 'GET /seo answers, with no noindex of ours', JSON.stringify(start.json?.rankxai))
  if (plugin && plugin !== 'slim-seo') check(start.json?.pluginStored?.noindex === '0', 'and reports the page as indexable', JSON.stringify(start.json?.pluginStored?.noindex))
  const on = await api(`/rankxai/v1/seo/${made.product}`, { method: 'POST', body: JSON.stringify({ fields: { noindex: '1' } }) })
  check(on.status === 200 && on.json?.stored?.noindex === '1', 'POST noindex "1" is stored', `${on.status} ${JSON.stringify(on.json).slice(0, 200)}`)
  if (plugin && plugin !== 'slim-seo') check(on.json?.pluginStored?.noindex === '1', 'the SEO plugin now reports it as noindex', JSON.stringify(on.json?.pluginStored?.noindex))
  const hidden = await page(productUrl)
  if (plugin === 'slim-seo') {
    note(`slim-seo: the product page ${noindexOf(hidden.html, hidden.xRobots) ? 'carries' : 'does not carry'} noindex (no robots integration for a non-target plugin)`)
  } else {
    check(hidden.status === 200 && noindexOf(hidden.html, hidden.xRobots), 'the product page now tells search engines to stay out')
  }
  const off = await api(`/rankxai/v1/seo/${made.product}`, { method: 'POST', body: JSON.stringify({ fields: { noindex: '' } }) })
  check(off.status === 200 && off.json?.stored?.noindex === undefined, 'POST noindex "" clears ours', JSON.stringify(off.json?.stored))
  if (plugin && plugin !== 'slim-seo') check(off.json?.pluginStored?.noindex === '0', 'the SEO plugin reports it indexable again', JSON.stringify(off.json?.pluginStored?.noindex))
  const shown = await page(productUrl)
  check(!noindexOf(shown.html, shown.xRobots), 'the product page no longer says noindex')
}

async function scenario(plugin, urls) {
  console.log(`\n== ${plugin ?? 'no SEO plugin'} ==`)
  activateOnly(plugin ? [plugin] : [])
  await termScenario(plugin, urls.cat)
  await noindexScenario(plugin, urls.product)
}

async function refusals() {
  console.log('\n== refusals ==')
  const badValue = await api(`/rankxai/v1/seo/${made.product}`, { method: 'POST', body: JSON.stringify({ fields: { noindex: 'yes' } }) })
  check(badValue.status === 400 && badValue.json?.code === 'rankxai_invalid_field', 'noindex must be "1" or ""', `${badValue.status} ${badValue.json?.code}`)
  const badField = await api(`/rankxai/v1/term-seo/product_cat/${made.cat}`, { method: 'POST', body: JSON.stringify({ fields: { canonical: 'https://example.com' } }) })
  check(badField.status === 400 && badField.json?.code === 'rankxai_unknown_field', 'a term field we do not carry is refused, not ignored', `${badField.status} ${badField.json?.code}`)
  const badTax = await api('/rankxai/v1/term-seo/nav_menu/1')
  check(badTax.status === 400 && badTax.json?.code === 'rankxai_bad_taxonomy', 'a taxonomy with no public archive is refused', `${badTax.status} ${badTax.json?.code}`)
  const missing = await api('/rankxai/v1/term-seo/product_cat/999999999')
  check(missing.status === 404, 'a term that does not exist answers 404', String(missing.status))
  const anon = await http(`${BASE}/?rest_route=${encodeURIComponent(`/rankxai/v1/term-seo/product_cat/${made.cat}`)}`)
  check(anon.status === 401 || anon.status === 403, `an anonymous read is refused (${anon.status})`)
  const manifest = await api('/rankxai/v1/manifest')
  const caps = manifest.json?.capabilities ?? []
  check(['seo.noindex', 'term_seo.read', 'term_seo.write'].every((c) => caps.includes(c)), 'the manifest advertises seo.noindex, term_seo.read and term_seo.write', JSON.stringify(caps))
}

async function main() {
  console.log(`== wp-env at ${BASE} ==`)
  const originalActive = wp('plugin', 'list', '--status=active', '--field=name').split(/\r?\n/).filter((n) => ALL.includes(n))
  const wooWasActive = wp('plugin', 'list', '--status=active', '--field=name').split(/\r?\n/).includes('woocommerce')
  let pwUuid = null
  try {
    if (!wooWasActive) wp('plugin', 'activate', 'woocommerce')
    wpQuiet('option', 'update', 'woocommerce_coming_soon', 'no')
    const pw = wp('user', 'application-password', 'create', 'admin', MARK, '--porcelain')
    pwUuid = wp('user', 'application-password', 'list', 'admin', `--name=${MARK}`, '--field=uuid')
    AUTH = 'Basic ' + Buffer.from(`admin:${pw}`).toString('base64')
    const cat = await api('/wc/v3/products/categories', { method: 'POST', body: JSON.stringify({ name: `${MARK} category` }) })
    made.cat = cat.json?.id ?? null
    if (!made.cat) throw new Error(`category create: ${cat.status} ${JSON.stringify(cat.json).slice(0, 200)}`)
    const product = await api('/wc/v3/products', { method: 'POST', body: JSON.stringify({ name: `${MARK} product`, type: 'simple', status: 'publish', regular_price: '10.00', categories: [{ id: made.cat }] }) })
    made.product = product.json?.id ?? null
    if (!made.product) throw new Error(`product create: ${product.status} ${JSON.stringify(product.json).slice(0, 200)}`)
    // wp-env pins WP_HOME, so the canonical permalink is the site's own; the archive's link is read back, never built.
    const urls = { cat: wp('eval', `echo get_term_link(${made.cat}, 'product_cat');`), product: product.json.permalink }
    console.log(`fixtures: category ${made.cat} (${urls.cat}), product ${made.product} (${urls.product})`)
    await scenario(null, urls)
    for (const plugin of ['wordpress-seo', 'seo-by-rank-math', 'all-in-one-seo-pack', 'wp-seopress', 'autodescription', 'siteseo', 'surerank', 'slim-seo']) {
      await scenario(plugin, urls)
    }
    activateOnly([])
    await refusals()
  } catch (e) {
    bad(`the probe threw: ${e.stack ?? e.message}`)
  } finally {
    if (made.product) await api(`/wc/v3/products/${made.product}?force=true`, { method: 'DELETE' })
    if (made.cat) await api(`/wc/v3/products/categories/${made.cat}?force=true`, { method: 'DELETE' })
    const leftProduct = made.product ? (await api(`/wc/v3/products/${made.product}`)).status : 404
    check(leftProduct === 404, 'removed its fixture product', String(leftProduct))
    if (pwUuid) wpQuiet('user', 'application-password', 'delete', 'admin', pwUuid)
    try { activateOnly(originalActive) } catch (e) { bad(`could not restore the active plugins: ${e.message}`) }
    if (!wooWasActive) wpQuiet('plugin', 'deactivate', 'woocommerce')
  }
  console.log(`\nPASSED ${pass}   FAILED ${fail}${notes.length ? `   NOTES ${notes.length}` : ''}`)
  process.exit(fail ? 1 : 0)
}

main()
