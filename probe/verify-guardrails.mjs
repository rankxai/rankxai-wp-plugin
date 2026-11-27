#!/usr/bin/env node
/**
 * Source scan of the plugin's hard limits over every shipped PHP file, with comments stripped. Each check
 * has a control, so a scan that matches nothing fails rather than passes.
 *
 * Run:  node probe/verify-guardrails.mjs      (no Docker, no WordPress)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }

/** Every PHP file that ships (probe/ does not). */
function shippedPhpFiles(dir = ROOT, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'vendor' || name === 'node_modules' || name === 'probe' || name === 'dist' || name === 'build') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) shippedPhpFiles(full, acc)
    else if (name.endsWith('.php')) acc.push(full)
  }
  return acc
}

/**
 * PHP with comments removed, in one left-to-right pass, so a `/*` inside a line comment cannot swallow code.
 */
function stripComments(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? src.length : end + 2
      continue
    }
    if (two === '//') {
      const end = src.indexOf('\n', i)
      i = end === -1 ? src.length : end
      continue
    }
    if (src[i] === '#' && src.slice(i, i + 12) !== '# phpcs:') {
      // PHP's other line comment. `#[` is an attribute, not a comment.
      if (src[i + 1] !== '[') {
        const end = src.indexOf('\n', i)
        i = end === -1 ? src.length : end
        continue
      }
    }
    out += src[i]
    i += 1
  }
  return out
}

// Regexes beside ternary statements are named constants: a regex literal on the line after
// `cond ? ok() : bad()` is parsed as division.
const STATUS_IS_OPEN = new RegExp('/status' + String.fromCharCode(39) + '[^]{0,400}__return_true')
const VERSION_LEAK = new RegExp('RANKXAI_VERSION|pluginVersion|RANKXAI_CONTRACT_VERSION')

const files = shippedPhpFiles()
const code = new Map(files.map((f) => [relative(ROOT, f).replace(/\\/g, '/'), stripComments(readFileSync(f, 'utf8'))]))

console.log(`== scanning ${code.size} shipped PHP file(s) ==`)

// Controls: the walker found files, and it found every file these checks are about.
const MUST_SEE = [
  'rankxai.php',
  'uninstall.php',
  'includes/class-rankxai-rest.php',
  'includes/class-rankxai-content.php',
  'includes/class-rankxai-schema.php',
  'includes/class-rankxai-schema-set.php',
  'includes/class-rankxai-admin.php',
  'includes/class-rankxai-generate.php',
  'includes/class-rankxai-redirects.php',
  'includes/class-rankxai-crawlers.php',
  'includes/class-rankxai-updater.php',
  'includes/class-rankxai-ui.php',
  'includes/class-rankxai-pages.php',
  'includes/class-rankxai-scan.php',
  'includes/class-rankxai-loopback.php',
  'includes/class-rankxai-view-as-ai.php',
  'includes/class-rankxai-summary.php',
  'includes/class-rankxai-connection.php',
  'includes/class-rankxai-app-client.php',
  'includes/class-rankxai-session-cache.php',
  'includes/store/class-rankxai-session.php',
  'includes/store/class-rankxai-store-admin.php',
  'includes/store/class-rankxai-product-panel.php',
]
code.size > 5
  ? ok(`CONTROL — the walker found ${code.size} files`)
  : bad(`CONTROL — only ${code.size} files found; this scan is measuring nothing`)
const missing = MUST_SEE.filter((f) => !code.has(f))
missing.length === 0
  ? ok('CONTROL — and it found every file this guard is known to be about')
  : bad(`CONTROL — did not find ${missing.join(', ')}; the scan is not seeing the tree`)
;[...code.values()].some((src) => src.includes('register_rest_route'))
  ? ok('CONTROL — comment stripping left real code behind')
  : bad('CONTROL — no `register_rest_route` survived stripping, so the scan is reading nothing')

// No file writers at all: `.htaccess` accepts `auto_prepend_file` and `SetHandler`, so writing remote input
// to disk could become code execution.
const DISK_WRITERS = [
  'file_put_contents', 'fwrite', 'fputs', 'fopen', 'move_uploaded_file',
  'rename', 'unlink', 'mkdir', 'rmdir', 'copy', 'symlink', 'touch',
  'WP_Filesystem', 'wp_upload_bits', 'wp_mkdir_p',
]
const diskOffenders = []
for (const [name, src] of code) {
  for (const fn of DISK_WRITERS) {
    if (new RegExp(`\\b${fn}\\s*\\(`).test(src)) diskOffenders.push(`${name}: ${fn}`)
  }
}
diskOffenders.length === 0
  ? ok('no file-writing function anywhere in the shipped tree')
  : bad(`a file writer appeared: ${diskOffenders.join(', ')}`)

