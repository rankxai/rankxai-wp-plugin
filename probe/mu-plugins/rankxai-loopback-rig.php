<?php
/**
 * Lets this wp-env site request itself. Probe only, never shipped.
 *
 * Inside the container localhost:8888 reaches nothing, so requests to it, and to
 * the tunnel host in `rankxai_probe_loopback_host`, go to the container's own web
 * server with the Host header kept. `rankxai_probe_block_loopback` makes them fail.
 *
 * @package RankXAI
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_filter(
	'pre_http_request',
	function ( $pre, $args, $url ) {
		if ( false !== $pre ) {
			return $pre;
		}
		$url    = (string) $url;
		$tunnel = (string) get_option( 'rankxai_probe_loopback_host', '' );
		$prefix = '';
		$host   = '';
		if ( 0 === strpos( $url, 'http://localhost:8888' ) ) {
			$prefix = 'http://localhost:8888';
			$host   = 'localhost:8888';
		} elseif ( '' !== $tunnel && 0 === strpos( $url, 'https://' . $tunnel ) ) {
			$prefix                                = 'https://' . $tunnel;
			$host                                  = $tunnel;
			$args['headers']['X-Forwarded-Proto'] = 'https';
		} else {
			return $pre;
		}
		if ( get_option( 'rankxai_probe_block_loopback' ) ) {
			return new WP_Error( 'http_request_failed', 'cURL error 7: Failed to connect (blocked by the probe)' );
		}
		$args['headers']['Host']    = $host;
		$args['reject_unsafe_urls'] = false;
		return wp_remote_request( 'http://wordpress' . substr( $url, strlen( $prefix ) ), $args );
	},
	1,
	3
);
