<?php
/**
 * Plugin Name: RankX AI cache witness (probe only)
 * Description: Records whether DONOTCACHEPAGE was defined by the end of a REST request. Probe only, never shipped.
 *
 * Page caches such as LiteSpeed ignore WordPress's no-store header but honour
 * DONOTCACHEPAGE. wp-env has no page cache, so this records the constant instead.
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
