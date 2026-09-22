#!/usr/bin/env node
/**
 * The whole chain: the platform's download route → WordPress's own unzipper →
 * a working plugin.
 *
 * Run:  node probe/verify-downloaded-install.mjs [--base http://localhost:3000]
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Everything else about the archive is proven STRUCTURALLY — entry names carry
 * no backslash, the plugin file sits at the expected depth, the three version
 * strings agree. None of that is WordPress actually unpacking it. The defect
 * this guards is one the plugin repo has already paid for once: a ZIP whose
 * entry names used backslashes unpacked a level too deep, where wp-admin
 * reported only "Plugin file does not exist" and the plugin could not even be
 * deleted.
 *
 * So this fetches the bytes the CUSTOMER would get, hands them to `wp plugin
 * install`, and asks the installed copy to do something.
 *
 * ── IT SWAPS THE RIG AND PUTS IT BACK ──────────────────────────────────────
 *
 * wp-env maps the checkout in as its own plugin, and a second copy of the same
 * classes is a fatal on load. So the mapped plugin is deactivated for the
 * duration and reactivated at the end, the downloaded copy is deleted, and both
 * are asserted. A run killed by `timeout` never reaches its cleanup — the
 * recovery is one line and it is printed before anything is touched.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cliContainer } from './containers.mjs'

const BASE = (() => {
  const i = process.argv.indexOf('--base')
  return (i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'http://localhost:3000').replace(/\/+$/, '')
})()

const DOWNLOAD = `${BASE}/api/wordpress-plugin/download`
/** The slug the archive unpacks into — what WordPress will call it. */
const INSTALLED = 'rankxai'
/** The mapped checkout, named after the directory wp-env was started from. */
const MAPPED = 'rankxai-wp-plugin'

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
let checksRun = 0
const check = (condition, okMessage, badMessage) => {
  checksRun++
  return condition ? ok(okMessage) : bad(badMessage)
}

function wp(args, opts = {}) {
  return execFileSync('docker', ['exec', '-i', '-u', '33', cliContainer(), 'wp', ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    ...opts,
  }).trim()
}
/** For the calls whose failure is a legitimate answer (a plugin not installed). */
function wpSoft(args) {
  try {
    return wp(args)
  } catch (e) {
    return `ERROR:${String(e.stderr ?? e).slice(0, 160)}`
  }
}

/**
 * A docker command that may fail without that being a result.
 *
 * MEASURED: `docker cp` writes into the container as ROOT, so removing that
 * file as uid 33 fails with "Operation not permitted". The first version let
 * that throw INSIDE the `finally`, which aborted the rest of the cleanup block
 * — the two assertions that state whether the rig was put back never ran, and
 * the run reported a thrown error instead of the one fact it most needed to
 * report. Every step of a cleanup has to be individually survivable, for the
 * same reason `finally` does not protect against being killed.
 */
function dockerSoft(args) {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch (e) {
    return `ERROR:${String(e.stderr ?? e).slice(0, 160)}`
  }
}
function wpEval(php) {
  return wp(['eval-file', '-'], { input: php })
}

