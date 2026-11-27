#!/usr/bin/env node
/**
 * Checks markdown copies of pages (twins) against a real WordPress: routing,
 * headers, conversion and cleanup. Fixtures are created by the probe.
 *
 * Run:  npx wp-env start   then   node probe/verify-markdown-twins.mjs
 *       with WP_APP_PASSWORD from: wp user application-password create admin twins-probe --porcelain
 */

import { cliContainer, wpContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const USER = process.env.WP_USER ?? 'admin'
const PASS = process.env.WP_APP_PASSWORD ?? ''

if (!PASS) {
  console.error('Set WP_APP_PASSWORD (wp user application-password create admin twins-probe --porcelain).')
  process.exit(2)
}

const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const has = (re, text) => re.test(text)

/** Fetch without following redirects, so a canonical redirect stays visible. */
async function raw(path, init = {}) {
  const res = await http(`${BASE}${path}`, { redirect: 'manual', ...init })
  const body = res.status < 400 || res.status === 404 ? await res.text() : ''
  return {
    status: res.status,
    ct: res.headers.get('content-type') ?? '',
    link: res.headers.get('link') ?? '',
    robots: res.headers.get('x-robots-tag') ?? '',
    vary: res.headers.get('vary') ?? '',
    source: res.headers.get('x-rankxai-source') ?? '',
    nosniff: res.headers.get('x-content-type-options') ?? '',
    cache: res.headers.get('cache-control') ?? '',
    location: res.headers.get('location') ?? '',
    body,
  }
}

/**
 * fetch with a short retry on transport errors only (the container sometimes
 * resets keep-alive sockets). An HTTP error status is an answer and is never retried.
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

const api = (route, init = {}) =>
  http(`${BASE}/?rest_route=${encodeURIComponent(route)}`, {
    ...init,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })

async function apiJson(route, init) {
  const res = await api(route, init)
  const text = await res.text()
  try {
    return { status: res.status, json: JSON.parse(text) }
  } catch {
    return { status: res.status, json: null, text }
  }
}

/** The switch is the site owner's, so it is set on the site; only the context block goes over REST. */
async function setTwins(patch) {
  if (patch.enabled !== undefined) {
    await wpCapture(['eval', `RankXAI_Twins::save_settings( ${patch.enabled ? 'true' : 'false'}, null );`])
  }
  if (patch.context !== undefined) {
    const put = await apiJson('/rankxai/v1/twins', { method: 'PUT', body: JSON.stringify({ context: patch.context }) })
    if (put.status !== 200) return put
  }
  return apiJson('/rankxai/v1/twins')
}

const CONTEXT = [
  '**Probe Business**',
  '',
  'We prove that markdown twins work.',
  '',
  '- Category: verification',
  '- More: https://example.com/llms.txt',
].join('\n')

/** The container's error log, for PHP notices no functional assertion can see. */
async function apacheLog() {
  const { execFileSync } = await import('node:child_process')
  const container = wpContainer()
  try {
    return execFileSync('docker', ['logs', '--tail', '2000', container], { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    return ''
  }
}

/**
 * The log lines added since `before`, anchored on its last line rather than a byte
 * offset, because the tail window scrolls. With no anchor, the whole window is returned.
 */
function linesSince(before, after) {
  const anchor = before.trimEnd().split('\n').pop() ?? ''
  if (anchor === '') return after
  const at = after.lastIndexOf(anchor)
  return at === -1 ? after : after.slice(at + anchor.length)
}

async function run() {
  const logBefore = await apacheLog()
  const FIX = await provision()

  // Delete the options so the plugin is in its freshly installed state, which
  // must publish no new public URL.
  await wpExec(['option', 'delete', 'rankxai_twins'])
  await wpExec(['option', 'delete', 'rankxai_twin_context'])

  const freshState = await apiJson('/rankxai/v1/twins')
  freshState.json?.enabled === false
    ? ok('FRESH — with no options at all, the plugin reports twins OFF')
    : bad(`FRESH — a fresh install reported enabled=${freshState.json?.enabled}`)
  const freshMd = await raw(`${FIX.path}.md`)
  const freshMap = await raw('/sitemap-md.xml')
  const freshHtml = await raw(`${FIX.path}/`)
  const freshRobots = await raw('/robots.txt')
  freshMd.status === 404 && freshMap.status === 404
    ? ok('FRESH — no .md URL and no sitemap exist')
    : bad(`FRESH — .md=${freshMd.status} sitemap=${freshMap.status}`)
  !has(/text\/markdown/, freshHtml.link) && !has(/type="text\/markdown"/, freshHtml.body)
    ? ok('FRESH — nothing is advertised in the header or the head')
    : bad('FRESH — a fresh install advertises a twin')
  !has(/sitemap-md/i, freshRobots.body)
    ? ok('FRESH — robots.txt is untouched')
    : bad('FRESH — a fresh install changed robots.txt')

  await setTwins({ enabled: false })

  // The eligible count must not depend on the switch, or a site with copies off
  // reports nothing to copy.
  const offState = await apiJson('/rankxai/v1/twins')
  offState.json?.eligibleCount > 0
    ? ok(`OFF — the site still reports ${offState.json.eligibleCount} pages that WOULD get a copy`)
    : bad('OFF — eligibleCount is 0 while off, so the platform cannot offer the switch')
  offState.json?.sample?.sourceBytes > 0
    ? ok('OFF — and a measured sample, so the customer sees the saving before committing')
    : bad('OFF — no sample while off')

  const offMd = await raw(`${FIX.path}.md`)
  offMd.status === 404 ? ok('OFF — the .md URL 404s') : bad(`OFF — .md answered ${offMd.status}`)

  const offHtml = await raw(`${FIX.path}/`)
  !has(/text\/markdown/, offHtml.link)
    ? ok('OFF — no alternate Link header on the HTML page')
    : bad('OFF — the page still advertises a twin')
  !has(/type="text\/markdown"/, offHtml.body)
    ? ok('OFF — no alternate <link> in the head')
    : bad('OFF — the head still advertises a twin')

  const offSitemap = await raw('/sitemap-md.xml')
  offSitemap.status === 404 ? ok('OFF — sitemap-md.xml 404s') : bad(`OFF — sitemap answered ${offSitemap.status}`)

  const offNegotiated = await raw(`${FIX.path}/`, { headers: { Accept: 'text/markdown' } })
  has(/text\/html/, offNegotiated.ct)
    ? ok('OFF — Accept: text/markdown still gets HTML')
    : bad(`OFF — negotiated response was ${offNegotiated.ct}`)

  await apiJson('/rankxai/v1/documents/agents_md', {
    method: 'PUT',
    body: JSON.stringify({ content: '# Agents\n\nThis is the stored document.\n' }),
  })
  const docNotOn = await raw('/agents.md')
  docNotOn.status === 404
    ? ok('OFF — a stored /agents.md is not served until the site owner switches it on')
    : bad(`OFF — /agents.md answered ${docNotOn.status} while switched off`)
  const docsBefore = await wpOption('rankxai_documents_local')
  await wpExec(['option', 'update', 'rankxai_documents_local', '{"llms_txt":false,"agents_md":true,"ai_txt":false}', '--format=json'])
  const docOff = await raw('/agents.md')
  has(/This is the stored document/, docOff.body) && docOff.source === 'virtual-route'
    ? ok('OFF — switched on, /agents.md serves the stored document')
    : bad(`OFF — /agents.md served source=${docOff.source} status=${docOff.status}`)
  if (docsBefore === null) await wpExec(['option', 'delete', 'rankxai_documents_local'])
  else await wpExec(['option', 'update', 'rankxai_documents_local', JSON.stringify(docsBefore), '--format=json'])

  const remote = await apiJson('/rankxai/v1/twins', { method: 'PUT', body: JSON.stringify({ enabled: true }) })
  remote.status === 403 && remote.json?.code === 'rankxai_twins_site_only'
    ? ok('REMOTE — the switch cannot be turned on over REST')
    : bad(`REMOTE — PUT enabled answered ${remote.status} ${JSON.stringify(remote.json ?? remote.text)}`)

  const on = await setTwins({ enabled: true, context: CONTEXT })
  on.status === 200 && on.json?.enabled === true
    ? ok('ON — the site owner switched it on, and the site reports it')
    : bad(`ON — answered ${on.status} ${JSON.stringify(on.json ?? on.text)}`)
  typeof on.json?.eligibleCount === 'number' && on.json.eligibleCount > 0
    ? ok(`ON — ${on.json.eligibleCount} pages reported eligible`)
    : bad(`ON — eligibleCount was ${on.json?.eligibleCount}`)
  on.json?.sample && on.json.sample.sourceBytes > 0 && on.json.sample.twinBytes > 0
    ? ok(`ON — sample measured: ${on.json.sample.sourceBytes}B HTML → ${on.json.sample.twinBytes}B markdown`)
    : bad(`ON — no usable sample came back: ${JSON.stringify(on.json?.sample)}`)
  // The sample must be the page with the most content, not the newest (which may be empty).
  on.json?.sample && on.json.sample.sourceBytes >= on.json.sample.twinBytes / 4
    ? ok('ON — the sample is a page with real content, not the empty newest one')
    : bad(`ON — the sample looks empty: ${JSON.stringify(on.json?.sample)}`)

  const docOn = await raw('/agents.md')
  has(/This is the stored document/, docOn.body) && docOn.source === 'virtual-route'
    ? ok('ON — /agents.md STILL serves the stored document, not a twin of the page slugged "agents"')
    : bad(`ON — /agents.md was taken over: source=${docOn.source} body=${docOn.body.slice(0, 60)}`)

  const shapes = {
    suffix: await raw(`${FIX.path}.md`),
    index: await raw(`${FIX.path}/index.md`),
    query: await raw(`${FIX.path}/?format=md`),
  }
  for (const [name, res] of Object.entries(shapes)) {
    res.status === 200 && has(/text\/markdown/, res.ct)
      ? ok(`ON — ${name} serves text/markdown`)
      : bad(`ON — ${name} answered ${res.status} ${res.ct} (location=${res.location})`)
  }
  shapes.suffix.body === shapes.index.body && shapes.suffix.body === shapes.query.body
    ? ok('ON — all three shapes return identical bytes')
    : bad('ON — the three shapes disagree')

  const md = shapes.suffix
  has(/noindex/, md.robots) && has(/follow/, md.robots)
    ? ok('ON — the .md URL is noindex, follow')
    : bad(`ON — X-Robots-Tag was "${md.robots}"`)
  !has(/canonical/i, md.link)
    ? ok('ON — no rel="canonical" on the twin (Google says pick one)')
    : bad(`ON — a canonical was emitted: ${md.link}`)
  has(/rel="alternate".*type="text\/html"/, md.link)
    ? ok('ON — the twin links back to the HTML page as an alternate')
    : bad(`ON — Link header was "${md.link}"`)
  md.nosniff === 'nosniff' ? ok('ON — X-Content-Type-Options: nosniff') : bad(`ON — nosniff was "${md.nosniff}"`)
  has(/Accept/i, md.vary) ? ok('ON — Vary: Accept') : bad(`ON — Vary was "${md.vary}"`)
  has(/no-store/, md.cache) ? ok('ON — Cache-Control: no-store keeps it out of a page cache') : bad(`ON — Cache-Control was "${md.cache}"`)
  md.source === 'markdown-twin' ? ok('ON — X-RankXAI-Source names the twin') : bad(`ON — source was "${md.source}"`)

  // ?format=md is its own address, so it is noindexed like the .md copy.
  has(/noindex/, shapes.query.robots)
    ? ok('ON — ?format=md carries noindex, like the .md copy')
    : bad(`ON — the query shape emitted X-Robots-Tag: ${shapes.query.robots}`)

  const negotiated = await raw(`${FIX.path}/`, { headers: { Accept: 'text/markdown' } })
  has(/text\/markdown/, negotiated.ct)
    ? ok('ON — Accept: text/markdown returns markdown at the page’s own URL')
    : bad(`ON — negotiated response was ${negotiated.ct}`)
  const browser = await raw(`${FIX.path}/`, {
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  })
  has(/text\/html/, browser.ct)
    ? ok('ON — a browser’s Accept still gets HTML from the same URL')
    : bad(`ON — a browser got ${browser.ct}`)

  has(/rel="alternate".*type="text\/markdown"/, browser.link)
    ? ok('ON — the HTML page advertises the twin in a Link header')
    : bad(`ON — Link header was "${browser.link}"`)
  has(/<link rel="alternate" type="text\/markdown"/, browser.body)
    ? ok('ON — and as a <link> in the head')
    : bad('ON — no alternate <link> in the head')

  has(/^---\n/, md.body) ? ok('DOC — front matter opens the document') : bad('DOC — no front matter')
  has(/^source: "http/m, md.body)
    ? ok('DOC — front matter cites the canonical HTML URL')
    : bad('DOC — no source: field')
  has(/^# /m, md.body) ? ok('DOC — the page title is an H1') : bad('DOC — no H1')
  has(/## About this business/, md.body) && has(/Probe Business/, md.body)
    ? ok('DOC — the site context block is appended')
    : bad('DOC — the context block is missing')

  // Expected values are markdown full of regex syntax, so match them as plain strings.
  const hasLine = (line) => `\n${md.body}`.includes(`\n${line}`)
  const conversions = [
    [hasLine('## What this page proves'), 'an h2 becomes ##'],
    [md.body.includes('**bold**'), 'bold survives'],
    [md.body.includes('*italic*'), 'italic survives'],
    [md.body.includes('`inline code`'), 'inline code survives'],
    [md.body.includes('[link with a space](https://example.com/a%20b)'), 'a space in a URL is encoded, not left to break the link'],
    [hasLine('- First item'), 'a bullet list'],
    [hasLine('  - Nested one'), 'a NESTED bullet list is indented'],
    [hasLine('1. Step one'), 'an ordered list'],
    [hasLine('> A quotation'), 'a blockquote'],
    [md.body.includes('| Plan | Price \\| per month |'), 'a table, with a pipe inside a cell escaped'],
    [hasLine('| --- | --- |'), 'the table header rule'],
    [md.body.includes('![A picture of a thing](https://example.com/pic.png)'), 'an image keeps its alt text'],
    [hasLine('*The caption*'), 'a figcaption becomes an italic line'],
    [hasLine('```php'), 'a code block keeps its language'],
    [hasLine("echo 'hello';"), 'code content is verbatim, not escaped'],
    [md.body.includes('Inside a div.'), 'content inside a plain div survives'],
    [md.body.includes('[A video](https://www.youtube.com/embed/xyz)'), 'an iframe becomes a link'],
    [hasLine('\\* Not a list item'), 'a paragraph starting with * is escaped so it stays a paragraph'],
  ]
  for (const [held, label] of conversions) {
    held ? ok(`CONV — ${label}`) : bad(`CONV — ${label}`)
  }
  // Control: an empty body would pass every "does not contain" check below.
  md.body.length > 400 ? ok('CONV — CONTROL: the body is substantial, so the absence checks mean something') : bad(`CONV — CONTROL: body is ${md.body.length} bytes`)
  !md.body.includes('should not appear') ? ok('CONV — a <script> is dropped whole') : bad('CONV — script content leaked into the twin')
  !md.body.includes('Submit') ? ok('CONV — form controls are dropped') : bad('CONV — a button label became prose')
  !has(/<h2|<p>|<table/, md.body) ? ok('CONV — no raw HTML tags survive') : bad('CONV — HTML leaked into the markdown')

  const sitemap = await raw('/sitemap-md.xml')
  sitemap.status === 200 && has(/<urlset/, sitemap.body)
    ? ok('ON — sitemap-md.xml is a urlset')
    : bad(`ON — sitemap answered ${sitemap.status} ${sitemap.ct}`)
  sitemap.body.includes(`${FIX.path}.md</loc>`)
    ? ok('ON — the sitemap lists the probe post’s twin')
    : bad('ON — the sitemap does not list the twin')

  const robots = await raw('/robots.txt')
  !has(/sitemap-md/i, robots.body)
    ? ok('ON — robots.txt does NOT declare sitemap-md.xml (deliberate)')
    : bad('ON — robots.txt declares the noindex sitemap')

  // Set through Yoast's key, on the sample page (ID 2) so the fixture post stays untouched.
  await wpExec(['post', 'meta', 'update', '2', '_yoast_wpseo_meta-robots-noindex', '1'])
  const noindexed = await raw('/sample-page.md')
  noindexed.status === 404
    ? ok('ON — a post marked noindex has no twin at all')
    : bad(`ON — a noindexed post served a twin (${noindexed.status})`)
  await wpExec(['post', 'meta', 'delete', '2', '_yoast_wpseo_meta-robots-noindex'])
  const restored = await raw('/sample-page.md')
  restored.status === 200
    ? ok('CONTROL — the same page DOES get a twin once the noindex is removed')
    : bad(`CONTROL — the page still 404s after the noindex was cleared (${restored.status})`)

  await wpExec(['post', 'meta', 'update', '2', '_rankxai_twin_disabled', '1'])
  const optedOut = await raw('/sample-page.md')
  optedOut.status === 404 ? ok('ON — the per-post opt-out removes the twin') : bad(`ON — opt-out ignored (${optedOut.status})`)
  await wpExec(['post', 'meta', 'delete', '2', '_rankxai_twin_disabled'])

  const missing = await raw('/there-is-no-such-page.md')
  missing.status === 404 && !has(/text\/markdown/, missing.ct)
    ? ok('ON — an unmapped .md path is a normal 404, not an HTML shell as markdown')
    : bad(`ON — unmapped path answered ${missing.status} ${missing.ct}`)

  // Without the plugin's redirect_canonical filter, core would guess its way out
  // of these 404s and redirect to the HTML page.
  await wpExec(['post', 'meta', 'update', '2', '_rankxai_twin_disabled', '1'])
  for (const path of ['/sample-page.md', '/sample-page/index.md', '/Sample-Page.md']) {
    const refused = await raw(path)
    refused.status === 404
      ? ok(`ON — ${path} on a refused page is a 404`)
      : bad(`ON — ${path} answered ${refused.status} ${refused.location}`)
  }
  await wpExec(['post', 'meta', 'delete', '2', '_rankxai_twin_disabled'])

  // The plugin rewrites REQUEST_URI for twin requests, so check it does so for reads only.
  const posted = await http(`${BASE}${FIX.path}.md`, { method: 'POST', redirect: 'manual' })
  !(posted.headers.get('content-type') ?? '').includes('text/markdown')
    ? ok('ON — a POST to a twin URL is not served as a twin')
    : bad('ON — a POST was rewritten and served markdown')

  const draft = await raw('/privacy-policy.md')
  draft.status === 404 ? ok('ON — a draft has no twin') : bad(`ON — a draft served ${draft.status}`)

  await setTwins({ enabled: false, context: '' })
  await apiJson('/rankxai/v1/documents/agents_md', { method: 'DELETE' })

  const afterMd = await raw(`${FIX.path}.md`)
  afterMd.status === 404 ? ok('CLEANUP — twins are off and the .md URL 404s again') : bad(`CLEANUP — .md still answers ${afterMd.status}`)
  const afterHtml = await raw(`${FIX.path}/`)
  !has(/text\/markdown/, afterHtml.link) && !has(/type="text\/markdown"/, afterHtml.body)
    ? ok('CLEANUP — the advertisement is gone from header and head')
    : bad('CLEANUP — the page still advertises a twin')
  const afterState = await apiJson('/rankxai/v1/twins')
  afterState.json?.contextBytes === 0 ? ok('CLEANUP — the context block is removed') : bad(`CLEANUP — contextBytes ${afterState.json?.contextBytes}`)
  const afterDoc = await raw('/agents.md')
  !has(/This is the stored document/, afterDoc.body)
    ? ok('CLEANUP — the probe document is removed')
    : bad('CLEANUP — the document is still served')

  await wpCapture(['post', 'delete', FIX.id, '--force'])
  const gone = await wpCapture(['post', 'list', '--post_type=post', `--name=${FIXTURE_SLUG}`, '--field=ID'])
  gone.trim() === ''
    ? ok('CLEANUP — the fixture post is removed')
    : bad(`CLEANUP — the fixture post survives as ${gone.trim()}`)

  // Some page caches serve REST responses despite no-store headers; DONOTCACHEPAGE
  // is what they honour, so it must be set on rankxai/v1 requests only.
  await apiJson('/rankxai/v1/twins')
  const ours = await wpOption('rankxai_cache_witness')
  ours?.nocache === true && String(ours.uri).includes('rankxai')
    ? ok('CACHE — DONOTCACHEPAGE is defined on a rankxai/v1 request')
    : bad(`CACHE — the never-cache filter did not fire: ${JSON.stringify(ours)}`)

  await api('/wp/v2/types', { method: 'GET' })
  const theirs = await wpOption('rankxai_cache_witness')
  theirs?.nocache === false && String(theirs.uri).includes('wp%2Fv2')
    ? ok('CACHE — CONTROL: it does NOT fire on an unrelated wp/v2 request')
    : bad(`CACHE — the filter fires for everybody, which would disable a customer's own caching: ${JSON.stringify(theirs)}`)

  // rankxai-probe.php is a test mu-plugin (not shipped) with warnings of its own,
  // so it is excluded by name.
  const after = await apacheLog()
  const fresh = linesSince(logBefore, after)
  const complaints = fresh
    .split('\n')
    .filter((l) => /PHP (Fatal|Warning|Notice|Deprecated)/.test(l))
    .filter((l) => !l.includes('rankxai-probe.php'))
  complaints.length === 0
    ? ok('LOG — PHP logged nothing during the run')
    : bad(`LOG — PHP complained ${complaints.length} time(s):\n        ${complaints.slice(0, 4).join('\n        ')}`)
  // Control: an empty log read would pass the check above vacuously.
  fresh.includes(FIXTURE_SLUG)
    ? ok('LOG — CONTROL: the log read covers this run’s own requests')
    : bad('LOG — CONTROL: the log read found none of this run’s requests, so it proved nothing')

  console.log(`\n  ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

/** Read one option through wp-cli as parsed JSON, or null when unset or unreadable. */
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

/** Run a wp-cli command and return its output. Throws, so a missing fixture fails the run. */
async function wpCapture(args) {
  const { execFileSync } = await import('node:child_process')
  return execFileSync(
    'docker',
    ['exec', '-u', '33', cliContainer(), 'wp', ...args],
    { encoding: 'utf8', stdio: 'pipe' }
  ).trim()
}

const FIXTURE_SLUG = 'rankxai-twin-fixture'

/** One page body carrying every construct the conversion checks expect. */
const FIXTURE_BODY = [
  '<h2>What this page proves</h2>',
  '<p>A paragraph with <strong>bold</strong>, <em>italic</em> and <code>inline code</code>,'
  + ' plus <a href="https://example.com/a b">link with a space</a>.</p>',
  '<ul><li>First item<ul><li>Nested one</li></ul></li><li>Second item</li></ul>',
  '<ol><li>Step one</li><li>Step two</li></ol>',
  '<blockquote><p>A quotation worth keeping.</p></blockquote>',
  '<table><thead><tr><th>Plan</th><th>Price | per month</th></tr></thead>'
  + '<tbody><tr><td>Starter</td><td>10</td></tr></tbody></table>',
  '<figure><img src="https://example.com/pic.png" alt="A picture of a thing" />'
  + '<figcaption>The caption</figcaption></figure>',
  '<pre class="language-php"><code>echo \'hello\';</code></pre>',
  '<div>Inside a div.</div>',
  '<iframe src="https://www.youtube.com/embed/xyz" title="A video"></iframe>',
  '<p>* Not a list item</p>',
  "<script>var leak = 'should not appear';<" + "/script>",
  '<form><button type="submit">Submit</button></form>',
].join('\n')

/**
 * Create the fixture post and an `agents` page (whose .md path collides with a root
 * document), and return the fixture's path, read back rather than guessed.
 */
async function provision() {
  const stale = await wpCapture(['post', 'list', '--post_type=post', `--name=${FIXTURE_SLUG}`, '--field=ID'])
  for (const id of stale.split('\n').map((l) => l.trim()).filter(Boolean)) {
    await wpCapture(['post', 'delete', id, '--force'])
  }

  const agents = await wpCapture(['post', 'list', '--post_type=page', '--name=agents', '--field=ID'])
  if (!agents.trim()) {
    await wpCapture([
      'post', 'create', '--post_type=page', '--post_title=Agents',
      '--post_name=agents', '--post_status=publish',
    ])
  }

  const id = await wpCapture([
    'post', 'create', '--post_type=post',
    '--post_title=RankX AI twin fixture',
    `--post_name=${FIXTURE_SLUG}`,
    '--post_status=publish',
    // An explicit excerpt, so WordPress does not build the description from the
    // body, which would include the form's button label.
    '--post_excerpt=A fixture page for the markdown converter.',
    `--post_content=${FIXTURE_BODY}`,
    '--porcelain',
  ])
  const url = await wpCapture(['eval', `echo get_permalink(${id});`])
  return { id, path: new URL(url).pathname.replace(/\/$/, '') }
}
/** Run a wp-cli command inside the wp-env container. */
async function wpExec(args) {
  const { execFileSync } = await import('node:child_process')
  const container = cliContainer()
  try {
    execFileSync('docker', ['exec', '-u', '33', container, 'wp', ...args], { stdio: 'pipe' })
  } catch (e) {
    console.log(`  (wp ${args.join(' ')} failed: ${String(e).slice(0, 120)})`)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
