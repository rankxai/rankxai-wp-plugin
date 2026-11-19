<?php
/**
 * The plugin's admin menu, pages and form handlers.
 *
 * Every form posts to `admin-post.php`, and each handler checks the capability
 * and nonce itself.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Admin menu, pages and form handlers.
 */
class RankXAI_Admin {

	/** The Settings form. */
	const ACTION = 'rankxai_save_settings';

	/** Remove one of this plugin's own redirects. */
	const ACTION_DELETE_REDIRECT = 'rankxai_delete_redirect';

	/** Switch crawler counting on or off. */
	const ACTION_CRAWLERS = 'rankxai_crawlers_switch';

	/** Clear every crawler count. */
	const ACTION_CLEAR_COUNTS = 'rankxai_clear_counts';

	/** Add a redirect for a crawler 404 or a broken link. */
	const ACTION_ADD_REDIRECT = 'rankxai_add_redirect';

	/** Start a site check. */
	const ACTION_SCAN = 'rankxai_scan_now';

	/** Read robots.txt again. */
	const ACTION_ROBOTS = 'rankxai_robots_refresh';

	/** Hide the Overview's "Start here" card. */
	const ACTION_DISMISS_START = 'rankxai_dismiss_start';

	/** User meta: this user hid the "Start here" card. */
	const META_START_DISMISSED = 'rankxai_start_dismissed';

	/** Top-level menu slug (formerly the Settings page's slug). */
	const PAGE = 'rankxai';

	/** AI crawlers page. */
	const PAGE_CRAWLERS = 'rankxai-crawlers';

	/** Site checks page. */
	const PAGE_CHECKS = 'rankxai-checks';

	/** Settings page. */
	const PAGE_SETTINGS = 'rankxai-settings';

	/** The store app, on a WooCommerce site. */
	const PAGE_STORE = 'rankxai-store';

	/** View as AI, reached from a post's row actions. Not in the menu. */
	const PAGE_VIEW = 'rankxai-view-as-ai';

	/** Menu position: just below Settings. */
	const POSITION = 81;

	/**
	 * Hook suffixes of the registered pages (they depend on the translated title).
	 *
	 * @var string[]
	 */
	private static $hooks = array();

	/**
	 * Register the pages and handlers.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_action( 'admin_page_access_denied', array( __CLASS__, 'redirect_old_address' ) );
		add_action( 'admin_page_access_denied', array( __CLASS__, 'store_needs_woocommerce' ) );
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle_save' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_REDIRECT, array( __CLASS__, 'handle_delete_redirect' ) );
		add_action( 'admin_post_' . self::ACTION_CRAWLERS, array( __CLASS__, 'handle_crawlers' ) );
		add_action( 'admin_post_' . self::ACTION_CLEAR_COUNTS, array( __CLASS__, 'handle_clear_counts' ) );
		add_action( 'admin_post_' . self::ACTION_ROBOTS, array( __CLASS__, 'handle_robots' ) );
		add_action( 'admin_post_' . self::ACTION_ADD_REDIRECT, array( __CLASS__, 'handle_add_redirect' ) );
		add_action( 'admin_post_' . self::ACTION_SCAN, array( __CLASS__, 'handle_scan' ) );
		add_action( 'admin_post_' . self::ACTION_DISMISS_START, array( __CLASS__, 'handle_dismiss_start' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( RANKXAI_PLUGIN_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * The pages in the menu, in order, slug => label.
	 *
	 * @return array<string, string>
	 */
	public static function pages() {
		$pages = array( self::PAGE => __( 'Overview', 'rankxai' ) );
		// The Store page exists only on a WooCommerce site.
		if ( class_exists( 'RankXAI_Store_Admin' ) ) {
			$pages[ self::PAGE_STORE ] = __( 'Store', 'rankxai' );
		}
		$pages[ self::PAGE_CRAWLERS ] = __( 'AI crawlers', 'rankxai' );
		$pages[ self::PAGE_CHECKS ]   = __( 'Site checks', 'rankxai' );
		$pages[ self::PAGE_SETTINGS ] = __( 'Settings', 'rankxai' );
		return $pages;
	}

