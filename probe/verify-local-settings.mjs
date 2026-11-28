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

const OPTIONS = ['rankxai_documents_local', 'rankxai_document_ai_txt', 'rankxai_document_llms_txt', 'rankxai_document_agents_md', 'rankxai_twin_context', 'rankxai_twins', 'rankxai_fill', 'rankxai_keep_data', 'rankxai_share_personal_data']

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
    check(doc.status === 200 && doc.body.includes(`# ${MARK}`) && doc.source === 'published', `ai.txt written in Settings is served (${doc.status}, ${doc.source})`)
    check(!doc.body.includes('\u0007'), 'and the control character in it was removed when it was saved')
    r = await saveSettings(jar, { 'rankxai_generate[ai_txt]': null })
    doc = await served('/ai.txt')
    check(!doc.body.includes(MARK) && doc.source === '', `unticking "Serve it" stops serving it (${doc.status})`)
    check(wpSoft('option', 'get', 'rankxai_document_ai_txt', '--format=json')?.includes(MARK), 'and the text is kept')
    const settings = await page(jar, '/wp-admin/admin.php?page=rankxai-settings')
    check(settings.html.includes('Text is saved, but nothing is served until you tick the box.'), 'Settings says the text is kept but not served')
    r = await saveSettings(jar, { 'rankxai_document[ai_txt]': '', 'rankxai_generate[ai_txt]': '1' })
    doc = await served('/ai.txt')
    check(wpSoft('option', 'get', 'rankxai_document_ai_txt') === null && !doc.body.includes(MARK), 'emptying the text removes it, and ai.txt has nothing to serve')

    r = await saveSettings(jar, { 'rankxai_document[llms_txt]': `# Own llms ${MARK}\n`, 'rankxai_generate[llms_txt]': '1' })
    doc = await served('/llms.txt')
    check(doc.body.startsWith(`# Own llms ${MARK}`) && doc.source === 'published', 'llms.txt written in Settings beats the generated copy')
    r = await saveSettings(jar, { 'rankxai_document[llms_txt]': '' })
    doc = await served('/llms.txt')
    check(doc.status === 200 && doc.source === 'generated' && !doc.body.includes(MARK), `emptied, the generated copy is served again (${doc.source})`)

    const big = 'x'.repeat(524289)
    r = await saveSettings(jar, { 'rankxai_document[agents_md]': big })
    check(r.location.includes('rankxai-too-long=1') && wpSoft('option', 'get', 'rankxai_document_agents_md') === null, 'text over 512 KB is refused, and Settings says so')

    console.log('\n== B  the business summary on markdown copies ==')
    r = await saveSettings(jar, { rankxai_twin_context: `We make probe mugs. ${MARK}\u0001` })
    const context = JSON.parse(wp('option', 'get', 'rankxai_twin_context', '--format=json'))
    check(context.content === `We make probe mugs. ${MARK}`, 'saved from Settings, with the control character removed', JSON.stringify(context.content))
    const postId = wp('post', 'create', '--post_type=post', '--post_status=publish', `--post_title=${MARK} copy`, '--post_content=<p>Body</p>', '--porcelain')
    made.push(postId)
    const md = evalPhp(`echo RankXAI_Twins::markdown_for( get_post( ${postId} ) );`)
    check(md.includes(`We make probe mugs. ${MARK}`), 'it ends the markdown copy')
    r = await saveSettings(jar, { rankxai_twin_context: 'y'.repeat(5000) })
    check(r.location.includes('rankxai-too-long=1') && JSON.parse(wp('option', 'get', 'rankxai_twin_context', '--format=json')).content.includes(MARK), 'over 4 KB is refused and the saved one stays')

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
    const term = await page(jar, '/wp-admin/term.php?taxonomy=category&tag_ID=1')
    check(term.html.includes('name="rankxai_term_seo[title]"'), 'a category edit screen has the fields')
    wp('plugin', 'activate', 'seo-by-rank-math')
    const withPlugin = await page(jar, `/wp-admin/post.php?post=${postId}&action=edit&classic-editor`)
    check(!withPlugin.html.includes('id="rankxai-seo"'), 'with an SEO plugin active, the box is not shown')
    wp('plugin', 'deactivate', 'seo-by-rank-math')

    console.log('\n== E  lists are paged, not cut short ==')
    // The UI kit loads only in wp-admin; WP-CLI loads it by hand.
    const paged = JSON.parse(evalPhp('if ( ! class_exists( "RankXAI_UI" ) ) { require_once dirname( RANKXAI_PLUGIN_FILE ) . "/includes/class-rankxai-ui.php"; } $_GET["rx-p"] = "3"; $p = RankXAI_UI::page_of( range( 1, 60 ), "rx-p" ); ob_start(); RankXAI_UI::pager( $p, "x" ); $h = ob_get_clean(); echo wp_json_encode( array( "items" => $p["items"], "pages" => $p["pages"], "html" => $h ) );'))
    check(paged.pages === 3 && paged.items.length === 10 && paged.items[0] === 51 && paged.items[9] === 60, 'the last of 60 rows are on page 3')
    check(paged.html.includes('Previous') && !paged.html.includes('Next') && paged.html.includes('60 in all'), 'and the pager says how many in all')
    const checksPage = await page(jar, '/wp-admin/admin.php?page=rankxai-checks')
    check(checksPage.status === 200 && !/ more are not shown/.test(checksPage.html), `the site checks page loads and hides no rows (${checksPage.status})`)

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
