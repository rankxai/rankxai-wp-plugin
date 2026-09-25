<?php
/**
 * Rig-only fixtures for probe/verify-admin-menu.mjs. Inert unless the option
 * `rankxai_probe_menu_fixture` names a case.
 *
 *   translate  - the plugin's menu title is translated, so every screen id changes
 *   collide    - another plugin registers a top-level menu at position 81 first
 *
 * NOT shipped. Lives under probe/ and is mapped into wp-env only.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$rankxai_probe_case = (string) get_option( 'rankxai_probe_menu_fixture', '' );

if ( 'translate' === $rankxai_probe_case ) {
	add_filter(
		'gettext',
		function ( $translation, $text, $domain ) {
			if ( 'rankxai' === $domain && 'RankX AI' === $text ) {
				return 'RankX KI Übersetzt';
			}
			return $translation;
		},
		10,
		3
	);
}

if ( 'collide' === $rankxai_probe_case ) {
	add_action(
		'admin_menu',
		function () {
			add_menu_page( 'Other 81', 'Other 81', 'manage_options', 'rankxai-probe-other-81', '__return_null', '', 81 );
		},
		1
	);
}