// ── Outbound requests (WordPress.org guideline 7) ──────────────────────────
//
// No calls to external servers without consent. readme.txt says so, and that sentence is checked below.
const OUTBOUND = [
  'wp_remote_get', 'wp_remote_post', 'wp_remote_head', 'wp_remote_request', 'wp_safe_remote_get',
  'wp_safe_remote_post', 'wp_safe_remote_head', 'wp_safe_remote_request',
  'curl_init', 'curl_exec', 'curl_multi_init', 'fsockopen', 'stream_socket_client',
  'file_get_contents', 'fopen', 'readfile', 'get_headers', 'dns_get_record',
]
// Exception: the GitHub build's updater asks github.com for the latest release. One file, one call, one
// fixed address; the WordPress.org build removes the file.
const UPDATER_FILE = 'includes/class-rankxai-updater.php'
// Exception: requests from the site to itself (robots.txt, missing pages). One file, one call, and a host
// check that refuses any other address.
const LOOPBACK_FILE = 'includes/class-rankxai-loopback.php'
// Exception: RankX AI itself, only after an administrator connects an account. One file, one call, one
// fixed host, with the connection check before the call.
const APP_CLIENT_FILE = 'includes/class-rankxai-app-client.php'
const outboundOffenders = []
const updaterCalls = []
const loopbackCalls = []
const appClientCalls = []
for (const [name, src] of code) {
  for (const fn of OUTBOUND) {
    const hits = (src.match(new RegExp(`\\b${fn}\\s*\\(`, 'g')) ?? []).length
    if (hits === 0) continue
    if (name === UPDATER_FILE) updaterCalls.push(...Array(hits).fill(fn))
    else if (name === LOOPBACK_FILE) loopbackCalls.push(...Array(hits).fill(fn))
    else if (name === APP_CLIENT_FILE) appClientCalls.push(...Array(hits).fill(fn))
    else outboundOffenders.push(`${name}: ${fn}`)
  }
}
outboundOffenders.length === 0
  ? ok('nothing outside the updater, the loopback class and the RankX AI client can make a request')
  : bad(`an outbound call appeared: ${outboundOffenders.join(', ')}`)

// ── The RankX AI client: one host, only when connected ─────────────────────
appClientCalls.length === 1 && appClientCalls[0] === 'wp_safe_remote_request'
  ? ok('the RankX AI client makes exactly one request, through wp_safe_remote_request')
  : bad(`the RankX AI client makes ${JSON.stringify(appClientCalls)}; exactly one wp_safe_remote_request is allowed`)
const appSrc = code.get(APP_CLIENT_FILE) ?? ''
// Raw source for addresses: the comment stripper reads the `//` in a URL as a comment.
const appRaw = code.has(APP_CLIENT_FILE) ? readFileSync(join(ROOT, APP_CLIENT_FILE), 'utf8') : ''
const APP_URL_LITERAL = new RegExp("'https?://[^']*'", 'g')
const appUrls = appRaw.match(APP_URL_LITERAL) ?? []
appUrls.length === 1 && appUrls[0] === "'https://app.rankxai.com'"
  ? ok('the client names one address, https://app.rankxai.com')
  : bad(`the RankX AI client names ${JSON.stringify(appUrls)}; only 'https://app.rankxai.com' is allowed`)
const APP_TARGET = new RegExp('wp_safe_remote_request\\(\\s*self::APP_ORIGIN\\s*\\.\\s*\\$path')
APP_TARGET.test(appSrc)
  ? ok('and its request goes to self::APP_ORIGIN')
  : bad('the RankX AI client request is not addressed to self::APP_ORIGIN')
const CONNECTED_FIRST = new RegExp('RankXAI_Connection::link\\(\\)[^]{0,120}?if \\(\\s*null === \\$link\\s*\\)\\s*\\{[^]{0,200}?return new WP_Error')
const checkAt = appSrc.indexOf('RankXAI_Connection::link()')
CONNECTED_FIRST.test(appSrc) && checkAt > -1 && checkAt < appSrc.indexOf('wp_safe_remote_request(')
  ? ok('and it returns before the request when no account is connected')
  : bad('the RankX AI client does not refuse, before the request, when no account is connected')
const PATH_ALLOW = new RegExp('in_array\\(\\s*\\$path\\s*,\\s*self::PATHS')
PATH_ALLOW.test(appSrc) && appSrc.search(PATH_ALLOW) < appSrc.indexOf('wp_safe_remote_request(')
  ? ok('and only to the paths it names')
  : bad('the RankX AI client does not restrict the path before the request')
const clientCallers = [...code].filter(([name, src]) => name !== APP_CLIENT_FILE && src.includes('RankXAI_App_Client::request(')).map(([n]) => n)
clientCallers.includes('includes/store/class-rankxai-session.php') && clientCallers.includes('includes/class-rankxai-connection.php')
  ? ok(`CONTROL — the client is called from ${clientCallers.join(', ')}`)
  : bad(`CONTROL — expected the session route and the disconnect to call the client, found ${JSON.stringify(clientCallers)}`)

