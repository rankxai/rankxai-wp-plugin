#!/usr/bin/env node
/**
 * Content writes and JSON-LD output, checked against a real WordPress. Creates and removes its own fixtures;
 * needs the mu-plugin in probe/mu-plugins, which wp-env maps in.
 *
 * Run:  npx wp-env start   then   node probe/verify-content-and-schema.mjs
 */

import { cliContainer, wpContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const USER = process.env.WP_USER ?? 'admin'
const PASS = process.env.WP_APP_PASSWORD ?? ''

if (!PASS) {
  console.error('Set WP_APP_PASSWORD (wp user application-password create admin phase3-probe --porcelain).')
  process.exit(2)
}

const BS = String.fromCharCode(92)
const ADMIN = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }

/**
 * fetch with a bounded retry on transport errors only (the rig's Apache closes idle sockets). A non-2xx is
 * a result and is never retried.
 */
async function http(url, init = {}, attempt = 0) {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (attempt >= 2) throw e
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    return http(url, init, attempt + 1)
  }
}

const api = (route, init = {}, auth = ADMIN, query = '') =>
  http(`${BASE}/?rest_route=${encodeURIComponent(route)}${query}`, {
    ...init,
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

async function json(route, init = {}, auth = ADMIN, query = '') {
  const res = await api(route, init, auth, query)
  let body = null
  try { body = await res.json() } catch { body = null }
  return { status: res.status, json: body }
}

/** A cache-busted public fetch, so a rendered page is this request's answer. */
async function page(url) {
  const res = await http(`${url}${url.includes('?') ? '&' : '?'}probe=${Date.now()}`)
  return { status: res.status, html: res.ok ? await res.text() : '' }
}

/** Every `application/ld+json` payload on a page, in document order, whatever its attributes. */
function ldJsonBlocks(html) {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)].map((m) => m[1])
}

/**
 * Whether this script carries the stored document. Stored documents print as nodes in one graph, so every
 * stored node, less its `@context`, must appear.
 */
function parsesTo(block, expectedJson) {
  try {
    const nodesOf = (doc) => {
      const list = Array.isArray(doc?.['@graph']) ? doc['@graph'] : Array.isArray(doc) ? doc : [doc]
      return list.map((n) => {
        const rest = { ...n }
        delete rest['@context']
        return JSON.stringify(rest)
      })
    }
    const have = new Set(nodesOf(JSON.parse(block)))
    return nodesOf(JSON.parse(expectedJson)).every((n) => have.has(n))
  } catch {
    return false
  }
}

/**
 * SEO plugins off for the schema sections, and back on after: these test our own script's escaping, and
 * probe/verify-schema-providers.mjs tests the SEO plugins.
 */
const SEO_PLUGINS = ['wordpress-seo', 'seo-by-rank-math', 'wp-seopress', 'all-in-one-seo-pack', 'autodescription', 'slim-seo']
let seoRestore = []
async function cliRun(...args) {
  const { execFileSync } = await import('node:child_process')
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', stdio: 'pipe' })
}
async function seoPluginsOff() {
  seoRestore = (await cliRun('plugin', 'list', '--status=active', '--field=name')).split(/\r?\n/).filter((n) => SEO_PLUGINS.includes(n))
  // A warning under WP_DEBUG exits non-zero; the plugin list is the answer.
  if (seoRestore.length) await cliRun('plugin', 'deactivate', ...seoRestore, '--quiet').catch(() => '')
}
async function seoPluginsBack() {
  if (!seoRestore.length) return
  await cliRun('plugin', 'activate', ...seoRestore, '--quiet').catch(() => '')
  seoRestore = []
}

