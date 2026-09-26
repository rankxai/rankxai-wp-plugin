#!/usr/bin/env node
/**
 * Plan 82 Phase 3 — "View as AI".
 *
 * Run:  node probe/verify-view-as-ai.mjs      (wp-env must be running)
 *
 *   A  the row action is under posts and pages, and nowhere a user cannot edit
 *   B  an ordinary post: the server sends its words
 *   C  a block post with builder-style wrappers and attribute JSON: still sends its words
 *   D  a body written by JavaScript in the browser: the warning fires
 *   E  a post marked noindex says so; robots.txt blocking an assistant says so
 *   F  a draft: "not public yet", and the Markdown is still shown
 *   G  a site that cannot reach itself, and one behind a password: "could not check", never a warning
 *   H  looking publishes nothing: with markdown copies off, the .md address stays 404
 *   I  an author cannot open someone else's post; a subscriber cannot open any
 *   J  the canonical shown is the one the page prints
 */

import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const MARK = `rx-p3-${Date.now()}`
let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m) => (cond ? ok(m) : bad(m))

const env = { ...process.env, MSYS_NO_PATHCONV: '1' }
const wp = (...args) => execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', stdio: 'pipe', env, maxBuffer: 64 * 1024 * 1024 }).trim()
const wpSoft = (...args) => { try { return wp(...args) } catch { return null } }
const evalJson = (code) => JSON.parse(wp('eval', code))

async function http(url, init = {}, attempt = 0) {
  try { return await fetch(url, init) } catch (e) {
    if (attempt >= 2) throw e
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    return http(url, init, attempt + 1)
  }
}
async function login(user, pwd) {
  const res = await http(`${BASE}/wp-login.php`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body: new URLSearchParams({ log: user, pwd, 'wp-submit': 'Log In', testcookie: '1' }),
  })
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#8217;|&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ')
async function view(jar, id) {
  const res = await http(`${BASE}/wp-admin/admin.php?page=rankxai-view-as-ai&post=${id}`, { headers: { Cookie: jar } })
  const html = await res.text()
  return { status: res.status, html, text: text(html) }
}

// Sixty distinct words, so every comparison has something to compare.
const PROSE = 'Harbour lanterns glowed while fishermen mended nettings beneath weathered timber sheds. '
  + 'Morning tides carried seaweed, driftwood and shells toward quiet shingle beaches. '
  + 'Villagers gathered inside warm bakeries selling crusty loaves, honey pastries and spiced buns. '
  + 'Coastal walkers followed chalk cliffs past lighthouses, abandoned chapels and grazing sheep. '
  + 'Evening storms rolled across grey water, rattling shutters along narrow cobbled streets. '
  + 'Children collected pebbles, crabs and feathers before supper beside crackling hearth fires.'