// The session route refuses an Application Password and checks the REST nonce
// itself: WordPress checks X-WP-Nonce only for cookie requests.
const sessionSrc = code.get('includes/store/class-rankxai-session.php') ?? ''
const canStart = sessionSrc.slice(sessionSrc.indexOf('function can_start'), sessionSrc.indexOf('function handle'))
canStart.length > 100
  ? ok('CONTROL — the session route’s permission callback was located')
  : bad('CONTROL — could not isolate can_start, so the checks below prove nothing')
canStart.includes("current_user_can( 'manage_options' )") && canStart.includes('rest_get_authenticated_app_password()') && canStart.includes("wp_verify_nonce( $nonce, 'wp_rest' )")
  ? ok('the session route needs an administrator, refuses an Application Password, and verifies the nonce itself')
  : bad('the session route is missing its capability, Application Password or nonce check')

// The store app's chunks import its entry by the bare file name. A version on the entry module (`?ver=`, which
// WordPress adds for any version but null, its default false included) loads it twice: two React roots, a blank page.
const moduleCalls = [...code].flatMap(([name, src]) => [...src.matchAll(/wp_enqueue_script_module\(([^;]*)\);/g)].map((m) => ({ name, args: m[1] })))
moduleCalls.some((c) => c.name === 'includes/store/class-rankxai-store-admin.php')
  ? ok(`CONTROL — found the store app's module enqueue (${moduleCalls.length} in all)`)
  : bad('CONTROL — no wp_enqueue_script_module call in the store admin class, so the check below proves nothing')
const versioned = moduleCalls.filter((c) => !/,\s*null\s*\)?\s*$/.test(c.args.trim()))
versioned.length === 0
  ? ok('every script module is enqueued with a null version, so it loads once under one address')
  : bad(`a script module is enqueued with a version: ${versioned.map((c) => `${c.name}: ${c.args.trim()}`).join('; ')}`)
loopbackCalls.length === 1 && loopbackCalls[0] === 'wp_safe_remote_request'
  ? ok('the loopback class makes exactly one request, through wp_safe_remote_request')
  : bad(`the loopback class makes ${JSON.stringify(loopbackCalls)}; exactly one wp_safe_remote_request is allowed`)
const loopSrc = code.get(LOOPBACK_FILE) ?? ''
const HOST_GUARD = new RegExp("home_url\\(\\s*'/'\\s*\\)\\s*,\\s*PHP_URL_HOST[^]{0,400}?strtolower\\(\\s*\\$home\\s*\\)\\s*!==\\s*strtolower\\(\\s*\\$host\\s*\\)[^]{0,200}?return")
const GUARD_BEFORE_CALL = loopSrc.indexOf('PHP_URL_HOST') > -1 && loopSrc.indexOf('PHP_URL_HOST') < loopSrc.indexOf('wp_safe_remote_request(')
HOST_GUARD.test(loopSrc) && GUARD_BEFORE_CALL
  ? ok('and it refuses, before the call, any address whose host is not this site')
  : bad('the loopback class does not refuse a foreign host before it makes the request')
updaterCalls.length === 1 && updaterCalls[0] === 'wp_safe_remote_get'
  ? ok('the updater makes exactly one request, through wp_safe_remote_get')
  : bad(`the updater makes ${JSON.stringify(updaterCalls)}; exactly one wp_safe_remote_get is allowed`)

const updaterSrc = code.get(UPDATER_FILE) ?? ''
const URL_LITERAL = new RegExp("'https?://[^']*'", 'g')
// Raw source: the stripped text holds no addresses, as `//` in a URL reads as a comment.
const updaterRaw = code.has(UPDATER_FILE) ? readFileSync(join(ROOT, UPDATER_FILE), 'utf8') : ''
const updaterUrls = updaterRaw.match(URL_LITERAL) ?? []
updaterUrls.length > 0 && updaterUrls.every((u) => u.startsWith("'https://github.com/rankxai/rankxai-wp-plugin") || u === "'https://rankxai.com'")
  ? ok(`every address in the updater is this plugin's own GitHub repository (${updaterUrls.length})`)
  : bad(`the updater names an address outside the repository: ${updaterUrls.join(', ')}`)
const FETCH_TARGET = new RegExp('wp_safe_remote_get\\(\\s*self::MANIFEST_URL')
FETCH_TARGET.test(updaterSrc)
  ? ok('and its one request goes to the fixed manifest constant')
  : bad('the updater request is not addressed to self::MANIFEST_URL')

// The download address is built from the checked version, never taken from the
// manifest, so a tampered manifest cannot send a site elsewhere.
const PACKAGE_ASSIGN = new RegExp("\\['package'\\]\\s*=\\s*self::package_url\\(")
const MANIFEST_PACKAGE = new RegExp("\\$data\\[\\s*'(package|download_link|url)'\\s*\\]")
PACKAGE_ASSIGN.test(updaterSrc)
  ? ok('the package address is built by package_url()')
  : bad('the package address is not built by package_url()')
