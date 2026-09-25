#!/usr/bin/env node
/**
 * The update path, end to end, through WordPress's own update machinery.
 *
 * Run:  node probe/verify-updater.mjs            (fixture: GitHub is simulated)
 *       node probe/verify-updater.mjs --live     (real GitHub: needs a published release)
 *
 * Installs the GitHub build as `rankxai/`, makes it look one version older, and
 * asks core — `wp_update_plugins()`, `plugins_api()`, `wp plugin update` — what a
 * site owner would see and get. The fixture (probe/mu-plugins/rankxai-updater-
 * fixture.php) answers the two GitHub addresses so hostile and broken manifests
 * can be tried; `--live` removes it and talks to the real release.
 *
 * Cleanup puts the rig back (the mapped checkout active, nothing else installed)
 * and asserts it. RECOVERY if killed: wp plugin delete rankxai rx-other;
 * wp plugin activate rankxai-wp-plugin; wp option delete rankxai_probe_updater
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cliContainer } from './containers.mjs'

const LIVE = process.argv.includes('--live')
const MAPPED = 'rankxai-wp-plugin'
const ZIP_IN_CONTAINER = '/tmp/rankxai-next.zip'
const PINNED = (v) => `https://github.com/rankxai/rankxai-wp-plugin/releases/download/v${v}/rankxai.zip`

let pass = 0
let fail = 0
let checksRun = 0
const check = (cond, good, badMsg) => {
  checksRun++
  if (cond) { console.log(`  PASS  ${good}`); pass++ } else { console.log(`  FAIL  ${badMsg}`); fail++ }
}

function wp(args, opts = {}) {
  return execFileSync('docker', ['exec', '-i', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', stdio: 'pipe', ...opts }).trim()
}
function wpSoft(args, opts = {}) {
  try { return wp(args, opts) } catch (e) { return `ERROR:${String(e.stderr ?? e).slice(0, 300)}` }
}
const php = (code) => wp(['eval-file', '-'], { input: `<?php ${code}` })
/** Same, with stderr kept: WP-CLI writes the automatic updater's log there. */
function phpWithLog(code) {
  const r = spawnSync('docker', ['exec', '-i', '-u', '33', cliContainer(), 'wp', 'eval-file', '-'], { input: `<?php ${code}`, encoding: 'utf8' })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`
}
const json = (code) => JSON.parse(php(`echo wp_json_encode( ( function () { ${code} } )() );`))
function dockerRoot(args) {
  try { return execFileSync('docker', ['exec', '-u', '0', cliContainer(), ...args], { encoding: 'utf8', stdio: 'pipe' }).trim() } catch (e) { return `ERROR:${String(e.stderr ?? e).slice(0, 200)}` }
}

const header = readFileSync(new URL('../rankxai.php', import.meta.url), 'utf8')
const VERSION = /^\s*\*\s*Version:\s*(\S+)/m.exec(header)[1]
const [maj, min, pat] = VERSION.split('.').map(Number)
const OLDER = pat > 0 ? `${maj}.${min}.${pat - 1}` : `${maj}.${min - 1}.99`

/** Make the installed copy report an older version, both header and constant. */
function ageInstalled(to) {
  const file = wp(['plugin', 'path', 'rankxai'])
  dockerRoot(['sed', '-i', '-E', `s/^( \\* Version: +).*/\\1${to}/; s/define\\( 'RANKXAI_VERSION', '[^']+' \\);/define( 'RANKXAI_VERSION', '${to}' );/`, file])
}
function setFixture(fixture) {
  wp(['option', 'update', 'rankxai_probe_updater', JSON.stringify(fixture), '--format=json'])
  wpSoft(['option', 'delete', 'rankxai_probe_updater_hits'])
}
const manifest = (over = {}) => JSON.stringify({ version: VERSION, requires: '6.0', requires_php: '7.4', tested: '7.1', released: '2026-09-24', changelog: ['First line', '<script>alert(1)</script> escaped'], ...over })
/** Run core's update check afresh, with our cache cleared unless told otherwise. */
function checkUpdates({ keepCache = false } = {}) {
  return json(`
    delete_option( 'rankxai_probe_updater_hits' ); // count THIS check's requests only
    if ( ! ${keepCache ? 'true' : 'false'} ) { delete_site_transient( 'rankxai_release' ); }
    delete_site_transient( 'update_plugins' );
    wp_clean_plugins_cache( false );
    wp_update_plugins();
    $t = get_site_transient( 'update_plugins' );
    $pick = function ( $list, $file ) { return isset( $list[ $file ] ) ? (array) $list[ $file ] : null; };
    return array(
      'response'       => $pick( $t->response, 'rankxai/rankxai.php' ),
      'no_update'      => $pick( $t->no_update, 'rankxai/rankxai.php' ),
      'mapped'         => $pick( $t->response, '${MAPPED}/rankxai.php' ),
      'other'          => $pick( $t->response, 'rx-other/rx-other.php' ),
      'hits'           => (int) get_option( 'rankxai_probe_updater_hits', 0 ),
      'ua'             => get_option( 'rankxai_probe_updater_ua', '' ),
    );
  `)
}

