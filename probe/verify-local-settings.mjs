#!/usr/bin/env node
/**
 * Probe: what the site owner can do in wp-admin with no RankX AI account.
 *
 *   A  root documents: text written in Settings is served, only while "Serve it" is ticked
 *   B  the business summary on markdown copies: saved from Settings, sanitised, size-limited
 *   C  redirects from Settings: add, refuse a live page, download as CSV, the import script loaded
 *   D  the search title box: shown with no SEO plugin, saved from the edit form only, hidden with one
 *   E  lists are paged, never cut short
 *   F  deactivating leaves no scheduled event, including one scheduled with arguments
 *   G  hidden pages have a title, so the admin header logs no deprecation
 *
 * The Settings form is submitted as a browser would: every field the page holds, with only the ones under test
 * changed. Run on the wp-env rig: node probe/verify-local-settings.mjs
 */
import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const MARK = `rx-local-${Date.now()}`

let pass = 0
let fail = 0
const check = (cond, m, detail = '') => {
  if (cond) {
    console.log(`  PASS  ${m}`)
    pass++
  } else {
    console.log(`  FAIL  ${m}${detail ? ` — ${detail}` : ''}`)
    fail++
  }
}

function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  }).trim()
}
function wpSoft(...args) {
  try { return wp(...args) } catch { return null }
}
const evalPhp = (code) => wp('eval', code)
const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64')

async function http(url, init = {}, attempt = 0) {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (attempt >= 2) throw e
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    return http(url, init, attempt + 1)
  }
}

async function login(user, password) {
  const body = new URLSearchParams({ log: user, pwd: password, 'wp-submit': 'Log In', testcookie: '1' })
  const res = await http(`${BASE}/wp-login.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body,
  })
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
  if (!cookies.some((c) => c.startsWith('wordpress_logged_in_'))) throw new Error(`login failed for ${user} (${res.status})`)
  return cookies.join('; ')
}

async function page(cookie, path) {
  const res = await http(`${BASE}${path}`, { headers: { Cookie: cookie } })
  return { status: res.status, html: await res.text() }
}

async function adminPost(cookie, fields) {
  const res = await http(`${BASE}/wp-admin/admin-post.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: fields instanceof URLSearchParams ? fields : new URLSearchParams(fields),
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, location: res.headers.get('location') ?? '', type: res.headers.get('content-type') ?? '', text }
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')

/** Every field the Settings form would submit, as a browser would. */
function settingsForm(html) {
  const start = html.indexOf('name="action" value="rankxai_save_settings"')
  const open = html.lastIndexOf('<form', start)
  const form = html.slice(open, html.indexOf('</form>', start))
  const fields = new URLSearchParams()
  for (const m of form.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0]
    const name = /name="([^"]+)"/.exec(tag)?.[1]
    if (!name) continue
    const type = /type="([^"]+)"/.exec(tag)?.[1] ?? 'text'
    const value = decode(/value="([^"]*)"/.exec(tag)?.[1] ?? '')
    if (type === 'checkbox' && !/\bchecked\b/.test(tag)) continue
    fields.append(name, type === 'checkbox' ? value || '1' : value)
  }
  for (const m of form.matchAll(/<textarea\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
    // A browser drops one newline right after <textarea>.
    fields.append(m[1], decode(m[2]).replace(/^\n/, ''))
  }
  return fields
}

/** Submit Settings with some fields changed (null removes a field, as an unticked box does). */
async function saveSettings(jar, changes) {
  const { html } = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
  const fields = settingsForm(html)
  for (const [k, v] of Object.entries(changes)) {
    fields.delete(k)
    if (v !== null) fields.append(k, v)
  }
  return adminPost(jar, fields)
}

async function served(path) {
  const res = await http(`${BASE}${path}?nocache=${Date.now()}`)
  return { status: res.status, body: await res.text(), source: res.headers.get('x-rankxai-document') ?? '' }
}

const OPTIONS = ['rankxai_documents_local', 'rankxai_document_ai_txt', 'rankxai_document_llms_txt', 'rankxai_document_agents_md', 'rankxai_document_ai_txt_own', 'rankxai_document_llms_txt_own', 'rankxai_document_agents_md_own', 'rankxai_twin_context', 'rankxai_twin_context_own', 'rankxai_twins', 'rankxai_fill', 'rankxai_keep_data', 'rankxai_share_personal_data', 'rankxai_crawlers_enabled']

