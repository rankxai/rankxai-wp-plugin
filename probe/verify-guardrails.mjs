#!/usr/bin/env node
/**
 * The plugin's hard limits, as a derived source scan.
 *
 * Run:  node probe/verify-guardrails.mjs      (no Docker, no WordPress)
 *
 * The candidate set is every `.php` file in the shipped tree, taken from the
 * filesystem rather than from a list here: a member missing from a hand-written
 * list is never examined at all.
 *
 * Every scan carries a two-part control — it found files, and it found the file
 * it is known to be about — because a scan that silently matches nothing passes
 * everything. Comments are stripped before matching, so a scan cannot fire on
 * the note describing the thing it forbids.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }

/** Every PHP file that SHIPS. `probe/` is export-ignored and is not one. */
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
 * PHP with comments removed, in ONE left-to-right pass.
 *
 * Not a block-comment `.replace()` followed by a line-comment one: a `/*`
 * mentioned inside a line comment then swallows everything to the next `*` and
 * slash, taking real code with it.
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

/**
 * Every regex used beside a ternary in this file is NAMED, and that is not
 * style. A regex literal on the line AFTER a `cond ? ok() : bad()` statement is
 * parsed as DIVISION — automatic semicolon insertion does not apply — and node
 * reports it as `Invalid or unexpected token` pointing at the slash. It
 * happened three times while this phase was built. A named constant cannot be
 * misread.
 */
const STATUS_IS_OPEN = new RegExp('/status' + String.fromCharCode(39) + '[^]{0,400}__return_true')
const VERSION_LEAK = new RegExp('RANKXAI_VERSION|pluginVersion|RANKXAI_CONTRACT_VERSION')

const files = shippedPhpFiles()
const code = new Map(files.map((f) => [relative(ROOT, f).replace(/\\/g, '/'), stripComments(readFileSync(f, 'utf8'))]))

console.log(`== scanning ${code.size} shipped PHP file(s) ==`)

// Two parts. A `found > 0` control on its own passes vacuously the day the
// walker stops seeing the tree, and covering the KNOWN members is what makes it
// a control rather than a smoke test.
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

// Snow SEO's own `class-snowseo-perf.php` states the reason exactly: `.htaccess`
// accepts `php_value auto_prepend_file` and `SetHandler`, so a route that wrote
// remote input would be remote code execution. A leaked credential must be a
// nuisance, not a compromise — and the way to guarantee that is for the tree to
// contain no writer at all, which is checkable.
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

// ── GUIDELINE 7, AND THE SENTENCE IN readme.txt THAT DEPENDS ON IT ─────────
//
// "Plugins may not contact external servers without explicit and authorized
// consent" is the guideline that sinks most SaaS-client plugins, and this one
// answers it before it is asked: the platform calls IN and nothing here calls
// out. readme.txt states that as a fact to every customer and to the reviewer.
//
// It was measured once, by hand, before the public release. A claim in a public
// readme with no standing guard is a claim that drifts — and this phase added a
// whole new class that builds a document, which is exactly where a helpful
// `wp_remote_get` would arrive. So the scan and the sentence are checked
// TOGETHER: if one ever stops being true the other has to change with it.
const OUTBOUND = [
  'wp_remote_get', 'wp_remote_post', 'wp_remote_head', 'wp_remote_request', 'wp_safe_remote_get',
  'wp_safe_remote_post', 'wp_safe_remote_head', 'wp_safe_remote_request',
  'curl_init', 'curl_exec', 'curl_multi_init', 'fsockopen', 'stream_socket_client',
  'file_get_contents', 'fopen', 'readfile', 'get_headers', 'dns_get_record',
]
// ONE deliberate exception since 0.4.0 (owner, 2026-09-24): the GitHub build's
// updater asks github.com for the latest release. It is confined to one file,
// one call and one fixed address, and the WordPress.org build removes the file.
const UPDATER_FILE = 'includes/class-rankxai-updater.php'
const outboundOffenders = []
const updaterCalls = []
for (const [name, src] of code) {
  for (const fn of OUTBOUND) {
    const hits = (src.match(new RegExp(`\\b${fn}\\s*\\(`, 'g')) ?? []).length
    if (hits === 0) continue
    if (name === UPDATER_FILE) updaterCalls.push(...Array(hits).fill(fn))
    else outboundOffenders.push(`${name}: ${fn}`)
  }
}
outboundOffenders.length === 0
  ? ok('nothing outside the updater can make an outbound request')
  : bad(`an outbound call appeared: ${outboundOffenders.join(', ')}`)