async function wpOption(name) {
  const { execFileSync } = await import('node:child_process')
  const container = cliContainer()
  try {
    const out = execFileSync('docker', ['exec', '-u', '33', container, 'wp', 'option', 'get', name, '--format=json'], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return JSON.parse(out)
  } catch {
    return null
  }
}

/**
 * The post_content column straight from the database, independent of both REST transports.
 */
async function dbPostContent(id) {
  const { execFileSync } = await import('node:child_process')
  const container = cliContainer()
  try {
    const out = execFileSync('docker', ['exec', '-u', '33', container, 'wp', 'post', 'get', String(id), '--field=post_content'], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    // wp-cli appends exactly one newline to the field it prints.
    return out.replace(/\n$/, '')
  } catch {
    return null
  }
}

async function apacheLog() {
  const { execFileSync } = await import('node:child_process')
  const container = wpContainer()
  try {
    return execFileSync('docker', ['logs', '--tail', '2000', container], { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    return ''
  }
}

/** The lines this run added. Anchored on the last line seen, not a byte offset. */
function linesSince(before, after) {
  const anchor = before.trimEnd().split('\n').pop() ?? ''
  if (anchor === '') return after
  const at = after.lastIndexOf(anchor)
  return at === -1 ? after : after.slice(at + anchor.length)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MARK = `phase3-probe-${Date.now()}`
const created = { posts: [], users: [] }

/**
 * A body with every byte class a write without `wp_slash` mangles: backslashes, an escaped quote in block
 * attribute JSON, a `\u003c` escape, an emoji, accents and an em dash.
 */
const ADVERSARIAL_BODY = [
  '<!-- wp:paragraph -->',
  `<p>Backslash ${BS} and a regex ${BS}d+ and a path C:${BS}Users${BS}test and a double ${BS}${BS}</p>`,
  '<!-- /wp:paragraph -->',
  '<!-- wp:code -->',
  `<pre class="wp-block-code"><code>const s = "a ${BS}" quote"; // ${MARK}</code></pre>`,
  '<!-- /wp:code -->',
  `<!-- wp:greenshift-blocks/element {"id":"gsbp-abc123","tag":"div","textContent":"say ${BS}"hi${BS}""} -->`,
  '<div class="gsbp-abc123">Emoji \u{1F600}, accents é ü, em dash — and a JSON escape ' + BS + 'u003c</div>',
  '<!-- /wp:greenshift-blocks/element -->',
].join('\n')

async function createPost(fields, auth = ADMIN, type = 'posts') {
  const { status, json: body } = await json(`/wp/v2/${type}`, { method: 'POST', body: JSON.stringify(fields) }, auth)
  if (status !== 201 || !body?.id) throw new Error(`could not create a ${type} fixture: ${status} ${JSON.stringify(body).slice(0, 200)}`)
  created.posts.push({ id: body.id, type })
  return body
}

// ---------------------------------------------------------------------------

async function run() {
  const logBefore = await apacheLog()

  const manifest = await json('/rankxai/v1/manifest')
  const caps = manifest.json?.capabilities ?? []
  console.log(`\n== A. contract (plugin ${manifest.json?.pluginVersion}, contract ${manifest.json?.contractVersion}) ==`)
  for (const cap of ['content.write', 'schema.read', 'schema.write']) {
    caps.includes(cap) ? ok(`MANIFEST — advertises ${cap}`) : bad(`MANIFEST — does not advertise ${cap}`)
  }
  // The earlier capabilities must still be advertised too.
  ;['seo.read', 'seo.write', 'documents.read', 'twins.read'].every((c) => caps.includes(c))
    ? ok('MANIFEST — CONTROL: every pre-Phase-3 capability is still advertised')
    : bad(`MANIFEST — a previous capability was lost: ${JSON.stringify(caps)}`)

  const seed = await createPost({ title: `Probe ${MARK}`, content: '<!-- wp:paragraph -->\n<p>seed</p>\n<!-- /wp:paragraph -->', status: 'publish' })
  const PID = seed.id

  const noGet = await api(`/rankxai/v1/content/${PID}`, { method: 'GET' })
  noGet.status === 404 || noGet.status === 405
    ? ok(`ROUTE — /content offers no GET (${noGet.status}); reading a post is wp/v2's job`)
    : bad(`ROUTE — /content answered a GET with ${noGet.status}`)

  console.log('\n== B. content: what we sent is what is stored ==')
  const write = await json(`/rankxai/v1/content/${PID}`, { method: 'POST', body: JSON.stringify({ fields: { content: ADVERSARIAL_BODY } }) })
  write.status === 200 ? ok('WRITE — accepted') : bad(`WRITE — ${write.status} ${JSON.stringify(write.json).slice(0, 300)}`)
  const stored = write.json?.object?.content?.raw ?? ''

  if (stored === ADVERSARIAL_BODY) {
    ok('BYTES — the stored body is byte-identical to what was sent, backslashes and all')
  } else {
    let at = 0
    while (at < Math.max(stored.length, ADVERSARIAL_BODY.length) && stored[at] === ADVERSARIAL_BODY[at]) at++
    bad(`BYTES — diverged at ${at}\n        sent: ${JSON.stringify(ADVERSARIAL_BODY.slice(Math.max(0, at - 40), at + 40))}\n        got : ${JSON.stringify(stored.slice(Math.max(0, at - 40), at + 40))}`)
  }
  // Control: a route that echoed its input would pass the check above, so read the database row itself.
  const inDb = await dbPostContent(PID)
  inDb === ADVERSARIAL_BODY
    ? ok('BYTES — CONTROL: the wp_posts row itself holds exactly those bytes')
    : bad(inDb === null
        ? 'BYTES — CONTROL: could not read the database, so the byte check above proves nothing'
        : 'BYTES — CONTROL: the database disagrees with what /content reported as stored')

  // wp/v2 re-encodes an escaped quote in block attribute JSON as a unicode escape, on read and on write.
  // The database row above shows the connector reports the stored bytes.
  const viaRest = await json(`/wp/v2/posts/${PID}`, { method: 'GET' }, ADMIN, '&context=edit')
  const mine = String(write.json?.object?.content?.raw ?? '').split('\n')
  const theirs = String(viaRest.json?.content?.raw ?? '').split('\n')
  let offDelimiter = 0
  let unexplained = 0
  let delimiterDiffs = 0
  if (mine.length !== theirs.length) {
    unexplained = 1
  } else {
    for (let i = 0; i < mine.length; i++) {
      if (mine[i] === theirs[i]) continue
      if (!mine[i].startsWith('<!-- wp:')) { offDelimiter++; continue }
      delimiterDiffs++
      // Exactly WordPress's own `serialize_block_attributes` quote escaping,
      // applied to this line and nothing else.
      if (mine[i].split(BS + '"').join(BS + 'u0022') !== theirs[i]) unexplained++
    }
  }
  offDelimiter === 0 && unexplained === 0
    ? ok(`BYTES — wp/v2's read differs only on block delimiters (${delimiterDiffs}), and only by WordPress's own attribute quote escaping`)
    : bad(`BYTES — wp/v2 differs in an unmeasured way (off-delimiter: ${offDelimiter}, unexplained: ${unexplained})`)

  // Callers compare this with a `modified_gmt` read over wp/v2, so both must use the same format.
  const restModified = viaRest.json?.modified_gmt
  const pluginModified = write.json?.object?.modified_gmt
  pluginModified === restModified
    ? ok(`TIME — modified_gmt is identical to wp/v2's (${pluginModified})`)
    : bad(`TIME — plugin said ${pluginModified}, wp/v2 says ${restModified}`)
  const rfc3339Shape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
  rfc3339Shape.test(String(pluginModified))
    ? ok('TIME — and it is in the RFC3339-ish shape core uses, not the database shape')
    : bad(`TIME — wrong shape: ${pluginModified}`)

  // `wp_insert_post` sets `post_modified` on every update, even a no-op, so assert parity with wp/v2.
  // Sleep a second each way: the column has one-second resolution.
  await new Promise((r) => setTimeout(r, 1100))
  const noop = await json(`/rankxai/v1/content/${PID}`, { method: 'POST', body: JSON.stringify({ fields: { content: ADVERSARIAL_BODY } }) })
  const connectorMoved = noop.json?.object?.modified_gmt !== pluginModified
  await new Promise((r) => setTimeout(r, 1100))
  const restNoop = await json(`/wp/v2/posts/${PID}`, { method: 'POST', body: JSON.stringify({ content: ADVERSARIAL_BODY }) })
  const restMoved = restNoop.json?.modified_gmt !== noop.json?.object?.modified_gmt
  connectorMoved === restMoved
    ? ok(`TIME — an identical write moves the clock on BOTH transports (moved: ${connectorMoved}), so the two stay comparable`)
    : bad(`TIME — the connector and wp/v2 disagree on a no-op: connector moved=${connectorMoved}, wp/v2 moved=${restMoved}`)

  const revisions = await json(`/wp/v2/posts/${PID}/revisions`, { method: 'GET' }, ADMIN, '&per_page=10')
  const revIds = Array.isArray(revisions.json) ? revisions.json.map((r) => r.id) : []
  revIds.includes(write.json?.revisionId)
    ? ok(`REVISION — revisionId ${write.json?.revisionId} is a real revision of this post`)
    : bad(`REVISION — ${write.json?.revisionId} is not among ${JSON.stringify(revIds)}`)

  // A post type that keeps no revisions (from the probe mu-plugin) reports `null`, not a failure.
  const norev = await createPost({ title: `No-revision ${MARK}`, content: 'x', status: 'publish' }, ADMIN, 'rankxai_norev')
  const norevWrite = await json(`/rankxai/v1/content/${norev.id}`, { method: 'POST', body: JSON.stringify({ fields: { content: 'updated body' } }) })
  norevWrite.status === 200 && norevWrite.json?.revisionId === null
    ? ok('REVISION — a post type that keeps none reports revisionId: null rather than failing')
    : bad(`REVISION — expected null on a no-revision type, got ${norevWrite.status} / ${JSON.stringify(norevWrite.json?.revisionId)}`)

  // `object.meta` follows WordPress's registry: the show_in_rest key appears, the hidden one does not.
  // Both come from the probe mu-plugin; the third check fails if it is missing.
  await json(`/wp/v2/posts/${PID}`, { method: 'POST', body: JSON.stringify({ meta: { rankxai_probe_visible: MARK } }) })
  const metaWrite = await json(`/rankxai/v1/content/${PID}`, { method: 'POST', body: JSON.stringify({ fields: { excerpt: `excerpt ${MARK}` } }) })
  const metaOut = metaWrite.json?.object?.meta ?? {}
  Object.prototype.hasOwnProperty.call(metaOut, 'rankxai_probe_visible')
    ? ok('META — a key registered with show_in_rest comes back')
    : bad(`META — the REST-registered key is missing: ${JSON.stringify(Object.keys(metaOut))}`)
  !Object.prototype.hasOwnProperty.call(metaOut, 'rankxai_probe_hidden')
    ? ok('META — a key registered WITHOUT show_in_rest does not, which is wp/v2 parity')
    : bad('META — an unregistered key leaked into the response')
  metaOut.rankxai_probe_visible === MARK
    ? ok('META — CONTROL: and it carries the value, so the read is real rather than an empty shape')
    : bad(`META — CONTROL: value missing, so the two checks above prove nothing: ${JSON.stringify(metaOut.rankxai_probe_visible)}`)

  metaWrite.json?.object?.excerpt === undefined
    ? ok('SHAPE — no excerpt field is invented; the route returns what wp/v2 returns and no more')
    : bad('SHAPE — an unexpected field appeared')
  // Compare with wp/v2 rather than guess the markup (WordPress adds its own classes). Callers read
  // `content.rendered` to detect Elementor, so it must match wp/v2 exactly.
  const renderedRef = await json(`/wp/v2/posts/${PID}`, { method: 'GET' }, ADMIN, '&context=edit')
  const connectorRendered = String(metaWrite.json?.object?.content?.rendered ?? '').trim()
  const restRendered = String(renderedRef.json?.content?.rendered ?? '').trim()
  connectorRendered.length > 0 && connectorRendered === restRendered
    ? ok('RENDERED — content.rendered matches wp/v2 exactly (the Elementor signal depends on it)')
    : bad(`RENDERED — diverged from wp/v2\n        connector: ${JSON.stringify(connectorRendered.slice(0, 160))}\n        wp/v2    : ${JSON.stringify(restRendered.slice(0, 160))}`)

  const titled = await json(`/rankxai/v1/content/${PID}`, { method: 'POST', body: JSON.stringify({ fields: { title: `Retitled ${MARK}`, slug: `retitled-${MARK}` } }) })
  titled.json?.object?.title?.raw === `Retitled ${MARK}` && titled.json?.object?.slug === `retitled-${MARK}`
    ? ok('FIELDS — title and slug are written and come back')
    : bad(`FIELDS — title/slug did not round-trip: ${JSON.stringify(titled.json?.object?.title)} ${titled.json?.object?.slug}`)
  Array.isArray(titled.json?.written) && titled.json.written.includes('title') && titled.json.written.includes('slug')
    ? ok('FIELDS — `written` names exactly what was written')
    : bad(`FIELDS — written was ${JSON.stringify(titled.json?.written)}`)

  console.log('\n== C. content: a refusal leaves the page exactly as it was ==')
  // Read the body from the database: wp/v2 re-encodes block attributes, so it would show a change.
  const bodyBefore = await dbPostContent(PID)
  const modifiedBefore = (await json(`/wp/v2/posts/${PID}`, { method: 'GET' }, ADMIN, '&context=edit')).json?.modified_gmt

  const refusals = [
    ['an unknown field', { bogus: 'x' }, 400],
    ['`status`, which a caller most likely assumes works', { status: 'draft' }, 400],
    ['`meta`, which belongs on wp/v2', { meta: { a: 'b' } }, 400],
    ['a non-string content', { content: 12345 }, 400],
    ['an empty content', { content: '' }, 400],
    ['a whitespace-only content', { content: '   \n ' }, 400],
    ['an empty title', { title: '' }, 400],
    ['no fields at all', {}, 400],
  ]
  for (const [label, fields, expect] of refusals) {
    const r = await json(`/rankxai/v1/content/${PID}`, { method: 'POST', body: JSON.stringify({ fields }) })
    r.status === expect ? ok(`REFUSE — ${label} → ${expect}`) : bad(`REFUSE — ${label} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`)
  }
  const bodyAfter = await dbPostContent(PID)
  const modifiedAfter = (await json(`/wp/v2/posts/${PID}`, { method: 'GET' }, ADMIN, '&context=edit')).json?.modified_gmt
  bodyAfter !== null && bodyAfter === bodyBefore && modifiedAfter === modifiedBefore
    ? ok('REFUSE — CONTROL: after eight refusals the row is byte-identical, timestamp included')
    : bad('REFUSE — something was written by a request that was refused')

  // `excerpt` and `slug` are not destructive, so an empty string is honoured.
  const cleared = await json(`/rankxai/v1/content/${PID}`, { method: 'POST', body: JSON.stringify({ fields: { excerpt: '' } }) })
  cleared.status === 200 && cleared.json?.object?.content?.raw === bodyBefore
    ? ok('REFUSE — an empty excerpt IS allowed, and clearing it left the body alone')
    : bad(`REFUSE — an empty excerpt was ${cleared.status}; body unchanged: ${cleared.json?.object?.content?.raw === bodyBefore}`)

  // Must be 404, not 403: a permission callback that returns a bare false always gives 403.
  const missing = await json('/rankxai/v1/content/99999999', { method: 'POST', body: JSON.stringify({ fields: { content: 'x' } }) })
  missing.status === 404
    ? ok('REFUSE — a post that does not exist → 404, the same answer wp/v2 gives')
    : bad(`REFUSE — a missing post → ${missing.status}; 403 would blame the account for a stale page id`)

  await seoPluginsOff()
  console.log('\n== D/E. roles, and the measurement the schema route exists for ==')
  const username = `probe-author-${Date.now()}`
  const authorUser = await json('/wp/v2/users', {
    method: 'POST',
    body: JSON.stringify({ username, email: `${username}@example.com`, password: `Aa1!${Math.random().toString(36).slice(2)}`, roles: ['author'] }),
  })
  if (authorUser.status !== 201) throw new Error(`could not create the author fixture: ${authorUser.status} ${JSON.stringify(authorUser.json).slice(0, 200)}`)
  created.users.push(authorUser.json.id)
  const appPass = await json(`/wp/v2/users/${authorUser.json.id}/application-passwords`, { method: 'POST', body: JSON.stringify({ name: MARK }) })
  if (appPass.status !== 201) throw new Error(`could not mint an application password: ${appPass.status}`)
  const AUTHOR = 'Basic ' + Buffer.from(`${username}:${appPass.json.password}`).toString('base64')

  const authorPost = await createPost({ title: `Author post ${MARK}`, content: 'seed', status: 'publish', author: authorUser.json.id })

  const anon = await api(`/rankxai/v1/content/${PID}`, { method: 'POST', body: JSON.stringify({ fields: { content: 'x' } }) }, null)
  anon.status === 401 ? ok('AUTH — anonymous → 401') : bad(`AUTH — anonymous → ${anon.status}`)
  const anonSchema = await api(`/rankxai/v1/schema/${PID}`, { method: 'GET' }, null)
  anonSchema.status === 401 ? ok('AUTH — anonymous schema read → 401') : bad(`AUTH — anonymous schema read → ${anonSchema.status}`)

  // 403 here and 404 above: a post this account may not edit is a credential problem, a missing post is a
  // site problem.
  const cross = await json(`/rankxai/v1/content/${PID}`, { method: 'POST', body: JSON.stringify({ fields: { content: 'x' } }) }, AUTHOR)
  cross.status === 403 ? ok("AUTH — an author writing someone else's post → 403, NOT 404") : bad(`AUTH — cross-user write → ${cross.status}`)
  const crossSchema = await json(`/rankxai/v1/schema/${PID}`, { method: 'PUT', body: JSON.stringify({ content: '{}' }) }, AUTHOR)
  crossSchema.status === 403 ? ok("AUTH — an author writing someone else's schema → 403, NOT 404") : bad(`AUTH — cross-user schema → ${crossSchema.status}`)

  // One graph, one account, two channels: a wp:html block in post_content and /schema. For an account
  // without unfiltered_html, kses strips the first and not the second.
  const GRAPH = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: `Probe ${MARK}`,
    description: `A quote " and a backslash ${BS} and an escape ${BS}u0026`,
  })
  const BLOCK_CHANNEL =
    '<!-- wp:paragraph -->\n<p>Ordinary prose survives.</p>\n<!-- /wp:paragraph -->\n' +
    `<!-- wp:html -->\n<script type="application/ld+json">${GRAPH}</script>\n<!-- /wp:html -->`

  const authorBlock = await json(`/rankxai/v1/content/${authorPost.id}`, { method: 'POST', body: JSON.stringify({ fields: { content: BLOCK_CHANNEL } }) }, AUTHOR)
  const authorStored = authorBlock.json?.object?.content?.raw ?? ''
  authorBlock.json?.unfilteredHtml === false
    ? ok('KSES — the author is reported as lacking unfiltered_html, which is the FACT the diagnosis needs')
    : bad(`KSES — unfilteredHtml was ${JSON.stringify(authorBlock.json?.unfilteredHtml)} for an author`)
  !authorStored.includes('<script')
    ? ok('KSES — the BLOCK channel is censored for that account: the <script> is gone from post_content')
    : bad('KSES — the script survived for a user without unfiltered_html; the rig has changed, not the product')
  authorStored.includes('Ordinary prose survives')
    ? ok('KSES — CONTROL: the rest of the body came through, so the write itself worked')
    : bad('KSES — CONTROL: the whole write failed, so the line above proves nothing')

  const authorSchema = await json(`/rankxai/v1/schema/${authorPost.id}`, { method: 'PUT', body: JSON.stringify({ content: GRAPH }) }, AUTHOR)
  authorSchema.status === 200 && authorSchema.json?.content === GRAPH
    ? ok('KSES — the SCHEMA channel stores the SAME graph byte-identically for the SAME account')
    : bad(`KSES — the schema write failed for an author: ${authorSchema.status}`)
  const authorPage = await page(authorSchema.json?.publicUrl ?? authorPost.link)
  const authorBlocks = ldJsonBlocks(authorPage.html)
  authorBlocks.some((b) => parsesTo(b, GRAPH))
    ? ok('KSES — and it RENDERS on the public page, parsed and deep-equal to what was sent')
    : bad(`KSES — the graph is not on the rendered page (${authorBlocks.length} ld+json block(s) found)`)

  const authorOwn = await json(`/rankxai/v1/content/${authorPost.id}`, { method: 'POST', body: JSON.stringify({ fields: { content: '<!-- wp:paragraph -->\n<p>own post</p>\n<!-- /wp:paragraph -->' } }) }, AUTHOR)
  authorOwn.status === 200 ? ok('AUTH — an author CAN write their own post') : bad(`AUTH — own-post write → ${authorOwn.status}`)

  console.log('\n== F. structured data ==')
  const put = await json(`/rankxai/v1/schema/${PID}`, { method: 'PUT', body: JSON.stringify({ content: GRAPH }) })
  put.status === 200 && put.json?.content === GRAPH
    ? ok('SCHEMA — stored byte-identically, backslashes intact')
    : bad(`SCHEMA — store failed: ${put.status} ${JSON.stringify(put.json).slice(0, 200)}`)
  const get = await json(`/rankxai/v1/schema/${PID}`)
  get.json?.content === GRAPH && get.json?.stored === true && get.json?.willRender === true
    ? ok('SCHEMA — read back identical, stored: true, willRender: true')
    : bad(`SCHEMA — read back wrong: ${JSON.stringify(get.json).slice(0, 200)}`)

  const rendered = await page(get.json.publicUrl)
  ldJsonBlocks(rendered.html).some((b) => parsesTo(b, GRAPH))
    ? ok('SCHEMA — renders in the head and parses to exactly what was sent')
    : bad('SCHEMA — not on the rendered page')
  rendered.html.includes('class="rankxai-schema"')
    ? ok('SCHEMA — CONTROL: our class is on the script element, so the block above is ours')
    : bad('SCHEMA — CONTROL: our marker is absent, so a matching block could be another plugin\'s')

  // The escaping is the security property, so it is measured against a value
  // built to break out rather than asserted from the source.
  const HOSTILE = JSON.stringify({ '@type': 'Thing', name: '</script><img src=x onerror=alert(1)>' })
  await json(`/rankxai/v1/schema/${PID}`, { method: 'PUT', body: JSON.stringify({ content: HOSTILE }) })
  const hostilePage = await page(get.json.publicUrl)
  !hostilePage.html.includes('</script><img')
    ? ok('SCHEMA — a value containing </script> cannot close the element early')
    : bad('SCHEMA — BREAKOUT: the literal </script><img reached the page')
  hostilePage.html.includes(`${BS}u003c/script${BS}u003e`)
    ? ok('SCHEMA — CONTROL: the escaped form IS on the page, so the value really was rendered')
    : bad('SCHEMA — CONTROL: neither form is present, so the breakout check proves nothing')
  ldJsonBlocks(hostilePage.html).some((b) => parsesTo(b, HOSTILE))
    ? ok('SCHEMA — and the escaped payload still parses back to the original value')
    : bad('SCHEMA — the escaping corrupted the graph')

  // Idempotent: escaping an already-escaped document changes nothing.
  const PRE_ESCAPED = JSON.stringify({ '@type': 'Thing', name: `already ${BS}u003cb${BS}u003e escaped` })
  await json(`/rankxai/v1/schema/${PID}`, { method: 'PUT', body: JSON.stringify({ content: PRE_ESCAPED }) })
  const preEscapedPage = await page(get.json.publicUrl)
  ldJsonBlocks(preEscapedPage.html).some((b) => parsesTo(b, PRE_ESCAPED))
    ? ok('SCHEMA — escaping is idempotent: an already-escaped graph is unchanged by it')
    : bad('SCHEMA — an already-escaped graph was double-escaped')

  const badInputs = [
    ['invalid JSON', '{not json'],
    ['an empty string', ''],
    ['a graph larger than the cap', JSON.stringify({ x: 'y'.repeat(300000) })],
  ]
  for (const [label, content] of badInputs) {
    const r = await json(`/rankxai/v1/schema/${PID}`, { method: 'PUT', body: JSON.stringify({ content }) })
    r.status === 400 ? ok(`SCHEMA — ${label} → 400`) : bad(`SCHEMA — ${label} → ${r.status}`)
  }
  const nonString = await json(`/rankxai/v1/schema/${PID}`, { method: 'PUT', body: JSON.stringify({ content: { a: 1 } }) })
  nonString.status === 400 ? ok('SCHEMA — a non-string content → 400') : bad(`SCHEMA — a non-string → ${nonString.status}`)
  const survived = await json(`/rankxai/v1/schema/${PID}`)
  survived.json?.content === PRE_ESCAPED
    ? ok('SCHEMA — CONTROL: four refusals later the previously-stored graph is untouched')
    : bad(`SCHEMA — a refusal destroyed the stored graph: ${JSON.stringify(survived.json?.content).slice(0, 120)}`)

  const draft = await createPost({ title: `Draft ${MARK}`, content: 'draft body', status: 'draft' })
  const draftSchema = await json(`/rankxai/v1/schema/${draft.id}`, { method: 'PUT', body: JSON.stringify({ content: GRAPH }) })
  draftSchema.json?.stored === true && draftSchema.json?.willRender === false
    ? ok('SCHEMA — a draft stores it and reports willRender: false, which is the stored/serving split')
    : bad(`SCHEMA — a draft reported stored=${draftSchema.json?.stored} willRender=${draftSchema.json?.willRender}`)

  const locked = await createPost({ title: `Locked ${MARK}`, content: 'locked body', status: 'publish', password: 'secret' })
  await json(`/rankxai/v1/schema/${locked.id}`, { method: 'PUT', body: JSON.stringify({ content: GRAPH }) })
  const lockedState = await json(`/rankxai/v1/schema/${locked.id}`)
  lockedState.json?.willRender === false
    ? ok('SCHEMA — a password-protected post reports willRender: false')
    : bad('SCHEMA — a password-protected post claimed it would render')
  // A published post of a non-public type (from the probe mu-plugin): why `willRender` uses
  // `is_post_publicly_viewable()` rather than the status.
  const hiddenType = await createPost({ title: `Hidden type ${MARK}`, content: 'x', status: 'publish' }, ADMIN, 'rankxai_hidden')
  const hiddenSchema = await json(`/rankxai/v1/schema/${hiddenType.id}`, { method: 'PUT', body: JSON.stringify({ content: GRAPH }) })
  hiddenSchema.json?.stored === true && hiddenSchema.json?.willRender === false
    ? ok('SCHEMA — a PUBLISHED post of a non-public type reports willRender: false')
    : bad(`SCHEMA — a non-public type reported stored=${hiddenSchema.json?.stored} willRender=${hiddenSchema.json?.willRender}`)

  const lockedPage = await page(locked.link)
  !ldJsonBlocks(lockedPage.html).some((b) => parsesTo(b, GRAPH))
    ? ok('SCHEMA — and its head carries nothing, so the password is not defeated by the graph')
    : bad('SCHEMA — a password-protected post published its graph')

  const schemaMissing = await json('/rankxai/v1/schema/99999999', { method: 'GET' })
  schemaMissing.status === 404
    ? ok('SCHEMA — a post that does not exist → 404, the same answer wp/v2 gives')
    : bad(`SCHEMA — a missing post → ${schemaMissing.status}; 403 would blame the account for a stale page id`)
  // Control: wp/v2 must answer 404 for the same id too.
  const restMissing = await json('/wp/v2/posts/99999999', { method: 'GET' })
  restMissing.status === 404
    ? ok('SCHEMA — CONTROL: wp/v2 answers 404 for the same missing post, so the two transports agree')
    : bad(`SCHEMA — CONTROL: wp/v2 answered ${restMissing.status} for a missing post, so this comparison proves nothing`)

  const del = await json(`/rankxai/v1/schema/${PID}`, { method: 'DELETE' })
  del.status === 200 && del.json?.stored === false
    ? ok('SCHEMA — DELETE removes it')
    : bad(`SCHEMA — delete → ${del.status}`)
  const del2 = await json(`/rankxai/v1/schema/${PID}`, { method: 'DELETE' })
  del2.status === 200 && del2.json?.stored === false
    ? ok('SCHEMA — DELETE is idempotent; removing what is not there is the state the caller asked for')
    : bad(`SCHEMA — second delete → ${del2.status}`)
  const gone = await page(get.json.publicUrl)
  !gone.html.includes('class="rankxai-schema"')
    ? ok('SCHEMA — the page no longer carries our marker')
    : bad('SCHEMA — the marker is still on the page after a delete')

  await seoPluginsBack()
  await parityArm()

  console.log('\n== G. the never-cache filter reaches the new routes ==')
  await json(`/rankxai/v1/schema/${PID}`, { method: 'GET' })
  const witness = await wpOption('rankxai_cache_witness')
  witness?.nocache === true && String(witness.uri).includes('rankxai')
    ? ok('CACHE — DONOTCACHEPAGE is defined on a /schema request (the filter is namespace-scoped, so a new route inherits it)')
    : bad(`CACHE — the never-cache filter did not fire for /schema: ${JSON.stringify(witness)}`)
  await json('/wp/v2/types', { method: 'GET' })
  const control = await wpOption('rankxai_cache_witness')
  control?.nocache === false
    ? ok('CACHE — CONTROL: it does not fire on an unrelated wp/v2 request')
    : bad(`CACHE — it fires for everybody: ${JSON.stringify(control)}`)

  console.log('\n== H. the container log ==')
  const logAfter = await apacheLog()
  const fresh = linesSince(logBefore, logAfter)
  const complaints = fresh
    .split('\n')
    .filter((l) => /PHP (Fatal|Warning|Notice|Deprecated)/.test(l))
    .filter((l) => !l.includes('rankxai-probe.php'))
  complaints.length === 0
    ? ok('LOG — PHP logged nothing during the run')
    : bad(`LOG — PHP complained ${complaints.length} time(s):\n        ${complaints.slice(0, 5).join('\n        ')}`)
  fresh.includes('rankxai%2Fv1%2Fschema') || fresh.includes('rankxai/v1/schema')
    ? ok("LOG — CONTROL: the log window covers this run's own requests")
    : bad('LOG — CONTROL: the log read found none of this run’s requests, so it proved nothing')
}

/**
 * The same write through the connector and wp/v2, on post states where `wp_insert_post` does more than
 * store a field. Slugs are compared per side, as WordPress gives the second post a `-2` slug.
 */
async function parityArm() {
  console.log('\n== F2. parity with wp/v2 on the post states that do something ==')
  const past = new Date(Date.now() - 3600_000).toISOString().replace(/\.\d+Z$/, '')
  const future = new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d+Z$/, '')
  const cases = [
    ['a scheduled post whose date is still in the future', { status: 'future', date_gmt: future }],
    ['a scheduled post whose date has PASSED', { status: 'future', date_gmt: past }],
    ['a private post', { status: 'private', date_gmt: past }],
    ['a pending post', { status: 'pending', date_gmt: past }],
    ['a sticky post', { status: 'publish', date_gmt: past, sticky: true }],
  ]
  const body = '<!-- wp:paragraph -->\n<p>parity body</p>\n<!-- /wp:paragraph -->'
  const shape = (o) => JSON.stringify({ status: o.status, sticky: o.sticky, date_gmt: o.date_gmt, format: o.format })

  for (const [label, fields] of cases) {
    const a = await createPost({ title: `Parity A ${label} ${MARK}`, content: 'seed', ...fields })
    const b = await createPost({ title: `Parity B ${label} ${MARK}`, content: 'seed', ...fields })
    const read = async (id) => (await json(`/wp/v2/posts/${id}`, { method: 'GET' }, ADMIN, '&context=edit')).json
    const beforeA = await read(a.id)
    const beforeB = await read(b.id)

    const viaConnector = await json(`/rankxai/v1/content/${a.id}`, { method: 'POST', body: JSON.stringify({ fields: { content: body } }) })
    const viaRest = await json(`/wp/v2/posts/${b.id}`, { method: 'POST', body: JSON.stringify({ content: body }) })
    const afterA = await read(a.id)
    const afterB = await read(b.id)

    viaConnector.status === 200 && viaRest.status === 200
      ? ok(`PARITY — ${label}: both transports accepted the write`)
      : bad(`PARITY — ${label}: connector ${viaConnector.status}, wp/v2 ${viaRest.status}`)
    shape(afterA) === shape(afterB)
      ? ok(`PARITY — ${label}: status, date and sticky are identical afterwards (${afterA.status})`)
      : bad(`PARITY — ${label}: diverged\n        connector: ${shape(afterA)}\n        wp/v2    : ${shape(afterB)}`)
    afterA.content.raw === body && afterB.content.raw === body
      ? ok(`PARITY — ${label}: both stored the body byte-identically`)
      : bad(`PARITY — ${label}: a stored body is not what was sent`)
    afterA.slug === beforeA.slug && afterB.slug === beforeB.slug
      ? ok(`PARITY — ${label}: neither transport moved the slug`)
      : bad(`PARITY — ${label}: connector ${beforeA.slug} -> ${afterA.slug}, wp/v2 ${beforeB.slug} -> ${afterB.slug}`)
  }
}

/**
 * Remove every fixture and check it is gone. Runs on the failure path too.
 */
async function cleanup() {
  console.log('\n== cleanup ==')
  for (const { id, type } of created.posts) {
    await json(`/wp/v2/${type}/${id}`, { method: 'DELETE' }, ADMIN, '&force=true')
  }
  for (const id of created.users) {
    await json(`/wp/v2/users/${id}`, { method: 'DELETE', body: JSON.stringify({ force: true, reassign: 1 }) })
  }
  let leftover = 0
  for (const { id, type } of created.posts) {
    const r = await json(`/wp/v2/${type}/${id}`, { method: 'GET' })
    if (r.status !== 404) leftover++
  }
  for (const id of created.users) {
    const r = await json(`/wp/v2/users/${id}`, { method: 'GET' })
    if (r.status !== 404) leftover++
  }
  leftover === 0
    ? ok(`CLEANUP — all ${created.posts.length} post(s) and ${created.users.length} user(s) removed, verified`)
    : bad(`CLEANUP — ${leftover} fixture(s) survived; remove them by hand`)
}

run()
  .catch((e) => {
    bad(`RUN — threw: ${e && e.message ? e.message : e}`)
  })
  .then(seoPluginsBack)
  .then(cleanup)
  .catch((e) => {
    bad(`CLEANUP — threw: ${e && e.message ? e.message : e}`)
  })
  .finally(() => {
    console.log('\n================================================')
    console.log(`PASSED ${pass}   FAILED ${fail}`)
    process.exit(fail > 0 ? 1 : 0)
  })
