<?php
/**
 * The plugin's admin pages: a top-level "RankX AI" menu with four pages.
 *
 * Overview, AI crawlers, Site checks and Settings, plus a "View as AI" screen
 * reached from the post and page lists. These pages and the tests in Site
 * Health are the only places the plugin speaks. There is no dashboard widget,
 * no admin notice and no banner anywhere else in wp-admin.
 *
 * Every form posts to `admin-post.php` and each handler checks the capability
 * and the nonce itself: the menu decides what is visible, the handler decides
 * what is allowed.
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

	/** Top-level menu slug. It was the Settings page's slug before, so old links still resolve. */
	const PAGE = 'rankxai';

	/** AI crawlers page. */
	const PAGE_CRAWLERS = 'rankxai-crawlers';

	/** Site checks page. */
	const PAGE_CHECKS = 'rankxai-checks';

	/** Settings page. */
	const PAGE_SETTINGS = 'rankxai-settings';

	/** View as AI, reached from a post's row actions. Not in the menu. */
	const PAGE_VIEW = 'rankxai-view-as-ai';

	/** Menu position: just below Settings. */
	const POSITION = 81;

	/**
	 * Hook suffixes returned when the pages were registered.
	 *
	 * Screen ids depend on the translated menu title, so they are never written
	 * out by hand.
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
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle_save' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_REDIRECT, array( __CLASS__, 'handle_delete_redirect' ) );
		add_action( 'admin_post_' . self::ACTION_CRAWLERS, array( __CLASS__, 'handle_crawlers' ) );
		add_action( 'admin_post_' . self::ACTION_CLEAR_COUNTS, array( __CLASS__, 'handle_clear_counts' ) );
		add_action( 'admin_post_' . self::ACTION_ROBOTS, array( __CLASS__, 'handle_robots' ) );
		add_action( 'admin_post_' . self::ACTION_ADD_REDIRECT, array( __CLASS__, 'handle_add_redirect' ) );
		add_action( 'admin_post_' . self::ACTION_SCAN, array( __CLASS__, 'handle_scan' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( RANKXAI_PLUGIN_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * The pages in the menu, in order, slug => label.
	 *
	 * @return array<string, string>
	 */
	public static function pages() {
		return array(
			self::PAGE          => __( 'Overview', 'rankxai' ),
			self::PAGE_CRAWLERS => __( 'AI crawlers', 'rankxai' ),
			self::PAGE_CHECKS   => __( 'Site checks', 'rankxai' ),
			self::PAGE_SETTINGS => __( 'Settings', 'rankxai' ),
		);
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
		// The old Settings address resolves to this top-level page, so it is
		// redirected before anything is sent.
		add_action( 'load-' . $top, array( __CLASS__, 'redirect_old_address' ) );

		$renderers = array(
			self::PAGE          => array( 'RankXAI_Pages', 'overview' ),
			self::PAGE_CRAWLERS => array( 'RankXAI_Pages', 'crawlers' ),
			self::PAGE_CHECKS   => array( 'RankXAI_Pages', 'checks' ),
			self::PAGE_SETTINGS => array( 'RankXAI_Pages', 'settings' ),
		);
		foreach ( self::pages() as $slug => $label ) {
			$hook = add_submenu_page( self::PAGE, $label . ' ‹ ' . __( 'RankX AI', 'rankxai' ), $label, 'manage_options', $slug, $renderers[ $slug ] );
			if ( $hook ) {
				self::$hooks[] = $hook;
			}
		}

		// View as AI has no menu entry: it is opened from a post's row actions,
		// by anyone who may edit posts. The screen checks the post itself.
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
	 *
	 * Runs on the top-level page's `load-` hook, because core resolves the old
	 * address to the new top-level page, and on `admin_page_access_denied` in
	 * case it ever does not. An account without `manage_options` is not
	 * redirected and ends at core's own refusal.
	 */
	public static function redirect_old_address() {
		global $pagenow;
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Reading which page was asked for, not acting on input.
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
		if ( 'options-general.php' !== $pagenow || self::PAGE !== $page || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		wp_safe_redirect( self::page_url( self::PAGE_SETTINGS ) );
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
		return $links;
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
	 * The Settings form: markdown copies and root documents.
	 *
	 * Crawler counting has its own switch on the AI crawlers page, so saving
	 * this form never changes it.
	 */
	public static function handle_save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION );

		// Every field is read and validated before anything is stored.
		$twins_on = isset( $_POST['rankxai_twins_enabled'] );

		$post_types = array();
		if ( isset( $_POST['rankxai_twin_post_types'] ) && is_array( $_POST['rankxai_twin_post_types'] ) ) {
			foreach ( wp_unslash( $_POST['rankxai_twin_post_types'] ) as $type ) { // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Each element is sanitized on the next line.
				$type = sanitize_key( (string) $type );
				if ( '' !== $type && post_type_exists( $type ) && is_post_type_viewable( $type ) ) {
					$post_types[] = $type;
				}
			}
		}

		$documents = array();
		foreach ( RankXAI_Generate::supported() as $slug ) {
			$documents[ $slug ] = isset( $_POST['rankxai_generate'][ $slug ] );
		}

		// A submission that chose no post type keeps what is stored.
		RankXAI_Twins::save_settings( $twins_on, $post_types ? $post_types : null );
		RankXAI_Generate::save_state( $documents );

		wp_safe_redirect( add_query_arg( 'rankxai-saved', '1', self::page_url( self::PAGE_SETTINGS ) ) );
		exit;
	}

	/**
	 * Remove one of this plugin's own redirects.
	 *
	 * Only our own store is touched: a redirect in Rank Math or the Redirection
	 * plugin is removed in that plugin's own screen.
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
	 * Read robots.txt again now, rather than waiting for the cached reading to age.
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
	 * Start a site check. Nothing runs here: the check runs in WP-Cron, a
	 * batch at a time, so an administrator's request never loops back.
	 */
	public static function handle_scan() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_SCAN );

		RankXAI_Scan::start();
		// Start it now rather than on the next visit, unless the site owner has
		// switched WP-Cron off, in which case their own scheduler runs it.
		if ( ! ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) ) {
			spawn_cron();
		}

		wp_safe_redirect( add_query_arg( 'rankxai-scan-started', '1', self::page_url( self::PAGE_CHECKS ) ) );
		exit;
	}

	/**
	 * Ask for a redirect from a missing address to a published page.
	 *
	 * Nothing is written here: RankXAI_Redirect_Requests refuses what it can at
	 * once and confirms the rest in WP-Cron before writing.
	 */
	public static function handle_add_redirect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_ADD_REDIRECT );

		// Paths are compared and shape-checked, never printed unescaped;
		// sanitize_text_field would strip percent-encoded octets.
		$from   = isset( $_POST['rankxai_from'] ) ? trim( (string) wp_unslash( $_POST['rankxai_from'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- See above.
		$to     = isset( $_POST['rankxai_to'] ) ? trim( (string) wp_unslash( $_POST['rankxai_to'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- See above.
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
	 * The newest time RankX AI sent this site anything.
	 *
	 * The plugin never calls RankX AI, so it cannot ask whether an account is
	 * connected. What it can state is when something last arrived.
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
