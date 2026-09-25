#!/usr/bin/env node
/**
 * Gap fills (meta description, Open Graph, Twitter card, breadcrumbs, sitemap),
 * proven against a real WordPress.
 *
 * Run:  npx wp-env start   then   node probe/verify-fill.mjs
 *
 * With no SEO plugin: a switched-on feature prints from WordPress's own data,
 * and nothing is invented where WordPress holds nothing. With a known SEO
 * plugin active: every fill stops on the next request, whatever is switched on.
 * Provisions its own application password and posts, removes them, and leaves
 * the switches and the active plugins as it found them. Run one probe at a time.
 */
import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
let pass = 0
let fail = 0
const check = (cond, m, d = '') => {
  if (cond) { console.log(`  PASS  ${m}`); pass++ } else { console.log(`  FAIL  ${m}${d ? ` — ${d}` : ''}`); fail++ }
}
const wp = (...a) => execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...a], { encoding: 'utf8', stdio: 'pipe' }).replace(/\n$/, '')
const wpQuiet = (...a) => { try { return wp(...a) } catch { return null } }
const ALL = ['wordpress-seo', 'seo-by-rank-math', 'wp-seopress', 'all-in-one-seo-pack', 'autodescription', 'slim-seo', 'siteseo', 'surerank']
function only(plugins) {
  wpQuiet('plugin', 'deactivate', ...ALL, '--quiet')
  if (plugins.length) wpQuiet('plugin', 'activate', ...plugins, '--quiet')
}

