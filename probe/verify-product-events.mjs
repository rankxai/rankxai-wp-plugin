#!/usr/bin/env node
/**
 * Checks that a connected store reports product changes itself: what is queued,
 * what is sent and where, what happens when RankX AI cannot take it, and that the
 * WooCommerce webhooks earlier versions let RankX AI create are removed once.
 * Every outgoing request is intercepted; nothing leaves the machine.
 *
 * Run:  node probe/verify-product-events.mjs      (wp-env must be running)
 */

import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

let pass = 0
let fail = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m) => (cond ? ok(m) : bad(m))

function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  }).trim()
}
function wpSoft(...args) {
  try { return wp(...args) } catch { return null }
}
const evalJson = (code) => JSON.parse(wp('eval', code))

const TOKEN = `rxwp_${'P'.repeat(43)}`
const LINK = `update_option( 'rankxai_store_link', array( 'token' => '${TOKEN}', 'app_url' => 'https://app.rankxai.com' ), false );`
// Answers every outgoing request with `status`, and records what was asked.
const FAKE = (status) => `$GLOBALS['rx_sent'] = array(); add_filter( 'pre_http_request', function ( $pre, $args, $url ) { $GLOBALS['rx_sent'][] = array( 'url' => $url, 'auth' => isset( $args['headers']['Authorization'] ) ? $args['headers']['Authorization'] : '', 'body' => json_decode( (string) $args['body'], true ) ); return array( 'headers' => array(), 'body' => '{}', 'response' => array( 'code' => ${status}, 'message' => 'x' ), 'cookies' => array() ); }, 10, 3 );`
const STATE = `echo wp_json_encode( array( 'queue' => RankXAI_Product_Events::queued(), 'next' => (bool) wp_next_scheduled( RankXAI_Product_Events::HOOK ), 'sent' => isset( $GLOBALS['rx_sent'] ) ? $GLOBALS['rx_sent'] : array() ) );`

