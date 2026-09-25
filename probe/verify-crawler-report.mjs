#!/usr/bin/env node
/**
 * Plan 82 Phase 1 — the AI crawlers page, the robots.txt check and the Site
 * Health tests, against a real WordPress.
 *
 * Run:  node probe/verify-crawler-report.mjs      (wp-env must be running)
 *
 *   A  the PHP robots grammar against the SHARED fixture file, the crawler list
 *      against the platform's, and the fixture's bytes against the platform copy
 *   B  robots.txt read from all three sources: WordPress's own file, an SEO
 *      plugin's virtual file (Rank Math), and a real file on disk
 *   C  the page, from planted counts with mixed statuses
 *   D  "Add redirect": a live page is refused at once, a live archive is refused
 *      by the loopback check with Rank Math as the backend (where a wrong answer
 *      would hide a page), and a missing address is written to our own store,
 *      to Rank Math and to the Redirection plugin; a blocked loopback writes nothing
 *   E  Site Health: what is registered, what each test says, who may run the
 *      async one, and that it does not slow the Site Health screen
 *   F  counting start date and "Clear counts"
 *   G  the crawler-config contract: shape 2 carries names; shape 1 still works;
 *      a half-labelled push is refused; the 0.4.x class ignores the new keys
 *
 * Self-provisioning, and puts back every option, plugin and file it touched.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cliContainer, wpContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PLUGIN_DIR = '/var/www/html/wp-content/plugins/rankxai-wp-plugin'
const MARK = `rx-p1-${Date.now()}`

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m) => (cond ? ok(m) : bad(m))

const env = { ...process.env, MSYS_NO_PATHCONV: '1' }
function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', stdio: 'pipe', env }).trim()
}
function wpSoft(...args) {
  try { return wp(...args) } catch { return null }
}
const evalPhp = (code) => wp('eval', code)
const evalJson = (code) => JSON.parse(evalPhp(code))
function inWeb(...cmd) {
  return execFileSync('docker', ['exec', wpContainer(), ...cmd], { encoding: 'utf8', stdio: 'pipe', env }).trim()
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
async function login(user, password) {
  const res = await http(`${BASE}/wp-login.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body: new URLSearchParams({ log: user, pwd: password, 'wp-submit': 'Log In', testcookie: '1' }),
  })
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
  if (!cookies.some((c) => c.startsWith('wordpress_logged_in_'))) throw new Error(`login failed for ${user}`)
  return cookies.join('; ')
}
const page = async (jar, q = '') => (await http(`${BASE}/wp-admin/admin.php?page=rankxai-crawlers${q}`, { headers: { Cookie: jar } })).text()
const ADD_NONCE = /name="action" value="rankxai_add_redirect"[^]*?name="_wpnonce" value="([a-f0-9]+)"/
const CLEAR_NONCE = /name="action" value="rankxai_clear_counts"[^]*?name="_wpnonce" value="([a-f0-9]+)"/
async function adminPost(jar, fields) {
  const res = await http(`${BASE}/wp-admin/admin-post.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar },
    body: new URLSearchParams(fields),
  })
  await res.arrayBuffer().catch(() => undefined)
  return res.status
}
const requests = () => JSON.parse(wpSoft('option', 'get', 'rankxai_redirect_requests', '--format=json') ?? '[]')
async function settle(from) {
  // WP-Cron is spawned by the request itself; wait for it rather than racing it.
  for (let i = 0; i < 40; i++) {
    const r = requests().find((x) => x.from === from)
    if (r && r.state !== 'checking') return r
    await new Promise((res) => setTimeout(res, 750))
  }
  return requests().find((x) => x.from === from) ?? null
}
async function addRedirect(jar, from, to) {
  const nonce = ADD_NONCE.exec(await page(jar))?.[1] ?? ''
  const status = await adminPost(jar, { action: 'rankxai_add_redirect', _wpnonce: nonce, rankxai_from: from, rankxai_to: to, rankxai_source: 'crawlers' })
  return { status, nonce }
}

const OPTIONS = ['rankxai_crawlers_enabled', 'rankxai_crawler_tokens', 'rankxai_crawler_ranges', 'rankxai_crawlers_enabled_at', 'rankxai_redirect_requests', 'rankxai_redirects', 'rankxai_redirect_hits', 'rankxai_probe_robots', 'rankxai_probe_block_loopback', 'rank-math-options-general']

async function run() {
  const saved = Object.fromEntries(OPTIONS.map((o) => [o, wpSoft('option', 'get', o, '--format=json')]))
  const plugins = (wpSoft('plugin', 'list', '--status=active', '--field=name') ?? '').split('\n').filter(Boolean)
  const jar = await login('admin', 'password')

  try {
    // ── A ─────────────────────────────────────────────────────────────────
    console.log('\n== A  one evidence set, two languages ==')
    const fixtures = JSON.parse(readFileSync(join(ROOT, 'probe', 'fixtures', 'robots-fixtures.json'), 'utf8'))
    const a = evalJson(`
      $f = json_decode( file_get_contents( "${PLUGIN_DIR}/probe/fixtures/robots-fixtures.json" ), true );
      $out = array( "fail" => array(), "n" => 0 );
      foreach ( $f["parse"] as $c ) { $out["n"]++; $p = RankXAI_Robots::parse( $c["robots"] );
        $agents = array_map( function ( $g ) { return $g["agents"]; }, $p["groups"] );
        $bad = $agents !== $c["groups"]
          || ( isset( $c["ignoredDirectives"] ) && $p["ignoredDirectives"] !== $c["ignoredDirectives"] )
          || ( isset( $c["unparsedLines"] ) && $p["unparsedLines"] !== $c["unparsedLines"] )
          || ( isset( $c["firstRulePattern"] ) && $p["groups"][0]["rules"][0]["pattern"] !== $c["firstRulePattern"] );
        if ( $bad ) $out["fail"][] = "parse: " . $c["name"]; }
      foreach ( $f["patterns"] as $c ) { $out["n"]++; if ( RankXAI_Robots::pattern_matches( $c["pattern"], $c["path"] ) !== $c["matches"] ) $out["fail"][] = "pattern: " . $c["name"]; }
      foreach ( $f["access"] as $c ) { $out["n"]++; $d = RankXAI_Robots::access_for( RankXAI_Robots::parse( $c["robots"] ), $c["agent"], $c["path"] );
        $bad = $d["access"] !== $c["access"]
          || ( array_key_exists( "decidedBy", $c ) && $d["decidedBy"] !== $c["decidedBy"] )
          || ( isset( $c["matchedRule"] ) && $d["matchedRule"] != $c["matchedRule"] );
        if ( $bad ) $out["fail"][] = "access: " . $c["name"] . " got " . $d["access"]; }
      foreach ( $f["every"] as $c ) { $out["n"]++; foreach ( RankXAI_Robots::assess( RankXAI_Robots::parse( $c["robots"] ) ) as $v ) { if ( $v["access"] !== $c["everyAccess"] ) { $out["fail"][] = "every: " . $c["name"]; break; } } }
      foreach ( $f["blanket"] as $c ) { $out["n"]++; if ( RankXAI_Robots::has_blanket_disallow( RankXAI_Robots::parse( $c["robots"] ) ) !== $c["blanket"] ) $out["fail"][] = "blanket: " . $c["name"]; }
      $out["crawlersMatch"] = RankXAI_Robots::crawlers() === $f["crawlers"];
      $s = json_decode( file_get_contents( "${PLUGIN_DIR}/probe/fixtures/crawler-registry-snapshot.json" ), true );
      $defaults = RankXAI_Crawlers::default_bots(); $meta = RankXAI_Crawlers::default_meta(); $mismatch = array();
      foreach ( $s["crawlers"] as $c ) {
        if ( ! isset( $defaults[ $c["id"] ] ) || $defaults[ $c["id"] ] !== $c["tokens"] ) $mismatch[] = $c["id"] . ": tokens";
        if ( ! isset( $meta[ $c["id"] ] ) || $meta[ $c["id"] ]["label"] !== $c["label"] || $meta[ $c["id"] ]["purpose"] !== $c["purpose"] || $meta[ $c["id"] ]["group"] !== $c["group"] ) $mismatch[] = $c["id"] . ": meta";
      }
      if ( count( $defaults ) !== count( $s["crawlers"] ) ) $mismatch[] = "counts differ";
      $out["registry"] = $mismatch; $out["registryN"] = count( $s["crawlers"] );
      echo json_encode( $out );`)
    const total = fixtures.parse.length + fixtures.patterns.length + fixtures.access.length + fixtures.every.length + fixtures.blanket.length
    check(a.n === total && total > 50, `CONTROL — the PHP port ran every shared case (${a.n} of ${total})`)
    check(a.fail.length === 0, `the PHP grammar agrees with every case${a.fail.length ? `: ${a.fail.join(' | ')}` : ''}`)
    check(a.crawlersMatch === true, 'the PHP AI crawler list is the fixture list, field for field')
    check(a.registryN >= 17 && a.registry.length === 0, `the no-account crawler list matches the registry snapshot (${a.registryN} crawlers${a.registry.length ? `; ${a.registry.join(', ')}` : ''})`)
    const platform = process.env.RANKXAI_PLATFORM_DIR ?? join(ROOT, '..', 'rankxai')
    const platformFixture = join(platform, 'lib', 'agent-readiness', 'robots-fixtures.json')
    if (existsSync(platformFixture)) {
      const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
      check(sha(platformFixture) === sha(join(ROOT, 'probe', 'fixtures', 'robots-fixtures.json')), 'the fixture is byte-identical to the platform’s copy')
      check(sha(join(platform, 'lib', 'crawlers', 'crawler-registry-snapshot.json')) === sha(join(ROOT, 'probe', 'fixtures', 'crawler-registry-snapshot.json')), 'and so is the registry snapshot')
    } else {
      console.log(`  NOT RUN  no platform checkout at ${platform}; set RANKXAI_PLATFORM_DIR to compare hashes`)
    }
    // A mutation the probe must catch: a PHP port that forgot the tie rule.
    const tie = evalPhp(`$p = RankXAI_Robots::parse( "User-agent: *\\nDisallow: /\\nAllow: /" ); echo RankXAI_Robots::access_for( $p, "GPTBot", "/" )["access"];`)
    check(tie === 'allowed', 'CONTROL — the tie rule is live in PHP (Allow wins an equal-length tie)')

    // ── B ─────────────────────────────────────────────────────────────────
    console.log('\n== B  robots.txt from three sources ==')
    wpSoft('plugin', 'deactivate', 'seo-by-rank-math', 'wordpress-seo', 'wp-seopress', 'all-in-one-seo-pack', 'autodescription', 'redirection')
    wpSoft('option', 'delete', 'rankxai_probe_robots')
    const core = evalJson('$r = RankXAI_Robots::reading( true ); echo json_encode( array( "state" => $r["state"], "source" => $r["source"], "body" => $r["body"], "cf" => $r["cloudflare"] ) );')
    check(core.state === 'ok' && core.source === 'core' && /User-agent: \*/.test(core.body), `WordPress's own file is read by asking the site (source ${core.source})`)
    wp('plugin', 'activate', 'seo-by-rank-math')
    wp('option', 'update', 'rank_math_registration_skip', '1')
    evalPhp('\\RankMath\\Helper::update_modules( array( "robots-txt" => "on" ) ); $o = get_option( "rank-math-options-general", array() ); $o["robots_txt_content"] = "User-agent: *\\nAllow: /\\n\\nUser-agent: PerplexityBot\\nDisallow: /\\n"; update_option( "rank-math-options-general", $o );')
    const rm = evalJson('$r = RankXAI_Robots::reading( true ); $p = RankXAI_Robots::parse( $r["body"] ); echo json_encode( array( "state" => $r["state"], "source" => $r["source"], "perplexity" => RankXAI_Robots::access_for( $p, "PerplexityBot" )["access"], "body" => $r["body"] ) );')
    check(rm.state === 'ok' && rm.perplexity === 'blocked', `Rank Math's virtual file is what is read, and its block is seen (${rm.perplexity})`)
    check(rm.source === 'rankmath', `and the edit location names Rank Math (${rm.source})`)
    inWeb('sh', '-c', 'printf "User-agent: *\\nDisallow: /\\n" > /var/www/html/robots.txt && chown 33:33 /var/www/html/robots.txt')
    try {
      const file = evalJson('$r = RankXAI_Robots::reading( true ); $p = RankXAI_Robots::parse( $r["body"] ); echo json_encode( array( "source" => $r["source"], "blanket" => RankXAI_Robots::has_blanket_disallow( $p ) ) );')
      check(file.source === 'file' && file.blanket === true, `a real file on disk wins over both, and its blanket block is seen (source ${file.source})`)
    } finally {
      inWeb('rm', '-f', '/var/www/html/robots.txt')
    }
    check(inWeb('sh', '-c', 'test -e /var/www/html/robots.txt && echo yes || echo no') === 'no', 'cleanup — the planted robots.txt file is gone')
    wp('plugin', 'deactivate', 'seo-by-rank-math')
    const cf = evalPhp('echo json_encode( array( RankXAI_Loopback::via_cloudflare( array( "cf-ray" => "8x" ) ), RankXAI_Loopback::via_cloudflare( array( "server" => "cloudflare" ) ), RankXAI_Loopback::via_cloudflare( array( "server" => "Apache" ) ) ) );')
    check(cf === '[true,true,false]', 'a response through Cloudflare is recognised, and one without is not')
    const foreign = evalPhp('echo RankXAI_Loopback::request( "https://example.com/robots.txt" )["error"];')
    check(foreign === 'not_this_site', 'the loopback class refuses an address on another host')

    // ── C ─────────────────────────────────────────────────────────────────
    console.log('\n== C  the page, from planted counts ==')
    wp('option', 'update', 'rankxai_probe_robots', 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: OAI-SearchBot\nDisallow: /\n')
    evalPhp(`RankXAI_Crawlers::set_enabled( true ); RankXAI_Crawlers::clear(); delete_transient( "rankxai_robots_reading" ); delete_option( "rankxai_crawler_tokens" );
      $d = gmdate( "Y-m-d" );
      foreach ( array( array( "oai-searchbot", 200, "/sample-page/" ), array( "oai-searchbot", 200, "/sample-page/" ), array( "gptbot", 200, "/" ), array( "claudebot", 404, "/${MARK}-gone/" ), array( "perplexitybot", 403, "/sample-page/" ), array( "googlebot", 200, "/hello-world/" ), array( "bytespider", 404, "/wp-login.php" ), array( "claude-user", 200, "/sample-page/" ) ) as $r ) { RankXAI_Crawlers::count( $d, $r[0], false, $r[1], $r[2] ); }
      RankXAI_Crawlers::count( $d, "gptbot", false, 404, "/" . str_repeat( "a", 254 ) );`)
    const html = await page(jar)
    for (const heading of ['Search and answers', 'Fetching a page a person asked about', 'Collecting pages for training', 'Search engines']) {
      check(html.includes(`>${heading}</h3>`), `visits are grouped: "${heading}"`)
    }
    check(html.includes('ChatGPT search') && html.includes('Claude, fetching for a user') && html.includes('Google Search'), 'crawlers are named the way a customer knows them')
    check(html.includes('says it is Claude training'), 'with no published ranges, an error row says "says it is"')
    // Rows of the errors card only: the same path can appear in the visits table above it.
    const errorsCard = html.slice(html.indexOf('Errors AI crawlers hit'))
    const rowOf = (path) => (errorsCard.split('<tr>').find((r) => r.includes(`<code>${path}</code>`)) ?? '')
    check(rowOf(`/${MARK}-gone/`).includes('rankxai_add_redirect'), 'a missing page gets an "Add redirect" form')
    check(!rowOf('/wp-login.php').includes('rankxai_add_redirect') && rowOf('/wp-login.php').includes('probe'), 'a probe-shaped path gets no button')
    check(!rowOf(`/${'a'.repeat(254)}`).includes('rankxai_add_redirect') && rowOf(`/${'a'.repeat(254)}`).includes('too long'), 'a 255-byte (possibly truncated) path gets no button')
    check(rowOf('/sample-page/').includes('security plugin or firewall'), 'a 403 row names the likely cause')
    check(html.includes('<datalist id="rankxai-destinations">') && html.includes('value="/sample-page/"'), 'the destination list offers the site’s own published pages')
    check(/robots\.txt stops ChatGPT from reading this site/.test(html), 'robots.txt: the blocked assistant is named')
    check(html.includes('User-agent: OAI-SearchBot\nAllow: /') && html.includes('WordPress generates this file itself'), 'with the exact lines to add, and where they live')
    check(html.includes('robots.txt blocks OAI-SearchBot, yet a crawler calling itself OAI-SearchBot visited 2 times'), '"blocked but visited" is stated')
    check(html.includes('robots.txt allows PerplexityBot, but this site refused it 1 time.'), '"allowed but refused" is stated, singular')
    check(html.includes('No visits seen') && html.includes('Claude search'), 'a search crawler with no visits reads "No visits seen", never "blocked"')
    const thirty = await page(jar, '&days=30')
    check(thirty.includes('aria-current') || thirty.includes('Last 30 days'), 'the 30-day window renders')

    // ── D ─────────────────────────────────────────────────────────────────
    console.log('\n== D  Add redirect ==')
    wp('term', 'create', 'category', `${MARK}-cat`, `--slug=${MARK}-cat`)
    wp('post', 'create', '--post_type=post', '--post_status=publish', `--post_title=${MARK} in cat`, `--post_category=${MARK}-cat`)
    const live = await addRedirect(jar, '/sample-page/', '/')
    check(live.status === 302 && requests().every((r) => r.from !== '/sample-page'), 'a published page is refused at once, and nothing is queued')
    // Rank Math redirects LIVE pages, so this is where a wrong answer would hide one.
    wp('plugin', 'activate', 'seo-by-rank-math')
    evalPhp('\\RankMath\\Helper::update_modules( array( "redirections" => "on" ) );')
    check(evalPhp('echo RankXAI_Redirect_Requests::backend()["backend"];') === 'rank_math', 'CONTROL — with Rank Math ready, Rank Math is the backend')
    const archive = `/category/${MARK}-cat`
    check(evalPhp(`echo url_to_postid( home_url( "${archive}/" ) );`) === '0', 'CONTROL — url_to_postid cannot resolve the archive, so only the loopback can catch it')
    await addRedirect(jar, `${archive}/`, '/sample-page/')
    const arch = await settle(archive)
    check(arch?.state === 'refused' && /answers 200/.test(arch.message), `a live archive is refused by the loopback check, asked exactly as found (${arch?.state}: ${arch?.message})`)
    const inRm = evalPhp(`$r = \\RankMath\\Redirections\\DB::get_redirections( array( "search" => "category/${MARK}-cat" ) ); echo (int) $r["count"];`)
    check(inRm === '0', 'and nothing was written to Rank Math')
    await addRedirect(jar, `/${MARK}-rm/`, '/sample-page/')
    const rmDone = await settle(`/${MARK}-rm`)
    const rmRow = evalPhp(`$r = \\RankMath\\Redirections\\DB::get_redirections( array( "search" => "${MARK}-rm" ) ); echo (int) $r["count"];`)
    check(rmDone?.state === 'added' && rmDone.backend === 'rank_math' && rmRow === '1', `a missing address is written to Rank Math (${rmDone?.state})`)
    const rmFollow = await http(`${BASE}/${MARK}-rm/`, { redirect: 'manual' })
    check(rmFollow.status === 301 && (rmFollow.headers.get('location') ?? '').endsWith('/sample-page/'), 'and Rank Math answers it with the redirect')
    evalPhp(`$r = \\RankMath\\Redirections\\DB::get_redirections( array( "search" => "${MARK}-rm" ) ); foreach ( $r["redirections"] as $x ) { \\RankMath\\Redirections\\DB::delete( array( (int) $x["id"] ) ); }`)
    wp('plugin', 'deactivate', 'seo-by-rank-math')

    wp('plugin', 'activate', 'redirection')
    evalPhp('if ( class_exists( "Red_Group" ) && ! RankXAI_Redirects::redirection_ready() ) { Red_Group::create( "Redirections", 1 ); }')
    check(evalPhp('echo RankXAI_Redirect_Requests::backend()["backend"];') === 'redirection', 'CONTROL — with the Redirection plugin active, it is the backend')
    await addRedirect(jar, `/${MARK}-red/`, '/sample-page/')
    const red = await settle(`/${MARK}-red`)
    const redRow = evalPhp(`echo count( Red_Item::get_for_matched_url( "/${MARK}-red" ) );`)
    check(red?.state === 'added' && red.backend === 'redirection' && redRow === '1', `a missing address is written to the Redirection plugin (${red?.state}: ${red?.message})`)
    const redFollow = await http(`${BASE}/${MARK}-red/`, { redirect: 'manual' })
    check(redFollow.status === 301, `and Redirection answers it (${redFollow.status})`)
    evalPhp(`foreach ( Red_Item::get_for_matched_url( "/${MARK}-red" ) as $i ) { $i->delete(); }`)
    wp('plugin', 'deactivate', 'redirection')

    check(evalPhp('echo RankXAI_Redirect_Requests::backend()["backend"];') === 'own_store', 'CONTROL — with no manager, our own store is the backend')
    wp('option', 'update', 'rankxai_probe_block_loopback', '1')
    await addRedirect(jar, `/${MARK}-blocked/`, '/sample-page/')
    // With loopbacks blocked WP-Cron cannot spawn either (it is a loopback), so
    // the request honestly waits; run the event as a system cron would.
    await new Promise((r) => setTimeout(r, 1500))
    check(requests().find((x) => x.from === `/${MARK}-blocked`)?.state === 'checking', 'with loopbacks blocked, the request waits rather than guessing')
    wpSoft('cron', 'event', 'run', 'rankxai_confirm_redirect')
    const blocked = await settle(`/${MARK}-blocked`)
    check(blocked?.state === 'could_not_check' && evalPhp(`echo count( RankXAI_Redirects::items( "/${MARK}-blocked" )["items"] );`) === '0', `a blocked loopback writes nothing and says so (${blocked?.state})`)
    wpSoft('option', 'delete', 'rankxai_probe_block_loopback')
    await addRedirect(jar, `/${MARK}-gone/`, '/sample-page/')
    const own = await settle(`/${MARK}-gone`)
    check(own?.state === 'added' && own.backend === 'own_store', `a missing address is written to our own store (${own?.state})`)
    const ownFollow = await http(`${BASE}/${MARK}-gone/`, { redirect: 'manual' })
    check(ownFollow.status === 301, `and it answers (${ownFollow.status})`)
    const listed = await page(jar)
    check(listed.includes('Redirects you asked for') && listed.includes(`/${MARK}-gone`), 'the page lists each request and how it ended')
    const forged = await adminPost(jar, { action: 'rankxai_add_redirect', _wpnonce: 'deadbeef00', rankxai_from: `/${MARK}-forged/`, rankxai_to: '/' })
    check(forged === 403 && requests().every((r) => r.from !== `/${MARK}-forged`), 'a forged nonce is refused and queues nothing')

    // ── E ─────────────────────────────────────────────────────────────────
    console.log('\n== E  Site Health ==')
    const sh = evalJson(`require_once ABSPATH . "wp-admin/includes/class-wp-site-health.php"; $t = WP_Site_Health::get_tests();
      $r = RankXAI_Site_Health::robots_test(); $e = RankXAI_Site_Health::errors_test();
      wp_set_current_user( 1 ); $ok = rest_do_request( new WP_REST_Request( "GET", "/rankxai/v1/site-health/robots" ) );
      wp_set_current_user( 0 ); $anon = rest_do_request( new WP_REST_Request( "GET", "/rankxai/v1/site-health/robots" ) );
      echo json_encode( array( "async" => isset( $t["async"]["rankxai_ai_robots"]["has_rest"] ) && $t["async"]["rankxai_ai_robots"]["has_rest"], "direct" => isset( $t["direct"]["rankxai_ai_robots"] ), "core" => isset( $t["direct"]["search_engine_visibility"] ), "ours" => isset( $t["direct"]["rankxai_search_visibility"] ), "errors" => isset( $t["direct"]["rankxai_crawler_errors"] ), "robots" => $r["status"], "restStatus" => $ok->get_status(), "restResult" => $ok->get_data()["status"], "anon" => $anon->get_status(), "errorsStatus" => $e["status"] ) );`)
    check(sh.async === true && sh.direct === false, 'the robots test is asynchronous, never a direct test that blocks the screen')
    check(sh.core === true && sh.ours === false, 'core already tests search visibility, so ours is not registered')
    check(sh.robots === 'recommended' && sh.restStatus === 200 && sh.restResult === 'recommended', 'a robots.txt blocking a search assistant is "recommended", over REST too')
    check(sh.anon === 401, `an anonymous request to the test is refused (${sh.anon})`)
    check(sh.errors === true, 'with counting on, the crawler-errors test is registered')
    check(sh.errorsStatus === 'good', 'one unverified 404 on one day does not raise it')
    evalPhp(`RankXAI_Crawlers::count( gmdate( "Y-m-d", time() - DAY_IN_SECONDS ), "claudebot", false, 404, "/${MARK}-twice/" ); RankXAI_Crawlers::count( gmdate( "Y-m-d" ), "claudebot", false, 404, "/${MARK}-twice/" ); update_option( "rankxai_crawlers_enabled_at", gmdate( "c", time() - 3 * DAY_IN_SECONDS ) );`)
    check(evalPhp('echo RankXAI_Site_Health::errors_test()["status"];') === 'recommended', 'the same 404 on two days does')
    wpSoft('option', 'delete', 'rankxai_probe_robots')
    evalPhp('delete_transient( "rankxai_robots_reading" );')
    check(evalPhp('echo RankXAI_Site_Health::robots_test()["status"];') === 'good', 'with robots.txt allowing everyone, the robots test is "good"')
    const time = async () => { const t0 = Date.now(); await (await http(`${BASE}/wp-admin/site-health.php`, { headers: { Cookie: jar } })).text(); return Date.now() - t0 }
    const med = (xs) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)]
    const withOurs = med([await time(), await time(), await time()])
    wp('plugin', 'deactivate', 'rankxai-wp-plugin')
    const without = med([await time(), await time(), await time()])
    wp('plugin', 'activate', 'rankxai-wp-plugin')
    check(withOurs < without + 800, `the Site Health screen is not slowed by our tests (${withOurs} ms vs ${without} ms without the plugin)`)

    // ── F ─────────────────────────────────────────────────────────────────
    console.log('\n== F  counting start date and Clear counts ==')
    const before = await page(jar)
    const clearNonce = CLEAR_NONCE.exec(before)?.[1] ?? ''
    check(clearNonce.length > 0, 'CONTROL — a Clear counts form is on the page')
    check((await adminPost(jar, { action: 'rankxai_clear_counts', _wpnonce: 'deadbeef00' })) === 403, 'a forged Clear is refused')
    check((await adminPost(jar, { action: 'rankxai_clear_counts', _wpnonce: clearNonce })) === 302, 'Clear counts runs')
    const cleared = evalJson('$r = RankXAI_Crawlers::report( 30 ); echo json_encode( array( "bots" => count( $r["bots"] ), "since" => RankXAI_Crawlers::enabled_at() ) );')
    check(cleared.bots === 0, 'every count is gone')
    check(Math.abs(Date.parse(cleared.since) - Date.now()) < 5 * 60_000, `and counting starts again from now (${cleared.since})`)
    const after = await page(jar)
    check(after.includes('Counting since') && after.includes('No visits seen'), 'the page says when counting started, and "no visits seen" dates from it')

    // ── G ─────────────────────────────────────────────────────────────────
    console.log('\n== G  the crawler-config contract ==')
    const appPass = wp('user', 'application-password', 'create', 'admin', MARK, '--porcelain')
    const AUTH = 'Basic ' + Buffer.from(`admin:${appPass}`).toString('base64')
    const api = async (route, init = {}) => {
      const res = await http(`${BASE}/?rest_route=${encodeURIComponent(route)}`, { ...init, headers: { Authorization: AUTH, 'Content-Type': 'application/json' } })
      return { status: res.status, json: await res.json().catch(() => null) }
    }
    const man = await api('/rankxai/v1/manifest')
    check(man.json?.capabilities?.includes('crawlers.config.v2'), 'the manifest advertises crawlers.config.v2')
    const get0 = await api('/rankxai/v1/crawlers')
    check(get0.json?.configShape === 2 && typeof get0.json?.countingSince === 'string', 'GET /crawlers says it reads config shape 2, and when counting started')
    const v2 = { version: `v2-${MARK}`, bots: [{ id: 'gptbot', tokens: ['GPTBot'], prefixes: [], label: 'OpenAI training probe', purpose: 'training', group: 'ai' }], proxies: [] }
    const p2 = await api('/rankxai/v1/crawlers/config', { method: 'PUT', body: JSON.stringify(v2) })
    check(p2.status === 200 && evalPhp('echo RankXAI_Crawlers::meta( "gptbot" )["label"];') === 'OpenAI training probe', 'a labelled push is stored and its name is used')
    const half = await api('/rankxai/v1/crawlers/config', { method: 'PUT', body: JSON.stringify({ version: 'v2-half', bots: [{ id: 'gptbot', tokens: ['GPTBot'], label: 'x' }] }) })
    check(half.status === 400 && evalPhp('echo RankXAI_Crawlers::meta( "gptbot" )["label"];') === 'OpenAI training probe', `a half-labelled push is refused and changes nothing (${half.status})`)
    const v1 = await api('/rankxai/v1/crawlers/config', { method: 'PUT', body: JSON.stringify({ version: `v1-${MARK}`, bots: [{ id: 'gptbot', tokens: ['GPTBot'], prefixes: [] }], proxies: [] }) })
    check(v1.status === 200 && evalPhp('echo RankXAI_Crawlers::meta( "gptbot" )["label"];') === 'ChatGPT training', 'a shape-1 push still works, and the default name returns')
    // The released 0.4.x class, loaded under another name, given a labelled push.
    const old = execFileSync('git', ['show', '53d5973:includes/class-rankxai-crawlers.php'], { cwd: ROOT, encoding: 'utf8' })
      .replace('class RankXAI_Crawlers', 'class RankXAI_Crawlers_Released')
      .replace(/^<\?php/, '')
    // Through stdin into a file: the class is too long for a Windows command line.
    execFileSync('docker', ['exec', '-i', '-u', '33', cliContainer(), 'sh', '-c', 'cat > /tmp/rankxai-released-crawlers.php'], { input: `<?php ${old}`, env })
    const b64 = (s) => Buffer.from(s).toString('base64')
    const oldOk = evalPhp(`require "/tmp/rankxai-released-crawlers.php"; $r = RankXAI_Crawlers_Released::save_config( json_decode( base64_decode( '${b64(JSON.stringify({ ...v2, version: 'v2-old' }))}' ), true ) ); echo is_wp_error( $r ) ? "refused" : "accepted";`)
    check(oldOk === 'accepted', `the released 0.4.x class accepts a labelled push rather than refusing it (${oldOk})`)
    wpSoft('user', 'application-password', 'delete', 'admin', '--all')
  } finally {
    for (const [o, v] of Object.entries(saved)) {
      if (v === null) wpSoft('option', 'delete', o)
      else wpSoft('option', 'update', o, v, '--format=json')
    }
    evalPhp('delete_transient( "rankxai_robots_reading" );')
    const now = (wpSoft('plugin', 'list', '--status=active', '--field=name') ?? '').split('\n').filter(Boolean)
    const off = now.filter((p) => !plugins.includes(p))
    const on = plugins.filter((p) => !now.includes(p))
    if (off.length) wpSoft('plugin', 'deactivate', ...off)
    if (on.length) wpSoft('plugin', 'activate', ...on)
    const posts = wpSoft('post', 'list', '--post_type=post', `--s=${MARK}`, '--field=ID', '--format=ids')
    if (posts) wpSoft('post', 'delete', ...posts.split(' '), '--force')
    const term = wpSoft('term', 'get', 'category', `${MARK}-cat`, '--by=slug', '--field=term_id')
    if (term) wpSoft('term', 'delete', 'category', term)
    const final = (wpSoft('plugin', 'list', '--status=active', '--field=name') ?? '').split('\n').filter(Boolean)
    check(JSON.stringify([...final].sort()) === JSON.stringify([...plugins].sort()), 'cleanup — the active plugins are as they were')
  }
}

run()
  .catch((e) => { console.error(e); fail++ })
  .finally(() => {
    console.log('\n================================================')
    console.log(`PASSED ${pass}   FAILED ${fail}`)
    process.exit(fail > 0 ? 1 : 0)
  })
