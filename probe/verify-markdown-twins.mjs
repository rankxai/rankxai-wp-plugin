#!/usr/bin/env node
/**
 * Plan 80 §22 — markdown twins, proven against a real WordPress.
 *
 * Run:  npx wp-env start   then   node probe/verify-markdown-twins.mjs
 *
 * ── WHY A REAL WORDPRESS AND NOT A UNIT TEST ────────────────────────────────
 *
 * Every rule this feature rests on is about things a unit test cannot reach:
 * whether `plugins_loaded` priority 0 actually beats `redirect_canonical`,
 * whether a header survives to the wire, whether `/agents.md` still belongs to
 * the documents route once the twin interceptor exists, and whether an
 * `X-Robots-Tag` another plugin queued is removed. The plugin has no PHP unit
 * suite; this is the gate.
 *
 * ── THE FIXTURES IT NEEDS, BECAUSE A FRESH RIG DOES NOT HAVE THEM ──────────
 *
 * On a wp-env created from scratch these do not exist and the run fails in ways
 * that read as product defects rather than as a missing rig:
 *
 *   wp post create --post_type=page --post_title="Agents" --post_name=agents  *     --post_status=publish
 *       The COLLISION fixture. `/agents.md` is one of our own root documents AND
 *       a `.md` path, so without a page slugged `agents` the guard that stops
 *       the twin interceptor claiming it is never exercised against anything.
 *
 *   wp post update 4 --post_content="<the markup the CONV block asserts>"
 *       The probe post needs a body with a table, a nested list, a code block, a
 *       figure, an iframe and a paragraph starting with `*`. Without it every
 *       CONV assertion fails.
 *
 *   wp user application-password create admin twins-probe --porcelain
 *       Passed as WP_APP_PASSWORD.
 *
 * ── IT PUTS THE SITE BACK ───────────────────────────────────────────────────
 *
 * Twins are switched off, the stored document removed and the fixture meta
 * cleared at the end, and the cleanup is ASSERTED rather than hoped for — the
 * same rule every live harness in the platform repo follows.
 */

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

/**
 * Fetch without following redirects, so a canonical redirect is visible rather
 * than hidden.
 *
 * ONE retry on a transport error, and only on a transport error. The 404
 * template on this rig is 88 KB and node's keep-alive pool resets against the
 * container occasionally; a reset is not a result, and crashing the run on one
 * loses every assertion after it. A non-2xx is NEVER retried — that is an
 * answer, and retrying an answer is how a flaky harness hides a real failure.
 */
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
 * Every request in this file, with a bounded retry on a TRANSPORT error only.
 *
 * MEASURED, twice, on two different steps: Apache in this rig answers
 * `Keep-Alive: timeout=5, max=100` and the 404 template is 88 KB, and node's
 * connection pool occasionally sends on a socket the server has just closed —
 * ECONNRESET. That is not a result, and crashing the run on one loses every
 * assertion after it.
 *
 * A NON-2xx IS NEVER RETRIED. That is an answer, and retrying an answer is how
 * a flaky harness hides a real failure. The first version put the retry inside
 * `raw()` only, and the run then died on the one bare `fetch` beside it — a fix
 * whose BOUNDARY was wrong, which is the shape this plan records five times.
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

async function setTwins(patch) {
  return apiJson('/rankxai/v1/twins', { method: 'PUT', body: JSON.stringify(patch) })
}

const CONTEXT = [
  '**Probe Business**',
  '',
  'We prove that markdown twins work.',
  '',
  '- Category: verification',
  '- More: https://example.com/llms.txt',
].join('\n')

/**
 * Read the WordPress error log inside the container.
 *
 * ── THE CHECK THAT FOUND THE DEFECT NO ASSERTION COULD ──────────────────────
 *
 * `user_trailingslashit()` at `plugins_loaded` reads a property off a
 * `$wp_rewrite` that does not exist yet. Every twin request logged
 * "Trying to get property 'use_trailing_slashes' of non-object" and every
 * functional assertion still passed, because WordPress resolves a path with or
 * without the slash. It was found by READING the container's log. So the log is
 * now part of the gate.
 */
