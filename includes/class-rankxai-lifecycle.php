<?php
/**
 * Activation, deactivation, and the small options read on every request.
 *
 * A missing or non-autoloaded option costs a query on every request, so these
 * are stored once and autoloaded.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Plugin lifecycle.
 */
class RankXAI_Lifecycle {

	/**
	 * Hooks.
	 */
	public static function init() {
		// Updates run no activation hook, so also check on admin pages.
		add_action( 'admin_init', array( __CLASS__, 'ensure_options' ) );
	}

	/**
	 * The plugin was activated.
	 */
	public static function activate() {
		self::ensure_options();
		RankXAI_Scan::on_activate();
	}

	/**
	 * The plugin was deactivated: disconnect, and leave nothing scheduled.
	 */
	public static function deactivate() {
		RankXAI_Connection::on_deactivate();
		RankXAI_Scan::on_deactivate();
		wp_clear_scheduled_hook( 'rankxai_product_check_batch' );
		wp_clear_scheduled_hook( 'rankxai_send_product_events' );
	}

	/**
	 * Make the per-request options exist and autoload, without changing values.
	 */
	public static function ensure_options() {
		$autoloaded = wp_load_alloptions();
		if ( array_key_exists( RankXAI_Fill::OPTION_ALLOWED, $autoloaded ) ) {
			delete_option( RankXAI_Fill::OPTION_ALLOWED );
		}
		// The crawler ranges now ship with the plugin.
		foreach ( RankXAI_Crawlers::OBSOLETE_OPTIONS as $obsolete ) {
			if ( false !== get_option( $obsolete, false ) ) {
				delete_option( $obsolete );
			}
		}
		$defaults = array(
			RankXAI_Twins::OPTION_SETTINGS   => array(),
			RankXAI_Fill::OPTION             => array( 'features' => array() ),
			RankXAI_Fill::OPTION_FLUSH       => 0,
			RankXAI_Crawlers::OPTION_ENABLED => 0,
		);
		foreach ( $defaults as $name => $default ) {
			if ( array_key_exists( $name, $autoloaded ) ) {
				continue;
			}
			$value = get_option( $name, null );
			if ( null === $value ) {
				add_option( $name, $default, '', true );
			} elseif ( function_exists( 'wp_set_option_autoload' ) ) {
				wp_set_option_autoload( $name, true );
			}
		}
	}
}
