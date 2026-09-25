<?php
/**
 * Rig-only: serve a chosen robots.txt through core's own virtual file.
 *
 * When the option `rankxai_probe_robots` holds text, core's `robots_txt` filter
 * returns it, which is exactly how an SEO plugin's virtual robots.txt reaches a
 * visitor. Inert while the option is unset.
 *
 * NOT shipped. Lives under probe/ and is mapped into wp-env only.
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