!MANIFEST_PACKAGE.test(updaterSrc)
  ? ok('no address is read out of the manifest')
  : bad('the updater reads an address out of the manifest')

// Core's `update_plugins_{hostname}` filter is the supported door. Rewriting the
// update transient, or deciding auto-updates for the site owner, is not ours.
const UPDATE_HACKS = ['site_transient_update_plugins', 'auto_update_plugin', 'upgrader_source_selection', 'upgrader_pre_download']
const hackOffenders = []
for (const [name, src] of code) {
  for (const hook of UPDATE_HACKS) if (src.includes(hook)) hackOffenders.push(`${name}: ${hook}`)
}
updaterSrc.includes("'update_plugins_github.com'")
  ? ok('CONTROL — the updater hooks update_plugins_github.com')
  : bad('CONTROL — the updater does not hook update_plugins_github.com; the checks above prove little')
hackOffenders.length === 0
  ? ok('nothing rewrites the update transient, the upgrader or the auto-update choice')
  : bad(`an update hack appeared: ${hackOffenders.join(', ')}`)
// Every plugin with a github.com Update URI fires that filter.
const FOREIGN_PLUGIN_GUARD = new RegExp('function filter_update[^]{0,400}?plugin_basename\\(\\s*RANKXAI_PLUGIN_FILE\\s*\\)\\s*!==\\s*\\$plugin_file[^]{0,60}?return \\$update')
FOREIGN_PLUGIN_GUARD.test(updaterSrc)
  ? ok("the filter hands every other plugin's update back untouched")
  : bad('filter_update does not return early for other plugins')

// Deciding what may be written and whether a write succeeded is left to the caller, not the plugin, so
// none of these words may appear in PHP.
const PLATFORM_VOCABULARY = [
  'sentinel', 'byte_identical', 'byteIdentical', 'content_integrity', 'contentIntegrity',
  'attributes_lost', 'attributesLost', 'crosses_block_boundary', 'block_boundary',
  'apply_patch', 'applyPatch', 'oldString', 'newString', 'dry_run', 'dryRun',
  'write_not_verified', 'verified',
]
const ruleOffenders = []
for (const [name, src] of code) {
  for (const term of PLATFORM_VOCABULARY) {
    if (src.includes(term)) ruleOffenders.push(`${name}: ${term}`)
  }
}
ruleOffenders.length === 0
  ? ok('none of the platform\u2019s decision vocabulary appears in PHP')
  : bad(`a platform rule may have moved into the plugin: ${ruleOffenders.join(', ')}`)

const rest = code.get('includes/class-rankxai-rest.php') ?? ''
// Counted over every shipped file, so a route registered in any class is included.
const openRoutes = [...code.values()].reduce((n, src) => n + (src.match(/__return_true/g) ?? []).length, 0)
openRoutes === 1 && (rest.match(/__return_true/g) ?? []).length === 1
  ? ok('exactly one `__return_true` permission callback in the whole plugin, in the REST class')
  : bad(`${openRoutes} open permission callbacks; only the presence probe may be one`)
// And it is `/status`: a count alone would pass if another route were opened and `/status` closed.
STATUS_IS_OPEN.test(rest)
  ? ok('and it is `/status`, the presence probe')
  : bad('the open callback is not on `/status`')

// The open probe returns no version, which would show which sites run a release with a known defect.
const statusFn = rest.slice(rest.indexOf('function handle_status'), rest.indexOf('function handle_manifest'))
statusFn.length > 20
  ? ok('CONTROL — the status handler was located')
  : bad('CONTROL — could not locate `handle_status`, so the version check proves nothing')
!VERSION_LEAK.test(statusFn)
  ? ok('the unauthenticated probe returns no version of any kind')
  : bad('the unauthenticated probe discloses a version')

// `register_rest_route` does NOT require a `permission_callback`, and a method
// entry without one is open to the world.
const METHOD_KEY = new RegExp(String.fromCharCode(39) + 'methods' + String.fromCharCode(39), 'g')
const CALLBACK_KEY = new RegExp(String.fromCharCode(39) + 'permission_callback' + String.fromCharCode(39), 'g')
// Checked per file, over every file that registers a route.
const routeFiles = [...code].filter(([, src]) => src.includes('register_rest_route(')).map(([n]) => n)
;['includes/class-rankxai-rest.php', 'includes/class-rankxai-connection.php', 'includes/store/class-rankxai-session.php'].every((f) => routeFiles.includes(f))
  ? ok(`CONTROL — ${routeFiles.length} files register routes, including the connection and session classes`)
  : bad(`CONTROL — route files ${JSON.stringify(routeFiles)} miss a known one, so the gating check is not seeing them`)
