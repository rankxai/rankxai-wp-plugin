<?php
/**
 * Rig-only: lets this wp-env site request itself.
 *
 * wp-env's home URL is http://localhost:8888, the port Docker publishes on the
 * host. Inside the container that address is nobody, so every loopback would
 * fail and every site check would read "could not check". This rewrites a
 * request to that address to the container's own web server, keeping the Host
 * header, which is what a real site's loopback reaches anyway.
 *
 * While a harness points the site at a public tunnel (WP_HOME), the option
 * `rankxai_probe_loopback_host` names the tunnel's host, and a request to it is
 * routed to the same web server with `X-Forwarded-Proto: https`: the site's
 * own checks then take the direct path a real server's loopback takes, not a
 * round trip through the tunnel.
 *
 * Switched off, to prove the "loopback blocked" path, by the option
 * `rankxai_probe_block_loopback`.
 *
 * NOT shipped. Lives under probe/ and is mapped into wp-env only.
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
