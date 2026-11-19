<?php
/**
 * Plugin Name: RankX AI purge witness (probe only)
 * Description: Pretends to be LiteSpeed Cache when an option asks it to, and records every purge request it receives. Probe only, never shipped.
 *
 * wp-env has no page cache, so this records the purge URLs the plugin sends
 * instead. Off unless `rankxai_probe_fake_litespeed` is set.
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