let methodEntries = 0
for (const file of routeFiles) {
  const src = code.get(file) ?? ''
  const m = (src.match(METHOD_KEY) ?? []).length
  const c = (src.match(CALLBACK_KEY) ?? []).length
  methodEntries += m
  c === m
    ? ok(`${file}: every method entry has its own permission callback (${c} of ${m})`)
    : bad(`${file}: ${m} method entries and ${c} permission callbacks; one of them is open`)
}
methodEntries > 5
  ? ok(`CONTROL — ${methodEntries} method entries found`)
  : bad(`CONTROL — only ${methodEntries} method entries found, so the gating check proves nothing`)

// `wp_update_post` expects slashed data and `update_metadata` unslashes, so an unslashed write silently
// strips every backslash and still returns 200.
for (const file of ['includes/class-rankxai-content.php', 'includes/class-rankxai-schema.php', 'includes/class-rankxai-schema-set.php']) {
  const src = code.get(file) ?? ''
  const writes = (src.match(/wp_update_post\(|update_post_meta\(/g) ?? []).length
  const slashes = (src.match(/wp_slash\(/g) ?? []).length
  writes > 0
    ? ok(`CONTROL — ${file} makes ${writes} write call(s)`)
    : bad(`CONTROL — ${file} makes no write calls, so the slash check proves nothing`)
  slashes >= writes
    ? ok(`wp_slash — ${file} slashes every write (${slashes} for ${writes})`)
    : bad(`wp_slash — ${file} has ${writes} writes and only ${slashes} wp_slash calls`)
}

// ── The admin surface ──────────────────────────────────────────────────────
//
// Notices belong on the plugin's own pages, never across wp-admin.
const NOTICE_HOOKS = ['admin_notices', 'all_admin_notices', 'network_admin_notices', 'user_admin_notices']
const noticeOffenders = []
for (const [name, src] of code) {
  for (const hook of NOTICE_HOOKS) {
    if (src.includes(hook)) noticeOffenders.push(`${name}: ${hook}`)
  }
}
noticeOffenders.length === 0
  ? ok('no admin notice is registered anywhere in wp-admin')
  : bad(`an admin notice appeared: ${noticeOffenders.join(', ')}`)

// An `admin-post.php` handler needs a capability check (who) and a nonce (intent), both inside the handler
// itself: the same line elsewhere in the file would not protect it.
const ADMIN_POST = /add_action\(\s*['"]admin_post_/
const adminSrc = code.get('includes/class-rankxai-admin.php') ?? ''
const saveStart = adminSrc.indexOf('function handle_save')
const saveEnd = adminSrc.indexOf('function ', saveStart + 10)
const saveBody = saveStart === -1 ? '' : adminSrc.slice(saveStart, saveEnd === -1 ? adminSrc.length : saveEnd)

ADMIN_POST.test(adminSrc)
  ? ok('CONTROL — an `admin_post_` handler is registered, so the checks below have a subject')
  : bad('CONTROL — no `admin_post_` registration found; the form-handling checks prove nothing')
saveBody.length > 100
  ? ok(`CONTROL — the save handler was located (${saveBody.length} chars)`)
  : bad('CONTROL — could not isolate `handle_save`, so the checks below prove nothing')
saveBody.includes('check_admin_referer(')
  ? ok('the settings form verifies its nonce, inside the handler')
  : bad('`handle_save` has no `check_admin_referer` — it is cross-site submittable')
saveBody.includes("current_user_can( 'manage_options' )")
  ? ok('and `handle_save` checks the capability itself, not only on the menu entry')
  : bad('`handle_save` does not check a capability of its own')

// Every `admin_post_` handler, derived from its registration rather than named here.
const ADMIN_POST_HANDLER = /add_action\(\s*'admin_post_'\s*\.\s*self::\w+\s*,\s*array\(\s*__CLASS__\s*,\s*'(\w+)'/g
// Across every shipped file: Connect and Disconnect live in the connection class.
const handlers = []
for (const [file, src] of code) for (const m of src.matchAll(ADMIN_POST_HANDLER)) handlers.push({ file, name: m[1] })
const handlerNames = handlers.map((h) => h.name)
const ADMIN_POST_ANY = /add_action\(\s*'admin_post_/g
const registrations = [...code.values()].reduce((n, src) => n + (src.match(ADMIN_POST_ANY) ?? []).length, 0)
handlerNames.length >= 4 && ['handle_save', 'handle_delete_redirect', 'handle_connect', 'handle_disconnect'].every((n) => handlerNames.includes(n)) && registrations === handlers.length
  ? ok(`CONTROL — derived ${handlerNames.length} admin_post handlers across the plugin, including the known ones, and every registration was read`)
  : bad(`CONTROL — derived handlers ${JSON.stringify(handlerNames)} from ${registrations} registrations; the per-handler checks prove nothing`)
for (const { file, name } of handlers) {
  const src = code.get(file) ?? ''
  const start = src.indexOf(`function ${name}`)
  const next = src.indexOf('function ', start + 10)
  const body = start === -1 ? '' : src.slice(start, next === -1 ? src.length : next)
  // The updater's "Check for updates" link is core's own job and checks core's
  // capability for it, `update_plugins`; every other handler needs `manage_options`.
  const capability = file === UPDATER_FILE ? "current_user_can( 'update_plugins' )" : "current_user_can( 'manage_options' )"
  body.includes('check_admin_referer(') && body.includes(capability)
    ? ok(`\`${name}\` (${file}) verifies its nonce and checks the capability inside the handler`)
    : bad(`\`${name}\` (${file}) is missing its nonce check or its capability check`)
}

// The admin class loads only in wp-admin. `is_admin()` is false under WP-CLI and REST, so the live probes
// cannot prove this; it is checked here.
const BOOT = code.get('rankxai.php') ?? ''
const ADMIN_GUARD = new RegExp('is_admin\\(\\)[^]{0,240}?class-rankxai-admin\\.php')
BOOT.includes('class-rankxai-admin.php')
  ? ok('CONTROL — the bootstrap references the admin class')
  : bad('CONTROL — the bootstrap does not mention the admin class; the guard check proves nothing')
ADMIN_GUARD.test(BOOT)
  ? ok('the settings screen is loaded only inside an `is_admin()` guard')
  : bad('the admin class is loaded on front-end requests too')

// The menu and every page in it need `manage_options`. The window is 200 characters rather than `[^)]*`
// because the earlier arguments contain `__()` calls.
const MENU_PAGE = new RegExp("add_menu_page\\([^]{0,200}?'manage_options'")
MENU_PAGE.test(adminSrc)
  ? ok('the top-level menu itself requires `manage_options`')
  : bad('the top-level menu does not require `manage_options`')
const SUBMENU_ARGS = new RegExp('add_submenu_page\\(([^;]*?)\\);', 'g')
// Every file, so a page registered elsewhere is held to the same rule.
const submenus = [...code.values()].flatMap((src) => [...src.matchAll(SUBMENU_ARGS)].map((m) => m[1]))
// Not SUBMENU_ARGS: a /g regex carries lastIndex from one .test() to the next.
const MENU_CALL = /add_submenu_page\(|add_menu_page\(/
const menuFiles = [...code].filter(([, src]) => MENU_CALL.test(src)).map(([n]) => n)
menuFiles.length === 1 && menuFiles[0] === 'includes/class-rankxai-admin.php'
  ? ok('every admin page is registered in the admin class')
  : bad(`admin pages are registered in ${JSON.stringify(menuFiles)}; register them in the admin class, where this check reads them`)
// The Store page is the store app's mount point: its slug is the one the bundle's links use.
adminSrc.includes("const PAGE_STORE = 'rankxai-store'")
  ? ok('the Store page keeps the slug the store app links to (rankxai-store)')
  : bad('the Store page slug is not rankxai-store, so the store app’s own links would break')
const IN_MENU = new RegExp('^\\s*self::PAGE\\s*,')
const HIDDEN = new RegExp("^\\s*''\\s*,")
const menuPages = submenus.filter((args) => IN_MENU.test(args))
const hiddenPages = submenus.filter((args) => HIDDEN.test(args))
menuPages.length >= 1
  ? ok(`CONTROL — found ${menuPages.length} add_submenu_page call(s) in the menu`)
  : bad('CONTROL — no add_submenu_page call found in the menu; the capability check proves nothing')
menuPages.every((args) => args.includes("'manage_options'"))
  ? ok('every page in the menu requires `manage_options`')
  : bad('a page in the RankX AI menu is registered without `manage_options`')
hiddenPages.every((args) => args.includes("'manage_options'") || args.includes("'edit_posts'"))
  ? ok(`every page outside the menu requires at least \`edit_posts\` (${hiddenPages.length})`)
  : bad('a page outside the menu is registered with a weaker capability than `edit_posts`')

// ── The stylesheet uses its colour tokens only ─────────────────────────────
//
// Every colour lives in the token block; nothing outside it may name a raw colour.
const css = readFileSync(join(ROOT, 'assets', 'admin.css'), 'utf8')
const TOKEN_START = css.indexOf('/* -- tokens')
const TOKEN_END = css.indexOf('/* -- end tokens -- */')
const tokenBlock = TOKEN_START >= 0 && TOKEN_END > TOKEN_START ? css.slice(TOKEN_START, TOKEN_END) : ''
tokenBlock.includes('--rx-foreground') && tokenBlock.includes('oklch(')
  ? ok('CONTROL — found the token block, holding the app’s colours')
  : bad('CONTROL — no token block found in assets/admin.css; the colour check proves nothing')
const CSS_COMMENT = new RegExp('/\\*[^]*?\\*/', 'g')
const outside = (TOKEN_START >= 0 ? css.slice(0, TOKEN_START) + css.slice(TOKEN_END) : css).replace(CSS_COMMENT, '')
const RAW_COLOUR = new RegExp('#[0-9a-fA-F]{3,8}\\b|\\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb)\\(|:\\s*(white|black|red|green|blue|gray|grey|orange|yellow|purple|pink)\\s*[;!]')
const rawColour = outside.split('\n').filter((line) => RAW_COLOUR.test(line))
outside.includes('var(--rx-')
  ? ok('CONTROL — the rules outside the token block use the tokens')
  : bad('CONTROL — no rule reads a token; the scan below proves nothing')
rawColour.length === 0
  ? ok('no raw colour outside the token block in admin.css')
  : bad(`raw colour outside the token block: ${rawColour.slice(0, 3).join(' | ')}`)

// The store app's stylesheet: a raw colour may appear only in an `--rx-*` definition.
const STORE_CSS = join(ROOT, 'admin-app', 'src', 'store-app', 'hosts', 'wordpress', 'store.css')
const storeCss = readFileSync(STORE_CSS, 'utf8').replace(CSS_COMMENT, '')
const RX_TOKEN_LINE = new RegExp('^\\s*--rx-[a-z0-9-]+\\s*:')
const storeLines = storeCss.split('\n')
storeLines.some((l) => RX_TOKEN_LINE.test(l) && RAW_COLOUR.test(l)) && storeLines.some((l) => l.includes('var(--rx-'))
  ? ok('CONTROL — the store app stylesheet defines --rx- colour tokens and reads them')
  : bad('CONTROL — no --rx- colour token found in the store app stylesheet; the check below proves nothing')
const storeRaw = storeLines.filter((l) => RAW_COLOUR.test(l) && !RX_TOKEN_LINE.test(l))
storeRaw.length === 0
  ? ok('the store app stylesheet names a raw colour only in an --rx-* token')
  : bad(`raw colour outside an --rx-* token in the store app stylesheet: ${storeRaw.slice(0, 3).join(' | ')}`)

// Our stylesheet loads on our screens and no other: the enqueue is gated on the
// hook suffixes the registration returned, never on a hand-written screen id.
const ENQUEUE_GATE = new RegExp('function enqueue\\([^]{0,300}?in_array\\(\\s*\\$hook_suffix\\s*,\\s*self::\\$hooks')
ENQUEUE_GATE.test(adminSrc)
  ? ok('the stylesheet is enqueued only on the screens this plugin registered')
  : bad('the stylesheet enqueue is not gated on the registered hook suffixes')

// ── Crawler counts store no IP and no user agent ───────────────────────────
//
// The table's columns are read from its CREATE TABLE, and only the crawler class may read a visitor's
// address or agent (it uses them without storing them).
const crawlerSrc = code.get('includes/class-rankxai-crawlers.php') ?? ''
const CREATE_TABLE = new RegExp('CREATE TABLE \\{\\$table\\} \\(([^]*?)PRIMARY KEY')
const createMatch = CREATE_TABLE.exec(crawlerSrc)
const columns = createMatch
  ? createMatch[1].split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((c) => /^[a-z_]+$/.test(c))
  : []
columns.includes('path') && columns.includes('hits') && columns.includes('bot')
  ? ok(`CONTROL — read the crawler table's columns: ${columns.join(', ')}`)
  : bad('CONTROL — could not read the crawler table’s CREATE TABLE, so the column check proves nothing')
const PERSONAL_COLUMN = /ip|addr|agent|^ua$|query|referer|host/
const personal = columns.filter((c) => PERSONAL_COLUMN.test(c))
personal.length === 0
  ? ok('the crawler table has no column that could hold an IP address, a user agent or a query')
  : bad(`the crawler table has a column for personal data: ${personal.join(', ')}`)

const REQUEST_IDENTITY = /\$_SERVER\[\s*'(REMOTE_ADDR|HTTP_USER_AGENT|HTTP_CF_CONNECTING_IP|HTTP_X_FORWARDED_FOR)'\s*\]/
const identityReaders = [...code].filter(([, src]) => REQUEST_IDENTITY.test(src)).map(([name]) => name)
identityReaders.includes('includes/class-rankxai-crawlers.php')
  ? ok('CONTROL — the crawler class is found reading the request address and agent')
  : bad('CONTROL — the crawler class does not read the request address; the reader check proves nothing')
identityReaders.length === 1
  ? ok('no other file reads a visitor’s address or user agent')
  : bad(`other files read a visitor’s address or agent: ${identityReaders.join(', ')}`)

// ── The directory listing's limits ─────────────────────────────────────────
//
// The directory trims an over-long readme rather than refusing it. Its parser allows 150 characters for the
// short description, 2,500 words per section, and 5,000 words for the changelog and FAQ.
const readme = readFileSync(join(ROOT, 'readme.txt'), 'utf8')
const readmeHeader = (field) => {
  const m = new RegExp(`^${field}\\s*:\\s*(.+)$`, 'im').exec(readme)
  return m ? m[1].trim() : ''
}
const SECTION_SPLIT = new RegExp('^== (.+?) ==\\s*$', 'm')
const sections = readme.split(new RegExp(SECTION_SPLIT.source, 'gm'))
const SECTION_WORD_LIMIT = { changelog: 5000, 'frequently asked questions': 5000 }

readme.length > 500 && sections.length > 3
  ? ok(`CONTROL — readme.txt parsed into ${(sections.length - 1) / 2} sections`)
  : bad('CONTROL — readme.txt did not parse; every check below proves nothing')

// The short description is the line between the header block and `== Description ==`.
const shortDescription = (readme.split(SECTION_SPLIT)[0] ?? '')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('===') && !/^[A-Za-z ]+:/.test(l))
  .join(' ')
shortDescription.length > 0 && shortDescription.length <= 150
  ? ok(`the short description is ${shortDescription.length} of 150 characters`)
  : bad(`the short description is ${shortDescription.length} characters; the directory trims at 150`)

// The readme half of the outbound scan: it must say nothing is contacted until an account is connected,
// and name the service and every path the plugin then calls.
const CLAIMS_NO_OUTBOUND = /Until\s+you\s+connect\s+a\s+RankX\s+AI\s+account,\s+the\s+plugin\s+contacts\s+no\s+external\s+service/i
// The source readme carries the GitHub-only block; build-zip.mjs removes it from the WordPress.org build and fails if
// it does not.
const NAMES_UPDATE_CHECK = /checks\s+`?https:\/\/github\.com\/rankxai\/rankxai-wp-plugin\/releases\/latest\/download\/rankxai-update\.json`?\s+for\s+a\s+newer\s+version/i
CLAIMS_NO_OUTBOUND.test(readme)
  ? ok('readme.txt states that the WordPress.org copy contacts no external service until an account is connected, which the scan above proves')
  : bad('readme.txt no longer carries the no-outbound-until-connected claim for the WordPress.org copy')
const APP_PATH_LITERAL = new RegExp("'/api/store-app/wp/[a-z-]+'", 'g')
const TERMS_LINK = new RegExp('rankxai\\.com/terms-of-service')
const PRIVACY_LINK = new RegExp('rankxai\\.com/privacy-policy')
const appPaths = (appRaw.match(APP_PATH_LITERAL) ?? []).map((p) => p.slice(1, -1))
appPaths.length >= 3 && appPaths.every((p) => readme.includes(`https://app.rankxai.com${p}`)) && readme.includes('https://app.rankxai.com/api/store-app')
  ? ok(`readme.txt names RankX AI and every path the plugin calls (${appPaths.join(', ')}), and the store app API`)
  : bad(`readme.txt does not name every RankX AI path the client calls: ${JSON.stringify(appPaths)}`)
TERMS_LINK.test(readme) && PRIVACY_LINK.test(readme)
  ? ok('readme.txt links RankX AI’s terms and privacy policy (guideline 6)')
  : bad('readme.txt does not link RankX AI’s terms and privacy policy')
NAMES_UPDATE_CHECK.test(readme)
  ? ok('readme.txt discloses the GitHub build’s update check')
  : bad('readme.txt does not disclose the update check the updater makes')

const tags = readmeHeader('Tags').split(',').map((t) => t.trim()).filter(Boolean)
tags.length > 0 && tags.length <= 5
  ? ok(`${tags.length} tags, of the 5 the directory keeps`)
  : bad(`${tags.length} tags; everything past the fifth is dropped`)

const overLong = []
for (let i = 1; i < sections.length; i += 2) {
  const name = sections[i].trim()
  const words = sections[i + 1].trim().split(/\s+/).filter(Boolean).length
  const limit = SECTION_WORD_LIMIT[name.toLowerCase()] ?? 2500
  if (words > limit) overLong.push(`${name} ${words}/${limit} words`)
}
overLong.length === 0
  ? ok('no section exceeds the word count the directory trims at')
  : bad(`a section would be cut short on the listing page: ${overLong.join(', ')}`)

// The readme's Stable tag must match the plugin header.
const pluginVersion = (/^\s*\*\s*Version:\s*(.+)$/im.exec(readFileSync(join(ROOT, 'rankxai.php'), 'utf8')) ?? [])[1]?.trim()
const stableTag = readmeHeader('Stable tag')
pluginVersion && stableTag
  ? ok(`CONTROL — found both versions (plugin ${pluginVersion}, Stable tag ${stableTag})`)
  : bad(`CONTROL — could not read a version (plugin "${pluginVersion}", Stable tag "${stableTag}")`)
pluginVersion === stableTag
  ? ok('readme.txt Stable tag matches the plugin header')
  : bad(`Stable tag is ${stableTag} and the plugin header says ${pluginVersion}`)

console.log('\n================================================')
console.log(`PASSED ${pass}   FAILED ${fail}`)
process.exit(fail > 0 ? 1 : 0)
