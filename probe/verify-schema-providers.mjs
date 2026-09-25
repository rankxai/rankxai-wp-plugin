#!/usr/bin/env node
/**
 * Per-post schema through every supported SEO plugin, proven against a real
 * WordPress.
 *
 * Run:  npx wp-env start   then   node probe/verify-schema-providers.mjs
 *
 * For each scenario (no SEO plugin, then each of the six alone) it activates
 * that plugin, writes a FAQPage through `/schema-set`, and reads the page back
 * as a visitor would: the node must appear, and the page must carry ONE graph.
 * Rank Math additionally gets a native write, checked against Rank Math's own
 * reader — the same function its schema editor loads from.
 *
 * It provisions everything itself (an application password and its posts) and
 * removes all of it. Run one probe at a time: they share this WordPress.
 */

import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const BS = String.fromCharCode(92)

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(detail ? `${m} — ${detail}` : m))

function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', stdio: 'pipe' }).replace(/\n$/, '')
}
function wpQuiet(...args) {
  try { return wp(...args) } catch { return null }
}

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
  let body = null
  try { body = await res.json() } catch { body = null }
  return { status: res.status, json: body }
}

/** Every JSON-LD script on a page: its attributes and parsed body. */
function scripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => /application\/ld\+json/i.test(m[1]))
    .map((m) => {
      let data = null
      try { data = JSON.parse(m[2].trim()) } catch { data = undefined }
      return { attrs: m[1], data }
    })
}
function nodesOf(list) {
  const out = []
  for (const s of list) {
    if (s.data && Array.isArray(s.data['@graph'])) out.push(...s.data['@graph'])
    else if (Array.isArray(s.data)) out.push(...s.data)
    else if (s.data) out.push(s.data)
  }
  return out
}
const hasType = (n, t) => (Array.isArray(n['@type']) ? n['@type'].includes(t) : n['@type'] === t)

async function page(url, cookie = '') {
  const res = await http(`${url}${url.includes('?') ? '&' : '?'}probe=${Date.now()}`, cookie ? { headers: { Cookie: cookie } } : {})
  return { status: res.status, html: res.ok ? await res.text() : '' }
}

// ---------------------------------------------------------------------------

const MARK = `schema-probe-${Date.now()}`
const ALL = ['wordpress-seo', 'seo-by-rank-math', 'wp-seopress', 'all-in-one-seo-pack', 'autodescription', 'slim-seo', 'siteseo', 'surerank']
const SLUG = {
  'seo-by-rank-math': 'rankmath',
  'wordpress-seo': 'yoast',
  'all-in-one-seo-pack': 'aioseo',
  'wp-seopress': 'seopress',
  autodescription: 'tsf',
  'slim-seo': 'slimseo',
  siteseo: 'siteseo',
  surerank: 'surerank',
}
const created = []
let appPasswordUuid = ''

const FAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: `Is this the probe? ${MARK}`,
      acceptedAnswer: { '@type': 'Answer', text: `Yes, with a path C:${BS}Users${BS}probe and an accent é.` },
    },
  ],
}
const SERVICE = { '@type': 'Service', name: `Probe service ${MARK}`, description: `A service with a backslash ${BS}d+.`, serviceType: 'Answering' }

/**
 * wp-cli exits non-zero when an activation hook merely WARNS under WP_DEBUG, so
 * the exit code is not the answer. The plugin list afterwards is.
 */
function activateOnly(plugins) {
  wpQuiet('plugin', 'deactivate', ...ALL, '--quiet')
  if (plugins.length) wpQuiet('plugin', 'activate', ...plugins, '--quiet')
  const active = wp('plugin', 'list', '--status=active', '--field=name').split(/\r?\n/).filter((n) => ALL.includes(n)).sort()
  if (JSON.stringify(active) !== JSON.stringify([...plugins].sort())) {
    throw new Error(`could not switch plugins: wanted ${plugins.join(',') || 'none'}, active ${active.join(',') || 'none'}`)
  }
  if (plugins.includes('seo-by-rank-math')) {
    wp('option', 'update', 'rank_math_wizard_completed', '1')
    const modules = JSON.parse(wp('option', 'get', 'rank_math_modules', '--format=json'))
    if (!modules.includes('rich-snippet')) wp('option', 'update', 'rank_math_modules', JSON.stringify([...modules, 'rich-snippet']), '--format=json')
  }
}