	/**
	 * Add the menu and its pages.
	 */
	public static function menu() {
		$top           = add_menu_page(
			__( 'RankX AI', 'rankxai' ),
			__( 'RankX AI', 'rankxai' ),
			'manage_options',
			self::PAGE,
			array( 'RankXAI_Pages', 'overview' ),
			RankXAI_UI::MENU_ICON,
			self::POSITION
		);
		self::$hooks[] = $top;
		// The old Settings address resolves here, so redirect it before output.
		add_action( 'load-' . $top, array( __CLASS__, 'redirect_old_address' ) );

		$renderers = array(
			self::PAGE          => array( 'RankXAI_Pages', 'overview' ),
			self::PAGE_STORE    => array( 'RankXAI_Store_Admin', 'render' ),
			self::PAGE_CRAWLERS => array( 'RankXAI_Pages', 'crawlers' ),
			self::PAGE_CHECKS   => array( 'RankXAI_Pages', 'checks' ),
			self::PAGE_SETTINGS => array( 'RankXAI_Pages', 'settings' ),
		);
		foreach ( self::pages() as $slug => $label ) {
			$hook = add_submenu_page( self::PAGE, $label . ' ‹ ' . __( 'RankX AI', 'rankxai' ), $label, 'manage_options', $slug, $renderers[ $slug ] );
			if ( $hook ) {
				self::$hooks[] = $hook;
				if ( self::PAGE_STORE === $slug ) {
					add_action( 'load-' . $hook, array( 'RankXAI_Store_Admin', 'load' ) );
				}
			}
		}

		// Hidden page, opened from post row actions; it checks the post itself.
		$view = add_submenu_page( '', __( 'View as AI', 'rankxai' ), __( 'View as AI', 'rankxai' ), 'edit_posts', self::PAGE_VIEW, array( 'RankXAI_View_As_AI', 'render' ) );
		if ( $view ) {
			self::$hooks[] = $view;
			add_action( 'load-' . $view, array( 'RankXAI_View_As_AI', 'guard' ) );
		}
	}

	/**
	 * The screens this plugin owns.
	 *
	 * @return string[]
	 */
	public static function hooks() {
		return self::$hooks;
	}

	/**
	 * Load the stylesheet on this plugin's own screens and nowhere else.
	 *
	 * @param string $hook_suffix Current screen's hook suffix.
	 */
	public static function enqueue( $hook_suffix ) {
		if ( ! in_array( $hook_suffix, self::$hooks, true ) ) {
			return;
		}
		wp_enqueue_style( 'rankxai-admin', plugins_url( 'assets/admin.css', RANKXAI_PLUGIN_FILE ), array(), RANKXAI_VERSION );
	}

