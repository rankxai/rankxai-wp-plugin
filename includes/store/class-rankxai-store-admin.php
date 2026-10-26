<?php
/**
 * RankX AI › Store: the store app inside wp-admin, on a WooCommerce site.
 *
 * Before an account is connected this is a plain page that says what
 * connecting adds, with the Connect RankX AI button. Nothing is loaded and
 * nothing is sent until then. Once connected, the page loads the store app
 * from this plugin's own files (admin-app/build): WordPress's own React, the
 * app as a script module, and its stylesheet. The app draws its own section
 * menu inside the page and talks to RankX AI with a session token from
 * POST rankxai/v1/session.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * The Store page.
 */
class RankXAI_Store_Admin {

	/** Page slug. The store app's own links and deep links use it. */
	const PAGE = 'rankxai-store';

	/** The module's handle. */
	const HANDLE = 'rankxai-store';

	/** The store app's API, on RankX AI. */
	const API_PATH = '/api/store-app';

	/**
	 * The build's asset map (written by the release from the build manifest).
	 *
	 * @return array{file: string, css: string[], version: string}|null
	 */
	public static function assets() {
		$path = dirname( RANKXAI_PLUGIN_FILE ) . '/admin-app/build/store-app.asset.php';
		if ( ! is_readable( $path ) ) {
			return null;
		}
		$assets = include $path;
		if ( ! is_array( $assets ) || empty( $assets['file'] ) || ! is_string( $assets['file'] ) ) {
			return null;
		}
		return array(
			'file'    => $assets['file'],
			'css'     => isset( $assets['css'] ) && is_array( $assets['css'] ) ? array_values( array_filter( $assets['css'], 'is_string' ) ) : array(),
			'version' => isset( $assets['version'] ) ? (string) $assets['version'] : RANKXAI_VERSION,
		);
	}

	/**
	 * Whether this WordPress can run the store app: its own JSX runtime and
	 * admin script modules both arrived in 6.6.
	 *
	 * @return bool
	 */
	public static function runtime_available() {
		return function_exists( 'wp_enqueue_script_module' ) && wp_script_is( 'react-jsx-runtime', 'registered' );
	}

	/**
	 * Whether the page will mount the store app on this request.
	 *
	 * @return bool
	 */
	public static function mounts() {
		return RankXAI_Connection::is_connected() && self::runtime_available() && null !== self::assets();
	}

	/**
	 * Enqueue on the page's own load hook, and only when it mounts.
	 */
	public static function load() {
		if ( ! self::mounts() ) {
			return;
		}
		$assets = self::assets();
		$base   = plugins_url( 'admin-app/build/', RANKXAI_PLUGIN_FILE );
		wp_enqueue_script( 'react' );
		wp_enqueue_script( 'react-dom' );
		wp_enqueue_script( 'react-jsx-runtime' );
		foreach ( $assets['css'] as $i => $css ) {
			wp_enqueue_style( self::HANDLE . '-' . $i, $base . $css, array(), $assets['version'] );
		}
		// No version on the entry (null, not the default false): its lazily loaded chunks import it by its bare
		// file name, so `main.js?ver=…` and `main.js` would be two modules and the app would start twice. The file
		// name already carries a content hash, which is what a version would buy.
		wp_enqueue_script_module( self::HANDLE, $base . $assets['file'], array(), null );
	}

	/**
	 * Render the page.
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		if ( self::mounts() ) {
			self::render_app();
			return;
		}
		self::render_explainer();
	}

	/**
	 * The store app's mount point, with its configuration printed before it.
	 */
	private static function render_app() {
		$config = array(
			'apiBase'    => RankXAI_App_Client::APP_ORIGIN . self::API_PATH,
			'sessionUrl' => rest_url( RankXAI_REST::NAMESPACE_V1 . '/session' ),
			'nonce'      => wp_create_nonce( 'wp_rest' ),
			'pageUrl'    => admin_url( 'admin.php?page=' . self::PAGE ),
			'adminUrl'   => admin_url(),
			'locale'     => get_user_locale(),
		);
		echo '<div class="wrap"><h1 class="screen-reader-text">' . esc_html__( 'RankX AI', 'rankxai' ) . '</h1><hr class="wp-header-end">';
		wp_print_inline_script_tag(
			(string) wp_json_encode( $config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES ),
			array(
				'type' => 'application/json',
				'id'   => 'rx-store-config',
			)
		);
		echo '<div id="rx-store"></div></div>';
	}

	/**
	 * What connecting adds, before an account is connected (or why the app
	 * cannot run here).
	 */
	private static function render_explainer() {
		RankXAI_UI::open_page( __( 'Store', 'rankxai' ), __( 'Your WooCommerce store in AI shopping answers, from your own dashboard.', 'rankxai' ), self::PAGE );
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Connect your store to RankX AI', 'rankxai' ),
				'subtitle' => __( 'See how ChatGPT and Google show your products, fix what keeps them out, and track the result here.', 'rankxai' ),
				'hero'     => true,
			)
		);
		if ( ! self::runtime_available() ) {
			echo '<p>' . esc_html__( 'The store app needs WordPress 6.6 or later. Update WordPress, then come back to this page. Everything else in this plugin keeps working.', 'rankxai' ) . '</p>';
		} elseif ( null === self::assets() ) {
			echo '<p>' . esc_html__( 'This copy of the plugin is missing the store app\'s files. Reinstall the plugin from its release, then come back to this page.', 'rankxai' ) . '</p>';
		} else {
			echo '<ul class="rankxai-list">';
			echo '<li>' . esc_html__( 'Which of your products AI assistants show, for the questions shoppers ask, and which stores they show instead.', 'rankxai' ) . '</li>';
			echo '<li>' . esc_html__( 'Missing details that keep products out of answers, fixed one at a time or in bulk, every change with Undo.', 'rankxai' ) . '</li>';
			echo '<li>' . esc_html__( 'Product images, SEO titles and descriptions, and blog articles written for your store.', 'rankxai' ) . '</li>';
			echo '</ul>';
			$blocked = RankXAI_Connection::outbound_blocked();
			if ( '' !== $blocked ) {
				RankXAI_UI::note( $blocked );
			}
			echo '<p class="rankxai-muted">' . esc_html__( 'Connecting opens RankX AI in a new tab, where you sign in or create an account and choose this site. Nothing is sent to RankX AI until you do.', 'rankxai' ) . '</p>';
			echo '<div class="rankxai-actions">';
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Every value is escaped in connect_button_html().
			echo RankXAI_Connection::connect_button_html( __( 'Connect RankX AI', 'rankxai' ) );
			echo '</div>';
		}
		RankXAI_UI::card_close();
		RankXAI_UI::close_page();
	}
}