function createPage(status) {
  const id = Number(wp('post', 'create', '--post_type=page', `--post_status=${status}`, `--post_title=${MARK} ${status}`, '--porcelain'))
  created.push(id)
  return id
}

async function state(id) {
  const r = await api(`/rankxai/v1/schema-set/${id}`)
  if (r.status !== 200) throw new Error(`state ${id}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`)
  return r.json
}

async function write(id, body) {
  return api(`/rankxai/v1/schema-set/${id}`, { method: 'POST', body: JSON.stringify(body) })
}

async function upsert(id, store, schema, extra = {}) {
  const s = await state(id)
  return write(id, { op: 'upsert', store, schema, expectedSchemaVersion: s.schemaVersion, ...extra })
}

async function adminCookie() {
  const res = await http(`${BASE}/wp-login.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body: new URLSearchParams({ log: 'admin', pwd: 'password', 'wp-submit': 'Log In', testcookie: '1' }).toString(),
  })
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? '']
  return raw.map((c) => c.split(';')[0]).filter((c) => c.startsWith('wordpress_')).join('; ')
}

// ---------------------------------------------------------------------------

async function scenario(plugin) {
  const expectSlug = plugin ? SLUG[plugin] : ''
  console.log(`\n== ${plugin ?? 'no SEO plugin'} ==`)
  activateOnly(plugin ? [plugin] : [])

  const pub = createPage('publish')
  const before = await state(pub)
  check(JSON.stringify(before.active) === JSON.stringify(plugin ? [expectSlug] : []), `detects ${expectSlug || 'no plugin'}`, JSON.stringify(before.active))
  if (plugin) {
    const facts = before.providers.find((p) => p.slug === expectSlug)
    check(facts && facts.active && facts.version !== '', `reports ${expectSlug} version ${facts?.version}`)
  }
  const expectKind = !plugin ? 'standalone' : ['wp-seopress', 'siteseo', 'surerank'].includes(plugin) ? 'separate_script' : 'inject'
  check(before.printPlan.kind === expectKind, `print plan is ${expectKind}`, JSON.stringify(before.printPlan))

  // Inject / standalone: our store.
  const w = await upsert(pub, 'rankxai', FAQ, { provider: expectSlug })
  check(w.status === 200 && w.json?.written?.id?.startsWith('rankxai:'), 'our store accepts a FAQPage', `${w.status} ${JSON.stringify(w.json).slice(0, 200)}`)
  const item = w.json?.state?.items?.find((i) => i.id === w.json?.written?.id)
  check(item && item.schema.mainEntity[0].acceptedAnswer.text.includes(`C:${BS}Users${BS}probe`), 'stored byte for byte, backslashes included')
  check(item && item.schema['@context'] === undefined, '@context is not stored on the node')

  const url = before.publicUrl
  const { html } = await page(url)
  const all = scripts(html)
  const graphs = all.filter((s) => s.data && Array.isArray(s.data['@graph']))
  const faqs = nodesOf(all).filter((n) => hasType(n, 'FAQPage') || (Array.isArray(n['@type']) && n['@type'].includes('FAQPage')))
  check(all.every((s) => s.data !== undefined), 'every JSON-LD script on the page parses')
  check(faqs.some((n) => JSON.stringify(n).includes(MARK)), 'the FAQPage is printed on the page')
  check(faqs.filter((n) => JSON.stringify(n).includes(MARK)).length === 1, 'and printed once')
  if (expectKind === 'inject') {
    check(graphs.length === 1, `the page carries ONE @graph (found ${graphs.length})`)
    check(!all.some((s) => /rankxai-schema/.test(s.attrs)), 'we printed no script of our own')
    const holder = all.find((s) => JSON.stringify(s.data ?? '').includes(MARK))
    check(holder && !/rankxai-schema/.test(holder.attrs), 'the FAQPage sits inside the SEO plugin’s own script', holder?.attrs)
  } else {
    check(all.filter((s) => /rankxai-schema/.test(s.attrs)).length === 1, 'exactly one RankX AI script')
  }

  // A stale version is refused and changes nothing.
  const stale = await write(pub, { op: 'upsert', store: 'rankxai', schema: SERVICE, expectedSchemaVersion: before.schemaVersion })
  check(stale.status === 409 && stale.json?.code === 'rankxai_schema_moved', 'a write with a stale schemaVersion is refused (409)')
  const after = await state(pub)
  check(after.items.filter((i) => i.store === 'rankxai').length === 1, 'and nothing was written')

  // Draft: rendered only to a logged-in editor.
  const draft = createPage('draft')
  const dw = await upsert(draft, 'rankxai', FAQ, { provider: expectSlug })
  check(dw.status === 200, 'a draft accepts a write')
  const cookie = await adminCookie()
  const pv = await page(`${BASE}/?page_id=${draft}&preview=true`, cookie)
  check(pv.status === 200 && pv.html.includes(MARK), 'an authenticated preview of the draft prints it', `status ${pv.status}`)
  const pvGraphs = scripts(pv.html).filter((s) => s.data && Array.isArray(s.data['@graph']))
  if (expectKind === 'inject') check(pvGraphs.length === 1, `the preview carries ONE @graph (found ${pvGraphs.length})`)

  // Delete, then gone.
  const s2 = await state(pub)
  const del = await write(pub, { op: 'delete', target: item?.id ?? '', expectedSchemaVersion: s2.schemaVersion })
  check(del.status === 200 && !del.json?.state?.items?.some((i) => i.store === 'rankxai'), 'delete removes it from storage')
  const gone = await page(url)
  // The question text, not MARK: MARK is also in the page's own title.
  check(!gone.html.includes(`Is this the probe? ${MARK}`), 'and from the page')
  if (plugin === 'seo-by-rank-math' || plugin === 'wordpress-seo' || plugin === 'all-in-one-seo-pack' || plugin === 'autodescription' || plugin === 'slim-seo') {
    check(scripts(gone.html).filter((s) => s.data && Array.isArray(s.data['@graph'])).length === 1, 'the plugin’s own graph is still there')
  }

  if (plugin === 'seo-by-rank-math') await rankMathNative(pub, url)
  if (plugin === 'seo-by-rank-math') await rankMathModuleOff(pub, url)
}

async function rankMathNative(pub, url) {
  console.log('  -- Rank Math native --')
  const n = await api(`/rankxai/v1/schema-set/${pub}/normalise`, { method: 'POST', body: JSON.stringify({ store: 'rankmath', schema: SERVICE }) })
  check(n.status === 200 && n.json?.normalised?.metadata?.type === 'template', 'normalise returns Rank Math’s row with its metadata', JSON.stringify(n.json).slice(0, 200))
  const countBefore = Number(wp('db', 'query', `SELECT COUNT(*) FROM wp_postmeta WHERE post_id=${pub} AND meta_key LIKE 'rank_math_schema%'`, '--skip-column-names'))
  check(countBefore === 0, 'normalise wrote nothing')

  const w = await upsert(pub, 'rankmath', SERVICE)
  check(w.status === 200 && w.json?.written?.id?.startsWith('rankmath:'), 'a Service is written into Rank Math', `${w.status} ${JSON.stringify(w.json).slice(0, 300)}`)
  const mid = Number((w.json?.written?.id ?? '').split(':')[1])

  // Rank Math's own reader, which its schema editor loads from.
  const theirs = JSON.parse(wp('eval', `echo wp_json_encode( \\RankMath\\Schema\\DB::get_schemas( ${pub}, 'postmeta', true ) );`))
  const row = theirs[`schema-${mid}`]
  check(row && row['@type'] === 'Service', 'Rank Math’s own reader returns the row')
  check(row && row.metadata && row.metadata.type === 'template' && row.metadata.title === 'Service' && !!row.metadata.isPrimary, 'with the metadata its editor expects (Rank Math’s sanitiser stores true as "1")', JSON.stringify(row?.metadata))
  check(row && row.description === SERVICE.description, 'backslashes survive Rank Math’s own write path', row?.description)
  const shortcut = wpQuiet('post', 'meta', 'get', String(pub), `rank_math_shortcode_schema_${row?.metadata?.shortcode}`)
  check(Number(shortcut) === mid, 'and its shortcut row points at it')

  const { html } = await page(url)
  const nodes = nodesOf(scripts(html))
  const svc = nodes.find((x) => hasType(x, 'Service') && x.name === SERVICE.name)
  check(!!svc, 'Rank Math prints the Service in its graph')
  check(svc && svc.mainEntityOfPage, 'as the primary schema (mainEntityOfPage)')
  check(scripts(html).filter((s) => s.data && Array.isArray(s.data['@graph'])).length === 1, 'still ONE @graph')

  // Replace keeps its metadata.
  const s3 = await state(pub)
  const r = await write(pub, { op: 'upsert', store: 'rankmath', schema: { ...SERVICE, serviceType: 'Updated' }, target: `rankmath:${mid}`, expectedSchemaVersion: s3.schemaVersion })
  const replaced = r.json?.state?.items?.find((i) => i.id === `rankmath:${mid}`)
  check(r.status === 200 && replaced?.schema?.serviceType === 'Updated' && replaced?.metadata?.shortcode === row?.metadata?.shortcode, 'replacing keeps the row id and its metadata')

  // A second row is not primary.
  const s4 = await state(pub)
  const w2 = await write(pub, { op: 'upsert', store: 'rankmath', schema: { '@type': 'Course', name: `Probe course ${MARK}`, description: 'x', provider: { '@type': 'Organization', name: 'P' } }, expectedSchemaVersion: s4.schemaVersion })
  const second = w2.json?.state?.items?.find((i) => i.id === w2.json?.written?.id)
  check(w2.status === 200 && second?.primary === false, 'a second row is not marked primary')

  // Delete both; nothing of Rank Math's own settings changes.
  const before = wpQuiet('post', 'meta', 'get', String(pub), 'rank_math_rich_snippet')
  for (const id of [`rankmath:${mid}`, w2.json?.written?.id]) {
    const s = await state(pub)
    await write(pub, { op: 'delete', target: id, expectedSchemaVersion: s.schemaVersion })
  }
  const left = Number(wp('db', 'query', `SELECT COUNT(*) FROM wp_postmeta WHERE post_id=${pub} AND (meta_key LIKE 'rank_math_schema%' OR meta_key LIKE 'rank_math_shortcode_schema%')`, '--skip-column-names'))
  check(left === 0, 'deleting removes the rows and their shortcuts')
  check(wpQuiet('post', 'meta', 'get', String(pub), 'rank_math_rich_snippet') === before, 'and leaves rank_math_rich_snippet alone')
}

async function rankMathModuleOff(pub, url) {
  console.log('  -- Rank Math with its Schema module off --')
  const modules = JSON.parse(wp('option', 'get', 'rank_math_modules', '--format=json'))
  wp('option', 'update', 'rank_math_modules', JSON.stringify(modules.filter((m) => m !== 'rich-snippet')), '--format=json')
  try {
    const s = await state(pub)
    const rm = s.providers.find((p) => p.slug === 'rankmath')
    check(rm.graphEnabled === false && rm.nativeStore.available === false, 'reported as off, and the native store as unavailable')
    check(s.printPlan.kind === 'separate_script', 'our nodes are planned as our own script')
    const w = await upsert(pub, 'rankxai', FAQ, { provider: 'rankmath' })
    const { html } = await page(url)
    const all = scripts(html)
    check(all.some((x) => /rankxai-schema/.test(x.attrs) && JSON.stringify(x.data).includes(MARK)), 'and printed once, on their own')
    const s2 = await state(pub)
    await write(pub, { op: 'delete', target: w.json?.written?.id, expectedSchemaVersion: s2.schemaVersion })
  } finally {
    wp('option', 'update', 'rank_math_modules', JSON.stringify(modules), '--format=json')
  }
}

/** SEO metadata written through /seo lands in the plugin's own storage and on the page. */
async function seoMirror(plugin) {
  console.log(`
== ${plugin}: SEO metadata into its own storage ==`)
  activateOnly([plugin])
  const pub = createPage('publish')
  const desc = `Probe description ${MARK} with a C:${BS}path`
  const r = await api(`/rankxai/v1/seo/${pub}`, { method: 'POST', body: JSON.stringify({ fields: { description: desc, og_title: `OG ${MARK}` } }) })
  check(r.status === 200 && r.json?.targetPlugin === SLUG[plugin], `targets ${SLUG[plugin]}`, JSON.stringify(r.json).slice(0, 200))
  check(r.json?.pluginStored?.description === desc, 'the description is in the plugin’s own storage, backslash intact', JSON.stringify(r.json?.pluginStored))
  check(r.json?.pluginStored?.og_title === `OG ${MARK}`, 'and the Open Graph title')
  if (plugin === 'surerank') {
    const raw = wp('post', 'meta', 'get', String(pub), 'surerank_settings_general', '--format=json')
    check(raw && JSON.parse(raw).page_description === desc, 'SureRank’s general group holds it as an array key')
  }
  const { html } = await page(wp('post', 'url', String(pub)))
  const descs = (html.match(/<meta[^>]+name=["']description["'][^>]*>/gi) || [])
  check(descs.length === 1 && descs[0].includes(`Probe description ${MARK}`), `the page prints our description once (${descs.length})`, descs.join(' | '))
}

async function legacyAndSwitch() {
  console.log('\n== the older single document, and a site that installs an SEO plugin later ==')
  activateOnly([])
  const pub = createPage('publish')
  const doc = JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', '@id': `${BASE}/#org-${MARK}`, name: `Legacy org ${MARK}` }] })
  const put = await api(`/rankxai/v1/schema/${pub}`, { method: 'PUT', body: JSON.stringify({ content: doc }) })
  check(put.status === 200 && put.json?.stored === true, 'the older /schema route still stores a graph')
  const s = await state(pub)
  const legacy = s.items.find((i) => i.store === 'legacy')
  check(legacy && legacy.type === 'Organization', 'and /schema-set lists it')

  const w = await upsert(pub, 'rankxai', FAQ)
  check(w.status === 200, 'a standalone FAQPage is stored beside it')
  let html = (await page(s.publicUrl)).html
  let ours = scripts(html).filter((x) => /rankxai-schema/.test(x.attrs))
  check(ours.length === 1 && JSON.stringify(ours[0].data).includes(`Legacy org ${MARK}`) && JSON.stringify(ours[0].data).includes(`Is this the probe? ${MARK}`), 'with no SEO plugin, both print in ONE RankX AI graph')

  activateOnly(['wordpress-seo'])
  html = (await page(s.publicUrl)).html
  ours = scripts(html).filter((x) => /rankxai-schema/.test(x.attrs))
  const graphs = scripts(html).filter((x) => x.data && Array.isArray(x.data['@graph']))
  check(ours.length === 0, 'after Yoast is activated, we print no script of our own')
  check(graphs.length === 1 && JSON.stringify(graphs[0].data).includes(`Legacy org ${MARK}`) && JSON.stringify(graphs[0].data).includes(MARK), 'both now sit inside Yoast’s one graph')

  const s2 = await state(pub)
  const delLegacy = await write(pub, { op: 'delete', target: legacy?.id ?? 'legacy:0', expectedSchemaVersion: s2.schemaVersion })
  check(delLegacy.status === 409 && delLegacy.json?.code === 'rankxai_target_not_managed', 'the older document cannot be deleted through /schema-set')
}

async function multiple() {
  console.log('\n== two SEO plugins ==')
  activateOnly(['seo-by-rank-math', 'wordpress-seo'])
  const pub = createPage('publish')
  const s = await state(pub)
  check(s.active.length === 2, 'both are reported', JSON.stringify(s.active))
  await upsert(pub, 'rankxai', FAQ, { provider: 'yoast' })
  const s2 = await state(pub)
  check(s2.printPlan.provider === 'yoast', 'the set joins the plugin it was written for')
  const html = (await page(s.publicUrl)).html
  // The QUESTION text, never MARK alone: MARK is in the page title, so both
  // plugins' WebPage nodes carry it and a MARK count measures their graphs.
  const QUESTION = `Is this the probe? ${MARK}`
  const holders = scripts(html).filter((x) => JSON.stringify(x.data ?? '').includes(QUESTION))
  check(holders.length === 1 && /yoast-schema-graph/.test(holders[0].attrs), 'and prints inside Yoast’s graph only', holders.map((h) => h.attrs).join(' | '))
  check(nodesOf(scripts(html)).filter((n) => JSON.stringify(n).includes(QUESTION)).length === 1, 'once')
}

async function shapes() {
  console.log('\n== shapes the plugin refuses ==')
  activateOnly([])
  const pub = createPage('publish')
  const s = await state(pub)
  const tries = [
    [{ op: 'upsert', store: 'rankxai', schema: [1, 2], expectedSchemaVersion: s.schemaVersion }, 'a JSON list'],
    [{ op: 'upsert', store: 'rankxai', schema: { name: 'x' }, expectedSchemaVersion: s.schemaVersion }, 'no @type'],
    [{ op: 'upsert', store: 'rankxai', schema: { '@type': 'Bad Type!' }, expectedSchemaVersion: s.schemaVersion }, 'a malformed @type'],
    [{ op: 'upsert', store: 'nowhere', schema: FAQ, expectedSchemaVersion: s.schemaVersion }, 'an unknown store'],
    [{ op: 'upsert', store: 'rankxai', schema: FAQ }, 'no expectedSchemaVersion'],
  ]
  for (const [body, label] of tries) {
    const r = await write(pub, body)
    check(r.status >= 400 && r.status < 500, `refuses ${label} (${r.status} ${r.json?.code})`)
  }
  const after = await state(pub)
  check(after.items.length === 0, 'and none of them wrote anything')

  const anon = await http(`${BASE}/?rest_route=${encodeURIComponent(`/rankxai/v1/schema-set/${pub}`)}`)
  check(anon.status === 401 || anon.status === 403, `anonymous reads are refused (${anon.status})`)
}

async function main() {
  console.log(`== wp-env at ${BASE} ==`)
  const pw = wp('user', 'application-password', 'create', 'admin', MARK, '--porcelain')
  AUTH = 'Basic ' + Buffer.from(`admin:${pw}`).toString('base64')
  appPasswordUuid = wp('user', 'application-password', 'list', 'admin', `--name=${MARK}`, '--field=uuid')
  const originalActive = wp('plugin', 'list', '--status=active', '--field=name').split('\n').filter((n) => ALL.includes(n))

  try {
    await scenario(null)
    for (const plugin of ['seo-by-rank-math', 'wordpress-seo', 'all-in-one-seo-pack', 'wp-seopress', 'autodescription', 'slim-seo', 'siteseo', 'surerank']) {
      await scenario(plugin)
    }
    for (const plugin of ['siteseo', 'surerank', 'wordpress-seo', 'all-in-one-seo-pack']) await seoMirror(plugin)
    await legacyAndSwitch()
    await multiple()
    await shapes()
  } catch (e) {
    bad(`the probe threw: ${e.stack ?? e.message}`)
  } finally {
    for (const id of created) wpQuiet('post', 'delete', String(id), '--force')
    const leftover = created.filter((id) => wpQuiet('post', 'get', String(id), '--field=ID') !== null)
    check(leftover.length === 0, `removed its ${created.length} fixture posts`)
    if (appPasswordUuid) wpQuiet('user', 'application-password', 'delete', 'admin', appPasswordUuid)
    activateOnly(originalActive)
  }
  console.log(`\nPASSED ${pass}   FAILED ${fail}`)
  process.exit(fail ? 1 : 0)
}

main()
