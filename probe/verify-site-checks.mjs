#!/usr/bin/env node
/**
 * Plan 82 Phase 2 — site checks: broken and redirected links, orphans, alt text.
 *
 * Run:  node probe/verify-site-checks.mjs      (wp-env must be running)
 *
 * Set RANKXAI_SKIP_WOO=1 to skip installing WooCommerce, RANKXAI_SKIP_BULK=1 to
 * skip the 2,000-post timing fixture, RANKXAI_SKIP_WORDFENCE=1 to skip the
 * Wordfence check. A skipped section is reported NOT RUN, never passed.
 *
 *   A  a classic-theme fixture: a broken link, an archive url_to_postid cannot
 *      resolve, a link that exists only after rendering, a resized upload, a
 *      redirected link, an external link, orphans, a menu-only page, a page linked
 *      only from an UNUSED navigation post, images with no and with empty alt
 *   B  the Site checks page shows it, with the honest wording
 *   C  noindex through SEOPress, All in One SEO and SureRank keeps a page off the lists
 *   D  on a block theme, a page linked only from the navigation is not an orphan
 *   E  loopback blocked: nothing is "broken", everything is "could not check"
 *   F  WooCommerce: shop pages are never orphans, products are not called orphans
 *   G  DISABLE_WP_CRON: "Scan now" runs nothing itself, and a stalled scan reads "paused"
 *   H  2,000 posts: no batch exceeds its budget
 *   I  Wordfence at its strictest 404 limit does not block the site's own server
 *   J  uninstall removes the table, the options and the schedule
 */

import { execFileSync } from 'node:child_process'
import { cliContainer, wpContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const MARK = `rx-p2-${Date.now()}`
let pass = 0
let fail = 0
let notRun = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const skip = (m) => { console.log(`  NOT RUN  ${m}`); notRun++ }
const check = (cond, m) => (cond ? ok(m) : bad(m))

const env = { ...process.env, MSYS_NO_PATHCONV: '1' }
const wp = (...args) => execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', stdio: 'pipe', env, maxBuffer: 64 * 1024 * 1024 }).trim()
const wpSoft = (...args) => { try { return wp(...args) } catch { return null } }
const evalPhp = (code) => wp('eval', code)
const evalJson = (code) => JSON.parse(evalPhp(code))
const inWeb = (...cmd) => execFileSync('docker', ['exec', wpContainer(), ...cmd], { encoding: 'utf8', stdio: 'pipe', env }).trim()

async function http(url, init = {}, attempt = 0) {
  try { return await fetch(url, init) } catch (e) {
    if (attempt >= 2) throw e
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    return http(url, init, attempt + 1)
  }
}
async function login() {
  const res = await http(`${BASE}/wp-login.php`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body: new URLSearchParams({ log: 'admin', pwd: 'password', 'wp-submit': 'Log In', testcookie: '1' }),
  })
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}
// Another plugin's activation (Rank Math, SEOPress) can send the NEXT admin request to
// its setup wizard once. Ask again if the answer was not our page.
async function checksPage(jar) {
  for (let i = 0; i < 3; i++) {
    const res = await http(`${BASE}/wp-admin/admin.php?page=rankxai-checks`, { headers: { Cookie: jar }, redirect: 'manual' })
    const body = await res.text()
    if (res.status === 200 && body.includes('rankxai-page')) return body
    console.log(`  (the checks page answered ${res.status} ${res.headers.get('location') ?? ''}; asking again)`)
  }
  return ''
}

// A scan run to the end in one CLI call, as WP-Cron would run it batch by batch.
const SCAN = `RankXAI_Scan::start(); $i = 0; while ( "done" !== RankXAI_Scan::state()["phase"] && $i++ < 400 ) { delete_transient( "rankxai_scan_lock" ); RankXAI_Scan::run(); }`
const FINDINGS = `$f = RankXAI_Scan::findings(); $t = function ( $l ) { return array_column( $l, "title" ); };
  echo json_encode( array( "status" => $f["status"], "links" => $f["links"], "broken" => array_column( $f["broken"], "path" ), "brokenSources" => array_map( function ( $b ) { return $b["sources"]; }, $f["broken"] ), "redirects" => $f["redirects"], "cnc" => $f["couldNotCheck"], "orphans" => $t( $f["orphans"] ), "weak" => $t( $f["weak"] ), "unlinked" => $t( $f["unlinkedPosts"] ), "missingAlt" => $f["missingAlt"], "emptyAlt" => $f["emptyAlt"], "types" => $f["types"], "slowest" => array( "collect" => isset( RankXAI_Scan::state()["slowestMs_collect"] ) ? RankXAI_Scan::state()["slowestMs_collect"] : 0, "confirm" => isset( RankXAI_Scan::state()["slowestMs_confirm"] ) ? RankXAI_Scan::state()["slowestMs_confirm"] : 0 ) ) );`
