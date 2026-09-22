#!/usr/bin/env node
/**
 * The no-account mode, proven against a real WordPress.
 *
 * Run:  npx wp-env start   then   node probe/verify-no-account.mjs
 *
 * ── WHAT THIS IS THE GATE FOR ───────────────────────────────────────────────
 *
 * Everything here has to work with no RankX AI account, no credential and no
 * inbound call: a settings screen in wp-admin, and `llms.txt` / `agents.md`
 * built from the site's own content. That is what makes the plugin defensible
 * against the directory's trialware guideline, and it is the half of the
 * plugin a unit test cannot reach at all — a capability callback, a nonce, an
 * `admin-post.php` round trip and a virtual route are all WordPress.
 *
 * ── IT DRIVES THE REAL ENTRY POINTS ────────────────────────────────────────
 *
 * `RankXAI_Generate::save_state()` is not what a customer touches; the FORM is.
 * So the save path is exercised through `RankXAI_Admin::handle_save()` with a
 * real nonce, a real capability and a real `$_POST`, and the refusals are
 * proved too — no nonce, and a subscriber. A probe that called the storage
 * helper directly would pass with the screen completely broken.
 *
 * ── THE ACCEPTANCE ITEM THIS EXISTS FOR ────────────────────────────────────
 *
 * ACTIVATING THE PLUGIN MUST PUBLISH NOTHING. With every option deleted — the
 * state a site is in the moment it is installed or updated — `/llms.txt` and
 * `/agents.md` must 404. Generation is a switch somebody throws, never a
 * default.
 *
 * ── IT PUTS THE SITE BACK ───────────────────────────────────────────────────
 *
 * Options deleted, fixtures removed, and the cleanup asserted rather than
 * hoped for. Note a run killed by `timeout` never reaches its `finally`.
 *
 * Needs an application password only for the REST half:
 *   wp user application-password create admin no-account-probe --porcelain
 */

