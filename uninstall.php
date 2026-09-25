<?php
/**
 * Remove everything this plugin stored.
 *
 * Core deletes the plugin's files; this removes its data. Post meta (every key
 * prefixed `_rankxai_`), the root-document options, the markdown-twin
 * options and opt-out meta, this plugin's own redirects, and the crawler
 * counts table, and the cached update check.
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

	// Gap-fill switches. The rewrite rules a sitemap fill caused are core's and
	// are rebuilt by WordPress on the next flush.
	$rankxai_fill = __DIR__ . '/includes/class-rankxai-fill.php';
	if ( file_exists( $rankxai_fill ) ) {
		require_once $rankxai_fill;
		delete_option( RankXAI_Fill::OPTION );
		delete_option( RankXAI_Fill::OPTION_FLUSH );
	}

	// Our own redirects and their hit counts. Redirects added to Rank Math are
	// Rank Math's data once written, like mirrored SEO values, and stay.
	$redirects = __DIR__ . '/includes/class-rankxai-redirects.php';
	if ( file_exists( $redirects ) ) {
		require_once $redirects;
		delete_option( RankXAI_Redirects::OPTION );
		delete_option( RankXAI_Redirects::OPTION_HITS );
	}

	// Crawler counts: the table and every option. Nothing here belongs to anyone else.
	$crawlers = __DIR__ . '/includes/class-rankxai-crawlers.php';
	if ( file_exists( $crawlers ) ) {
		require_once $crawlers;
		$rankxai_table = $wpdb->prefix . RankXAI_Crawlers::TABLE;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Dropping this plugin's own table on uninstall; the name is not user input.
		$wpdb->query( "DROP TABLE IF EXISTS {$rankxai_table}" );
		foreach ( array( RankXAI_Crawlers::OPTION_ENABLED, RankXAI_Crawlers::OPTION_TOKENS, RankXAI_Crawlers::OPTION_RANGES, RankXAI_Crawlers::OPTION_PRUNED, RankXAI_Crawlers::OPTION_TABLE ) as $rankxai_option ) {
			delete_option( $rankxai_option );
		}
	}

	// Which documents were generated locally. One option holding every slug, so
	// unlike the catalogue above there is nothing to derive.
	$generate = __DIR__ . '/includes/class-rankxai-generate.php';
	if ( file_exists( $generate ) ) {
		require_once $generate;
		delete_option( RankXAI_Generate::OPTION );
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

// The cached update check. A site transient, so network-wide on multisite and
// deleted once. The key is repeated here because the updater is absent from the
// WordPress.org build.
delete_site_transient( 'rankxai_release' );