	/**
	 * Send the old Settings → RankX AI address to the new Settings page.
	 */
	public static function redirect_old_address() {
		global $pagenow;
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page check.
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
		if ( 'options-general.php' !== $pagenow || self::PAGE !== $page || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		wp_safe_redirect( self::page_url( self::PAGE_SETTINGS ) );
		exit;
	}

	/**
	 * Send a Store page link to the Overview while WooCommerce is inactive.
	 */
	public static function store_needs_woocommerce() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page check.
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
		if ( self::PAGE_STORE !== $page || class_exists( 'WooCommerce' ) || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		wp_safe_redirect( add_query_arg( 'rankxai-store-unavailable', '1', self::page_url( self::PAGE ) ) );
		exit;
	}

	/**
	 * A Settings link on the Plugins screen.
	 *
	 * @param string[] $links Existing links.
	 * @return string[]
	 */
	public static function action_links( $links ) {
		if ( ! is_array( $links ) ) {
			$links = array();
		}
		array_unshift(
			$links,
			'<a href="' . esc_url( self::page_url( self::PAGE_SETTINGS ) ) . '">' . esc_html__( 'Settings', 'rankxai' ) . '</a>'
		);
		if ( ! self::start_dismissed() ) {
			array_unshift(
				$links,
				'<a href="' . esc_url( self::page_url( self::PAGE ) ) . '"><strong>' . esc_html__( 'Get started', 'rankxai' ) . '</strong></a>'
			);
		}
		return $links;
	}

	/**
	 * Whether this user has hidden the Overview's "Start here" card.
	 *
	 * @return bool
	 */
	public static function start_dismissed() {
		return (bool) get_user_meta( get_current_user_id(), self::META_START_DISMISSED, true );
	}

	/**
	 * Hide the "Start here" card for this user.
	 */
	public static function handle_dismiss_start() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change this.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_DISMISS_START );
		update_user_meta( get_current_user_id(), self::META_START_DISMISSED, 1 );
		wp_safe_redirect( self::page_url( self::PAGE ) );
		exit;
	}

	/**
	 * A page's URL.
	 *
	 * @param string $slug Page slug; the Overview when omitted.
	 * @return string
	 */
	public static function page_url( $slug = self::PAGE ) {
		return admin_url( 'admin.php?page=' . $slug );
	}

	// -----------------------------------------------------------------------
	// Handlers
	// -----------------------------------------------------------------------

	/**
	 * The Settings form. Crawler counting has its own switch elsewhere.
	 */
	public static function handle_save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION );

		$twins_on = isset( $_POST['rankxai_twins_enabled'] );

		$post_types = array();
		if ( isset( $_POST['rankxai_twin_post_types'] ) && is_array( $_POST['rankxai_twin_post_types'] ) ) {
			foreach ( array_map( 'sanitize_key', (array) wp_unslash( $_POST['rankxai_twin_post_types'] ) ) as $type ) {
				if ( '' !== $type && post_type_exists( $type ) && is_post_type_viewable( $type ) ) {
					$post_types[] = $type;
				}
			}
		}

		$documents = array();
		foreach ( RankXAI_Generate::supported() as $slug ) {
			$documents[ $slug ] = isset( $_POST['rankxai_generate'][ $slug ] );
		}

		$keep_data = isset( $_POST['rankxai_keep_data'] );

		// A submission that chose no post type keeps what is stored.
		RankXAI_Twins::save_settings( $twins_on, $post_types ? $post_types : null );
		RankXAI_Generate::save_state( $documents );
		update_option( 'rankxai_keep_data', $keep_data ? 1 : 0, false );

		wp_safe_redirect( add_query_arg( 'rankxai-saved', '1', self::page_url( self::PAGE_SETTINGS ) ) );
		exit;
	}

	/**
	 * Remove one of this plugin's own redirects (never another plugin's).
	 */
	public static function handle_delete_redirect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_DELETE_REDIRECT );

		$id = isset( $_POST['rankxai_redirect_id'] ) ? sanitize_key( wp_unslash( $_POST['rankxai_redirect_id'] ) ) : '';
		if ( '' !== $id ) {
			$result = RankXAI_Redirects::delete( 'own_store', $id );
			if ( '' === $result['error'] ) {
				RankXAI_Redirects::purge( $result['from'] );
			}
		}

		wp_safe_redirect( add_query_arg( 'rankxai-redirect-removed', '1', self::page_url( self::PAGE_SETTINGS ) ) );
		exit;
	}

	/**
	 * Switch crawler counting on or off.
	 */
	public static function handle_crawlers() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_CRAWLERS );

		$on = isset( $_POST['rankxai_crawlers_enabled'] ) && '1' === sanitize_key( wp_unslash( $_POST['rankxai_crawlers_enabled'] ) );
		RankXAI_Crawlers::set_enabled( $on );

		wp_safe_redirect( add_query_arg( 'rankxai-saved', '1', self::page_url( self::PAGE_CRAWLERS ) ) );
		exit;
	}

	/**
	 * Delete every crawler count this site holds.
	 */
	public static function handle_clear_counts() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_CLEAR_COUNTS );

		RankXAI_Crawlers::clear();

		wp_safe_redirect( add_query_arg( 'rankxai-cleared', '1', self::page_url( self::PAGE_CRAWLERS ) ) );
		exit;
	}

	/**
	 * Read robots.txt again now, skipping the cache.
	 */
	public static function handle_robots() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_ROBOTS );

		RankXAI_Robots::reading( true );

		wp_safe_redirect( self::page_url( self::PAGE_CRAWLERS ) . '#rankxai-robots' );
		exit;
	}

	/**
	 * Start a site check. It runs in WP-Cron, a batch at a time.
	 */
	public static function handle_scan() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_SCAN );

		RankXAI_Scan::start();
		// Start now, unless WP-Cron is off and a real scheduler runs it.
		if ( ! ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) ) {
			spawn_cron();
		}

		wp_safe_redirect( add_query_arg( 'rankxai-scan-started', '1', self::page_url( self::PAGE_CHECKS ) ) );
		exit;
	}

	/**
	 * Ask for a redirect from a missing address to a published page. It is
	 * confirmed in WP-Cron before it is written.
	 */
	public static function handle_add_redirect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_ADD_REDIRECT );

		// Keeps percent-encoding, which sanitize_text_field() would strip.
		$from   = isset( $_POST['rankxai_from'] ) ? rankxai_sanitize_path( wp_unslash( $_POST['rankxai_from'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Sanitised by rankxai_sanitize_path().
		$to     = isset( $_POST['rankxai_to'] ) ? rankxai_sanitize_path( wp_unslash( $_POST['rankxai_to'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Sanitised by rankxai_sanitize_path().
		$source = isset( $_POST['rankxai_source'] ) && 'checks' === sanitize_key( wp_unslash( $_POST['rankxai_source'] ) ) ? 'checks' : 'crawlers';

		// A destination typed as a full address on this site becomes its path.
		if ( 0 === strpos( $to, home_url() ) ) {
			$to = (string) wp_parse_url( $to, PHP_URL_PATH );
		}
		$result = RankXAI_Redirect_Requests::request( $from, $to, $source );

		$page = 'checks' === $source ? self::PAGE_CHECKS : self::PAGE_CRAWLERS;
		set_transient( 'rankxai_redirect_notice_' . get_current_user_id(), $result, MINUTE_IN_SECONDS );
		wp_safe_redirect( self::page_url( $page ) );
		exit;
	}

	// -----------------------------------------------------------------------
	// Shared facts
	// -----------------------------------------------------------------------

	/**
	 * When RankX AI last sent this site anything.
	 *
	 * @return string A site-formatted date, or '' when nothing has arrived.
	 */
	public static function last_update_received() {
		$stamps = array();

		foreach ( array_keys( RankXAI_Documents::catalogue() ) as $slug ) {
			$stored = RankXAI_Documents::get( $slug );
			if ( null !== $stored && '' !== $stored['updated'] ) {
				$stamps[] = $stored['updated'];
			}
		}
		$context = RankXAI_Twins::context();
		if ( '' !== $context['updated'] ) {
			$stamps[] = $context['updated'];
		}
		$config = RankXAI_Crawlers::config_summary();
		if ( '' !== $config['updated'] ) {
			$stamps[] = $config['updated'];
		}
		foreach ( RankXAI_Summary::all() as $summary ) {
			$stamps[] = (string) $summary['receivedAt'];
		}

		if ( ! $stamps ) {
			return '';
		}
		$times = array_filter( array_map( 'strtotime', $stamps ) );
		if ( ! $times ) {
			return '';
		}
		return wp_date( (string) get_option( 'date_format' ) . ' ' . (string) get_option( 'time_format' ), max( $times ) );
	}
}