/** Retries a TRANSPORT error only (Apache keep-alive resets); a status is never retried. */
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
async function api(route, init = {}) {
  const res = await http(`${BASE}/?rest_route=${encodeURIComponent(route)}&cb=${Date.now()}`, {
    ...init,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  let json = null
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json }
}
async function head(url) {
  const res = await http(`${url}${url.includes('?') ? '&' : '?'}probe=${Date.now()}`)
  const html = await res.text()
  const block = (html.match(/<!-- RankX AI -->([\s\S]*?)<!-- \/RankX AI -->/) ?? [])[1] ?? ''
  const count = (re) => (html.match(re) ?? []).length
  return {
    html,
    ours: block,
    descriptions: count(/<meta[^>]+name=["']description["']/gi),
    ogTitles: count(/<meta[^>]+property=["']og:title["']/gi),
    twitterCards: count(/<meta[^>]+name=["']twitter:card["']/gi),
  }
}

const MARK = `fill-probe-${Date.now()}`
const created = []

async function main() {
  const pw = wp('user', 'application-password', 'create', 'admin', MARK, '--porcelain')
  AUTH = 'Basic ' + Buffer.from(`admin:${pw}`).toString('base64')
  const uuid = wp('user', 'application-password', 'list', 'admin', `--name=${MARK}`, '--field=uuid')
  const originalActive = wp('plugin', 'list', '--status=active', '--field=name').split(/\r?\n/).filter((n) => ALL.includes(n))
  const before = await api('/rankxai/v1/fill')

  try {
    console.log('\n== the route ==')
    check(before.status === 200 && Array.isArray(before.json?.supported) && before.json.supported.length === 5, 'GET /fill lists the five features')
    const bad = await api('/rankxai/v1/fill', { method: 'PUT', body: JSON.stringify({ features: { invented: true } }) })
    check(bad.status === 400, 'an unknown feature is refused (400)')
    const notBool = await api('/rankxai/v1/fill', { method: 'PUT', body: JSON.stringify({ features: { open_graph: 'yes' } }) })
    check(notBool.status === 400, 'a non-boolean is refused (400)')
    const anon = await http(`${BASE}/?rest_route=${encodeURIComponent('/rankxai/v1/fill')}`)
    check(anon.status === 401 || anon.status === 403, `anonymous access is refused (${anon.status})`)

    console.log('\n== no SEO plugin, fills off: nothing new is printed ==')
    only([])
    await api('/rankxai/v1/fill', { method: 'PUT', body: JSON.stringify({ features: { meta_description: false, open_graph: false, twitter_card: false, sitemap: false, breadcrumbs: false } }) })
    const cat = wp('term', 'create', 'category', `Cat ${MARK}`, '--porcelain')
    const withExcerpt = Number(wp('post', 'create', '--post_status=publish', `--post_title=Excerpted ${MARK}`, `--post_excerpt=A hand-written summary ${MARK}.`, `--post_category=${cat}`, '--porcelain'))
    const noExcerpt = Number(wp('post', 'create', '--post_status=publish', `--post_title=Bare ${MARK}`, '--post_content=Body text that must never become a description.', '--porcelain'))
    created.push(withExcerpt, noExcerpt)
    const urlA = wp('post', 'url', String(withExcerpt))
    const urlB = wp('post', 'url', String(noExcerpt))
    const off = await head(urlA)
    check(off.descriptions === 0 && off.ogTitles === 0, 'with every fill off, no description or og:title appears')

    console.log('\n== no SEO plugin, fills on ==')
    const put = await api('/rankxai/v1/fill', { method: 'PUT', body: JSON.stringify({ features: { meta_description: true, open_graph: true, twitter_card: true, sitemap: true, breadcrumbs: true } }) })
    check(put.status === 200 && put.json?.features?.open_graph === true && put.json.blockedBy.length === 0, 'switched on, nothing blocking')
    const on = await head(urlA)
    check(on.descriptions === 1 && on.ours.includes(`A hand-written summary ${MARK}.`), 'meta description = the hand-written excerpt, once')
    check(on.ogTitles === 1 && on.ours.includes(`Excerpted ${MARK}`) && /og:url/.test(on.ours) && /og:type" content="article"/.test(on.ours) && /og:site_name/.test(on.ours), 'Open Graph from WordPress’s own data, once')
    check(on.twitterCards === 1 && /twitter:card" content="summary"/.test(on.ours), 'Twitter card, once (summary: no featured image)')
    const crumbs = [...on.html.matchAll(/<script[^>]*rankxai-schema[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('')
    check(/BreadcrumbList/.test(crumbs) && crumbs.includes(`Cat ${MARK}`), 'BreadcrumbList with the post’s category, in our one graph')

    const bare = await head(urlB)
    check(bare.descriptions === 0, 'NO description without an excerpt: the body is never truncated into one')
    check(!bare.ours.includes('og:description'), 'and no og:description either')
    const sm = await http(`${BASE}/wp-sitemap.xml`, { redirect: 'manual' })
    check(sm.status === 200, `core sitemap is served (${sm.status})`)

    console.log('\n== a known SEO plugin arrives: every fill stops on the next request ==')
    only(['wordpress-seo'])
    const blocked = await api('/rankxai/v1/fill')
    check(blocked.json?.features?.open_graph === true && blocked.json?.blockedBy?.includes('yoast'), 'the switches are still on, and Yoast is reported as blocking')
    const y = await head(urlA)
    check(y.ours === '', 'we print no head tags at all')
    check(y.ogTitles === 1 && y.descriptions <= 1, `Yoast’s own tags appear once (og:title ${y.ogTitles}, description ${y.descriptions})`)
    check(!/rankxai-breadcrumb/.test(y.html), 'no breadcrumb from us')
    const ysm = await http(`${BASE}/wp-sitemap.xml`, { redirect: 'manual' })
    check(ysm.status !== 200, `core sitemap stays off under Yoast (${ysm.status})`)

    console.log('\n== the opt-out filter ==')
    only([])
    wp('eval', "update_option('rankxai_probe_fill_off', 1);")
    const optOut = await head(urlA)
    // The probe mu-plugin honours rankxai_probe_fill_off by returning false from rankxai_fill_open_graph.
    check(!optOut.ours.includes('og:title') && optOut.ours.includes('twitter:card'), 'rankxai_fill_open_graph returning false stops Open Graph, and only Open Graph')
    wp('eval', "delete_option('rankxai_probe_fill_off');")
  } catch (e) {
    check(false, `the probe threw: ${e.stack ?? e.message}`)
  } finally {
    for (const id of created) wpQuiet('post', 'delete', String(id), '--force')
    wpQuiet('term', 'delete', 'category', ...wp('term', 'list', 'category', `--search=${MARK}`, '--field=term_id').split(/\r?\n/).filter(Boolean))
    if (before.json?.features) await api('/rankxai/v1/fill', { method: 'PUT', body: JSON.stringify({ features: before.json.features }) })
    wpQuiet('user', 'application-password', 'delete', 'admin', uuid)
    only(originalActive)
  }
  console.log(`\nPASSED ${pass}   FAILED ${fail}`)
  process.exit(fail ? 1 : 0)
}

main()