async function run() {
  console.log(`== updater probe, ${LIVE ? 'LIVE against GitHub' : 'fixture'}; offering ${VERSION} to a copy at ${OLDER} ==`)
  execFileSync('node', ['build-zip.mjs'], { stdio: 'pipe', cwd: new URL('..', import.meta.url) })
  execFileSync('docker', ['cp', new URL('../dist/rankxai.zip', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), `${cliContainer()}:${ZIP_IN_CONTAINER}`], { stdio: 'pipe' })
  dockerRoot(['chmod', '644', ZIP_IN_CONTAINER])

  const mappedWasActive = wpSoft(['plugin', 'is-active', MAPPED]) === ''
  wpSoft(['plugin', 'deactivate', MAPPED])
  wpSoft(['option', 'delete', 'rankxai_probe_updater'])

  try {
    const install = wpSoft(['plugin', 'install', ZIP_IN_CONTAINER, '--force', '--activate'])
    // A left-over choice from an earlier run would make "enable" below a warning.
    wpSoft(['plugin', 'auto-updates', 'disable', 'rankxai'])
    check(!install.startsWith('ERROR:'), 'installed the GitHub build as rankxai/', `install failed: ${install}`)
    ageInstalled(OLDER)
    check(wp(['plugin', 'get', 'rankxai', '--field=version']) === OLDER, `the installed copy now reports ${OLDER}`, 'could not age the installed copy')

    if (!LIVE) {
      setFixture({ manifest: manifest(), status: 200, package_file: ZIP_IN_CONTAINER, other_update: null })
    }

    // ── 1. The offer ─────────────────────────────────────────────────────────
    const offer = checkUpdates()
    check(offer.response?.new_version === VERSION, `core lists ${VERSION} as an update`, `no update in the transient: ${JSON.stringify(offer.response)}`)
    check(offer.response?.package === PINNED(VERSION), 'its package is the tag-pinned release asset', `package is ${offer.response?.package}`)
    check(offer.response?.slug === 'rankxai' && offer.response?.id === 'https://github.com/rankxai/rankxai-wp-plugin', 'slug and id are the plugin’s own', `slug ${offer.response?.slug}, id ${offer.response?.id}`)
    const tv = json(`return array( 'site' => get_bloginfo( 'version' ), 'tested' => RankXAI_Updater::tested_for_site( '7.1' ), 'newer' => RankXAI_Updater::tested_for_site( '0.9' ), 'core_ok' => version_compare( get_bloginfo( 'version' ), RankXAI_Updater::tested_for_site( '7.1' ), '<=' ) );`)
    check(tv.core_ok === true, `"Tested up to 7.1" covers this ${tv.site} site (reported ${tv.tested})`, `site ${tv.site} would read as untested against ${tv.tested}`)
    check(tv.newer === '0.9', 'an older branch keeps its value, so the warning still shows', `older branch reported as ${tv.newer}`)
    const icon2x = offer.response?.icons?.['2x'] ?? ''
    check(icon2x.endsWith('/rankxai/assets/icon-256x256.png') && (offer.response?.icons?.['1x'] ?? '').endsWith('/rankxai/assets/icon-128x128.png'), 'the Updates screen gets the brand icon, from the installed copy', `icons ${JSON.stringify(offer.response?.icons)}`)
    const iconPath = icon2x.slice(icon2x.indexOf('/wp-content/'))
    const iconRes = await fetch(`http://localhost:8888${iconPath}`).catch(() => null)
    check(iconRes?.ok && (iconRes.headers.get('content-type') ?? '').startsWith('image/png'), 'and the icon file is served', `icon fetch ${iconRes?.status} ${iconRes?.headers.get('content-type')}`)
    check(offer.response?.requires_php === '7.4' && offer.response?.tested, 'requirements travel with the offer', `requires_php ${offer.response?.requires_php}, tested ${offer.response?.tested}`)
    const listed = wp(['plugin', 'list', '--name=rankxai', '--fields=update,update_version', '--format=json'])
    check(/"update":"available"/.test(listed) && listed.includes(VERSION), `wp plugin list shows "available" ${VERSION}`, `plugin list: ${listed}`)
    if (!LIVE) {
      check(offer.hits === 1, 'CONTROL — the first check made exactly one request, so the counter works', `the first check made ${offer.hits} requests`)
      check(offer.ua === 'RankX-AI-WordPress-plugin', 'the request’s user agent names no site', `user agent was "${offer.ua}"`)

      // ── 2. Cached: a second check does not ask again ───────────────────────
      const again = checkUpdates({ keepCache: true })
      check(again.hits === 0 && again.response?.new_version === VERSION, 'a second check within six hours is answered from cache', `second check made ${again.hits} request(s)`)
    }

    // ── 3. View details ───────────────────────────────────────────────────────
    const info = json(`
      require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
      $r = plugins_api( 'plugin_information', array( 'slug' => 'rankxai' ) );
      return is_wp_error( $r ) ? array( 'error' => $r->get_error_message() ) : (array) $r;
    `)
    check(info.version === VERSION && info.name === 'RankX AI', `"View details" describes RankX AI ${VERSION}`, `plugins_api answered ${JSON.stringify(info).slice(0, 200)}`)
    check(info.download_link === PINNED(VERSION), 'and offers the same pinned package', `download_link ${info.download_link}`)
    if (!LIVE) {
      check(info.sections?.changelog?.includes('&lt;script&gt;') && !info.sections.changelog.includes('<script>'), 'changelog text from the manifest is escaped', `changelog: ${info.sections?.changelog}`)
    } else {
      check(typeof info.sections?.changelog === 'string' && info.sections.changelog.includes('<li>'), 'the live changelog is listed', `changelog: ${info.sections?.changelog}`)
    }

    // ── 4. The update itself ─────────────────────────────────────────────────
    const updated = wpSoft(['plugin', 'update', 'rankxai'])
    check(!updated.startsWith('ERROR:') && /Success/i.test(updated), 'wp plugin update succeeded', `update: ${updated}`)
    check(wp(['plugin', 'get', 'rankxai', '--field=version']) === VERSION, `the site now runs ${VERSION}`, 'the version did not change')
    check(wpSoft(['plugin', 'is-active', 'rankxai']) === '', 'and the plugin is still active', 'the update left the plugin inactive')
    const loaded = json(`return array( 'v' => RANKXAI_VERSION, 'dir' => basename( dirname( RANKXAI_PLUGIN_FILE ) ), 'updater' => class_exists( 'RankXAI_Updater' ) );`)
    check(loaded.v === VERSION && loaded.dir === 'rankxai' && loaded.updater, 'it loads from rankxai/ with its updater', `loaded ${JSON.stringify(loaded)}`)
    if (!LIVE) {
      check(wp(['option', 'get', 'rankxai_probe_updater_package_url']) === PINNED(VERSION), 'WordPress downloaded exactly the pinned address', 'a different package address was fetched')
    }

    // ── 5. Current: listed as up to date, so the auto-update toggle shows ─────
    const current = checkUpdates()
    check(current.response === null && current.no_update?.new_version === VERSION, 'once current it sits in no_update, which is what shows "Enable auto-updates"', `response ${JSON.stringify(current.response)}, no_update ${JSON.stringify(current.no_update)}`)
    const auto = wpSoft(['plugin', 'auto-updates', 'enable', 'rankxai'])
    check(!auto.startsWith('ERROR:'), 'auto-updates can be switched on for it', `auto-updates: ${auto}`)
    const autoState = wp(['plugin', 'auto-updates', 'status', 'rankxai', '--field=status'])
    check(autoState === 'enabled', 'and they report enabled', `status ${autoState}`)

    // ── 5b. WordPress's own background updater installs it, unattended ───────
    // Run as cron does, because Plugin_Upgrader deactivates a plugin before
    // upgrading EXCEPT in cron (in wp-admin the browser reactivates it). Two rig
    // facts are overridden and nothing else: wp-env's tree is a git checkout,
    // which core refuses to auto-update, and core's post-update fatal-error
    // check requests localhost:8888, which the CLI container reaches as `wordpress`.
    ageInstalled(OLDER)
    wp(['plugin', 'activate', 'rankxai'])
    const auto5b = phpWithLog(`
      add_filter( 'wp_doing_cron', '__return_true' );
      add_filter( 'automatic_updates_is_vcs_checkout', '__return_false' );
      add_filter( 'pre_http_request', function ( $pre, $args, $url ) {
        if ( 0 !== strpos( $url, 'http://localhost:8888' ) ) { return $pre; }
        $args['headers']['Host'] = 'localhost:8888';
        return wp_remote_request( str_replace( 'http://localhost:8888', 'http://wordpress', $url ), $args );
      }, 1, 3 );
      delete_site_transient( 'rankxai_release' ); delete_site_transient( 'update_plugins' ); delete_option( 'auto_updater.lock' );
      wp_update_plugins();
      require_once ABSPATH . 'wp-admin/includes/admin.php';
      require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
      ( new WP_Automatic_Updater() )->run();`)
    check(/has no fatal errors/.test(auto5b), 'core’s post-update fatal-error check passed', `auto-update log: ${auto5b.slice(-400)}`)
    check(wp(['plugin', 'get', 'rankxai', '--field=version']) === VERSION && wpSoft(['plugin', 'is-active', 'rankxai']) === '', `the background auto-updater installed ${VERSION} and the plugin is still active`, `after auto-update: ${wpSoft(['plugin', 'list', '--name=rankxai', '--fields=status,version'])}`)
    wpSoft(['plugin', 'auto-updates', 'disable', 'rankxai'])

    if (LIVE) return

    // ── 6. Hostile and broken manifests ──────────────────────────────────────
    ageInstalled(OLDER)
    setFixture({ manifest: manifest({ package: 'https://evil.example/x.zip', download_link: 'https://evil.example/y.zip', url: 'https://evil.example' }), status: 200, package_file: ZIP_IN_CONTAINER, other_update: null })
    const hostile = checkUpdates()
    check(hostile.response?.package === PINNED(VERSION), 'a manifest naming another package address is ignored', `package ${hostile.response?.package}`)

    for (const [label, body, status] of [
      ['malformed JSON', '{not json', 200],
      ['a version that is not x.y.z', manifest({ version: '9.9.9-beta' }), 200],
      ['a version with a path in it', manifest({ version: '9.9.9/../../x' }), 200],
      ['HTTP 404', '', 404],
      ['HTTP 500', manifest(), 500],
    ]) {
      setFixture({ manifest: body, status, package_file: ZIP_IN_CONTAINER, other_update: null })
      const r = checkUpdates()
      check(r.response === null && r.no_update === null, `${label}: no update is offered and nothing breaks`, `${label}: ${JSON.stringify(r.response ?? r.no_update)}`)
    }
    // The failure above is cached for an hour, so an outage costs one request an hour.
    const cachedFailure = checkUpdates({ keepCache: true })
    check(cachedFailure.hits === 0, 'a failed check is cached too', `it asked again ${cachedFailure.hits} time(s)`)

    // ── 7. Another plugin updated from github.com ────────────────────────────
    dockerRoot(['sh', '-c', `mkdir -p /var/www/html/wp-content/plugins/rx-other && printf '<?php\\n/**\\n * Plugin Name: RX Other\\n * Version: 1.0.0\\n * Update URI: https://github.com/someone/else\\n */\\n' > /var/www/html/wp-content/plugins/rx-other/rx-other.php && chown -R 33:33 /var/www/html/wp-content/plugins/rx-other`])
    const otherAnswer = { slug: 'rx-other', version: '2.0.0', package: 'https://github.com/someone/else/releases/download/v2/rx-other.zip' }
    setFixture({ manifest: manifest(), status: 200, package_file: ZIP_IN_CONTAINER, other_update: otherAnswer })
    const both = checkUpdates()
    check(both.other?.new_version === '2.0.0' && both.other?.package === otherAnswer.package, "another plugin's github.com update passes through untouched", `other: ${JSON.stringify(both.other)}`)
    check(both.response?.new_version === VERSION, 'while RankX AI still gets its own', `rankxai: ${JSON.stringify(both.response)}`)
    wpSoft(['plugin', 'delete', 'rx-other'])

    // ── 8. A copy in another folder is told, not broken ──────────────────────
    wpSoft(['plugin', 'deactivate', 'rankxai'])
    wpSoft(['plugin', 'delete', 'rankxai'])
    wp(['plugin', 'activate', MAPPED])
    const [a, b, c] = VERSION.split('.').map(Number)
    setFixture({ manifest: manifest({ version: `${a}.${b}.${c + 1}` }), status: 200, package_file: ZIP_IN_CONTAINER, other_update: null })
    const elsewhere = checkUpdates()
    check(elsewhere.mapped?.new_version === `${a}.${b}.${c + 1}` && !elsewhere.mapped?.package, `a copy in ${MAPPED}/ sees the update with no package, so core says "update manually"`, `mapped: ${JSON.stringify(elsewhere.mapped)}`)
  } finally {
    wpSoft(['option', 'delete', 'rankxai_probe_updater'])
    for (const o of ['rankxai_probe_updater_hits', 'rankxai_probe_updater_ua', 'rankxai_probe_updater_package_url']) wpSoft(['option', 'delete', o])
    wpSoft(['plugin', 'auto-updates', 'disable', 'rankxai'])
    wpSoft(['plugin', 'deactivate', 'rankxai'])
    wpSoft(['plugin', 'delete', 'rankxai', 'rx-other'])
    if (mappedWasActive) wpSoft(['plugin', 'activate', MAPPED])
    wpSoft(['eval', "delete_site_transient( 'rankxai_release' ); delete_site_transient( 'update_plugins' );"])
    check(wpSoft(['plugin', 'get', 'rankxai', '--field=version']).startsWith('ERROR:'), 'CLEANUP — the installed copy is gone', 'CLEANUP — rankxai/ is still installed')
    check(!mappedWasActive || wpSoft(['plugin', 'is-active', MAPPED]) === '', 'CLEANUP — the mapped checkout is active again', 'CLEANUP — the mapped checkout is not active')
    dockerRoot(['rm', '-f', ZIP_IN_CONTAINER])
  }
}

await run().catch((e) => { console.log(`  FAIL  threw: ${e.message}`); fail++ })

const source = readFileSync(new URL(import.meta.url), 'utf8')
const written = (source.match(/^\s+check\(/gm) ?? []).length
const expected = LIVE ? written - 11 : written
if (fail === 0) {
  checksRun >= expected
    ? (console.log(`  PASS  CONTROL — ${checksRun} assertions ran`), pass++)
    : (console.log(`  FAIL  CONTROL — ${checksRun} ran of ${expected} expected; one was skipped`), fail++)
}
console.log('\n================================================')
console.log(`PASSED ${pass}   FAILED ${fail}`)
process.exit(fail > 0 ? 1 : 0)
