#!/usr/bin/env node
/**
 * Checks that the local product check covers every published product, keeps
 * itself up to date as products change, and lists every product with a gap.
 *
 * Run: npx wp-env start, then node probe/verify-product-check.mjs
 */
import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const COUNT = 610
const env = { ...process.env, MSYS_NO_PATHCONV: '1' }
const wp = (...args) => execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], { encoding: 'utf8', env, maxBuffer: 16 * 1024 * 1024 }).trim()
const php = (code) => wp('eval', code)
const json = (code) => JSON.parse(php(code))

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const RESULT = 'echo wp_json_encode( array_diff_key( RankXAI_Product_Check::result(), array( "products" => 1 ) ) );'
const UNTIL_DONE = `for ( $i = 0; $i < 200; $i++ ) { $s = get_option( RankXAI_Product_Check::OPTION ); if ( ! empty( $s['done'] ) ) { break; } do_action( RankXAI_Product_Check::HOOK ); }`
const GAPS = (id) => `$s = get_option( RankXAI_Product_Check::OPTION ); echo wp_json_encode( isset( $s['masks'][${id}] ) ? $s['masks'][${id}] : null );`

async function storePage(cookie, query = '') {
  const res = await fetch(`${BASE}/wp-admin/admin.php?page=rankxai-store${query}`, { headers: { Cookie: cookie } })
  return res.text()
}

async function login() {
  const res = await fetch(`${BASE}/wp-login.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body: new URLSearchParams({ log: 'admin', pwd: 'password', testcookie: '1' }),
  })
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

console.log(`Creating ${COUNT} products`)
php(`for ( $i = 0; $i < ${COUNT}; $i++ ) { $p = new WC_Product_Simple(); $p->set_name( 'Check probe ' . $i ); $p->set_status( 'publish' ); $p->set_regular_price( '10' ); $p->update_meta_data( '_rankxai_check_probe', 1 ); $p->save(); }`)
const ids = json(`echo wp_json_encode( get_posts( array( 'post_type' => 'product', 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => -1, 'meta_key' => '_rankxai_check_probe', 'orderby' => 'ID', 'order' => 'ASC' ) ) );`)

try {
  console.log('Every product')
  php('delete_option( RankXAI_Product_Check::OPTION ); wp_clear_scheduled_hook( RankXAI_Product_Check::HOOK );')
  const first = json(RESULT)
  check('a first page load starts the check', first.checked > 0, `${first.checked} checked so far, done=${first.done}`)
  if (!first.done) check('and continues it in the background', php('echo wp_next_scheduled( RankXAI_Product_Check::HOOK ) ? "yes" : "no";') === 'yes')
  php(UNTIL_DONE)
  const all = json(RESULT)
  check('it finishes', all.done === true)
  check('every published product is checked, past the old 500 cap', all.checked === all.total && all.total >= COUNT, `${all.checked} of ${all.total}`)
  check('each probe product is missing a description', all.counts.description >= COUNT, String(all.counts.description))

  console.log('Kept up to date')
  const target = ids[5]
  const before = json(GAPS(target))
  php(`$p = wc_get_product( ${target} ); $p->set_description( str_repeat( 'A clear sentence about this product. ', 12 ) ); $p->save();`)
  const after = json(GAPS(target))
  check('saving a product checks it again', before !== null && after !== null && after < before, `${before} -> ${after}`)
  check('its description gap is gone', json(RESULT).counts.description === all.counts.description - 1)
  php(`wp_trash_post( ${ids[6]} );`)
  check('a trashed product leaves the result', json(GAPS(ids[6])) === null)
  const media = php(`$a = wp_insert_attachment( array( 'post_title' => 'check probe image', 'post_mime_type' => 'image/png', 'post_status' => 'inherit' ) ); update_post_meta( $a, '_rankxai_check_probe', 1 ); $p = wc_get_product( ${ids[7]} ); $p->set_image_id( $a ); $p->save(); echo $a;`)
  const withImage = json(GAPS(ids[7]))
  php(`update_post_meta( ${media}, '_wp_attachment_image_alt', 'A probe image' );`)
  const withAlt = json(GAPS(ids[7]))
  check('changing an image’s alt text checks the products that use it', withImage !== null && withAlt < withImage, `${withImage} -> ${withAlt}`)

  console.log('The Store page')
  const cookie = await login()
  const page1 = await storePage(cookie)
  check('no "connect to check every product" line', !page1.includes('Connecting RankX AI checks every product'))
  check('it says every product was checked', page1.includes('Every product was checked'))
  check('it lists products with something missing', page1.includes('Products with something missing') && page1.includes('Check probe'))
  const pages = Number((page1.match(/Page 1 of (\d+)/) ?? [])[1] ?? 0)
  check('the list is paged, not cut off', pages >= Math.ceil(COUNT / 25), `${pages} pages`)
  const last = await storePage(cookie, `&rankxai-page=${pages}`)
  check('the last page shows products too', last.includes(`Page ${pages} of ${pages}`) && last.includes('Check probe'))
  const filtered = await storePage(cookie, '&rankxai-missing=image')
  check('a filter lists only that gap', filtered.includes('aria-current="true">Main image'))
} finally {
  php(`foreach ( get_posts( array( 'post_type' => array( 'product', 'attachment' ), 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => -1, 'meta_key' => '_rankxai_check_probe' ) ) as $id ) { wp_delete_post( $id, true ); }`)
  php('delete_option( RankXAI_Product_Check::OPTION ); wp_clear_scheduled_hook( RankXAI_Product_Check::HOOK );')
}

console.log(`\nPASSED ${pass}   FAILED ${fail}`)
process.exit(fail ? 1 : 0)