async function run() {
  const savedOptions = Object.fromEntries(['rankxai_probe_block_loopback', 'rankxai_probe_401', 'rankxai_probe_robots', 'rankxai_twins'].map((o) => [o, wpSoft('option', 'get', o, '--format=json')]))
  const created = { posts: [], users: [] }
  const admin = await login('admin', 'password')

  try {
    wp('eval', 'delete_transient( "rankxai_robots_reading" );')
    const ids = evalJson(`
      $m = "${MARK}"; $p = ${JSON.stringify(PROSE)};
      $mk = function ( $title, $content, $type = "post", $status = "publish", $author = 1 ) use ( $m ) { return wp_insert_post( array( "post_title" => "$m $title", "post_name" => sanitize_title( "$m $title" ), "post_type" => $type, "post_status" => $status, "post_content" => $content, "post_author" => $author ) ); };
      $out = array();
      $out["plain"]   = $mk( "plain", "<!-- wp:paragraph --><p>$p</p><!-- /wp:paragraph -->" );
      $out["page"]    = $mk( "page", "<!-- wp:paragraph --><p>$p</p><!-- /wp:paragraph -->", "page" );
      $out["builder"] = $mk( "builder", "<!-- wp:greenshift-blocks/container {\\"id\\":\\"gsbp-a1\\",\\"background\\":{\\"color\\":\\"#fff\\"},\\"spacing\\":{\\"padding\\":{\\"values\\":{\\"top\\":[\\"40px\\"]}}}} --><div class=\\"gspb_container gspb_container-gsbp-a1\\" id=\\"gspb_container-id-gsbp-a1\\"><div class=\\"gspb_inner\\"><!-- wp:greenshift-blocks/heading {\\"id\\":\\"gsbp-a2\\",\\"headingContent\\":\\"Coastal notes\\"} --><h2 class=\\"gspb_heading gspb_heading-id-gsbp-a2\\">Coastal notes</h2><!-- /wp:greenshift-blocks/heading --><!-- wp:greenshift-blocks/text {\\"id\\":\\"gsbp-a3\\"} --><div class=\\"gspb_text gspb_text-id-gsbp-a3\\">$p</div><!-- /wp:greenshift-blocks/text --></div></div><!-- /wp:greenshift-blocks/container -->" );
      $out["js"]      = $mk( "js body", "[rankxai_js_body]$p" . "[/rankxai_js_body]" );
      $out["noindex"] = $mk( "noindex", "<p>$p</p>" );
      update_post_meta( $out["noindex"], "_seopress_robots_index", "yes" );
      $out["draft"]   = $mk( "draft", "<p>$p</p>", "post", "draft" );
      $out["short"]   = $mk( "short", "<p>Only a few words here.</p>" );
      $out["greet"]   = $mk( "greet", "[rankxai_greeting]<p>$p</p>" );
      $out["titled"]  = $mk( "titled", "<!-- wp:heading {\\"level\\":1} --><h1 class=\\"wp-block-heading\\">$m titled</h1><!-- /wp:heading --><p>$p</p>" );
      $out["author"]  = wp_insert_user( array( "user_login" => "$m-author", "user_pass" => "pw-$m", "role" => "author", "user_email" => "$m-a@example.test" ) );
      $out["sub"]     = wp_insert_user( array( "user_login" => "$m-sub", "user_pass" => "pw-$m", "role" => "subscriber", "user_email" => "$m-s@example.test" ) );
      $out["own"]     = $mk( "authors own", "<p>$p</p>", "post", "publish", $out["author"] );
      echo json_encode( $out );`)
    created.posts.push(...['plain', 'page', 'builder', 'js', 'noindex', 'draft', 'short', 'own', 'greet', 'titled'].map((k) => ids[k]))
    created.users.push(ids.author, ids.sub)

    // ── A ─────────────────────────────────────────────────────────────────
    console.log('\n== A  the row action ==')
    const postsList = await (await http(`${BASE}/wp-admin/edit.php?s=${MARK}`, { headers: { Cookie: admin } })).text()
    check(postsList.includes(`page=rankxai-view-as-ai&#038;post=${ids.plain}`), '"View as AI" is under a post in the Posts list')
    const pagesList = await (await http(`${BASE}/wp-admin/edit.php?post_type=page&s=${MARK}`, { headers: { Cookie: admin } })).text()
    check(pagesList.includes(`page=rankxai-view-as-ai&#038;post=${ids.page}`), 'and under a page in the Pages list')
    const menu = await (await http(`${BASE}/wp-admin/admin.php?page=rankxai`, { headers: { Cookie: admin } })).text()
    check(!/<a[^>]+page=rankxai-view-as-ai[^>]*>\s*View as AI/.test(menu), 'it is not a menu entry')

    // ── B ─────────────────────────────────────────────────────────────────
    console.log('\n== B  an ordinary post ==')
    const plain = await view(admin, ids.plain)
    check(plain.status === 200, `CONTROL — the screen opens (${plain.status})`)
    check(plain.text.includes('The server sends the page\'s text'), 'the server sends its words')
    check(/100%/.test(plain.text), 'every editor word is in the page the server sends')
    check(plain.text.includes('The warning appears below 50%'), 'the screen states its threshold')
    check(plain.text.includes(`title: "${MARK} plain"`) || plain.text.includes(`title: ${MARK} plain`), 'the Markdown copy is shown, with its front matter')
    check(plain.text.includes('Harbour lanterns glowed'), 'and the post body in it')

    // ── C ─────────────────────────────────────────────────────────────────
    console.log('\n== C  a builder-style block post ==')
    const builder = await view(admin, ids.builder)
    check(builder.text.includes('The server sends the page\'s text'), 'wrappers and attribute JSON do not trip the warning')
    if (!builder.text.includes('The server sends the page\'s text')) {
      const at = builder.text.indexOf('Does the server')
      console.log(`  (diagnostic) ${builder.text.slice(at, at + 400)}`)
    }
    check(!builder.text.includes('gsbp-a1'), 'the attribute JSON is not counted as the author\'s words')

    // ── D ─────────────────────────────────────────────────────────────────
    console.log('\n== D  a body written by JavaScript ==')
    const js = await view(admin, ids.js)
    const jsSaid = js.text.slice(js.text.indexOf('Does the server'), js.text.indexOf('Does the server') + 300)
    check(js.text.includes('Most of this page\'s text is not in the HTML the server sends'), `the warning fires${js.text.includes('Most of this page') ? '' : ` (${jsSaid})`}`)
    check(/\b[0-9]%/.test(js.text) || /\b1[0-9]%/.test(js.text), 'with a coverage figure near zero')

    // ── E ─────────────────────────────────────────────────────────────────
    console.log('\n== E  noindex and robots.txt ==')
    const noindex = await view(admin, ids.noindex)
    check(noindex.text.includes('No, it is marked noindex'), 'a post marked noindex in SEOPress says so')
    check(plain.text.includes('may index it Yes'), 'CONTROL — an ordinary post says it may be indexed')
    wp('option', 'update', 'rankxai_probe_robots', 'User-agent: OAI-SearchBot\nDisallow: /\n')
    wp('eval', 'delete_transient( "rankxai_robots_reading" );')
    const blocked = await view(admin, ids.plain)
    check(/OAI-SearchBot\) may read it Blocked by robots\.txt/.test(blocked.text), 'robots.txt blocking an assistant\'s crawler is shown')
    check(/PerplexityBot\) may read it Yes/.test(blocked.text), 'CONTROL — an assistant it does not name may still read it')
    check(!/GPTBot\) may read it/.test(blocked.text), 'training crawlers are not listed on a page about what assistants read')
    wpSoft('option', 'delete', 'rankxai_probe_robots')
    wp('eval', 'delete_transient( "rankxai_robots_reading" );')

    // ── F ─────────────────────────────────────────────────────────────────
    console.log('\n== F  a draft and a short post ==')
    const draft = await view(admin, ids.draft)
    check(draft.text.includes('not public yet'), 'a draft says it is not public yet')
    check(!draft.text.includes('Most of this page'), 'and never warns')
    check(draft.text.includes('Harbour lanterns glowed'), 'the Markdown is still shown')
    const short = await view(admin, ids.short)
    check(short.text.includes('too little text in the editor to compare'), 'a post with too few words says so rather than guessing')
    check(draft.text.includes('Canonical address Not known until the page can be read'), 'a draft does not guess its canonical')
    // cfc.aiagencyplus.com, 2026-09-26: a short page is still read for its signals.
    const shortOk = !short.text.includes('Canonical address Not known') && short.text.includes(`${MARK}-short`)
    check(shortOk, `a post too short to compare still shows the canonical it prints${shortOk ? '' : ` (${short.text.slice(short.text.indexOf('Does the server'), short.text.indexOf('Does the server') + 400)})`}`)

    // ── F2 ────────────────────────────────────────────────────────────────
    // The same day: the Markdown was rendered as the admin, so a page that
    // greets its reader showed their name and a log-out link; and a page that
    // opens with its own title as a heading said it twice.
    console.log('\n== F2  rendered as an assistant sees it ==')
    const greet = await view(admin, ids.greet)
    check(greet.text.includes('Hello visitor') && !greet.text.includes('Hello admin'), 'the Markdown is rendered for a visitor, not for the admin looking')
    const asAdmin = wp('eval', 'wp_set_current_user( 1 ); echo do_shortcode( "[rankxai_greeting]" );')
    check(asAdmin.includes('Hello admin'), `CONTROL — rendered for the admin, the same page greets them by name (${asAdmin})`)
    const titled = await view(admin, ids.titled)
    const heads = (titled.html.match(new RegExp(`# ${MARK} titled`, 'g')) ?? []).length
    check(heads === 1, `a page that opens with its own title says it once (${heads})`)
    const plainView = await view(admin, ids.plain)
    check((plainView.html.match(new RegExp(`# ${MARK} plain`, 'g')) ?? []).length === 1, 'CONTROL — a page without one still gets the title as its heading')
    wp('option', 'update', 'rankxai_probe_robots', `User-agent: OAI-SearchBot\nDisallow: /${MARK}-draft\n`)
    wp('eval', 'delete_transient( "rankxai_robots_reading" );')
    const draftBlocked = await view(admin, ids.draft)
    const plainAgain = await view(admin, ids.plain)
    check(/OAI-SearchBot\) may read it Blocked by robots\.txt/.test(draftBlocked.text), 'robots.txt is checked against the address a draft will have, not ?p=')
    check(/OAI-SearchBot\) may read it Yes/.test(plainAgain.text), 'CONTROL — the rule does not reach an unrelated post')
    wpSoft('option', 'delete', 'rankxai_probe_robots')
    wp('eval', 'delete_transient( "rankxai_robots_reading" );')

    // ── G ─────────────────────────────────────────────────────────────────
    console.log('\n== G  when the site cannot see itself ==')
    wp('option', 'update', 'rankxai_probe_block_loopback', '1')
    const unreachable = await view(admin, ids.js)
    check(unreachable.text.includes('did not answer a request to itself'), 'loopback refused: "could not check"')
    check(!unreachable.text.includes('Most of this page'), 'and no warning, even on the page that would warn')
    wpSoft('option', 'delete', 'rankxai_probe_block_loopback')
    wp('option', 'update', 'rankxai_probe_401', '1')
    const locked = await view(admin, ids.js)
    check(locked.text.includes('answered 401'), 'behind a password: names the status')
    check(!locked.text.includes('Most of this page'), 'and no warning')
    wpSoft('option', 'delete', 'rankxai_probe_401')

    // ── H ─────────────────────────────────────────────────────────────────
    console.log('\n== H  looking publishes nothing ==')
    const twinsOn = evalJson('echo json_encode( RankXAI_Twins::settings()["enabled"] );')
    check(twinsOn === false, 'CONTROL — markdown copies are switched off on this rig')
    check(plain.text.includes('Markdown copies are switched off, so nothing is published'), 'the Markdown card says nothing is published')
    const md = await http(`${BASE}/${MARK}-plain.md`, { redirect: 'manual' })
    check(md.status === 404 || md.status === 301, `the .md address is still not served (${md.status})`)
    const mdBody = md.status === 200 ? await md.text() : ''
    check(!mdBody.includes('Harbour lanterns'), 'and carries no copy of the post')

    // ── I ─────────────────────────────────────────────────────────────────
    console.log('\n== I  who may look ==')
    const author = await login(`${MARK}-author`, `pw-${MARK}`)
    const own = await view(author, ids.own)
    check(own.status === 200 && own.text.includes('Does the server send your words'), 'an author can open their own post')
    const others = await view(author, ids.plain)
    check(others.status === 403, `an author cannot open someone else's post (${others.status})`)
    const sub = await login(`${MARK}-sub`, `pw-${MARK}`)
    const subView = await view(sub, ids.plain)
    check(subView.status === 403 || !subView.text.includes('Does the server send your words'), `a subscriber cannot open it (${subView.status})`)

    // ── J ─────────────────────────────────────────────────────────────────
    console.log('\n== J  the canonical the page prints ==')
    // Last, because re-activating SEOPress sends the next admin request to its wizard.
    // The canonical shown is the one the page prints, whichever plugin printed it.
    wpSoft('plugin', 'deactivate', 'wp-seopress')
    const publicHtml = await (await http(`${BASE}/${MARK}-plain/?x=${Date.now()}`)).text()
    const printed = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i.exec(publicHtml)?.[1]
    const withCore = await view(admin, ids.plain)
    check(!!printed && withCore.text.includes(printed), `the canonical the page prints is shown (${printed})`)
    wpSoft('plugin', 'activate', 'wp-seopress')
    // Consume SEOPress's one-shot redirect to its wizard, so the next probe does not meet it.
    await http(`${BASE}/wp-admin/`, { headers: { Cookie: admin }, redirect: 'manual' })
  } finally {
    for (const id of created.posts) wpSoft('post', 'delete', String(id), '--force')
    for (const id of created.users) wpSoft('user', 'delete', String(id), '--yes')
    for (const [o, v] of Object.entries(savedOptions)) {
      if (v === null) wpSoft('option', 'delete', o)
      else wpSoft('option', 'update', o, v, '--format=json')
    }
    wpSoft('eval', 'delete_transient( "rankxai_robots_reading" );')
    const left = wp('post', 'list', `--s=${MARK}`, '--post_status=any', '--format=count')
    check(left === '0', 'cleanup — every fixture post is gone')
  }

  console.log('\n================================================')
  console.log(`PASSED ${pass}   FAILED ${fail}`)
  process.exit(fail ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