async function run() {
  console.log(`== ${DOWNLOAD} ==`)
  console.log(`   RECOVERY, if this run is killed: wp plugin delete ${INSTALLED}; wp plugin activate ${MAPPED}\n`)

  // ── Fetch exactly what a customer gets ────────────────────────────────────
  const res = await fetch(DOWNLOAD)
  check(res.status === 200, `the download answered 200`, `the download answered ${res.status}`)
  if (res.status !== 200) return

  const bytes = Buffer.from(await res.arrayBuffer())
  const advertised = res.headers.get('x-rankxai-plugin-version') ?? ''
  check(bytes.length > 10_000, `${bytes.length} bytes fetched`, `only ${bytes.length} bytes — that is not the plugin`)

  const local = join(tmpdir(), `rankxai-download-${Date.now()}.zip`)
  writeFileSync(local, bytes)
  execFileSync('docker', ['cp', local, `${cliContainer()}:/tmp/rankxai.zip`], { stdio: 'pipe' })
  unlinkSync(local)

  // ── Make room. Two copies of these classes is a fatal on load. ────────────
  const wasActive = wpSoft(['plugin', 'is-active', MAPPED]) === ''
  wp(['plugin', 'deactivate', MAPPED])

  try {
    // ── THE ASSERTION THIS FILE EXISTS FOR ─────────────────────────────────
    const install = wpSoft(['plugin', 'install', '/tmp/rankxai.zip', '--force', '--activate'])
    check(
      !install.startsWith('ERROR:'),
      'WordPress unpacked and activated the downloaded archive',
      `WordPress refused it: ${install}`,
    )

    const listed = wpSoft(['plugin', 'get', INSTALLED, '--field=version'])
    check(
      listed === advertised,
      `it installed as "${INSTALLED}" at ${listed}, the version the route advertised`,
      `installed version "${listed}" against an advertised "${advertised}"`,
    )
    check(
      wpSoft(['plugin', 'is-active', INSTALLED]) === '',
      'and it is active',
      'it installed but is not active',
    )

    // ── Does the installed copy actually work? ─────────────────────────────
    const state = wpEval(`<?php
echo wp_json_encode( array(
	'constant'   => defined( 'RANKXAI_VERSION' ) ? RANKXAI_VERSION : null,
	'contract'   => defined( 'RANKXAI_CONTRACT_VERSION' ) ? RANKXAI_CONTRACT_VERSION : null,
	'generator'  => class_exists( 'RankXAI_Generate' ),
	'documents'  => class_exists( 'RankXAI_Documents' ),
	'supported'  => class_exists( 'RankXAI_Generate' ) ? RankXAI_Generate::supported() : null,
	'adminFile'  => file_exists( dirname( RANKXAI_PLUGIN_FILE ) . '/includes/class-rankxai-admin.php' ),
	'dir'        => basename( dirname( RANKXAI_PLUGIN_FILE ) ),
) );`)
    const parsed = JSON.parse(state)
    check(
      parsed.constant === advertised,
      `the loaded plugin reports ${parsed.constant}, matching its own header`,
      `RANKXAI_VERSION is ${parsed.constant} and the header says ${advertised}`,
    )
    check(parsed.dir === INSTALLED, `it loaded from wp-content/plugins/${parsed.dir}/`, `it loaded from "${parsed.dir}"`)
    check(parsed.generator === true && parsed.documents === true, 'its classes are loadable', 'a class is missing')
    check(parsed.adminFile === true, 'the settings screen shipped inside the archive', 'the admin file is missing from the archive')
    check(
      JSON.stringify(parsed.supported) === '["llms_txt","agents_md"]',
      'and the generator offers exactly llms.txt and agents.md',
      `supported() returned ${JSON.stringify(parsed.supported)}`,
    )

    // ── Switch a document on FROM THE INSTALLED COPY and fetch it. ─────────
    wpEval("<?php RankXAI_Generate::save_state( array( 'llms_txt' => true ) ); echo 'on';")
    const llms = await fetch(`${new URL(process.env.WP_BASE ?? 'http://localhost:8888').origin}/llms.txt`)
    const body = llms.status === 200 ? await llms.text() : ''
    check(
      llms.status === 200 && llms.headers.get('x-rankxai-document') === 'generated',
      'the installed copy serves a generated /llms.txt',
      `/llms.txt answered ${llms.status} with X-RankXAI-Document "${llms.headers.get('x-rankxai-document')}"`,
    )
    check(body.startsWith('# '), 'and it opens with an H1', `it began "${body.slice(0, 30)}"`)
    wpEval("<?php delete_option( RankXAI_Generate::OPTION ); echo 'off';")
  } finally {
    // ── PUT THE RIG BACK, and prove it. ────────────────────────────────────
    wpSoft(['plugin', 'deactivate', INSTALLED])
    wpSoft(['plugin', 'delete', INSTALLED])
    if (wasActive) wpSoft(['plugin', 'activate', MAPPED])

    // ASSERT THE RIG FIRST. Anything after this that fails must not be able to
    // stop these two from being reported — which is exactly what happened when
    // the temp-file removal below threw.
    const gone = wpSoft(['plugin', 'get', INSTALLED, '--field=version']).startsWith('ERROR:')
    const mappedBack = wpSoft(['plugin', 'is-active', MAPPED]) === ''
    check(gone, 'CLEANUP — the downloaded copy is gone', 'CLEANUP — the downloaded copy is still installed')
    check(mappedBack, 'CLEANUP — the mapped checkout is active again', 'CLEANUP — the rig is left with no plugin active')

    // Root, because `docker cp` put it there as root. Tolerant either way: a
    // stray file in a throwaway container is not worth failing a run over.
    const removed = dockerSoft(['exec', '-u', '0', cliContainer(), 'rm', '-f', '/tmp/rankxai.zip'])
    if (removed.startsWith('ERROR:')) console.log(`  (could not remove /tmp/rankxai.zip in the container: ${removed})`)
  }
}

await run().catch((e) => bad(`threw: ${e.message}`))

// Every assertion goes through `check()` so none can be swallowed, and the call
// sites are counted against the ones that ran — a silently skipped assertion is
// a failure rather than a missing line. See the pixel pass for the incident.
if (fail === 0) {
  const source = (await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8')
  // `^\s+` and not `^ {4,}`: two call sites sit at the top level of `run()`,
  // two spaces in, and the first version of this line missed them — which the
  // count then reported as two assertions having been swallowed. The guard
  // caught its own regex before it could be trusted.
  const callSites = (source.match(/^\s+check\(/gm) ?? []).length
  if (callSites >= 10) ok(`CONTROL — counted ${callSites} check() call sites`)
  else bad(`CONTROL — only ${callSites} call sites found; the count below proves nothing`)
  if (checksRun === callSites) ok(`every assertion written in this file ran (${checksRun})`)
  else bad(`${checksRun} ran and ${callSites} are written — one was swallowed`)
}

console.log('\n================================================')
console.log(`PASSED ${pass}   FAILED ${fail}`)
process.exit(fail > 0 ? 1 : 0)
