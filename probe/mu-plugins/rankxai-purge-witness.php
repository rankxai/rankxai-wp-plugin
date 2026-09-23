<?php
/**
 * Plugin Name: RankX AI purge witness (probe only)
 * Description: Pretends to be LiteSpeed Cache when an option asks it to, and records every purge request it receives. NEVER SHIPPED — this lives under probe/ and is export-ignored.
 *
 * wp-env runs no page cache, so a purge has no effect to observe. What can be
 * observed is that the plugin ASKED, with the right URL, through the hook the
 * real cache listens on. Off unless `rankxai_probe_fake_litespeed` is set, so
 * no other probe sees a cache that is not there.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

if ( get_option( 'rankxai_probe_fake_litespeed' ) && ! defined( 'LSCWP_V' ) ) {
	define( 'LSCWP_V', 'probe' );
	add_action(
		'litespeed_purge_url',
		function ( $url ) {
			$seen   = get_option( 'rankxai_probe_purged', array() );
			$seen   = is_array( $seen ) ? $seen : array();
			$seen[] = (string) $url;
			update_option( 'rankxai_probe_purged', $seen, false );
		}
	);
}
