<?php
/**
 * Plugin Name: RankX AI cache witness (probe only)
 * Description: Records whether DONOTCACHEPAGE was defined by the end of a request, so the never-cache filter can be proven rather than asserted. NEVER SHIPPED — this lives under probe/ and is export-ignored.
 *
 * ── WHY A WITNESS AND NOT AN ASSERTION ──────────────────────────────────────
 *
 * The defect this proves was measured on a LIVE site running LiteSpeed Cache:
 * `GET /?rest_route=/rankxai/v1/twins` answered `X-LiteSpeed-Cache: hit` on
 * every call, including straight after a PUT that had switched markdown copies
 * on — so the platform read `enabled: false` for ever while the site served
 * them. WordPress's own `Cache-Control: no-store, private` did not stop it;
 * `DONOTCACHEPAGE` is the constant every major page cache actually reads.
 *
 * wp-env runs no page cache, so there is nothing here to observe the EFFECT of
 * the fix. What can be observed is the CAUSE: whether the constant is defined,
 * for our namespace and not for anybody else's. Without this the fix would be a
 * line of code nobody had ever seen run.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

add_action(
	'shutdown',
	function () {
		if ( ! isset( $_SERVER['REQUEST_URI'] ) ) {
			return;
		}
		$uri = (string) wp_unslash( $_SERVER['REQUEST_URI'] );
		if ( false === strpos( $uri, 'rest_route' ) && false === strpos( $uri, '/wp-json/' ) ) {
			return;
		}
		update_option(
			'rankxai_cache_witness',
			array(
				'uri'     => $uri,
				'nocache' => defined( 'DONOTCACHEPAGE' ) && DONOTCACHEPAGE,
			),
			false
		);
	},
	1
);