async function run() {
  const original = wpSoft('option', 'get', 'rankxai_store_link', '--format=json')
  const made = []
  try {
    wpSoft('option', 'delete', 'rankxai_store_link')
    wpSoft('option', 'delete', 'rankxai_product_events')
    wp('eval', "wp_clear_scheduled_hook( 'rankxai_send_product_events' );")

    console.log('\n== A  not connected: nothing is queued ==')
    const a = evalJson(`$p = new WC_Product_Simple(); $p->set_name( 'Events probe A' ); $p->set_status( 'publish' ); $id = $p->save(); ${STATE.replace("echo wp_json_encode( array(", "echo wp_json_encode( array( 'id' => $id,")}`)
    made.push(a.id)
    check(Array.isArray(a.queue) || Object.keys(a.queue).length === 0, `a product created on an unconnected store queues nothing (${JSON.stringify(a.queue)})`)
    check(a.next === false, 'and nothing is scheduled')

    console.log('\n== B  connected: each change is queued once, newest last ==')
    const b = evalJson(`${LINK} $p = new WC_Product_Simple(); $p->set_name( 'Events probe B' ); $p->set_status( 'publish' ); $id = $p->save(); $p->set_name( 'Events probe B2' ); $p->save(); $o = wc_get_product( ${a.id} ); $o->set_regular_price( '9' ); $o->save(); wp_trash_post( ${a.id} ); ${STATE.replace("echo wp_json_encode( array(", "echo wp_json_encode( array( 'id' => $id,")}`)
    made.push(b.id)
    check(b.queue[b.id] === 'product.created', `a product created and saved again in the same minute is still "created" (${b.queue[b.id]})`)
    check(b.queue[a.id] === 'product.deleted', `a product moved to the bin is "deleted" (${b.queue[a.id]})`)
    check(Object.keys(b.queue).length === 2, `one entry per product (${Object.keys(b.queue).length})`)
    check(b.next === true, 'the send is scheduled')
    const c = evalJson(`${LINK} wp_untrash_post( ${a.id} ); ${STATE}`)
    check(c.queue[a.id] === 'product.restored', `restored from the bin is "restored" (${c.queue[a.id]})`)

    console.log('\n== C  sent to RankX AI: IDs and events only ==')
    const d = evalJson(`${LINK} ${FAKE(200)} RankXAI_Product_Events::send(); ${STATE}`)
    const sent = d.sent[0] ?? {}
    check(d.sent.length === 1 && sent.url === 'https://app.rankxai.com/api/store-app/wp/product-events', `one request, to the product-events address (${sent.url})`)
    check(sent.auth === `Bearer ${TOKEN}`, 'with the site token')
    const keys = [...new Set((sent.body?.events ?? []).flatMap((e) => Object.keys(e)))].sort().join(',')
    check(keys === 'id,topic' && Object.keys(sent.body ?? {}).sort().join(',') === 'events,siteUrl', `carrying only the site address and each product's id and event (${keys})`)
    check(Object.keys(d.queue).length === 0, 'and the queue is empty after a 200')

    console.log('\n== D  RankX AI unavailable: kept and retried ==')
    const e = evalJson(`${LINK} RankXAI_Product_Events::queue( ${b.id}, 'product.updated' ); wp_clear_scheduled_hook( RankXAI_Product_Events::HOOK ); ${FAKE(503)} RankXAI_Product_Events::send(); ${STATE}`)
    check(e.queue[b.id] === 'product.updated' && e.next === true, 'a 503 keeps the change and schedules another try')
    const f = evalJson(`${LINK} ${FAKE(409)} RankXAI_Product_Events::send(); ${STATE}`)
    check(Object.keys(f.queue).length === 0, 'a refusal that will not change (409) is dropped, not retried for ever')
    const g = evalJson(`delete_option( 'rankxai_store_link' ); RankXAI_Product_Events::queue( ${b.id}, 'product.updated' ); update_option( RankXAI_Product_Events::OPTION, array( ${b.id} => 'product.updated' ), false ); ${FAKE(200)} RankXAI_Product_Events::send(); ${STATE}`)
    check(g.sent.length === 0 && Object.keys(g.queue).length === 0, 'once disconnected, nothing is sent and the queue is dropped')

    console.log('\n== E  the old webhooks are removed once ==')
    const h = evalJson(`$ours = new WC_Webhook(); $ours->set_name( 'RankX AI: product.updated' ); $ours->set_topic( 'product.updated' ); $ours->set_delivery_url( 'https://app.rankxai.com/api/webhooks/woocommerce?w=x' ); $ours->set_status( 'paused' ); $ours->save(); $other = new WC_Webhook(); $other->set_name( 'Someone else' ); $other->set_topic( 'product.updated' ); $other->set_delivery_url( 'https://example.com/hook' ); $other->set_status( 'paused' ); $other->save(); delete_option( RankXAI_Product_Events::OPTION_CLEANED ); wp_set_current_user( 1 ); RankXAI_Product_Events::remove_old_webhooks(); echo wp_json_encode( array( 'ours' => (bool) wc_get_webhook( $ours->get_id() ), 'other' => (bool) wc_get_webhook( $other->get_id() ), 'otherId' => $other->get_id(), 'flag' => get_option( RankXAI_Product_Events::OPTION_CLEANED ) ) );`)
    check(h.ours === false, 'the webhook delivering to RankX AI is removed')
    check(h.other === true, "someone else's webhook is left alone")
    check(String(h.flag) === '1', 'and it happens only once')
    wpSoft('eval', `$w = wc_get_webhook( ${h.otherId} ); if ( $w ) { $w->delete( true ); }`)
  } finally {
    for (const id of made) wpSoft('post', 'delete', String(id), '--force')
    wpSoft('option', 'delete', 'rankxai_product_events')
    wpSoft('eval', "wp_clear_scheduled_hook( 'rankxai_send_product_events' );")
    if (original === null) wpSoft('option', 'delete', 'rankxai_store_link')
    else wpSoft('option', 'update', 'rankxai_store_link', original, '--format=json')
  }
  const left = wpSoft('option', 'get', 'rankxai_product_events')
  check(left === null, 'CLEANUP — no queue left behind')

  console.log(`\n================================================\nPASSED ${pass}   FAILED ${fail}`)
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
