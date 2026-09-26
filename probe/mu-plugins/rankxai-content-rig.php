<?php
/**
 * Rig-only content fixtures for the site-check and View-as-AI probes.
 *
 *   [rankxai_link to="/x/"]text[/rankxai_link]  a link that exists only once
 *                                               the content is rendered
 *   [rankxai_js_body]text[/rankxai_js_body]     text the server never sends:
 *                                               a script writes it in the browser
 *   [rankxai_greeting]                          "Hello <login>", or "Hello visitor"
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

// A link that exists only in the site-wide footer, as a theme's footer builder
// or a footer made of reusable blocks would print it.
add_action(
	'wp_footer',
	function () {
		$path = get_option( 'rankxai_probe_footer_link' );
		if ( is_string( $path ) && '' !== $path ) {
			echo '<footer class="rx-probe-footer"><a href="' . esc_url( home_url( $path ) ) . '">footer only</a></footer>';
		}
	}
);

// A public type with no address of its own, as a form plugin registers one.
add_action(
	'init',
	function () {
		if ( get_option( 'rankxai_probe_form_type' ) ) {
			register_post_type(
				'rx_probe_form',
				array(
					'public'  => true,
					'label'   => 'Probe forms',
					'rewrite' => false,
				)
			);
			// And one with an address, as a theme's content blocks have.
			register_post_type(
				'rx_probe_block',
				array(
					'public' => true,
					'label'  => 'Probe blocks',
				)
			);
		}
	}
);

// A plugin that drops a type from Rank Math's sitemap with the setting left on.
add_filter(
	'rank_math/sitemap/exclude_post_type',
	function ( $exclude, $type ) {
		return get_option( 'rankxai_probe_rm_exclude' ) === $type ? true : $exclude;
	},
	10,
	2
);

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

// Greets its reader, as a membership page does.
add_shortcode(
	'rankxai_greeting',
	function () {
		$user = wp_get_current_user();
		return '<p>' . esc_html( $user->exists() ? 'Hello ' . $user->user_login : 'Hello visitor' ) . '</p>';
	}
);

add_shortcode(
	'rankxai_js_body',
	function ( $atts, $content = '' ) {
		return '<div id="rx-js-body"></div><script>document.getElementById("rx-js-body").textContent = atob("' . base64_encode( wp_strip_all_tags( $content ) ) . '");</script>';
	}
);