const scanAndRead = () => evalJson(`${SCAN} ${FINDINGS}`)
const read = () => evalJson(FINDINGS)

async function run() {
  const theme = wp('theme', 'list', '--status=active', '--field=name')
  const plugins = (wpSoft('plugin', 'list', '--status=active', '--field=name') ?? '').split('\n').filter(Boolean)
  const savedOptions = Object.fromEntries(['rankxai_redirects', 'rankxai_scan_state', 'surerank_settings', 'rankxai_probe_block_loopback', 'rankxai_probe_disable_cron', 'nav_menu_locations', 'rankxai_probe_footer_link', 'rankxai_probe_form_type', 'rankxai_probe_rm_exclude'].map((o) => [o, wpSoft('option', 'get', o, '--format=json')]))
  const created = { posts: [], terms: [], menus: [] }
  const jar = await login()

  try {
    // ── A ─────────────────────────────────────────────────────────────────
    console.log('\n== A  a classic-theme fixture ==')
    wp('theme', 'activate', 'twentytwentyone')
    const ids = evalJson(`
      $m = "${MARK}";
      $mk = function ( $title, $slug, $type = "page", $content = "" ) { return wp_insert_post( array( "post_title" => $title, "post_name" => $slug, "post_type" => $type, "post_status" => "publish", "post_content" => $content ) ); };
      $out = array();
      $out["target"]   = $mk( "$m target", "$m-target" );
      $out["orphan"]   = $mk( "$m orphan", "$m-orphan" );
      $out["weak"]     = $mk( "$m weak", "$m-weak" );
      $out["menuonly"] = $mk( "$m menuonly", "$m-menuonly" );
      $out["navonly"]  = $mk( "$m navonly", "$m-navonly" );
      $out["seopress"] = $mk( "$m noindex seopress", "$m-noindex-seopress" );
      update_post_meta( $out["seopress"], "_seopress_robots_index", "yes" );
      $out["aioseo"]   = $mk( "$m noindex aioseo", "$m-noindex-aioseo" );
      $out["surerank"] = $mk( "$m noindex surerank", "$m-noindex-surerank" );
      $out["lonely"]   = $mk( "$m lonely post", "$m-lonely", "post" );
      $term = wp_insert_term( "$m-cat", "category", array( "slug" => "$m-cat" ) );
      $out["term"] = $term["term_id"];
      $out["incat"] = $mk( "$m in cat", "$m-in-cat", "post" );
      wp_set_post_categories( $out["incat"], array( $term["term_id"] ) );
      $up = wp_upload_dir();
      $out["upSub"] = $up["subdir"];
      RankXAI_Redirects::create( "own_store", "/$m-old/", "/$m-target/", 301 );
      $img = $up["baseurl"] . "/" . ltrim( $up["subdir"], "/" ) . "/$m-300x200.jpg";
      $hub = "<p><a href=\\"/$m-missing/\\">gone</a> <a href=\\"/category/$m-cat/\\">cat</a> [rankxai_link to=\\"/$m-target/\\"]target[/rankxai_link] <a href=\\"/$m-weak/\\">weak</a> <a href=\\"$img\\">file</a> <a href=\\"/$m-old/\\">old</a> <a href=\\"https://example.com/elsewhere\\">external</a> <a href=\\"#top\\">top</a></p><img src=\\"$img\\"><img src=\\"$img\\" alt=\\"\\">";
      $out["hub"] = $mk( "$m hub", "$m-hub", "page", $hub );
      $menu = wp_create_nav_menu( "$m menu" );
      $out["menu"] = $menu;
      foreach ( array( "hub", "menuonly" ) as $k ) { wp_update_nav_menu_item( $menu, 0, array( "menu-item-object-id" => $out[ $k ], "menu-item-object" => "page", "menu-item-type" => "post_type", "menu-item-status" => "publish" ) ); }
      set_theme_mod( "nav_menu_locations", array( "primary" => $menu ) );
      $out["nav"] = wp_insert_post( array( "post_type" => "wp_navigation", "post_status" => "publish", "post_title" => "$m nav", "post_content" => "<!-- wp:navigation-link {\\"label\\":\\"navonly\\",\\"url\\":\\"/$m-navonly/\\"} /-->" ) );
      echo json_encode( $out );`)
    created.posts.push(...['target', 'orphan', 'weak', 'menuonly', 'navonly', 'seopress', 'aioseo', 'surerank', 'lonely', 'incat', 'hub', 'nav'].map((k) => ids[k]))
    created.terms.push(ids.term)
    created.menus.push(ids.menu)
    inWeb('sh', '-c', `mkdir -p /var/www/html/wp-content/uploads${ids.upSub} && printf 'x' > /var/www/html/wp-content/uploads${ids.upSub}/${MARK}-300x200.jpg && chown -R 33:33 /var/www/html/wp-content/uploads`)

    const a = scanAndRead()
    check(a.status === 'done', `CONTROL — the scan finished (${a.status}, ${a.links} links)`)
    check(a.broken.includes(`/${MARK}-missing/`), 'a link to a missing page is "broken"')
    const brokenIdx = a.broken.indexOf(`/${MARK}-missing/`)
    check(brokenIdx >= 0 && a.brokenSources[brokenIdx].includes(ids.hub), 'and names the page that links to it')
    check(!a.broken.some((p) => p.includes(`/category/${MARK}-cat`)), 'an archive url_to_postid cannot resolve is not broken (the loopback found it)')
    check(!a.broken.some((p) => p.includes('300x200')), 'a resized upload that exists on disk is not broken')
    const red = a.redirects.find((r) => r.path === `/${MARK}-old/`)
    check(red && red.final.includes(`/${MARK}-target`), `a link through a redirect is listed, with its final page (${red?.final})`)
    check(a.broken.length === 1, `nothing else is called broken (${a.broken.join(', ')})`)
    const edges = evalJson(`global $wpdb; echo json_encode( $wpdb->get_col( "SELECT to_path FROM {$wpdb->prefix}rankxai_links WHERE from_id = ${ids.hub} AND from_kind = 'post'" ) );`)
    check(edges.some((p) => p.startsWith(`/${MARK}-target`)), 'a link that exists only after rendering (a shortcode) is seen')
    check(!edges.some((p) => /example\.com|#top/.test(p)), 'external links and in-page anchors are not stored')
    check(a.orphans.includes(`${MARK} orphan`), 'a page with no links is an orphan')
    check(a.orphans.includes(`${MARK} navonly`), 'a page linked only from an UNUSED navigation post on a classic theme is still an orphan')
    check(!a.orphans.includes(`${MARK} menuonly`) && !a.orphans.includes(`${MARK} hub`), 'a page in a menu is not an orphan')
    check(!a.orphans.includes(`${MARK} noindex seopress`), 'a page noindexed in SEOPress is not listed')
    check(a.weak.includes(`${MARK} weak`), 'a page with one link is "weakly linked"')
    check(!a.orphans.includes(`${MARK} target`), 'the page linked by the shortcode is not an orphan')
    check(a.unlinked.includes(`${MARK} lonely post`) && !a.orphans.includes(`${MARK} lonely post`), 'a post with no links is "no links from your other pages", never an orphan')
    check(a.missingAlt.some((m) => m.id === ids.hub && m.missing === 1), 'an image with no alt attribute is a finding')
    check(a.emptyAlt >= 1, 'an image with alt="" is counted apart')

    // ── B ─────────────────────────────────────────────────────────────────
    console.log('\n== B  the page ==')
    const html = await checksPage(jar)
    if (!html.includes('Broken internal links')) console.log(`  (diagnostic) the page said: ${html.replace(/s+/g, ' ').slice(html.indexOf('rankxai-page'), html.indexOf('rankxai-page') + 600)}`)
    check(html.includes('Broken internal links') && html.includes(`<code>/${MARK}-missing/</code>`), 'the broken link is on the page')
    check(html.includes('name="action" value="rankxai_add_redirect"'), 'with an "Add redirect" form')
    check(html.includes('Links through a redirect') && html.includes('Point them straight at the final page'), 'the redirected link has its own card, worded as an improvement')
    check(html.includes('No links to these pages were found in your content or menus.'), 'orphans are worded as "no links we could see"')
    check(html.includes('Archives and the shop still list these'), 'posts are never called orphans')
    check(html.includes('That is right for a decorative image') && !/rankxai-chip--danger[^<]*<\/span>[^<]*empty/i.test(html), 'empty alt text is explained, not shown as a failure')
    check(html.includes('What a site check covers') && html.includes('Does not see'), 'the page says what the check could not see')
    check(html.includes('Link to it from a related page'), 'orphans offer a structural "fix it yourself"')

    // ── C ─────────────────────────────────────────────────────────────────
    console.log('\n== C  noindex through three SEO plugins ==')
    wp('plugin', 'activate', 'all-in-one-seo-pack')
    check(read().orphans.includes(`${MARK} noindex aioseo`), 'CONTROL — with All in One SEO active and the page on its default, it is listed')
    evalPhp(`$p = \\AIOSEO\\Plugin\\Common\\Models\\Post::getPost( ${ids.aioseo} ); $p->post_id = ${ids.aioseo}; $p->robots_default = false; $p->robots_noindex = true; $p->save();`)
    check(!read().orphans.includes(`${MARK} noindex aioseo`), 'marked noindex in All in One SEO (its own table), it is not listed')
    wp('plugin', 'deactivate', 'all-in-one-seo-pack')
    wp('plugin', 'activate', 'surerank')
    check(read().orphans.includes(`${MARK} noindex surerank`), 'CONTROL — with SureRank active and nothing set, the page is listed')
    evalPhp(`update_post_meta( ${ids.surerank}, "surerank_settings_post_no_index", "yes" );`)
    check(!read().orphans.includes(`${MARK} noindex surerank`), 'marked noindex in SureRank, it is not listed')
    evalPhp('$s = get_option( "surerank_settings", array() ); $s = is_array( $s ) ? $s : array(); $s["no_index"] = array( "post" ); update_option( "surerank_settings", $s );')
    check(!read().unlinked.includes(`${MARK} lonely post`), 'a type SureRank noindexes by default (no per-post value) is not listed either')
    wp('plugin', 'deactivate', 'surerank')

    // ── D ─────────────────────────────────────────────────────────────────
    console.log('\n== D  a block theme ==')
    wp('theme', 'activate', 'twentytwentyfive')
    const d = scanAndRead()
    check(!d.orphans.includes(`${MARK} navonly`), 'on a block theme, a page linked from the navigation is not an orphan')
    wp('theme', 'activate', 'twentytwentyone')

    // ── E ─────────────────────────────────────────────────────────────────
    console.log('\n== E  loopback blocked ==')
    wp('option', 'update', 'rankxai_probe_block_loopback', '1')
    const e = scanAndRead()
    wpSoft('option', 'delete', 'rankxai_probe_block_loopback')
    check(e.broken.length === 0, `with this site unable to ask itself, nothing is called broken (${e.broken.join(', ') || 'none'})`)
    check(e.cnc >= 2, `and the unresolved links read "could not check" (${e.cnc})`)
    const eHtml = await checksPage(jar)
    check(eHtml.includes('could not be checked') && eHtml.includes('not counted as broken'), 'the page says so')

    // ── F ─────────────────────────────────────────────────────────────────
    console.log('\n== F  WooCommerce ==')
    if (process.env.RANKXAI_SKIP_WOO) {
      skip('WooCommerce (RANKXAI_SKIP_WOO set)')
    } else {
      if (wpSoft('plugin', 'is-installed', 'woocommerce') === null) wp('plugin', 'install', 'woocommerce')
      wp('plugin', 'activate', 'woocommerce')
      evalPhp('if ( class_exists( "WC_Install" ) ) { WC_Install::create_pages(); }')
      const product = Number(evalPhp(`echo wp_insert_post( array( "post_title" => "${MARK} product", "post_type" => "product", "post_status" => "publish" ) );`))
      created.posts.push(product)
      const woo = evalJson(`echo json_encode( array_map( "wc_get_page_id", array( "shop", "cart", "checkout", "myaccount" ) ) );`)
      const f = scanAndRead()
      const wooTitles = evalJson(`echo json_encode( array_map( "get_the_title", ${JSON.stringify(woo)} ) );`)
      check(woo.every((id) => id > 0), `CONTROL — WooCommerce created its pages (${wooTitles.join(', ')})`)
      check(f.types.includes('product'), 'products are scanned')
      check(!wooTitles.some((t) => f.orphans.includes(t) || f.weak.includes(t)), 'the shop, cart, checkout and account pages are never listed')
      check(f.unlinked.includes(`${MARK} product`) && !f.orphans.includes(`${MARK} product`), `a product with no links is advice, not an orphan (unlinked: ${f.unlinked.filter((t) => t.includes(MARK)).join(', ') || 'none'})`)
      if (!f.unlinked.includes(`${MARK} product`)) console.log(`  (diagnostic) ${evalPhp(`global $wpdb; echo json_encode( array( 'self' => $wpdb->get_row( "SELECT * FROM {$wpdb->prefix}rankxai_links WHERE from_kind = 'self' AND from_id = ${product}", ARRAY_A ), 'inbound' => $wpdb->get_results( "SELECT from_id, from_kind, to_path FROM {$wpdb->prefix}rankxai_links WHERE target_id = ${product} AND from_kind <> 'self'", ARRAY_A ), 'noindex' => RankXAI_Twins::is_noindexed( ${product} ) ) );`)}`)
      wp('plugin', 'deactivate', 'woocommerce')
      created.posts.push(...woo)
    }

    // ── G ─────────────────────────────────────────────────────────────────
    console.log('\n== G  DISABLE_WP_CRON ==')
    wp('option', 'update', 'rankxai_probe_disable_cron', '1')
    const before = await checksPage(jar)
    const nonce = /name="action" value="rankxai_scan_now"[^]*?name="_wpnonce" value="([a-f0-9]+)"/.exec(before)?.[1] ?? ''
    const res = await http(`${BASE}/wp-admin/admin-post.php`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar }, body: new URLSearchParams({ action: 'rankxai_scan_now', _wpnonce: nonce }) })
    check(res.status === 302, `"Scan now" accepts the request (${res.status})`)
    await new Promise((r) => setTimeout(r, 4000))
    const g = evalJson('echo json_encode( RankXAI_Scan::state() );')
    check(g.phase === 'collect' && g.scanned === 0 && g.lastBatch === '', 'with WP-Cron switched off, the request itself runs nothing')
    const gHtml = await checksPage(jar)
    check(gHtml.includes('DISABLE_WP_CRON'), 'the page names the reason it is waiting')
    evalPhp('$s = RankXAI_Scan::state(); $s["started"] = gmdate( "c", time() - 25 * HOUR_IN_SECONDS ); update_option( RankXAI_Scan::OPTION_STATE, $s, false );')
    const stalled = await checksPage(jar)
    check(stalled.includes('Paused:') && stalled.includes('scheduled tasks are not running'), 'after a day with no progress it reads "paused", never a spinner')
    wpSoft('option', 'delete', 'rankxai_probe_disable_cron')
    wpSoft('cron', 'event', 'delete', 'rankxai_scan_batch')

    // ── H ─────────────────────────────────────────────────────────────────
    console.log('\n== H  2,000 posts ==')
    if (process.env.RANKXAI_SKIP_BULK) {
      skip('2,000-post timing (RANKXAI_SKIP_BULK set)')
    } else {
      const content = `<p>Bulk ${MARK}. <a href="/${MARK}-target/">target</a> <a href="/${MARK}-bulk-missing/">gone</a></p>`.repeat(3)
      wp('post', 'generate', '--count=2000', '--post_type=post', `--post_title=${MARK} bulk`, `--post_content=${content}`)
      const t0 = Date.now()
      const h = scanAndRead()
      check(h.status === 'done', `the scan of about 2,000 posts finished (${Math.round((Date.now() - t0) / 1000)} s)`)
      // A reading batch may overrun its 2 s by one page render; a confirmation batch
      // by one loopback, which on this Docker rig takes several seconds (10 s timeout).
      check(h.slowest.collect > 0 && h.slowest.collect <= 3000, `no reading batch ran past its budget (slowest ${h.slowest.collect} ms against 2 s plus one render)`)
      check(h.slowest.confirm <= 12000, `no confirmation batch ran past its budget (slowest ${h.slowest.confirm} ms against 2 s plus one 10 s loopback)`)
      evalPhp(`global $wpdb; foreach ( $wpdb->get_col( "SELECT ID FROM {$wpdb->posts} WHERE post_title LIKE '${MARK} bulk%'" ) as $id ) { wp_delete_post( (int) $id, true ); }`)
      check(evalPhp(`global $wpdb; echo $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_title LIKE '${MARK} bulk%'" );`) === '0', 'cleanup — the 2,000 generated posts are gone')
    }

    // ── I ─────────────────────────────────────────────────────────────────
    console.log('\n== I  Wordfence ==')
    if (process.env.RANKXAI_SKIP_WORDFENCE) {
      skip('Wordfence (RANKXAI_SKIP_WORDFENCE set)')
    } else {
      await wordfence(jar, ids, created)
    }

    // ── K ─────────────────────────────────────────────────────────────────
    // Found on the first live scan (aiagencyplus.com, 2026-09-26): content
    // blocks and form posts were read as pages, and a footer made of content
    // blocks was invisible.
    console.log('\n== K  what a real site taught ==')
    wp('theme', 'activate', 'twentytwentyone')
    const orphanPath = `/${MARK}-orphan/`
    wp('option', 'update', 'rankxai_probe_form_type', '1')
    const formId = Number(evalPhp(`echo wp_insert_post( array( "post_title" => "${MARK} form", "post_type" => "rx_probe_form", "post_status" => "publish" ) );`))
    created.posts.push(formId)
    const coreTypes = JSON.parse(evalPhp('echo json_encode( RankXAI_Scan::post_types() );'))
    check(coreTypes.includes('rx_probe_block'), 'CONTROL — with no SEO plugin, a public type with an address is read (core lists it)')
    const k0 = scanAndRead()
    check(k0.orphans.includes(`${MARK} orphan`), 'CONTROL — with nothing in the footer, the page is an orphan')
    check(!k0.types.includes('rx_probe_form') && !k0.unlinked.includes(`${MARK} form`), 'a public type with no address of its own (a form) is not read as a page')
    wp('option', 'update', 'rankxai_probe_footer_link', orphanPath)
    const k1 = scanAndRead()
    check(evalPhp('echo RankXAI_Scan::findings()["chrome"];') === 'read', 'the home page\'s header and footer were read')
    check(!k1.orphans.includes(`${MARK} orphan`) && !k1.weak.includes(`${MARK} orphan`), 'a page linked only from the site-wide footer is not an orphan')
    const kPage = await checksPage(jar)
    check(kPage.includes('the header, footer and menus of your home page'), 'the page says it read them')
    wp('option', 'update', 'rankxai_probe_block_loopback', '1')
    scanAndRead()
    check(evalPhp('echo RankXAI_Scan::findings()["chrome"];') === 'could_not_read', 'with the site unable to ask itself, the header and footer are "could not read"')
    check((await checksPage(jar)).includes('Could not read the header and footer of your home page'), 'and the page says a page linked only from there may be listed')
    wpSoft('option', 'delete', 'rankxai_probe_block_loopback')
    // A broken link only in the site-wide header or footer (cfc.aiagencyplus.com,
    // 2026-09-26: a header button to a page that had moved) must say so, not
    // leave "Linked from" empty and tell the customer to edit a page.
    const footerMissing = `/${MARK}-footer-missing/`
    wp('option', 'update', 'rankxai_probe_footer_link', footerMissing)
    scanAndRead()
    const fb = evalJson(`$hit = null; foreach ( RankXAI_Scan::findings()["broken"] as $b ) { if ( "${footerMissing}" === $b["path"] ) { $hit = $b; } } echo json_encode( $hit );`)
    check(fb !== null, `CONTROL — a footer link to a missing page is reported broken (${JSON.stringify(fb)})`)
    check(fb && fb.chrome === true && fb.sources.length === 0 && fb.menus.length === 0, 'it is recorded as the header or footer, with no page and no menu')
    const fr = evalJson(`wp_set_current_user( 1 ); $d = rest_do_request( new WP_REST_Request( "GET", "/rankxai/v1/checks" ) )->get_data(); $hit = null; foreach ( $d["broken"] as $b ) { if ( "${footerMissing}" === $b["path"] ) { $hit = $b; } } echo json_encode( array( "item" => $hit, "hf" => $d["scan"]["headerFooter"] ) );`)
    check(fr.item && fr.item.inHeaderFooter === true && fr.item.inMenu === false && fr.item.sources.length === 0 && fr.hf === 'read', `the checks endpoint says so too (${JSON.stringify(fr)})`)
    const fPage = await checksPage(jar)
    check(fPage.includes('The header or footer on every page') && fPage.includes('Change the link in your site&#039;s header or footer'), 'the page names the header or footer and says where to change it')
    wpSoft('option', 'delete', 'rankxai_probe_footer_link')
    if (wpSoft('plugin', 'is-installed', 'seo-by-rank-math') !== null) {
      const rmSaved = ['rank_math_modules', 'rank-math-options-sitemap'].map((o) => [o, wpSoft('option', 'get', o, '--format=json')])
      wp('plugin', 'activate', 'seo-by-rank-math')
      evalPhp('$m = (array) get_option( "rank_math_modules", array() ); if ( ! in_array( "sitemap", $m, true ) ) { $m[] = "sitemap"; update_option( "rank_math_modules", $m ); } $s = (array) get_option( "rank-math-options-sitemap", array() ); $s["pt_post_sitemap"] = "on"; $s["pt_page_sitemap"] = "on"; unset( $s["pt_rx_probe_form_sitemap"] ); update_option( "rank-math-options-sitemap", $s );')
      const rmTypes = JSON.parse(evalPhp('echo json_encode( RankXAI_Scan::post_types() );'))
      const rmOn = JSON.parse(evalPhp('$s = (array) get_option( "rank-math-options-sitemap" ); $on = array(); foreach ( $s as $k => $v ) { if ( "on" === $v && preg_match( "/^pt_(.+)_sitemap$/", $k, $m ) ) { $on[] = $m[1]; } } echo json_encode( $on );'))
      check(!rmTypes.includes('rx_probe_block') && rmTypes.every((t) => rmOn.includes(t)), `with Rank Math's sitemap on, only the types it lists "on" are read (${rmTypes.join(', ')}); a type it has no setting for is not`)
      // aiagencyplus.com, 2026-09-26: Content Blocks had Rank Math's setting on,
      // but another plugin dropped them through Rank Math's filter, so its
      // sitemap never listed them. What counts is what Rank Math's index lists.
      const blockId = Number(evalPhp(`echo wp_insert_post( array( "post_title" => "${MARK} block", "post_type" => "rx_probe_block", "post_status" => "publish" ) );`))
      created.posts.push(blockId)
      evalPhp('$s = (array) get_option( "rank-math-options-sitemap", array() ); $s["pt_rx_probe_block_sitemap"] = "on"; update_option( "rank-math-options-sitemap", $s );')
      const rmOnTypes = JSON.parse(evalPhp('echo json_encode( RankXAI_Scan::post_types() );'))
      check(rmOnTypes.includes('rx_probe_block'), `CONTROL — with Rank Math listing the type, it is read (${rmOnTypes.join(', ')})`)
      wp('option', 'update', 'rankxai_probe_rm_exclude', 'rx_probe_block')
      const rmFiltered = JSON.parse(evalPhp('echo json_encode( RankXAI_Scan::post_types() );'))
      const rmSetting = evalPhp('$s = (array) get_option( "rank-math-options-sitemap" ); echo isset( $s["pt_rx_probe_block_sitemap"] ) ? $s["pt_rx_probe_block_sitemap"] : "";')
      check(rmSetting === 'on' && !rmFiltered.includes('rx_probe_block') && rmFiltered.includes('post'), `with the setting still on but a filter dropping it from Rank Math's sitemap, it is not read (${rmFiltered.join(', ')})`)
      wpSoft('option', 'delete', 'rankxai_probe_rm_exclude')
      wp('plugin', 'deactivate', 'seo-by-rank-math')
      for (const [o, v] of rmSaved) { if (v === null) wpSoft('option', 'delete', o); else wpSoft('option', 'update', o, v, '--format=json') }
    } else {
      skip('Rank Math is not installed on this rig')
    }
    wpSoft('option', 'delete', 'rankxai_probe_form_type')

    // ── J ─────────────────────────────────────────────────────────────────
    console.log('\n== J  uninstall ==')
    evalPhp('define( "WP_UNINSTALL_PLUGIN", true ); include WP_PLUGIN_DIR . "/rankxai-wp-plugin/uninstall.php";')
    const j = evalJson('echo json_encode( array( "table" => RankXAI_Scan::table_exists(), "state" => get_option( RankXAI_Scan::OPTION_STATE, null ), "cron" => wp_next_scheduled( RankXAI_Scan::HOOK ), "weekly" => wp_next_scheduled( RankXAI_Scan::HOOK_WEEKLY ) ) );')
    check(j.table === false && j.state === null && j.cron === false && j.weekly === false, 'uninstall drops the link table, the scan state and both schedules')
  } finally {
    wpSoft('option', 'delete', 'rankxai_probe_block_loopback')
    wpSoft('option', 'delete', 'rankxai_probe_disable_cron')
    for (const [o, v] of Object.entries(savedOptions)) {
      if (v === null) wpSoft('option', 'delete', o)
      else wpSoft('option', 'update', o, v, '--format=json')
    }
    if (created.posts.length) wpSoft('post', 'delete', ...created.posts.filter(Boolean).map(String), '--force')
    for (const t of created.terms) wpSoft('term', 'delete', 'category', String(t))
    for (const m of created.menus) wpSoft('menu', 'delete', String(m))
    inWeb('sh', '-c', `rm -f /var/www/html/wp-content/uploads/*/*/${MARK}-300x200.jpg`)
    wpSoft('theme', 'activate', theme)
    const now = (wpSoft('plugin', 'list', '--status=active', '--field=name') ?? '').split('\n').filter(Boolean)
    const off = now.filter((p) => !plugins.includes(p))
    const on = plugins.filter((p) => !now.includes(p))
    if (off.length) wpSoft('plugin', 'deactivate', ...off)
    if (on.length) wpSoft('plugin', 'activate', ...on)
    const final = (wpSoft('plugin', 'list', '--status=active', '--field=name') ?? '').split('\n').filter(Boolean)
    check(JSON.stringify([...final].sort()) === JSON.stringify([...plugins].sort()) && wp('theme', 'list', '--status=active', '--field=name') === theme, 'cleanup — plugins and theme are as they were')
  }
}