updaterCalls.length === 1 && updaterCalls[0] === 'wp_safe_remote_get'
  ? ok('the updater makes exactly one request, through wp_safe_remote_get')
  : bad(`the updater makes ${JSON.stringify(updaterCalls)}; exactly one wp_safe_remote_get is allowed`)

const updaterSrc = code.get(UPDATER_FILE) ?? ''
const URL_LITERAL = new RegExp("'https?://[^']*'", 'g')
// RAW source: the comment stripper reads the `//` in a URL literal as a comment
// and drops the rest of the line, so the stripped text holds no addresses.
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

// The platform owns every rule about what may be written, how content is
// preserved and whether a write succeeded, because those change with a deploy
// while this plugin is frozen at whatever version each site runs. The vocabulary
// below is the platform's own — if one of these words appears in PHP, a decision
// has moved to the wrong side of the boundary.
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
const openRoutes = (rest.match(/__return_true/g) ?? []).length
openRoutes === 1
  ? ok('exactly one `__return_true` permission callback')
  : bad(`${openRoutes} open permission callbacks; only the presence probe may be one`)
// ...and it is the one we mean. A count alone would pass if somebody opened a
// different route and closed `/status`.
STATUS_IS_OPEN.test(rest)
  ? ok('and it is `/status`, the presence probe')
  : bad('the open callback is not on `/status`')

// Snow SEO's `/ping` is `__return_true` and returns `pluginVersion`, which is a
// free fingerprint of which sites run a release with a known defect.
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
const methodEntries = (rest.match(METHOD_KEY) ?? []).length
const callbacks = (rest.match(CALLBACK_KEY) ?? []).length
methodEntries > 5
  ? ok(`CONTROL — ${methodEntries} method entries found`)
  : bad(`CONTROL — only ${methodEntries} method entries found, so the gating check proves nothing`)
callbacks === methodEntries
  ? ok(`every method entry has its own permission callback (${callbacks} of ${methodEntries})`)
  : bad(`${methodEntries} method entries and ${callbacks} permission callbacks; one of them is open`)

// MEASURED, and its absence is silent: `wp_update_post` expects slashed data and
// `update_metadata` unslashes every value, so an unslashed write strips every
// backslash and answers HTTP 200. Mutation-proved on a real WordPress — a body
// containing `C:\Users\test` came back `C:Userstest`.
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

// ── THE ADMIN SURFACE ──────────────────────────────────────────────────────
//
// The directory's own guidance is that a plugin's prompts and notices belong on
// its settings page and nowhere else, and a plugin that greets you on every
// screen in wp-admin is the reason that guidance exists. The plugin states the
// same rule in its own header; this is the derived version, so it survives
// somebody adding a "just one banner".
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

// A form posted to `admin-post.php` is reachable by any logged-in user and by
// any site that can make that browser submit it. The capability check answers
// WHO, the nonce answers WHETHER THEY MEANT TO, and a handler needs both —
// neither substitutes for the other.
//
// SCOPED TO THE HANDLER, not to the file. A file-level `includes()` was the
// first version and it could not fail: deleting the capability check from
// `handle_save` left the identical line in `render()` a few lines below, and
// the scan went on passing while the form was writable by any logged-in user.
// Mutation-proved both ways after the fix.
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

