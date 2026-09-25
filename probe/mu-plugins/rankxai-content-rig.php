<?php
/**
 * Rig-only content fixtures for the site-check and View-as-AI probes.
 *
 *   [rankxai_link to="/x/"]text[/rankxai_link]  a link that exists only once
 *                                               the content is rendered
 *   [rankxai_js_body]text[/rankxai_js_body]     text the server never sends:
 *                                               a script writes it in the browser
 *
 * While `rankxai_probe_401` is set, the site's requests to itself answer 401,
 * as a staging site behind HTTP basic auth does.
 *
 * And, while the option `rankxai_probe_disable_cron` is set, WordPress's own
 * scheduler is switched off exactly as a site owner would switch it off.
 *
 * NOT shipped. Lives under probe/ and is mapped into wp-env only.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// A staging site behind HTTP basic auth: its own page requests answer 401.
if ( get_option( 'rankxai_probe_401' ) && isset( $_SERVER['HTTP_USER_AGENT'] ) && false !== strpos( (string) $_SERVER['HTTP_USER_AGENT'], 'RankXAI-SiteCheck' ) ) {
	header( 'WWW-Authenticate: Basic realm="staging"' );
	status_header( 401 );
	exit;
}

if ( get_option( 'rankxai_probe_disable_cron' ) && ! defined( 'DISABLE_WP_CRON' ) ) {
	define( 'DISABLE_WP_CRON', true );
}

add_shortcode(
	'rankxai_link',
	function ( $atts, $content = '' ) {
		$atts = shortcode_atts( array( 'to' => '/' ), $atts );
		return '<a href="' . esc_url( home_url( $atts['to'] ) ) . '">' . esc_html( $content ) . '</a>';
	}
);

add_shortcode(
	'rankxai_js_body',
	function ( $atts, $content = '' ) {
		return '<div id="rx-js-body"></div><script>document.getElementById("rx-js-body").textContent = atob("' . base64_encode( wp_strip_all_tags( $content ) ) . '");</script>';
	}
);