import { execFileSync } from 'node:child_process'
import { cliContainer, wpContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const USER = process.env.WP_USER ?? 'admin'
const PASS = process.env.WP_APP_PASSWORD ?? ''

if (!PASS) {
  console.error('Set WP_APP_PASSWORD (wp user application-password create admin no-account-probe --porcelain).')
  process.exit(2)
}

const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const has = (re, text) => re.test(text)

const PAGE_SLUG = 'rankxai-noacct-page'
const POST_SLUG = 'rankxai-noacct-post'
const HIDDEN_SLUG = 'rankxai-noacct-hidden'

// Named, never written inline after a ternary: a regex literal opening a line
// that follows `cond ? ok() : bad()` is parsed as division, and the error
// points somewhere else entirely.
const GENERATED_HEADER = /generated/
const PUBLISHED_HEADER = /published/
const PHP_NOTICE = /PHP (Warning|Notice|Fatal error|Deprecated)/

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

/** Run wp-cli and return stdout. THROWS — a broken oracle must not read as a pass. */
function wpCapture(args, opts = {}) {
  return execFileSync('docker', ['exec', '-i', '-u', '33', cliContainer(), 'wp', ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    ...opts,
  }).trim()
}

/**
 * Evaluate PHP inside WordPress, from STDIN.
 *
 * `wp eval` would need the whole snippet through two levels of shell quoting;
 * `wp eval-file -` reads it verbatim, so the PHP below is the PHP that runs.
 */
function wpEval(php) {
  return wpCapture(['eval-file', '-'], { input: php })
}

/**
 * The admin class, loaded the way wp-admin loads it.
 *
 * `rankxai.php` requires it only when `is_admin()`, which is FALSE under
 * WP-CLI and false for a REST request — correct, since a settings screen can
 * never run there, and measured: the first version of this probe died with
 * "Class RankXAI_Admin not found". The path is derived from the plugin's own
 * constant rather than written out, because the directory is named after the
 * checkout here and after the wordpress.org slug on a real install.
 *
 * Because the class is loaded here and not by the plugin, THE GUARD ITSELF is
 * asserted separately, in `verify-guardrails.mjs`.
 */
const ADMIN_PRELUDE = "require_once dirname( RANKXAI_PLUGIN_FILE ) . '/includes/class-rankxai-admin.php';"

/**
 * Every option this feature stores, gone — in ONE round trip.
 *
 * Each `docker exec` against this rig costs 10–20 seconds and varies, so a
 * probe that spends one per option spends most of its wall clock in Docker and
 * eventually gets killed by whatever wraps it. Measured: the first version made
 * ~43 calls and was SIGTERMed mid-run, which surfaced as `status=143` on an
 * arbitrary step and read exactly like a product failure.
 *
 * The list is derived from the plugin's own catalogue where it can be, so a
 * fourth document does not quietly survive the reset.
 */
function resetOptions() {
  wpEval(`<?php
delete_option( RankXAI_Generate::OPTION );
delete_option( RankXAI_Twins::OPTION_SETTINGS );
delete_option( RankXAI_Twins::OPTION_CONTEXT );
delete_option( 'rankxai_phase0_llms' );
foreach ( array_keys( RankXAI_Documents::catalogue() ) as $slug ) {
	$option = RankXAI_Documents::option_name( $slug );
	if ( null !== $option ) {
		delete_option( $option );
	}
}
echo 'reset';
`)
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

async function raw(path, init = {}) {
  const res = await http(`${BASE}${path}`, { redirect: 'manual', ...init })
  const body = res.status < 400 || res.status === 404 ? await res.text() : ''
  return {
    status: res.status,
    ct: res.headers.get('content-type') ?? '',
    source: res.headers.get('x-rankxai-source') ?? '',
    document: res.headers.get('x-rankxai-document') ?? '',
    nosniff: res.headers.get('x-content-type-options') ?? '',
    robots: res.headers.get('x-robots-tag') ?? '',
    body,
  }
}

async function apiJson(route, init = {}) {
  const res = await http(`${BASE}/?rest_route=${encodeURIComponent(route)}`, {
    ...init,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  try {
    return { status: res.status, json: JSON.parse(text) }
  } catch {
    return { status: res.status, json: null, text }
  }
}

/** The container's error log, for the notices no assertion can see. */
function apacheLog() {
  try {
    return execFileSync('docker', ['logs', '--tail', '2000', wpContainer()], { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    return ''
  }
}

function linesSince(before, after) {
  const anchor = before.trimEnd().split('\n').pop() ?? ''
  if (anchor === '') return after
  const at = after.lastIndexOf(anchor)
  return at === -1 ? after : after.slice(at + anchor.length)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Three posts: a page, a post, and a post an SEO plugin has marked `noindex`.
 *
 * Created here rather than by hand, because a fixture made in a container
 * vanishes with it and every assertion downstream then fails as though the
 * feature had broken.
 */
function provision() {
  const raw = wpEval(`<?php
$slugs = array( '${PAGE_SLUG}', '${POST_SLUG}', '${HIDDEN_SLUG}' );
foreach ( $slugs as $slug ) {
	foreach ( get_posts( array( 'name' => $slug, 'post_type' => array( 'post', 'page' ), 'post_status' => 'any', 'numberposts' => 5 ) ) as $stale ) {
		wp_delete_post( $stale->ID, true );
	}
}

$page = wp_insert_post( array(
	'post_type'    => 'page',
	'post_title'   => 'No account fixture page',
	'post_name'    => '${PAGE_SLUG}',
	'post_status'  => 'publish',
	'post_excerpt' => 'The excerpt the author wrote.',
	'post_content' => '<p>A page that should be listed.</p>',
) );
$post = wp_insert_post( array(
	'post_type'    => 'post',
	'post_title'   => 'No account fixture post',
	'post_name'    => '${POST_SLUG}',
	'post_status'  => 'publish',
	'post_content' => '<p>A post that should be listed.</p>',
) );
$hidden = wp_insert_post( array(
	'post_type'    => 'post',
	'post_title'   => 'No account hidden post',
	'post_name'    => '${HIDDEN_SLUG}',
	'post_status'  => 'publish',
	'post_content' => '<p>A post the owner hid.</p>',
) );
// Yoast's own key, which the plugin reads through its one SEO registry.
update_post_meta( $hidden, '_yoast_wpseo_meta-robots-noindex', '1' );

// A page whose markdown address is a root document's. It is NOT deleted at the
// end: the markdown-twins probe expects it too and creates it the same way.
// (No backticks anywhere in this snippet — it is a JS template literal.)
if ( ! get_posts( array( 'name' => 'agents', 'post_type' => 'page', 'post_status' => 'any', 'numberposts' => 1 ) ) ) {
	wp_insert_post( array(
		'post_type'    => 'page',
		'post_title'   => 'Agents',
		'post_name'    => 'agents',
		'post_status'  => 'publish',
		'post_content' => '<p>A page whose markdown address collides with a root document.</p>',
	) );
}

// A subscriber, to prove the capability gate REFUSES rather than only that an
// administrator passes.
if ( ! get_user_by( 'login', 'rankxaiprobe' ) ) {
	wp_insert_user( array( 'user_login' => 'rankxaiprobe', 'user_email' => 'rankxaiprobe@example.com', 'user_pass' => wp_generate_password(), 'role' => 'subscriber' ) );
}

// The permalink is READ BACK rather than assembled: a guessed path 404s in a
// way that reads as a broken feature.
echo wp_json_encode( array(
	'pageId'   => $page,
	'postId'   => $post,
	'hiddenId' => $hidden,
	'pageUrl'  => get_permalink( $page ),
) );
`)
  const fix = JSON.parse(raw)
  if (!fix.pageId || !fix.postId || !fix.hiddenId || !fix.pageUrl) {
    throw new Error(`provisioning did not produce fixtures: ${raw}`)
  }
  fix.pagePath = new URL(fix.pageUrl).pathname.replace(/\/$/, '')
  return fix
}

// ---------------------------------------------------------------------------
// The admin form, driven for real
// ---------------------------------------------------------------------------

/**
 * Submit the settings form the way wp-admin does.
 *
 * `handle_save()` ends in `wp_safe_redirect()` and `exit`, so the PHP below
 * traps the redirect on `wp_redirect` and returns rather than dying — proving
 * the handler reached its end, which is the fact worth asserting.
 *
 * @param {object} p Form values.
 * @returns {string} 'saved:<location>' or 'died:<reason>'.
 */
function submitForm({ twinsOn, postTypes, generate, nonce = 'valid', asUser = 'admin' }) {
  const types = (postTypes ?? []).map((t) => `'${t}'`).join(', ')
  const docs = Object.entries(generate ?? {})
    .filter(([, on]) => on)
    .map(([slug]) => `'${slug}' => '1'`)
    .join(', ')

  const php = `<?php
${ADMIN_PRELUDE}
$user = get_user_by( 'login', '${asUser}' );
if ( ! $user ) { echo 'died:no-such-user'; return; }
wp_set_current_user( $user->ID );

$_POST = array();
$_REQUEST = array();
${twinsOn ? "$_POST['rankxai_twins_enabled'] = '1';" : ''}
$_POST['rankxai_twin_post_types'] = array( ${types} );
$_POST['rankxai_generate'] = array( ${docs} );
$_POST['action'] = RankXAI_Admin::ACTION;
${nonce === 'valid'
  ? "$_POST['_wpnonce'] = wp_create_nonce( RankXAI_Admin::ACTION );"
  : "$_POST['_wpnonce'] = 'not-a-nonce';"}
$_REQUEST = $_POST;

// Trap the two ways the handler can end.
//
// The redirect is suppressed and reported, so the process is not sent anywhere.
// wp_die is reported AND HALTED, because the real one halts: a handler that
// merely returned let handle_save carry straight on past its own refusal, so a
// SUBSCRIBER SAVED THE SETTINGS and the assertion still passed on the leading
// "died:". The refusal tests were measuring the echo, not the refusal.
add_filter( 'wp_redirect', function ( $location ) { echo 'saved:' . $location; return false; }, 10, 1 );
add_filter( 'wp_die_handler', function () { return function ( $message ) { echo 'died:' . wp_strip_all_tags( (string) $message ); exit( 0 ); }; } );

// check_admin_referer dies through wp_nonce_ays, which also goes to the
// wp_die_handler, so both refusals surface the same way. No backticks in here:
// this whole snippet is a JS template literal and one would close it.
RankXAI_Admin::handle_save();
`
  try {
    return wpEval(php)
  } catch (e) {
    // The exit status and the tail of stderr, not just "Command failed" — a
    // harness that reports only that it broke costs a diagnosis round trip.
    const err = String(e.stderr ?? '').trim().split('\n').slice(-2).join(' / ')
    return `threw:status=${e.status} ${err.slice(0, 300)}`
  }
}

/** Render the settings screen as an administrator and return the HTML. */
function renderScreen(asUser = 'admin') {
  return wpEval(`<?php
${ADMIN_PRELUDE}
$user = get_user_by( 'login', '${asUser}' );
if ( ! $user ) { echo 'no-such-user'; return; }
wp_set_current_user( $user->ID );
ob_start();
RankXAI_Admin::render();
echo ob_get_clean();
`)
}

/**
 * What `admin_menu` actually registers, as WordPress records it.
 *
 * Asserting on `$submenu` rather than on the source is the difference between
 * "the code calls add_options_page" and "WordPress has this screen, under
 * Settings, behind this capability".
 */
function registeredMenuEntry() {
  return wpEval(`<?php
${ADMIN_PRELUDE}
wp_set_current_user( get_user_by( 'login', 'admin' )->ID );
RankXAI_Admin::init();
do_action( 'admin_menu' );
$found = null;
foreach ( (array) ( $GLOBALS['submenu']['options-general.php'] ?? array() ) as $item ) {
	if ( isset( $item[2] ) && RankXAI_Admin::PAGE === $item[2] ) {
		$found = array(
			'title'      => $item[0],
			'capability' => $item[1],
			'slug'       => $item[2],
		);
	}
}
echo wp_json_encode( $found );
`)
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function run() {
  const logBefore = apacheLog()
  const FIX = provision()

  // ---- FRESH: activating publishes nothing --------------------------------
  //
  // `resetOptions` also clears `rankxai_phase0_llms`. Nothing else may own
  // these addresses while the generator is being measured: a Phase 0 fixture
  // used to claim /llms.txt at `init` priority 0 and this probe measured IT,
  // producing six failures that read as product defects. It is behind that
  // option now, and the option is the controlled competitor used further down.
  resetOptions()

  const freshLlms = await raw('/llms.txt')
  const freshAgents = await raw('/agents.md')
  freshLlms.status === 404 && freshAgents.status === 404
    ? ok('FRESH — with every option deleted, /llms.txt and /agents.md both 404')
    : bad(`FRESH — llms.txt=${freshLlms.status} agents.md=${freshAgents.status}; activation published a URL`)

  const freshState = wpEval('<?php echo wp_json_encode( RankXAI_Generate::stored_state() );')
  freshState === '{"llms_txt":false,"agents_md":false}'
    ? ok('FRESH — generation reports OFF for every supported document')
    : bad(`FRESH — stored_state() was ${freshState}`)

  const unsupported = wpEval("<?php echo RankXAI_Generate::is_local( 'ai_txt' ) ? 'yes' : 'no';")
  unsupported === 'no'
    ? ok('FRESH — ai.txt is not generatable: it declares a licensing position, which is the owner’s')
    : bad(`FRESH — ai.txt reported generatable (${unsupported})`)

  // ---- THE SCREEN ---------------------------------------------------------
  const menu = registeredMenuEntry()
  menu.includes('"slug":"rankxai"') && menu.includes('"capability":"manage_options"')
    ? ok(`SCREEN — WordPress registers it under Settings behind manage_options (${menu})`)
    : bad(`SCREEN — the menu entry was ${menu}`)

  const screen = renderScreen()
  has(/Markdown copies/, screen) && has(/Root documents/, screen)
    ? ok('SCREEN — the settings page renders both sections')
    : bad('SCREEN — a section is missing from the rendered page')
  has(/name="rankxai_generate\[llms_txt\]"/, screen) && has(/name="rankxai_generate\[agents_md\]"/, screen)
    ? ok('SCREEN — a generation control for each supported document')
    : bad('SCREEN — a generation checkbox is missing')
  !has(/name="rankxai_generate\[ai_txt\]"/, screen) && has(/ai\.txt/, screen)
    ? ok('SCREEN — ai.txt is listed with its state and NO control, rather than silently omitted')
    : bad('SCREEN — ai.txt is either missing entirely or wrongly offers a control')
  has(/Nothing is being served at this address/, screen)
    ? ok('SCREEN — and it states, per document, what is actually live')
    : bad('SCREEN — no per-document state sentence')
  has(/Nothing has been received from a RankX AI account/, screen)
    ? ok('SCREEN — it says plainly that nothing has arrived from an account, without dressing it as a fault')
    : bad('SCREEN — the account section did not render its empty state')
  has(/name="rankxai_twins_enabled"/, screen)
    ? ok('SCREEN — markdown copies are switchable without the platform')
    : bad('SCREEN — no markdown copies control')

  const subscriberScreen = renderScreen('rankxaiprobe')
  !has(/rankxai_generate/, subscriberScreen)
    ? ok('SCREEN — a subscriber renders nothing at all')
    : bad('SCREEN — a subscriber saw the form')

  // ---- THE FORM, refused --------------------------------------------------
  const noNonce = submitForm({ twinsOn: false, generate: { llms_txt: true }, nonce: 'bad' })
  has(/^died:/, noNonce)
    ? ok('FORM — a submission without a valid nonce is refused')
    : bad(`FORM — a bad nonce was accepted (${noNonce.slice(0, 120)})`)
  const afterBadNonce = wpEval('<?php echo wp_json_encode( RankXAI_Generate::stored_state() );')
  afterBadNonce === '{"llms_txt":false,"agents_md":false}'
    ? ok('FORM — and it stored nothing')
    : bad(`FORM — a refused submission still wrote ${afterBadNonce}`)

  const asSubscriber = submitForm({ twinsOn: false, generate: { llms_txt: true }, asUser: 'rankxaiprobe' })
  has(/^died:/, asSubscriber)
    ? ok('FORM — a subscriber is refused by the handler, not only by the menu')
    : bad(`FORM — a subscriber saved settings (${asSubscriber.slice(0, 160)})`)
  // The assertion that matters, and the one whose absence let a broken probe
  // pass: a refusal is only a refusal if nothing was written.
  const afterSubscriber = wpEval('<?php echo wp_json_encode( RankXAI_Generate::stored_state() );')
  afterSubscriber === '{"llms_txt":false,"agents_md":false}'
    ? ok('FORM — and the subscriber wrote nothing')
    : bad(`FORM — a refused subscriber still wrote ${afterSubscriber}`)

  // ---- THE FORM, accepted -------------------------------------------------
  const saved = submitForm({
    twinsOn: false,
    postTypes: ['post', 'page'],
    generate: { llms_txt: true, agents_md: true },
  })
  has(/^saved:/, saved)
    ? ok('FORM — an administrator with a valid nonce is redirected back')
    : bad(`FORM — the save did not complete (${saved.slice(0, 160)})`)
  has(/rankxai-saved=1/, saved)
    ? ok('FORM — and the redirect carries the confirmation marker the screen reads')
    : bad(`FORM — no confirmation marker in ${saved.slice(0, 160)}`)

  const savedState = wpEval('<?php echo wp_json_encode( RankXAI_Generate::stored_state() );')
  savedState === '{"llms_txt":true,"agents_md":true}'
    ? ok('FORM — both documents are now generated locally')
    : bad(`FORM — stored_state() was ${savedState}`)

  // ---- THE GENERATED DOCUMENTS -------------------------------------------
  const llms = await raw('/llms.txt')
  llms.status === 200
    ? ok('LLMS — /llms.txt is served')
    : bad(`LLMS — answered ${llms.status}`)
  has(GENERATED_HEADER, llms.document)
    ? ok('LLMS — X-RankXAI-Document says `generated`, so the platform cannot mistake it for a stranger’s file')
    : bad(`LLMS — X-RankXAI-Document was "${llms.document}"`)
  has(/text\/plain/, llms.ct) && has(/nosniff/, llms.nosniff)
    ? ok('LLMS — text/plain with nosniff')
    : bad(`LLMS — ct=${llms.ct} nosniff=${llms.nosniff}`)
  has(/noindex/, llms.robots)
    ? ok('LLMS — served noindex')
    : bad(`LLMS — X-Robots-Tag was "${llms.robots}"`)
  has(/^# \S/m, llms.body)
    ? ok('LLMS — opens with an H1, which is llmstxt.org’s one required element')
    : bad(`LLMS — no H1: ${llms.body.slice(0, 80)}`)
  has(/No account fixture page/, llms.body) && has(/No account fixture post/, llms.body)
    ? ok('LLMS — the published page and post are both listed')
    : bad('LLMS — a published fixture is missing from the list')
  !has(/No account hidden post/, llms.body)
    ? ok('LLMS — the noindexed post is NOT listed: a page the owner hid is not advertised to machines')
    : bad('LLMS — a noindexed post was published in the document')
  has(/The excerpt the author wrote/, llms.body)
    ? ok('LLMS — an author-written excerpt rides along as the link note')
    : bad('LLMS — the excerpt is missing')
  has(/^## /m, llms.body)
    ? ok('LLMS — content is grouped under H2 sections, one per post type')
    : bad('LLMS — no H2 section')

  const agents = await raw('/agents.md')
  agents.status === 200 && has(GENERATED_HEADER, agents.document)
    ? ok('AGENTS — /agents.md is generated and says so')
    : bad(`AGENTS — status=${agents.status} document="${agents.document}"`)
  has(/text\/markdown/, agents.ct) && has(/nosniff/, agents.nosniff)
    ? ok('AGENTS — text/markdown with nosniff')
    : bad(`AGENTS — ct=${agents.ct} nosniff=${agents.nosniff}`)
  has(/How to read this site/, agents.body)
    ? ok('AGENTS — it describes how to read the site rather than repeating llms.txt')
    : bad('AGENTS — no reading section')
  has(/Read-only REST API/, agents.body)
    ? ok('AGENTS — and names the addresses a reader would otherwise have to discover')
    : bad('AGENTS — no REST address')

  const aiTxt = await raw('/ai.txt')
  aiTxt.status === 404
    ? ok('AI.TXT — still 404, because nothing generates it and nothing has published one')
    : bad(`AI.TXT — answered ${aiTxt.status}`)

  // ---- LINKS FOLLOW THE TWIN SWITCH --------------------------------------
  //
  // The whole point of llms.txt is a list of documents a machine can read. With
  // copies off there are none, so linking `.md` would publish addresses that
  // 404; with them on, the HTML page is the worse answer.
  !has(/\.md\)/, llms.body)
    ? ok('LINKS — with markdown copies OFF, every link is the HTML page')
    : bad('LINKS — a .md link was published while copies are off')

  const twinsOn = submitForm({
    twinsOn: true,
    postTypes: ['post', 'page'],
    generate: { llms_txt: true, agents_md: true },
  })
  has(/^saved:/, twinsOn) ? ok('LINKS — markdown copies switched on from the same form') : bad(`LINKS — ${twinsOn.slice(0, 120)}`)

  const llmsWithTwins = await raw('/llms.txt')
  has(/\.md\)/, llmsWithTwins.body)
    ? ok('LINKS — and the links become markdown copies')
    : bad('LINKS — copies are on and the document still links HTML')
  has(/sitemap-md\.xml/, llmsWithTwins.body)
    ? ok('LINKS — the index of copies is named in the document')
    : bad('LINKS — no sitemap reference')

  // A real fetch of a link the document publishes, and it has to be the link
  // for a page THIS probe created — the first `.md` in the file belonged to
  // somebody else's fixture and resolved for the wrong reason.
  //
  // A list of addresses that answer with the wrong thing is worse than no
  // list, so the assertion is on the CONTENT, not on the status.
  const fixtureLink = (llmsWithTwins.body.match(/\((\S*rankxai-noacct-page[^)]*)\)/) ?? [])[1]
  if (fixtureLink) {
    const twin = await raw(new URL(fixtureLink).pathname + new URL(fixtureLink).search)
    twin.status === 200 && has(/text\/markdown/, twin.ct) && has(/No account fixture page/, twin.body)
      ? ok('LINKS — the link published for the fixture page resolves to that page in markdown')
      : bad(`LINKS — ${fixtureLink} answered ${twin.status} ${twin.ct}`)
  } else {
    bad(`LINKS — the fixture page is not linked in the document`)
  }

  // ---- A PAGE WHOSE .md ADDRESS IS A ROOT DOCUMENT'S ----------------------
  //
  // A page slugged `agents` suffixes to `/agents.md`, which the documents
  // route owns. Before this was fixed, the twin sitemap, the Link header, the
  // <link> in the head and this document all published that address for the
  // page — four surfaces pointing an assistant at the wrong content, and the
  // probe's own first version followed it and PASSED, because the root
  // document is also a 200 text/markdown.
  !has(/\(\S*\/agents\.md\)/, llmsWithTwins.body)
    ? ok('COLLISION — the page slugged `agents` is not published at /agents.md, which is a root document')
    : bad('COLLISION — the document links /agents.md as if it were that page')
  const collisionLink = (llmsWithTwins.body.match(/\((\S*\/agents\/\?format=md)\)/) ?? [])[1]
  if (collisionLink) {
    const collided = await raw(new URL(collisionLink).pathname + new URL(collisionLink).search)
    has(/text\/markdown/, collided.ct) && !has(/How to read this site/, collided.body)
      ? ok('COLLISION — it is published at its hint address instead, which serves the page and not the document')
      : bad(`COLLISION — the hint address served ${collided.ct}: ${collided.body.slice(0, 60)}`)
  } else {
    bad('COLLISION — the collision page is not linked at all')
  }

  // `/agents.md` ends in `.md` and is a root document, not a twin. The twin
  // interceptor has to stand down for it, and does so only because it asks the
  // documents catalogue first.
  const agentsWithTwins = await raw('/agents.md')
  agentsWithTwins.status === 200 && has(/How to read this site/, agentsWithTwins.body)
    ? ok('COLLISION — /agents.md is still the root document with copies on')
    : bad(`COLLISION — /agents.md answered ${agentsWithTwins.status}`)

  // ---- SOMEBODY ELSE OWNS THE ADDRESS ------------------------------------
  //
  // The readme promises that a plugin already serving one of these keeps it,
  // and until now nothing tested it. The Phase 0 fixture answers `/llms.txt` at
  // `init` priority 0, ahead of this plugin's route at 99, so it is a real
  // competitor rather than a mock.
  wpCapture(['option', 'update', 'rankxai_phase0_llms', '1'])
  const contested = await raw('/llms.txt')
  has(/served-by: plugin init hook/, contested.body) && contested.document === ''
    ? ok('COMPETITOR — another plugin claiming /llms.txt earlier keeps it, and we add no header of our own')
    : bad(`COMPETITOR — we took a URL somebody else was serving (document="${contested.document}")`)
  const contestedAgents = await raw('/agents.md')
  contestedAgents.status === 200 && has(GENERATED_HEADER, contestedAgents.document)
    ? ok('COMPETITOR — and standing down is per address: /agents.md is unaffected')
    : bad(`COMPETITOR — /agents.md became ${contestedAgents.status}`)
  wpEval("<?php delete_option( 'rankxai_phase0_llms' ); echo 'released';")
  const uncontested = await raw('/llms.txt')
  has(GENERATED_HEADER, uncontested.document)
    ? ok('COMPETITOR — with the other plugin gone the address comes back to us')
    : bad(`COMPETITOR — after releasing it, document="${uncontested.document}"`)

  // ---- PRECEDENCE ---------------------------------------------------------
  const published = await apiJson('/rankxai/v1/documents/llms_txt', {
    method: 'PUT',
    body: JSON.stringify({ content: '# Published by the account\n\n> Approved words.\n' }),
  })
  published.status === 200 && published.json?.stored === true
    ? ok('PRECEDENCE — an account can still publish over a generated document')
    : bad(`PRECEDENCE — PUT answered ${published.status}`)
  published.json?.servingSource === 'stored'
    ? ok('PRECEDENCE — and the site reports `stored` as what is serving')
    : bad(`PRECEDENCE — servingSource was "${published.json?.servingSource}"`)
  published.json?.generatedLocally === true
    ? ok('PRECEDENCE — while still reporting that generation is switched on')
    : bad(`PRECEDENCE — generatedLocally was ${published.json?.generatedLocally}`)

  const afterPublish = await raw('/llms.txt')
  has(/Published by the account/, afterPublish.body) && has(PUBLISHED_HEADER, afterPublish.document)
    ? ok('PRECEDENCE — the published document wins, and the header says `published`')
    : bad(`PRECEDENCE — body/header were ${afterPublish.body.slice(0, 40)} / ${afterPublish.document}`)

  const removed = await apiJson('/rankxai/v1/documents/llms_txt', { method: 'DELETE' })
  removed.json?.servingSource === 'generated'
    ? ok('PRECEDENCE — after a delete the site reports the generated document, not "nothing"')
    : bad(`PRECEDENCE — servingSource after delete was "${removed.json?.servingSource}"`)
  const afterDelete = await raw('/llms.txt')
  afterDelete.status === 200 && has(GENERATED_HEADER, afterDelete.document)
    ? ok('PRECEDENCE — and the address falls back to the generated one rather than going dark')
    : bad(`PRECEDENCE — after delete: ${afterDelete.status} "${afterDelete.document}"`)

  // ---- A SWITCH THAT ACTUALLY SWITCHES OFF -------------------------------
  const off = submitForm({ twinsOn: false, postTypes: ['post', 'page'], generate: {} })
  has(/^saved:/, off) ? ok('OFF — the form switched both documents off') : bad(`OFF — ${off.slice(0, 120)}`)
  const llmsOff = await raw('/llms.txt')
  const agentsOff = await raw('/agents.md')
  llmsOff.status === 404 && agentsOff.status === 404
    ? ok('OFF — both addresses go back to 404, leaving them to whatever else would serve them')
    : bad(`OFF — llms=${llmsOff.status} agents=${agentsOff.status}`)

  // ---- THE LOG ------------------------------------------------------------
  //
  // The check that found a defect every functional assertion passed straight
  // through: a property read on an object that does not exist yet.
  const added = linesSince(logBefore, apacheLog())
  added.includes('rankxai') || added.length > 0
    ? ok('CONTROL — the log read returned this run’s output')
    : bad('CONTROL — the log read found nothing, so the notice check proves nothing')
  const notices = added.split('\n').filter((l) => PHP_NOTICE.test(l) && l.toLowerCase().includes('rankxai'))
  notices.length === 0
    ? ok('LOG — no PHP warning or notice from this plugin during the run')
    : bad(`LOG — ${notices.length} notice(s): ${notices.slice(0, 2).join(' | ')}`)

  // ---- CLEANUP ------------------------------------------------------------
  //
  // Removing and then RE-READING in one round trip. The read has to come after
  // the deletes in the same process, or a cleanup that silently failed reports
  // itself clean.
  const leftover = wpEval(`<?php
delete_option( RankXAI_Generate::OPTION );
delete_option( RankXAI_Twins::OPTION_SETTINGS );
delete_option( RankXAI_Twins::OPTION_CONTEXT );
delete_option( 'rankxai_phase0_llms' );
foreach ( array_keys( RankXAI_Documents::catalogue() ) as $slug ) {
	$option = RankXAI_Documents::option_name( $slug );
	if ( null !== $option ) {
		delete_option( $option );
	}
}
foreach ( array( ${FIX.pageId}, ${FIX.postId}, ${FIX.hiddenId} ) as $id ) {
	wp_delete_post( $id, true );
}
$probe_user = get_user_by( 'login', 'rankxaiprobe' );
if ( $probe_user ) {
	require_once ABSPATH . 'wp-admin/includes/user.php';
	wp_delete_user( $probe_user->ID );
}

echo wp_json_encode( array(
	'local'  => get_option( RankXAI_Generate::OPTION, null ),
	'twins'  => get_option( RankXAI_Twins::OPTION_SETTINGS, null ),
	'phase0' => get_option( 'rankxai_phase0_llms', null ),
	'docs'   => get_option( 'rankxai_document_llms_txt', null ),
	'page'   => get_post( ${FIX.pageId} ) ? 1 : 0,
	'post'   => get_post( ${FIX.postId} ) ? 1 : 0,
	'hidden' => get_post( ${FIX.hiddenId} ) ? 1 : 0,
	'user'   => get_user_by( 'login', 'rankxaiprobe' ) ? 1 : 0,
) );
`)
  leftover === '{"local":null,"twins":null,"phase0":null,"docs":null,"page":0,"post":0,"hidden":0,"user":0}'
    ? ok('CLEANUP — every option and every fixture is gone')
    : bad(`CLEANUP — the rig still holds ${leftover}`)

  console.log('\n================================================')
  console.log(`PASSED ${pass}   FAILED ${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
