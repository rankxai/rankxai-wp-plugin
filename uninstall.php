<?php
/**
 * Remove everything this plugin stored.
 *
 * Core deletes the plugin's files; this removes its data. Post meta (every key
 * prefixed `_rankxai_`), the root-document options and the markdown-twin
 * options and opt-out meta.
 *
 * Values mirrored into Yoast, Rank Math, SEOPress or The SEO Framework are left
 * alone. Once written they are that plugin's data, and deleting them would
 * strip a site's live SEO as a side effect of removing an integration.
 *
 * Rendered twins cached in `_transient_rankxai_md_*` are left to expire on
 * their own.
 *
 * @package RankXAI
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Delete this plugin's post meta and options on the current site.
 */
function rankxai_uninstall_current_site() {
	global $wpdb;

	// `esc_like` escapes the underscores, which are LIKE wildcards.
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- One-shot cleanup on uninstall; core offers no API for "delete every post meta with this prefix".
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE %s",
			$wpdb->esc_like( '_rankxai_' ) . '%'
		)
	);

	// uninstall.php runs without the plugin bootstrap, so the classes below are
	// required explicitly. The file_exists guards keep a missing file from
	// aborting the rest of the cleanup.
	$rankxai_twins = __DIR__ . '/includes/class-rankxai-twins.php';
	if ( file_exists( $rankxai_twins ) ) {
		require_once $rankxai_twins;
		delete_option( RankXAI_Twins::OPTION_SETTINGS );
		delete_option( RankXAI_Twins::OPTION_CONTEXT );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- One-shot cleanup on uninstall.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->postmeta} WHERE meta_key = %s",
				RankXAI_Twins::META_DISABLED
			)
		);
	}

	// Derived from the catalogue rather than listed, so a new document cleans
	// itself up.
	$documents = __DIR__ . '/includes/class-rankxai-documents.php';
	if ( file_exists( $documents ) ) {
		require_once $documents;
		foreach ( array_keys( RankXAI_Documents::catalogue() ) as $rankxai_slug ) {
			$rankxai_option = RankXAI_Documents::option_name( $rankxai_slug );
			if ( null !== $rankxai_option ) {
				delete_option( $rankxai_option );
			}
		}
	}
}

/**
 * Run the cleanup on every site.
 *
 * Multisite runs uninstall.php once for the whole network, and
 * `$wpdb->postmeta` resolves to whichever site is current — so without this
 * loop only one site would be cleaned. Batched so a large network's site list
 * is not loaded whole.
 */
function rankxai_uninstall_everywhere() {
	if ( ! is_multisite() ) {
		rankxai_uninstall_current_site();
		return;
	}

	$batch  = 100;
	$offset = 0;
	do {
		$site_ids = get_sites(
			array(
				'fields'                 => 'ids',
				'number'                 => $batch,
				'offset'                 => $offset,
				'update_site_meta_cache' => false,
			)
		);
		foreach ( $site_ids as $site_id ) {
			switch_to_blog( $site_id );
			rankxai_uninstall_current_site();
			restore_current_blog();
		}
		$found   = count( $site_ids );
		$offset += $batch;
	} while ( $found === $batch );
}

rankxai_uninstall_everywhere();