// EVERY `admin_post_` handler, derived from the registrations rather than named
// here. The checks above were written when `handle_save` was the only form, and
// a second handler added later would have been examined by nothing.
const ADMIN_POST_HANDLER = /add_action\(\s*'admin_post_'\s*\.\s*self::\w+\s*,\s*array\(\s*__CLASS__\s*,\s*'(\w+)'/g
const handlerNames = [...adminSrc.matchAll(ADMIN_POST_HANDLER)].map((m) => m[1])
handlerNames.length >= 2 && handlerNames.includes('handle_save') && handlerNames.includes('handle_delete_redirect')
  ? ok(`CONTROL — derived ${handlerNames.length} admin_post handlers, including both known ones`)
  : bad(`CONTROL — derived handlers ${JSON.stringify(handlerNames)}; the per-handler checks prove nothing`)
for (const name of handlerNames) {
  const start = adminSrc.indexOf(`function ${name}`)
  const next = adminSrc.indexOf('function ', start + 10)
  const body = start === -1 ? '' : adminSrc.slice(start, next === -1 ? adminSrc.length : next)
  body.includes('check_admin_referer(') && body.includes("current_user_can( 'manage_options' )")
    ? ok(`\`${name}\` verifies its nonce and checks the capability inside the handler`)
    : bad(`\`${name}\` is missing its nonce check or its capability check`)
}

// The admin class is loaded ONLY in wp-admin, so a front-end request never
// parses it. That guard is what makes `is_admin()` false under WP-CLI and in a
// REST request — which is correct, and which is why the probe has to load the
// class itself and cannot prove this arm. So it is proved here.
const BOOT = code.get('rankxai.php') ?? ''
const ADMIN_GUARD = new RegExp('is_admin\\(\\)[^]{0,240}?class-rankxai-admin\\.php')
BOOT.includes('class-rankxai-admin.php')
  ? ok('CONTROL — the bootstrap references the admin class')
  : bad('CONTROL — the bootstrap does not mention the admin class; the guard check proves nothing')
ADMIN_GUARD.test(BOOT)
  ? ok('the settings screen is loaded only inside an `is_admin()` guard')
  : bad('the admin class is loaded on front-end requests too')

// `add_options_page` takes the capability as its third argument, and `read` —
// which every subscriber holds — would put this screen in front of everyone.
//
// The window is 200 characters rather than `[^)]*`: the arguments before the
// capability are `__( 'RankX AI', 'rankxai' )` calls, so a character class
// excluding `)` stops at the first of them and the scan silently measures
// nothing. Mutation-proved — with the capability changed the nearest other
// occurrence is ~1,900 characters away, well outside the window.
const OPTIONS_PAGE = new RegExp("add_options_page\\([^]{0,200}?'manage_options'")
OPTIONS_PAGE.test(adminSrc)
  ? ok('the settings page itself requires `manage_options`')
  : bad('the settings page does not require `manage_options`')

// ── CRAWLER COUNTS STORE NO IP AND NO USER AGENT (DG80-4) ─────────────────
//
// The owner's answer to DG80-4 made the privacy disclosure one sentence, and
// that sentence is only true while the table has nowhere to put either. So the
// table's columns are read out of its own CREATE TABLE, and every file that
// reads a request's address or agent is derived from the tree: the one class
// allowed to look at them uses them and forgets them.
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

// ── THE LISTING'S OWN LIMITS ───────────────────────────────────────────────
//
// readme.txt is the wordpress.org product page, and the directory TRIMS rather
// than refuses: over-length content is cut with an ellipsis on the public page
// and the plugin still ships. So a breach is invisible from here and visible to
// every customer.
//
// The numbers are READ OFF THE DIRECTORY'S OWN PARSER
// (plugin-directory/readme/class-parser.php), not from documentation, and the
// UNITS are the trap: `maximum_field_lengths` is 150 for `short_description`,
// 2500 for a section and 5000 for the changelog and the FAQ — but
// `trim_length()` is called with `'char'` for the first and `'words'` for the
// sections. Measured as characters, this readme's Description looked 2× over
// its limit and was comfortably inside it.
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

// The other half of the outbound scan above. Two ways to fail: the code starts
// calling out while the readme says it does not, or somebody removes the
// sentence while it is still true and hands a reviewer a question to ask.
const CLAIMS_NO_OUTBOUND = /copy\s+from\s+WordPress\.org\s+contacts\s+no\s+external\s+service/i
const NAMES_UPDATE_CHECK = /checks\s+github\.com\s+for\s+a\s+newer\s+release/i
CLAIMS_NO_OUTBOUND.test(readme)
  ? ok('readme.txt states that the WordPress.org copy contacts no external service, which the scan above proves')
  : bad('readme.txt no longer carries the no-outbound claim for the WordPress.org copy')
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

// One fact in three files. `check.sh` already pins the built archive against
// the source; this pins the readme the directory reads against both.
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
