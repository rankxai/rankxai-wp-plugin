<?php
/**
 * Stands in for GitHub while the updater probe runs. NOT shipped.
 *
 * Inert unless the `rankxai_probe_updater` option is set, so the real GitHub
 * path is what runs the rest of the time. While set it answers the manifest
 * address from the option, serves the package address from a file in the
 * container, and counts each manifest request so caching can be measured.
 *
 * Option shape: { manifest: string|null, status: int, package_file: string, other_update: array|null }
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_filter(
	'pre_http_request',
	function ( $pre, $args, $url ) {
		$fixture = get_option( 'rankxai_probe_updater' );
		if ( ! is_array( $fixture ) ) {
			return $pre;
		}
		$manifest_url = 'https://github.com/rankxai/rankxai-wp-plugin/releases/latest/download/rankxai-update.json';
		$package_base = 'https://github.com/rankxai/rankxai-wp-plugin/releases/download/';

		if ( $url === $manifest_url ) {
			update_option( 'rankxai_probe_updater_hits', (int) get_option( 'rankxai_probe_updater_hits', 0 ) + 1 );
			update_option( 'rankxai_probe_updater_ua', isset( $args['user-agent'] ) ? $args['user-agent'] : '' );
			return array(
				'headers'  => array(),
				'body'     => (string) $fixture['manifest'],
				'response' => array( 'code' => (int) $fixture['status'], 'message' => 'fixture' ),
				'cookies'  => array(),
				'filename' => null,
			);
		}

		if ( 0 === strpos( $url, $package_base ) ) {
			update_option( 'rankxai_probe_updater_package_url', $url );
			if ( ! empty( $args['stream'] ) && ! empty( $args['filename'] ) ) {
				copy( $fixture['package_file'], $args['filename'] );
			}
			return array(
				'headers'  => array(),
				'body'     => '',
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'cookies'  => array(),
				'filename' => isset( $args['filename'] ) ? $args['filename'] : null,
			);
		}
		return $pre;
	},
	10,
	3
);

// A second plugin whose Update URI is also on github.com. Its own answer, at an
// earlier priority, must survive the RankX AI filter untouched.
add_filter(
	'update_plugins_github.com',
	function ( $update, $plugin_data, $plugin_file ) {
		$fixture = get_option( 'rankxai_probe_updater' );
		if ( is_array( $fixture ) && ! empty( $fixture['other_update'] ) && 'rx-other/rx-other.php' === $plugin_file ) {
			return $fixture['other_update'];
		}
		return $update;
	},
	5,
	3
);