async function run() {
  const saved = {}
  for (const o of OPTIONS) saved[o] = wpSoft('option', 'get', o, '--format=json')
  // SEO plugins and redirect managers off, so this plugin's own box and redirect list are what is tested.
  const seoPlugins = ['wordpress-seo', 'seo-by-rank-math', 'all-in-one-seo-pack', 'wp-seopress', 'autodescription', 'redirection']
  const originalPlugins = JSON.parse(wp('plugin', 'list', '--status=active', '--field=name', '--format=json'))
  for (const p of seoPlugins) if (originalPlugins.includes(p)) wpSoft('plugin', 'deactivate', p)
  const made = []
  const debugBefore = Number(wpSoft('eval', 'echo file_exists( WP_CONTENT_DIR . "/debug.log" ) ? filesize( WP_CONTENT_DIR . "/debug.log" ) : 0;') ?? 0)

  try {
    const jar = await login('admin', 'password')

    console.log('\n== A  root documents written in Settings ==')
    const text = `User-Agent: *\nDisallow: /private/\n# ${MARK}\u0007`
    let r = await saveSettings(jar, { 'rankxai_document[ai_txt]': text, 'rankxai_generate[ai_txt]': '1' })
    check(r.status === 302 && r.location.includes('rankxai-saved=1'), `saving Settings redirects back saved (${r.status})`)
    let doc = await served('/ai.txt')
    check(doc.status === 200 && doc.body.includes(`# ${MARK}`) && doc.source === 'site', `ai.txt written in Settings is served, marked as the site's own (${doc.status}, ${doc.source})`)
    check(!doc.body.includes('\u0007'), 'and the control character in it was removed when it was saved')
    r = await saveSettings(jar, { 'rankxai_generate[ai_txt]': null })
    doc = await served('/ai.txt')
    check(!doc.body.includes(MARK) && doc.source === '', `unticking "Serve it" stops serving it (${doc.status})`)
    check((wpSoft('option', 'get', 'rankxai_document_ai_txt_own') ?? '').includes(MARK), 'and the text is kept')
    const settings = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    check(settings.html.includes('Text is saved, but nothing is served until you tick the box.'), 'Settings says the text is kept but not served')
    r = await saveSettings(jar, { 'rankxai_document[ai_txt]': '', 'rankxai_generate[ai_txt]': '1' })
    doc = await served('/ai.txt')
    check(wpSoft('option', 'get', 'rankxai_document_ai_txt_own') === null && !doc.body.includes(MARK), 'emptying the text removes it, and ai.txt has nothing to serve')
    evalPhp('RankXAI_Documents::set( "ai_txt", "# published ai.txt" );')
    doc = await served('/ai.txt')
    check(!doc.body.includes('published ai.txt'), 'an ai.txt stored by anything but the site owner is never served')
    evalPhp('RankXAI_Documents::delete( "ai_txt" );')

    r = await saveSettings(jar, { 'rankxai_document[llms_txt]': `# Own llms ${MARK}\n`, 'rankxai_generate[llms_txt]': '1' })
    doc = await served('/llms.txt')
    check(doc.body.startsWith(`# Own llms ${MARK}`) && doc.source === 'site', 'llms.txt written in Settings beats the generated copy')
    evalPhp(`RankXAI_Documents::set( "llms_txt", "# Published llms ${MARK}" );`)
    doc = await served('/llms.txt')
    check(doc.body.startsWith(`# Own llms ${MARK}`) && doc.source === 'site', 'and a version RankX AI publishes does not replace it')
    const restState = JSON.parse(evalPhp('wp_set_current_user( 1 ); $r = rest_do_request( new WP_REST_Request( "GET", "/rankxai/v1/documents/llms_txt" ) ); echo wp_json_encode( $r->get_data() );'))
    check(restState.ownText === true && restState.serving === false, 'and the connection is told the owner\'s text is served, not its own', JSON.stringify({ ownText: restState.ownText, serving: restState.serving }))
    r = await saveSettings(jar, { 'rankxai_document[llms_txt]': '' })
    doc = await served('/llms.txt')
    check(doc.body.startsWith(`# Published llms ${MARK}`) && doc.source === 'published', `emptied, the published version is served (${doc.source})`)
    evalPhp('RankXAI_Documents::delete( "llms_txt" );')
    doc = await served('/llms.txt')
    check(doc.status === 200 && doc.source === 'generated' && !doc.body.includes(MARK), `with neither, the generated copy is served (${doc.source})`)

    const big = 'x'.repeat(524289)
    r = await saveSettings(jar, { 'rankxai_document[agents_md]': big })
    check(r.location.includes('rankxai-too-long=1') && wpSoft('option', 'get', 'rankxai_document_agents_md_own') === null, 'text over 512 KB is refused, and Settings says so')

    console.log('\n== B  the business summary on markdown copies ==')
    r = await saveSettings(jar, { rankxai_twin_context: `We make probe mugs. ${MARK}\u0001` })
    const context = JSON.parse(wp('option', 'get', 'rankxai_twin_context_own', '--format=json'))
    check(context.content === `We make probe mugs. ${MARK}`, 'saved from Settings, with the control character removed', JSON.stringify(context.content))
    const postId = wp('post', 'create', '--post_type=post', '--post_status=publish', `--post_title=${MARK} copy`, '--post_content=<p>Body</p>', '--porcelain')
    made.push(postId)
    const md = evalPhp(`echo RankXAI_Twins::markdown_for( get_post( ${postId} ) );`)
    check(md.includes(`We make probe mugs. ${MARK}`), 'it ends the markdown copy')
    evalPhp(`RankXAI_Twins::save_context( "Published summary ${MARK}" );`)
    const md2 = evalPhp(`delete_transient( "rankxai_md_probe" ); echo RankXAI_Twins::context()["content"];`)
    check(md2.includes(`We make probe mugs. ${MARK}`) && !md2.includes('Published summary'), 'a summary RankX AI publishes does not replace the one written here')
    r = await saveSettings(jar, { rankxai_twin_context: 'y'.repeat(5000) })
    check(r.location.includes('rankxai-too-long=1') && JSON.parse(wp('option', 'get', 'rankxai_twin_context_own', '--format=json')).content.includes(MARK), 'over 4 KB is refused and the saved one stays')

    console.log('\n== C  redirects from Settings ==')
    const shot = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    const addNonce = /name="action" value="rankxai_add_redirect_now"[^]*?name="_wpnonce" value="([a-f0-9]+)"/.exec(shot.html)?.[1] ?? ''
    check(addNonce !== '', 'Settings offers an "Add redirect" form with no account')
    check(shot.html.includes('id="rankxai-redirect-csv"') && shot.html.includes('redirect-import.js') && shot.html.includes('rankxaiRedirectImport'), 'and a CSV import, with its script loaded on this page only')
    r = await adminPost(jar, { action: 'rankxai_add_redirect_now', _wpnonce: addNonce, rankxai_from: `/${MARK}-gone`, rankxai_to: '/sample-page/' })
    const stored = JSON.parse(evalPhp(`echo wp_json_encode( RankXAI_Redirects::items( "/${MARK}-gone" )["items"] );`))
    check(r.status === 302 && stored.length === 1 && stored[0].to === '/sample-page/', `a redirect added from Settings is stored (${r.status}, ${stored.length})`)
    const after = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    check(after.html.includes('Redirect added.'), 'and Settings says so')
    r = await adminPost(jar, { action: 'rankxai_add_redirect_now', _wpnonce: addNonce, rankxai_from: '/sample-page/', rankxai_to: '/' })
    const refused = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    check(refused.html.includes('notice-warning') && JSON.parse(evalPhp('echo wp_json_encode( RankXAI_Redirects::items( "/sample-page/" )["items"] );')).length === 0, 'a live page is refused, with the reason shown')
    const forged = await adminPost(jar, { action: 'rankxai_add_redirect_now', _wpnonce: 'deadbeef00', rankxai_from: `/${MARK}-forged`, rankxai_to: '/' })
    check(forged.status === 403, `a forged nonce is refused (${forged.status})`)
    const exportNonce = /name="action" value="rankxai_export_redirects"[^]*?name="_wpnonce" value="([a-f0-9]+)"/.exec(after.html)?.[1] ?? ''
    const csv = await adminPost(jar, { action: 'rankxai_export_redirects', _wpnonce: exportNonce })
    check(csv.status === 200 && csv.type.startsWith('text/csv') && csv.text.startsWith('from,to,code\n') && csv.text.includes(`/${MARK}-gone,/sample-page/,301`), `the download is a CSV of the redirects (${csv.status}, ${csv.type})`)
    evalPhp(`foreach ( RankXAI_Redirects::items( "/${MARK}-gone" )["items"] as $i ) { RankXAI_Redirects::delete( $i["backend"], $i["id"] ); }`)

    console.log('\n== D  the search title box ==')
    const edit = await page(jar, `/wp-admin/post.php?post=${postId}&action=edit&classic-editor`)
    check(edit.html.includes('id="rankxai-seo"') && edit.html.includes('name="rankxai_seo[title]"'), 'with no SEO plugin, the post edit screen has the box')
    const saveBox = (fields, withNonce) => evalPhp(`wp_set_current_user( 1 ); $_POST = json_decode( base64_decode( '${b64(fields)}' ), true ); ${withNonce ? '$_POST["rankxai_seo_box"] = wp_create_nonce( "rankxai_seo_box" );' : ''} RankXAI_SEO_Box::save_post( ${postId}, get_post( ${postId} ) ); echo wp_json_encode( RankXAI_SEO::get_own( ${postId} ) );`)
    let own = JSON.parse(saveBox({ rankxai_seo: { title: `Box title ${MARK}`, description: 'Box <b>description</b>', canonical: 'javascript:alert(1)' } }, true))
    check(own.title === `Box title ${MARK}` && own.description === 'Box description', 'saving the edit form stores the title and a sanitised description', JSON.stringify(own))
    check(!own.canonical, 'a canonical that is not an http address is not stored')
    own = JSON.parse(saveBox({ rankxai_seo: { title: 'Without the form nonce' } }, false))
    check(own.title === `Box title ${MARK}`, 'a save without the form nonce (REST, a script) changes nothing')
    const head = await (await http(`${BASE}/?p=${postId}`)).text()
    check(head.includes(`<title>Box title ${MARK}`) && head.includes('content="Box description"'), 'the page prints the title and description from the box')
    own = JSON.parse(saveBox({ rankxai_seo: { title: `Box title ${MARK}`, og_title: `Preview ${MARK}`, twitter_description: 'On X' }, rankxai_seo_noindex: '1' }, true))
    check(own.og_title === `Preview ${MARK}` && own.twitter_description === 'On X', 'the link preview fields are saved from the box')
    check(evalPhp(`echo RankXAI_Noindex::own( ${postId} );`) === '1', 'and the noindex box is saved')
    const head2 = await (await http(`${BASE}/?p=${postId}&n=${Date.now()}`)).text()
    check(head2.includes(`property="og:title" content="Preview ${MARK}"`) && head2.includes('name="twitter:description" content="On X"') && /<meta name=['"]robots['"][^>]*noindex/.test(head2), 'and the page prints them, with noindex')
    saveBox({ rankxai_seo: { title: `Box title ${MARK}` } }, true)
    check(evalPhp(`echo RankXAI_Noindex::own( ${postId} );`) === '', 'unticking noindex clears it')
    check(edit.html.includes('id="rankxai-schema"') && edit.html.includes('name="rankxai_schema_json"'), 'the structured data box is on the edit screen')
    const saveSchema = (json) => evalPhp(`wp_set_current_user( 1 ); $_POST = array( "rankxai_schema_box" => wp_create_nonce( "rankxai_schema_box" ), "rankxai_schema_json" => base64_decode( '${b64(json)}' ) ); RankXAI_SEO_Box::save_post( ${postId}, get_post( ${postId} ) ); $g = RankXAI_Schema::get( ${postId} ); echo null === $g ? "" : $g["content"];`)
    const schema = { '@context': 'https://schema.org', '@type': 'Organization', name: `Probe Org ${MARK}` }
    check(saveSchema(JSON.stringify(schema)).includes(`Probe Org ${MARK}`), 'valid JSON-LD is saved from the box')
    check(saveSchema('{ not json').includes(`Probe Org ${MARK}`), 'invalid JSON is not saved, and the saved one stays')
    const head3 = await (await http(`${BASE}/?p=${postId}&s3=${Date.now()}`)).text()
    check(head3.includes('application/ld+json') && head3.includes(`Probe Org ${MARK}`), 'and the page prints it as JSON-LD')
    saveSchema('')
    check(evalPhp(`echo null === RankXAI_Schema::get( ${postId} ) ? "none" : "kept";`) === 'none', 'emptying the box removes it')
    const term = await page(jar, '/wp-admin/term.php?taxonomy=category&tag_ID=1')
    check(term.html.includes('name="rankxai_term_seo[title]"'), 'a category edit screen has the fields')
    wp('plugin', 'activate', 'seo-by-rank-math')
    const withPlugin = await page(jar, `/wp-admin/post.php?post=${postId}&action=edit&classic-editor`)
    check(!withPlugin.html.includes('id="rankxai-seo"'), 'with an SEO plugin active, the search box is not shown')
    check(withPlugin.html.includes('id="rankxai-schema"'), 'but the structured data box still is')
    wp('plugin', 'deactivate', 'seo-by-rank-math')

    console.log('\n== E  lists are paged, not cut short ==')
    // The UI kit loads only in wp-admin; WP-CLI loads it by hand.
    const paged = JSON.parse(evalPhp('if ( ! class_exists( "RankXAI_UI" ) ) { require_once dirname( RANKXAI_PLUGIN_FILE ) . "/includes/class-rankxai-ui.php"; } $_GET["rx-p"] = "3"; $p = RankXAI_UI::page_of( range( 1, 60 ), "rx-p" ); ob_start(); RankXAI_UI::pager( $p, "x" ); $h = ob_get_clean(); echo wp_json_encode( array( "items" => $p["items"], "pages" => $p["pages"], "html" => $h ) );'))
    check(paged.pages === 3 && paged.items.length === 10 && paged.items[0] === 51 && paged.items[9] === 60, 'the last of 60 rows are on page 3')
    check(paged.html.includes('Previous') && !paged.html.includes('Next') && paged.html.includes('60 in all'), 'and the pager says how many in all')
    const checksPage = await page(jar, '/wp-admin/admin.php?page=rankxai-checks')
    check(checksPage.status === 200 && !/ more are not shown/.test(checksPage.html), `the site checks page loads and hides no rows (${checksPage.status})`)
    evalPhp(`RankXAI_Crawlers::set_enabled( true ); RankXAI_Crawlers::count( gmdate( "Y-m-d" ), "gptbot", true, 200, "/${MARK}-read-a" ); RankXAI_Crawlers::count( gmdate( "Y-m-d" ), "claudebot", false, 200, "/${MARK}-read-b" );`)
    const crawlers = await page(jar, '/wp-admin/admin.php?page=rankxai-crawlers&days=35')
    check(crawlers.html.includes('Everything kept (35 days)') && crawlers.html.includes('id="rankxai-pages-read"'), 'the crawler page offers all 35 days and a "Pages read" list')
    check(crawlers.html.includes(`/${MARK}-read-a`) && crawlers.html.includes(`/${MARK}-read-b`), 'which lists every page read, not just the top one')
    evalPhp(`global $wpdb; $t = esc_sql( RankXAI_Crawlers::table() ); $wpdb->query( $wpdb->prepare( "DELETE FROM {$t} WHERE path LIKE %s", "%${MARK}%" ) );`)

    console.log('\n== F  deactivating leaves nothing scheduled ==')
    const link = wpSoft('option', 'get', 'rankxai_store_link')
    if (link) {
      check(true, 'SKIPPED — the rig is connected; deactivating would disconnect it')
    } else {
      const left = JSON.parse(evalPhp('wp_schedule_single_event( time() + 3600, "rankxai_confirm_redirect", array( "probe1" ) ); wp_schedule_single_event( time() + 3600, "rankxai_send_product_events" ); RankXAI_Lifecycle::deactivate(); $n = 0; foreach ( _get_cron_array() as $hooks ) { foreach ( array_keys( $hooks ) as $h ) { if ( 0 === strpos( $h, "rankxai_" ) ) { $n++; } } } RankXAI_Lifecycle::activate(); echo wp_json_encode( $n );'))
      check(left === 0, `no rankxai_* event is left, including one scheduled with an id (${left})`)
    }

    console.log('\n== G  hidden pages have a title ==')
    const view = await page(jar, `/wp-admin/admin.php?page=rankxai-view-as-ai&post=${postId}`)
    check(/<title>View as AI/.test(view.html), 'View as AI has its title')
    const connect = await page(jar, '/wp-admin/admin.php?page=rankxai-authorize')
    check(/<title>Connect RankX AI/.test(connect.html), 'the Connect page has its title')
    const log = wpSoft('eval', `$f = WP_CONTENT_DIR . "/debug.log"; echo file_exists( $f ) ? substr( file_get_contents( $f ), ${debugBefore} ) : "";`) ?? ''
    check(!/strip_tags\(\): Passing null|rankxai/i.test(log), 'and the debug log gained nothing from the plugin', log.slice(0, 300))
  } finally {
    for (const id of made) wpSoft('post', 'delete', String(id), '--force')
    for (const o of OPTIONS) {
      if (saved[o] === null) wpSoft('option', 'delete', o)
      else wpSoft('option', 'update', o, saved[o], '--format=json')
    }
    const now = JSON.parse(wp('plugin', 'list', '--status=active', '--field=name', '--format=json'))
    for (const p of seoPlugins) {
      if (originalPlugins.includes(p) && !now.includes(p)) wpSoft('plugin', 'activate', p)
      if (!originalPlugins.includes(p) && now.includes(p)) wpSoft('plugin', 'deactivate', p)
    }
  }
  const restored = JSON.parse(wp('plugin', 'list', '--status=active', '--field=name', '--format=json'))
  check(JSON.stringify([...restored].sort()) === JSON.stringify([...originalPlugins].sort()), 'CLEANUP — the rig has exactly the plugins it started with')

  console.log(`\n================================================\nPASSED ${pass}   FAILED ${fail}`)
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