/**
 * Wordfence exempts the server's own addresses from its 404 limit only while
 * WP-Cron runs. So: prove the limit is live with a burst from outside, then run a
 * scan full of broken links through real WP-Cron and confirm the server was not
 * blocked.
 */
async function wordfence(jar, ids, created) {
  if (wpSoft('plugin', 'is-installed', 'wordfence') === null) wp('plugin', 'install', 'wordfence')
  wp('plugin', 'activate', 'wordfence')
  try {
    evalPhp('wfConfig::set( "firewallEnabled", 1 ); wfConfig::set( "max404Crawlers", "5" ); wfConfig::set( "max404Crawlers_action", "block" ); wfConfig::set( "max404Humans", "5" ); wfConfig::set( "max404Humans_action", "block" ); wfConfig::set( "blockedTime", "300" ); wfConfig::set( "neverBlockBG", "neverBlockUA" );')
    // The control: 12 not-found requests from the host must be limited.
    let limited = false
    for (let i = 0; i < 12; i++) {
      const r = await http(`${BASE}/${MARK}-wf-control-${i}/`, { headers: { 'User-Agent': 'Mozilla/5.0 probe' } })
      if (r.status === 503 || r.status === 403) limited = true
    }
    if (!limited) {
      skip('Wordfence did not limit a burst of 12 not-found requests: every request on wp-env comes from a private Docker address, which Wordfence exempts by default, so the check below would prove nothing here')
      return
    }
    ok('CONTROL — Wordfence limits a burst of not-found requests from outside')
    evalPhp('global $wpdb; foreach ( array( "wfblocks7", "wfBlocks7" ) as $t ) { $wpdb->query( "DELETE FROM {$wpdb->prefix}$t" ); }')
    const links = Array.from({ length: 25 }, (_, i) => `<a href="/${MARK}-wf-gone-${i}/">x</a>`).join(' ')
    const page = Number(evalPhp(`echo wp_insert_post( array( "post_title" => "${MARK} wf", "post_type" => "page", "post_status" => "publish", "post_content" => ${JSON.stringify(links)} ) );`))
    created.posts.push(page)
    evalPhp('RankXAI_Scan::start();')
    for (let i = 0; i < 40; i++) {
      await http(`${BASE}/wp-cron.php?doing_wp_cron=${Date.now()}`)
      if (evalPhp('echo RankXAI_Scan::state()["phase"];') === 'done') break
      await new Promise((r) => setTimeout(r, 1500))
    }
    const w = read()
    const blocks = Number(evalPhp('global $wpdb; $n = 0; foreach ( array( "wfblocks7", "wfBlocks7" ) as $t ) { $n += (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}$t" ); } echo $n;'))
    check(w.status === 'done' && w.broken.filter((p) => p.includes('-wf-gone-')).length === 25, `the scan, run through real WP-Cron, confirmed all 25 broken links (${w.broken.filter((p) => p.includes('-wf-gone-')).length})`)
    check(blocks === 0, `and Wordfence blocked nobody (${blocks} block rows)`)
  } finally {
    wpSoft('plugin', 'deactivate', 'wordfence')
  }
}

run()
  .catch((e) => { console.error(e); fail++ })
  .finally(() => {
    console.log('\n================================================')
    console.log(`PASSED ${pass}   FAILED ${fail}${notRun ? `   NOT RUN ${notRun}` : ''}`)
    process.exit(fail > 0 ? 1 : 0)
  })
