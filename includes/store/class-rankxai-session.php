<?php
/**
 * POST rankxai/v1/session: a store app session for the administrator who has
 * the Store page open.
 *
 * Only a signed-in administrator in this browser may ask: the request must
 * carry a valid REST nonce, checked here rather than left to WordPress (which
 * skips the nonce for Application Passwords), and must not be authenticated by
 * an Application Password at all. The plugin then asks RankX AI, server to
 * server, with the site token; the token never reaches the browser. What the
 * browser receives is a ten-minute session token bound to this site's admin
 * address.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * The session route.
 */
class RankXAI_Session {

	/** Sessions one user may ask for in ten minutes. */
	const PER_USER_LIMIT = 30;

	/** A site token is replaced at most this often by one plugin. */
	const ROTATE_LOCK = 'rankxai_site_token_rotating';

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Register the route.
	 */
	public static function register_routes() {
		register_rest_route(
			RankXAI_REST::NAMESPACE_V1,
			'/session',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle' ),
				'permission_callback' => array( __CLASS__, 'can_start' ),
			)
		);
	}

	/**
	 * A cookie-signed-in administrator, with this page's REST nonce.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return bool|WP_Error
	 */
	public static function can_start( $request ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		if ( function_exists( 'rest_get_authenticated_app_password' ) && null !== rest_get_authenticated_app_password() ) {
			return new WP_Error( 'rankxai_cookie_only', __( 'A session is only started from the Store page in wp-admin.', 'rankxai' ), array( 'status' => 403 ) );
		}
		$nonce = (string) $request->get_header( 'X-WP-Nonce' );
		if ( ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new WP_Error( 'rankxai_bad_nonce', __( 'This page has expired. Reload it and try again.', 'rankxai' ), array( 'status' => 403 ) );
		}
		return true;
	}

	/**
	 * Hand out a session.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle( $request ) {
		if ( ! RankXAI_Connection::is_connected() ) {
			return new WP_Error( 'rankxai_not_connected', __( 'Connect RankX AI first, in RankX AI › Settings.', 'rankxai' ), array( 'status' => 409 ) );
		}
		$user_id = get_current_user_id();
		$renew   = '1' === (string) $request->get_header( 'X-RankXAI-Renew' );
		if ( $renew ) {
			RankXAI_Session_Cache::clear( $user_id );
		} else {
			$cached = RankXAI_Session_Cache::get( $user_id );
			if ( null !== $cached ) {
				return self::answer( $cached['token'], $cached['expiresAt'], $cached['expiresIn'], $cached['canSpend'] );
			}
		}

		$blocked = RankXAI_Connection::outbound_blocked();
		if ( '' !== $blocked ) {
			return new WP_Error( 'rankxai_outbound_blocked', $blocked, array( 'status' => 503 ) );
		}
		if ( ! self::within_limit( $user_id ) ) {
			return new WP_Error( 'rankxai_too_many', __( 'Too many sessions were asked for. Please wait a few minutes.', 'rankxai' ), array( 'status' => 429 ) );
		}

		$user   = wp_get_current_user();
		$rotate = self::take_rotate_lock();
		$result = RankXAI_App_Client::request(
			'POST',
			'/api/store-app/wp/session',
			array(
				'wpUserId'   => $user_id,
				'wpUserName' => (string) $user->display_name,
				'origin'     => self::admin_origin(),
				'siteUrl'    => home_url(),
				'rotate'     => $rotate,
			)
		);
		if ( $rotate ) {
			$rotate_result = is_array( $result ) && isset( $result['body']['siteToken'] ) ? (string) $result['body']['siteToken'] : '';
			if ( preg_match( '/^rxwp_[A-Za-z0-9_-]{43}$/', $rotate_result ) ) {
				$link          = RankXAI_Connection::link();
				$link['token'] = $rotate_result;
				update_option( RankXAI_Connection::OPTION, $link, false );
			}
			delete_option( self::ROTATE_LOCK );
		}

		if ( is_wp_error( $result ) ) {
			return new WP_Error( 'rankxai_unreachable', __( 'This site could not reach RankX AI just now. Please try again.', 'rankxai' ), array( 'status' => 503 ) );
		}
		$body = $result['body'];
		if ( 200 !== $result['status'] ) {
			$code = isset( $body['code'] ) ? (string) $body['code'] : 'rankxai_refused';
			// The site token itself is dead: forget it, so Settings offers Reconnect.
			if ( in_array( $code, array( 'invalid_site_token', 'link_ended', 'site_token_expired' ), true ) ) {
				delete_option( RankXAI_Connection::OPTION );
				RankXAI_Session_Cache::clear_all();
			}
			$message = isset( $body['error'] ) ? sanitize_text_field( (string) $body['error'] ) : __( 'RankX AI refused the session.', 'rankxai' );
			return new WP_Error( 'rankxai_' . sanitize_key( $code ), $message, array( 'status' => $result['status'] >= 400 && $result['status'] < 600 ? $result['status'] : 502 ) );
		}
		$token = isset( $body['token'] ) ? (string) $body['token'] : '';
		if ( ! preg_match( '/^rxws_[A-Za-z0-9_-]{43}$/', $token ) ) {
			return new WP_Error( 'rankxai_bad_answer', __( 'RankX AI answered in a way this plugin does not understand. Update the plugin.', 'rankxai' ), array( 'status' => 502 ) );
		}
		$expires_at = isset( $body['expiresAt'] ) ? (string) $body['expiresAt'] : '';
		$expires_in = isset( $body['expiresIn'] ) ? (int) $body['expiresIn'] : 600;
		$can_spend  = ! empty( $body['canSpend'] );
		RankXAI_Session_Cache::put( $user_id, $token, $expires_at, $expires_in, $can_spend );
		return self::answer( $token, $expires_at, $expires_in, $can_spend );
	}

	/**
	 * The answer the Store page reads: the token, when it expires, and in how long.
	 *
	 * @param string $token      Session token.
	 * @param string $expires_at ISO time.
	 * @param int    $expires_in Seconds.
	 * @param bool   $can_spend  Whether it may spend credits.
	 * @return WP_REST_Response
	 */
	private static function answer( $token, $expires_at, $expires_in, $can_spend ) {
		$response = rest_ensure_response(
			array(
				'token'     => $token,
				'expiresAt' => $expires_at,
				'expiresIn' => $expires_in,
				'canSpend'  => (bool) $can_spend,
			)
		);
		$response->header( 'Cache-Control', 'no-store, private' );
		return $response;
	}

	/**
	 * This site's wp-admin origin, which the session is bound to.
	 *
	 * @return string
	 */
	public static function admin_origin() {
		$parts = wp_parse_url( admin_url() );
		$host  = isset( $parts['host'] ) ? $parts['host'] : '';
		$port  = isset( $parts['port'] ) ? ':' . $parts['port'] : '';
		return strtolower( ( isset( $parts['scheme'] ) ? $parts['scheme'] : 'https' ) . '://' . $host . $port );
	}

	/**
	 * Whether this user may ask for another session now.
	 *
	 * @param int $user_id WordPress user id.
	 * @return bool
	 */
	private static function within_limit( $user_id ) {
		$key   = 'rankxai_session_count_' . (int) $user_id;
		$count = (int) get_transient( $key );
		if ( $count >= self::PER_USER_LIMIT ) {
			return false;
		}
		set_transient( $key, $count + 1, 10 * MINUTE_IN_SECONDS );
		return true;
	}

	/**
	 * Take the lock that lets one request at a time ask for a new site token.
	 *
	 * `add_option` fails when the option exists, so two requests cannot both
	 * take it. A lock older than a minute was left by a request that died.
	 *
	 * @return bool
	 */
	private static function take_rotate_lock() {
		$held = (int) get_option( self::ROTATE_LOCK, 0 );
		if ( $held > 0 && time() - $held > MINUTE_IN_SECONDS ) {
			delete_option( self::ROTATE_LOCK );
		}
		return add_option( self::ROTATE_LOCK, time(), '', false );
	}
}
