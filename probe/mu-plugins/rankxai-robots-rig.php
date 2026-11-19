<?php
/**
 * Serves the text in `rankxai_probe_robots` as robots.txt through core's
 * `robots_txt` filter, as an SEO plugin would. Probe only, never shipped.
 *
 * @package RankXAI
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_filter(
	'robots_txt',
	function ( $output ) {
		$chosen = get_option( 'rankxai_probe_robots' );
		return is_string( $chosen ) && '' !== $chosen ? $chosen : $output;
	},
	99
);