async function apacheLog() {
  const { execFileSync } = await import('node:child_process')
  const container = process.env.WP_CONTAINER ?? 'wp-env-rankxai-wordpress-plugin-599f954e-wordpress-1'
  try {
    return execFileSync('docker', ['logs', '--tail', '2000', container], { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    return ''
  }
}

/**
 * The lines this run added.
 *
 * Anchored on the LAST LINE seen before the run, not on a byte offset. The
 * first version sliced by the before-length, which is wrong the moment the
 * tail window scrolls past where it started — and it did: the control reported
 * that it had found none of the run's own requests, on a clean run. An anchor
 * that cannot be found falls back to the WHOLE window, which examines more than
 * it needs to and never less.
 */
function linesSince(before, after) {
  const anchor = before.trimEnd().split('\n').pop() ?? ''
  if (anchor === '') return after
  const at = after.lastIndexOf(anchor)
  return at === -1 ? after : after.slice(at + anchor.length)
}

async function run() {
  const logBefore = await apacheLog()

  // Every option this feature stores is deleted, so the plugin is in the state
  // a site is in the moment it is activated or updated. That is the acceptance
  // item this whole design turns on: **installing must not publish a single new
  // public URL**, and `settings()` reaching its default is a different code path
  // from reading a stored `false`.
  await wpExec(['option', 'delete', 'rankxai_twins'])
  await wpExec(['option', 'delete', 'rankxai_twin_context'])

  const freshState = await apiJson('/rankxai/v1/twins')
  freshState.json?.enabled === false
    ? ok('FRESH — with no options at all, the plugin reports twins OFF')
    : bad(`FRESH — a fresh install reported enabled=${freshState.json?.enabled}`)
  const freshMd = await raw('/2026/09/21/plan-80-probe-post.md')
  const freshMap = await raw('/sitemap-md.xml')
  const freshHtml = await raw('/2026/09/21/plan-80-probe-post/')
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

  // THE DEFECT THIS EXISTS FOR MADE THE FEATURE IMPOSSIBLE TO TURN ON.
  // `is_eligible()` included the switch, so the state reported
  // `eligibleCount: 0` while off — which the platform rendered as "No published
  // pages are eligible yet, so there is nothing to copy" and used to DISABLE
  // the button that switches it on. Measured on both live sites: 0 while off, a
  // full catalogue the moment it was on.
  const offState = await apiJson('/rankxai/v1/twins')
  offState.json?.eligibleCount > 0
    ? ok(`OFF — the site still reports ${offState.json.eligibleCount} pages that WOULD get a copy`)
    : bad('OFF — eligibleCount is 0 while off, so the platform cannot offer the switch')
  offState.json?.sample?.sourceBytes > 0
    ? ok('OFF — and a measured sample, so the customer sees the saving before committing')
    : bad('OFF — no sample while off')

  const offMd = await raw('/2026/09/21/plan-80-probe-post.md')
  offMd.status === 404 ? ok('OFF — the .md URL 404s') : bad(`OFF — .md answered ${offMd.status}`)

  const offHtml = await raw('/2026/09/21/plan-80-probe-post/')
  !has(/text\/markdown/, offHtml.link)
    ? ok('OFF — no alternate Link header on the HTML page')
    : bad('OFF — the page still advertises a twin')
  !has(/type="text\/markdown"/, offHtml.body)
    ? ok('OFF — no alternate <link> in the head')
    : bad('OFF — the head still advertises a twin')

  const offSitemap = await raw('/sitemap-md.xml')
  offSitemap.status === 404 ? ok('OFF — sitemap-md.xml 404s') : bad(`OFF — sitemap answered ${offSitemap.status}`)

  const offNegotiated = await raw('/2026/09/21/plan-80-probe-post/', { headers: { Accept: 'text/markdown' } })
  has(/text\/html/, offNegotiated.ct)
    ? ok('OFF — Accept: text/markdown still gets HTML')
    : bad(`OFF — negotiated response was ${offNegotiated.ct}`)

  await apiJson('/rankxai/v1/documents/agents_md', {
    method: 'PUT',
    body: JSON.stringify({ content: '# Agents\n\nThis is the stored document.\n' }),
  })
  const docOff = await raw('/agents.md')
  has(/This is the stored document/, docOff.body) && docOff.source === 'virtual-route'
    ? ok('OFF — /agents.md serves the stored document')
    : bad(`OFF — /agents.md served source=${docOff.source} status=${docOff.status}`)

  const on = await setTwins({ enabled: true, context: CONTEXT })
  on.status === 200 && on.json?.enabled === true
    ? ok('ON — the site accepted the switch and reports it')
    : bad(`ON — PUT answered ${on.status} ${JSON.stringify(on.json ?? on.text)}`)
  typeof on.json?.eligibleCount === 'number' && on.json.eligibleCount > 0
    ? ok(`ON — ${on.json.eligibleCount} pages reported eligible`)
    : bad(`ON — eligibleCount was ${on.json?.eligibleCount}`)
  on.json?.sample && on.json.sample.sourceBytes > 0 && on.json.sample.twinBytes > 0
    ? ok(`ON — sample measured: ${on.json.sample.sourceBytes}B HTML → ${on.json.sample.twinBytes}B markdown`)
    : bad(`ON — no usable sample came back: ${JSON.stringify(on.json?.sample)}`)
  // The sample must be the page with the MOST content, not the newest.
  // Measured on this rig before the fix: `eligible_posts()` is ordered by
  // `modified DESC`, the newest page was EMPTY, and the state came back
  // `sourceBytes: 0, twinBytes: 331` — a twin bigger than its source, offered
  // as the one number this feature is sold on.
  on.json?.sample && on.json.sample.sourceBytes >= on.json.sample.twinBytes / 4
    ? ok('ON — the sample is a page with real content, not the empty newest one')
    : bad(`ON — the sample looks empty: ${JSON.stringify(on.json?.sample)}`)

  const docOn = await raw('/agents.md')
  has(/This is the stored document/, docOn.body) && docOn.source === 'virtual-route'
    ? ok('ON — /agents.md STILL serves the stored document, not a twin of the page slugged "agents"')
    : bad(`ON — /agents.md was taken over: source=${docOn.source} body=${docOn.body.slice(0, 60)}`)

  const shapes = {
    suffix: await raw('/2026/09/21/plan-80-probe-post.md'),
    index: await raw('/2026/09/21/plan-80-probe-post/index.md'),
    query: await raw('/2026/09/21/plan-80-probe-post/?format=md'),
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

  // The query shape is a HINT on the HTML URL, so it must NOT carry noindex —
  // that URL is the one the HTML page is indexed under.
  !has(/noindex/, shapes.query.robots)
    ? ok('ON — ?format=md does not noindex the page’s own URL')
    : bad(`ON — the query shape emitted X-Robots-Tag: ${shapes.query.robots}`)

  const negotiated = await raw('/2026/09/21/plan-80-probe-post/', { headers: { Accept: 'text/markdown' } })
  has(/text\/markdown/, negotiated.ct)
    ? ok('ON — Accept: text/markdown returns markdown at the page’s own URL')
    : bad(`ON — negotiated response was ${negotiated.ct}`)
  const browser = await raw('/2026/09/21/plan-80-probe-post/', {
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

  // Every expected value here is markdown, so most of them are made of the
  // characters a regex treats as syntax — `*`, `|`, `[`, `\`. Two of these were
  // written as regexes first and BOTH were wrong in a way that still passed:
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
  // CONTROL: without this, a body that came back empty would pass every
  // "does NOT contain" assertion below and read as a clean conversion.
  md.body.length > 400 ? ok('CONV — CONTROL: the body is substantial, so the absence checks mean something') : bad(`CONV — CONTROL: body is ${md.body.length} bytes`)
  !md.body.includes('should not appear') ? ok('CONV — a <script> is dropped whole') : bad('CONV — script content leaked into the twin')
  !md.body.includes('Submit') ? ok('CONV — form controls are dropped') : bad('CONV — a button label became prose')
  !has(/<h2|<p>|<table/, md.body) ? ok('CONV — no raw HTML tags survive') : bad('CONV — HTML leaked into the markdown')

  const sitemap = await raw('/sitemap-md.xml')
  sitemap.status === 200 && has(/<urlset/, sitemap.body)
    ? ok('ON — sitemap-md.xml is a urlset')
    : bad(`ON — sitemap answered ${sitemap.status} ${sitemap.ct}`)
  has(/plan-80-probe-post\.md<\/loc>/, sitemap.body)
    ? ok('ON — the sitemap lists the probe post’s twin')
    : bad('ON — the sitemap does not list the twin')

  const robots = await raw('/robots.txt')
  !has(/sitemap-md/i, robots.body)
    ? ok('ON — robots.txt does NOT declare sitemap-md.xml (deliberate)')
    : bad('ON — robots.txt declares the noindex sitemap')

  // Set through Yoast's key, because the registry's map is what decides and the
  // shapes differ per plugin. The post is the SAMPLE PAGE, so the probe post
  // stays available to every check above.
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

  // MEASURED: without `send_404()`'s `redirect_canonical` filter, core guesses
  // its way out of our 404 and answers 301 to the HTML page. Both shapes below
  // did exactly that — `/Sample-Page.md` on any permalink structure, and
  // `/x/index.md` on a structure with no trailing slash.
  await wpExec(['post', 'meta', 'update', '2', '_rankxai_twin_disabled', '1'])
  for (const path of ['/sample-page.md', '/sample-page/index.md', '/Sample-Page.md']) {
    const refused = await raw(path)
    refused.status === 404
      ? ok(`ON — ${path} on a refused page is a 404`)
      : bad(`ON — ${path} answered ${refused.status} ${refused.location}`)
  }
  await wpExec(['post', 'meta', 'delete', '2', '_rankxai_twin_disabled'])

  // It rewrites REQUEST_URI before WordPress parses it, which is the most
  // invasive thing this plugin does. Reads only.
  const posted = await http(`${BASE}/2026/09/21/plan-80-probe-post.md`, { method: 'POST', redirect: 'manual' })
  !(posted.headers.get('content-type') ?? '').includes('text/markdown')
    ? ok('ON — a POST to a twin URL is not served as a twin')
    : bad('ON — a POST was rewritten and served markdown')

  const draft = await raw('/privacy-policy.md')
  draft.status === 404 ? ok('ON — a draft has no twin') : bad(`ON — a draft served ${draft.status}`)

  await setTwins({ enabled: false, context: '' })
  await apiJson('/rankxai/v1/documents/agents_md', { method: 'DELETE' })

  const afterMd = await raw('/2026/09/21/plan-80-probe-post.md')
  afterMd.status === 404 ? ok('CLEANUP — twins are off and the .md URL 404s again') : bad(`CLEANUP — .md still answers ${afterMd.status}`)
  const afterHtml = await raw('/2026/09/21/plan-80-probe-post/')
  !has(/text\/markdown/, afterHtml.link) && !has(/type="text\/markdown"/, afterHtml.body)
    ? ok('CLEANUP — the advertisement is gone from header and head')
    : bad('CLEANUP — the page still advertises a twin')
  const afterState = await apiJson('/rankxai/v1/twins')
  afterState.json?.contextBytes === 0 ? ok('CLEANUP — the context block is removed') : bad(`CLEANUP — contextBytes ${afterState.json?.contextBytes}`)
  const afterDoc = await raw('/agents.md')
  !has(/This is the stored document/, afterDoc.body)
    ? ok('CLEANUP — the probe document is removed')
    : bad('CLEANUP — the document is still served')

  // MEASURED ON A LIVE SITE, and it made the product look broken: LiteSpeed
  // Cache answered `GET /?rest_route=/rankxai/v1/twins` with
  // `X-LiteSpeed-Cache: hit` on every call, including straight after a PUT that
  // had switched copies on and returned `enabled: true`. The next read said
  // `false`, for ever. WordPress's own `Cache-Control: no-store, private` did
  // not stop it; `DONOTCACHEPAGE` is what every major page cache reads.
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

  // The probe mu-plugin (a Phase 0 leftover, not shipped) emits its own
  // undefined-constant warnings, so it is excluded BY NAME rather than the
  // check being softened.
  const after = await apacheLog()
  const fresh = linesSince(logBefore, after)
  const complaints = fresh
    .split('\n')
    .filter((l) => /PHP (Fatal|Warning|Notice|Deprecated)/.test(l))
    .filter((l) => !l.includes('rankxai-probe.php'))
  complaints.length === 0
    ? ok('LOG — PHP logged nothing during the run')
    : bad(`LOG — PHP complained ${complaints.length} time(s):\n        ${complaints.slice(0, 4).join('\n        ')}`)
  // CONTROL: a log read that returned nothing would pass the line above
  // vacuously, which is the shape `guard-scan.ts` warns about.
  fresh.includes('plan-80-probe-post')
    ? ok('LOG — CONTROL: the log read covers this run’s own requests')
    : bad('LOG — CONTROL: the log read found none of this run’s requests, so it proved nothing')

  console.log(`\n  ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

/**
 * Read one option through wp-cli, PARSED. `null` when unset or unreadable.
 *
 * `--format=json` returns JSON, not PHP's serialised form. The first version of
 * the caller matched `'"nocache";b:1'` against it and reported a working fix as
 * broken — a guard looking for the wrong string, which is indistinguishable
 * from a real failure until somebody reads the value it printed.
 */
async function wpOption(name) {
  const { execFileSync } = await import('node:child_process')
  const container = process.env.WP_CLI_CONTAINER ?? 'wp-env-rankxai-wordpress-plugin-599f954e-cli-1'
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

/** Run a wp-cli command inside the wp-env container. */
async function wpExec(args) {
  const { execFileSync } = await import('node:child_process')
  const container = process.env.WP_CLI_CONTAINER ?? 'wp-env-rankxai-wordpress-plugin-599f954e-cli-1'
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
