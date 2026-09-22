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
const MUST_SEE = ['rankxai.php', 'uninstall.php', 'includes/class-rankxai-rest.php', 'includes/class-rankxai-content.php', 'includes/class-rankxai-schema.php']
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
for (const file of ['includes/class-rankxai-content.php', 'includes/class-rankxai-schema.php']) {
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

console.log('\n================================================')
console.log(`PASSED ${pass}   FAILED ${fail}`)
process.exit(fail > 0 ? 1 : 0)
