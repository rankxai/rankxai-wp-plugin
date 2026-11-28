<?php
/**
 * Remove what this plugin stored, when it is deleted.
 *
 * The connection and scheduled events always go. Everything else goes unless
 * "Keep RankX AI's data" is ticked. Values written into other SEO or redirect
 * plugins are theirs and are left alone.
 *
 * @package RankXAI
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Delete this plugin's data on the current site.
 */
function rankxai_uninstall_current_site() {
	global $wpdb;

	// No plugin bootstrap here; a missing file must not stop the cleanup.
	$rankxai_connection = __DIR__ . '/includes/class-rankxai-connection.php';
	$rankxai_cache      = __DIR__ . '/includes/class-rankxai-session-cache.php';
	if ( file_exists( $rankxai_connection ) && file_exists( $rankxai_cache ) ) {
		require_once $rankxai_cache;
		require_once $rankxai_connection;
		RankXAI_Session_Cache::clear_all();
		delete_option( RankXAI_Connection::OPTION );
		delete_option( RankXAI_Connection::STATES_OPTION );
		delete_option( 'rankxai_site_token_rotating' );
		RankXAI_Connection::remove_app_passwords();
		$rankxai_connector = __DIR__ . '/includes/class-rankxai-connector.php';
		if ( file_exists( $rankxai_connector ) ) {
			require_once $rankxai_connector;
			RankXAI_Connector::remove_user();
			delete_option( RankXAI_Connector::OPTION_APPROVER );
			remove_role( RankXAI_Connector::ROLE );
		}
	}

	// Every event of each hook, including those scheduled with arguments.
	foreach ( array( 'rankxai_scan_batch', 'rankxai_scan_weekly', 'rankxai_confirm_redirect', 'rankxai_product_check_batch', 'rankxai_send_product_events' ) as $rankxai_hook ) {
		wp_unschedule_hook( $rankxai_hook );
	}

	if ( get_option( 'rankxai_keep_data' ) ) {
		return;
	}

	// Post and term meta: find our keys, then delete through core so caches are cleared.
	$rankxai_meta = $wpdb->esc_like( '_rankxai_' ) . '%';
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Own meta keys, on uninstall.
	foreach ( (array) $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT meta_key FROM {$wpdb->postmeta} WHERE meta_key LIKE %s", $rankxai_meta ) ) as $rankxai_key ) {
		delete_post_meta_by_key( $rankxai_key );
	}
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- As above.
	foreach ( (array) $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT meta_key FROM {$wpdb->termmeta} WHERE meta_key LIKE %s", $rankxai_meta ) ) as $rankxai_key ) {
		delete_metadata( 'term', 0, $rankxai_key, '', true );
	}

	// The plugin's own tables.
	foreach ( array( 'rankxai_crawler_hits', 'rankxai_links' ) as $rankxai_table ) {
		$rankxai_table = esc_sql( $wpdb->prefix . $rankxai_table );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Own table; name is prefix plus a constant.
		$wpdb->query( "DROP TABLE IF EXISTS {$rankxai_table}" );
	}

	// Options and transients, found by prefix.
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Own options, on uninstall.
	$rankxai_options = (array) $wpdb->get_col( $wpdb->prepare( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", $wpdb->esc_like( 'rankxai_' ) . '%', $wpdb->esc_like( '_transient_rankxai_' ) . '%' ) );
	foreach ( $rankxai_options as $rankxai_option ) {
		if ( 0 === strpos( $rankxai_option, '_transient_' ) ) {
			delete_transient( substr( $rankxai_option, strlen( '_transient_' ) ) );
		} else {
			delete_option( $rankxai_option );
		}
	}
}

/**
 * Run the cleanup on every site of a network, in batches.
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

// A display preference in network-wide user meta, so deleted once, always.
delete_metadata( 'user', 0, 'rankxai_start_dismissed', '', true );

// <github-build>
// The GitHub build's cached update check (network-wide).
delete_site_transient( 'rankxai_release' );
// </github-build>
