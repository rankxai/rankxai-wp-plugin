<?php
/**
 * The connection to a RankX AI account, made from wp-admin.
 *
 * Connect RankX AI opens RankX AI's own site in a new tab with this site's
 * address and a one-time state. The administrator signs in there, chooses
 * which of their websites this is, and approves the connection. RankX AI then
 * sends this site a site token over its Application Password, together with
 * the state, and the plugin keeps the token only if the state is one it made,
 * for this site, in the last day, and not used before. A token already held is
 * never replaced without that state.
 *
 * The site token is the record of consent: nothing in this plugin contacts
 * RankX AI unless it is present (see RankXAI_App_Client).
 *
 * Disconnecting, from here, from RankX AI, or by deactivating the plugin,
 * removes the token and the Application Passwords that carry RankX AI's
 * application id, so RankX AI can no longer reach the site.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * The site token, the connect state and the disconnect.
 */
class RankXAI_Connection {

	/** The link to the account. Not autoloaded. */
	const OPTION = 'rankxai_store_link';

	/** Connect states, keyed by their SHA-256. Not autoloaded. */
	const STATES_OPTION = 'rankxai_connect_states';

	/** How long a Connect click stays usable: signing up can take a while. */
	const STATE_TTL = DAY_IN_SECONDS;

	/** Most connect states kept at once. */
	const MAX_STATES = 10;

	/**
	 * RankX AI's application id, which WordPress stores beside every
	 * Application Password approved through its authorization screen.
	 */
	const APP_ID = 'a3f1c07e-6d4b-4f2a-9c85-1b7e0d3a5f42';

	/** The Connect button. */
	const ACTION_CONNECT = 'rankxai_connect';

	/** The Disconnect button. */
	const ACTION_DISCONNECT = 'rankxai_disconnect';

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_action( 'admin_post_' . self::ACTION_CONNECT, array( __CLASS__, 'handle_connect' ) );
		add_action( 'admin_post_' . self::ACTION_DISCONNECT, array( __CLASS__, 'handle_disconnect' ) );
	}

	/**
	 * The stored link, or null.
	 *
	 * @return array|null
	 */
	public static function link() {
		$link = get_option( self::OPTION, null );
		if ( ! is_array( $link ) || empty( $link['token'] ) || ! is_string( $link['token'] ) ) {
			return null;
		}
		return $link;
	}

	/**
	 * Whether a RankX AI account is connected from here.
	 *
	 * @return bool
	 */
	public static function is_connected() {
		return null !== self::link();
	}

	/**
	 * The web app address the account lives at, for "Open in RankX AI".
	 *
	 * @return string
	 */
	public static function app_url() {
		$link = self::link();
		$url  = is_array( $link ) && isset( $link['app_url'] ) ? (string) $link['app_url'] : '';
		return 0 === strpos( $url, 'https://' ) ? $url : RankXAI_App_Client::APP_ORIGIN;
	}

	/**
	 * REST routes: the platform puts the site token here, or takes it away.
	 */
	public static function register_routes() {
		register_rest_route(
			RankXAI_REST::NAMESPACE_V1,
			'/connection',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'handle_put' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'handle_delete' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
			)
		);
	}

	/**
	 * Only an administrator may change the connection.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Store a site token the platform sends.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_put( $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			return self::error( 'rankxai_bad_body', __( 'The body must be an object.', 'rankxai' ), 400 );
		}
		$token = isset( $body['token'] ) ? $body['token'] : '';
		if ( ! is_string( $token ) || ! preg_match( '/^rxwp_[A-Za-z0-9_-]{43}$/', $token ) ) {
			return self::error( 'rankxai_bad_token', __( 'That is not a RankX AI site token.', 'rankxai' ), 400 );
		}
		$link_id = isset( $body['linkId'] ) ? $body['linkId'] : '';
		if ( ! is_string( $link_id ) || ! preg_match( '/^[0-9a-f-]{36}$/', $link_id ) ) {
			return self::error( 'rankxai_bad_link', __( 'linkId must be an id.', 'rankxai' ), 400 );
		}
		$state = isset( $body['state'] ) && is_string( $body['state'] ) ? $body['state'] : '';

		// A token already held is replaced only with a state this plugin made.
		// Without one, a token may be placed only on a site that holds none.
		if ( '' !== $state ) {
			if ( ! self::consume_state( $state ) ) {
				return self::error( 'rankxai_state_refused', __( 'This connection was not started from this site, or it has expired. Click Connect RankX AI again.', 'rankxai' ), 403 );
			}
		} elseif ( self::is_connected() ) {
			return self::error( 'rankxai_connection_exists', __( 'This site is already connected. To connect it again, click Connect RankX AI in RankX AI › Settings on the site.', 'rankxai' ), 409 );
		}

		$app  = isset( $body['appUrl'] ) && is_string( $body['appUrl'] ) && 0 === strpos( $body['appUrl'], 'https://' ) && strlen( $body['appUrl'] ) <= 200 ? esc_url_raw( $body['appUrl'] ) : RankXAI_App_Client::APP_ORIGIN;
		$name = isset( $body['projectName'] ) && is_string( $body['projectName'] ) ? sanitize_text_field( substr( $body['projectName'], 0, 120 ) ) : '';
		$link = array(
			'token'         => $token,
			'link_id'       => $link_id,
			'connection_id' => isset( $body['connectionId'] ) && is_string( $body['connectionId'] ) ? sanitize_key( $body['connectionId'] ) : '',
			'project_name'  => $name,
			'app_url'       => $app,
			'is_store'      => ! empty( $body['isStore'] ),
			'connected_at'  => gmdate( 'c' ),
			'connected_by'  => get_current_user_id(),
		);
		update_option( self::OPTION, $link, false );
		RankXAI_Session_Cache::clear_all();

		return rest_ensure_response(
			array(
				'connected' => true,
				'linkId'    => $link_id,
			)
		);
	}

	/**
	 * Remove the site token (the account removed this site).
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function handle_delete( $request ) {
		$body    = $request->get_json_params();
		$link    = self::link();
		$link_id = is_array( $body ) && isset( $body['linkId'] ) ? (string) $body['linkId'] : '';
		// Only the link named, so a stale request cannot remove a newer one.
		if ( null !== $link && ( '' === $link_id || $link_id === $link['link_id'] ) ) {
			delete_option( self::OPTION );
			RankXAI_Session_Cache::clear_all();
		}
		return rest_ensure_response( array( 'connected' => self::is_connected() ) );
	}

	/**
	 * The Connect button: make a one-time state and open RankX AI with it.
	 */
	public static function handle_connect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to connect this site.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_CONNECT );

		$state  = 'rxcs_' . rtrim( strtr( base64_encode( random_bytes( 32 ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- A random state, not obfuscation.
		$states = self::states();
		$hash   = hash( 'sha256', $state );

		$states[ $hash ] = array(
			'user'    => get_current_user_id(),
			'expires' => time() + self::STATE_TTL,
		);
		// The newest few only, so the option cannot grow without bound.
		uasort(
			$states,
			function ( $a, $b ) {
				return $b['expires'] - $a['expires'];
			}
		);
		update_option( self::STATES_OPTION, array_slice( $states, 0, self::MAX_STATES, true ), false );

		$url = add_query_arg(
			array(
				'site'   => rawurlencode( home_url() ),
				'admin'  => rawurlencode( admin_url() ),
				'state'  => rawurlencode( $state ),
				'wpUser' => get_current_user_id(),
			),
			RankXAI_App_Client::APP_ORIGIN . '/connect/wordpress'
		);
		add_filter( 'allowed_redirect_hosts', array( __CLASS__, 'allow_app_host' ) );
		wp_safe_redirect( $url );
		exit;
	}

	/**
	 * The one host the Connect button may send an administrator to.
	 *
	 * @param string[] $hosts Allowed hosts.
	 * @return string[]
	 */
	public static function allow_app_host( $hosts ) {
		$hosts[] = (string) wp_parse_url( RankXAI_App_Client::APP_ORIGIN, PHP_URL_HOST );
		return $hosts;
	}

	/**
	 * The Disconnect button.
	 */
	public static function handle_disconnect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to disconnect this site.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_DISCONNECT );
		$removed = self::disconnect( 'disconnected' );
		wp_safe_redirect( add_query_arg( 'rankxai-disconnected', (string) $removed, RankXAI_Admin::page_url( RankXAI_Admin::PAGE_SETTINGS ) ) );
		exit;
	}

	/**
	 * Disconnect: tell RankX AI (while its access still works), remove the token,
	 * and remove the Application Passwords carrying RankX AI's application id.
	 *
	 * @param string $reason 'disconnected', 'deactivated' or 'uninstalled'.
	 * @return int How many Application Passwords were removed.
	 */
	public static function disconnect( $reason ) {
		if ( self::is_connected() ) {
			// Best effort, with a short timeout: deactivating must never wait on us.
			RankXAI_App_Client::request( 'DELETE', '/api/store-app/wp/connection', array( 'reason' => $reason ), 3 );
		}
		delete_option( self::OPTION );
		delete_option( self::STATES_OPTION );
		RankXAI_Session_Cache::clear_all();
		return self::remove_app_passwords();
	}

	/**
	 * Remove every Application Password RankX AI's authorization created.
	 *
	 * A password typed in by hand carries no application id and cannot be told
	 * apart from any other, so it stays; Settings says so.
	 *
	 * @return int How many were removed.
	 */
	public static function remove_app_passwords() {
		if ( ! class_exists( 'WP_Application_Passwords' ) ) {
			return 0;
		}
		$removed = 0;
		$users   = get_users(
			array(
				'meta_key' => WP_Application_Passwords::USERMETA_KEY_APPLICATION_PASSWORDS, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- Run on disconnect only, never on a page view.
				'fields'   => 'ID',
			)
		);
		foreach ( $users as $user_id ) {
			foreach ( WP_Application_Passwords::get_user_application_passwords( (int) $user_id ) as $item ) {
				if ( isset( $item['app_id'], $item['uuid'] ) && self::APP_ID === $item['app_id'] ) {
					if ( true === WP_Application_Passwords::delete_application_password( (int) $user_id, $item['uuid'] ) ) {
						++$removed;
					}
				}
			}
		}
		return $removed;
	}

	/**
	 * The plugin was deactivated.
	 */
	public static function on_deactivate() {
		self::disconnect( 'deactivated' );
	}

	/**
	 * The stored connect states, expired ones dropped.
	 *
	 * @return array<string, array{user: int, expires: int}>
	 */
	private static function states() {
		$states = get_option( self::STATES_OPTION, array() );
		$out    = array();
		foreach ( is_array( $states ) ? $states : array() as $hash => $row ) {
			if ( is_array( $row ) && isset( $row['expires'] ) && (int) $row['expires'] > time() ) {
				$out[ (string) $hash ] = array(
					'user'    => (int) $row['user'],
					'expires' => (int) $row['expires'],
				);
			}
		}
		return $out;
	}

	/**
	 * Use a connect state, once.
	 *
	 * @param string $state The state RankX AI handed back.
	 * @return bool Whether it was one this plugin made and had not used.
	 */
	private static function consume_state( $state ) {
		if ( ! preg_match( '/^rxcs_[A-Za-z0-9_-]{43}$/', $state ) ) {
			return false;
		}
		$hash   = hash( 'sha256', $state );
		$states = self::states();
		$found  = false;
		foreach ( array_keys( $states ) as $stored ) {
			if ( hash_equals( (string) $stored, $hash ) ) {
				$found = true;
			}
		}
		if ( ! $found ) {
			return false;
		}
		unset( $states[ $hash ] );
		update_option( self::STATES_OPTION, $states, false );
		return true;
	}

	/**
	 * The Connect RankX AI button: a form that opens RankX AI in a new tab.
	 *
	 * @param string $label   Button label.
	 * @param string $variant 'primary' or 'outline'.
	 * @return string HTML.
	 */
	public static function connect_button_html( $label, $variant = 'primary' ) {
		$html  = '<form class="rankxai-inline-form" method="post" target="_blank" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		$html .= '<input type="hidden" name="action" value="' . esc_attr( self::ACTION_CONNECT ) . '" />';
		$html .= wp_nonce_field( self::ACTION_CONNECT, '_wpnonce', true, false );
		$html .= '<button type="submit" class="rankxai-button rankxai-button--' . esc_attr( $variant ) . '">' . esc_html( $label ) . '</button>';
		$html .= '</form>';
		return $html;
	}

	/**
	 * Why this site cannot reach RankX AI, or '' when it can.
	 *
	 * @return string
	 */
	public static function outbound_blocked() {
		$http = new WP_Http();
		if ( $http->block_request( RankXAI_App_Client::APP_ORIGIN . '/' ) ) {
			return __( 'This site blocks outgoing connections (WP_HTTP_BLOCK_EXTERNAL in wp-config.php), so it cannot reach RankX AI. Add app.rankxai.com to WP_ACCESSIBLE_HOSTS to allow it.', 'rankxai' );
		}
		return '';
	}

	/**
	 * A REST error.
	 *
	 * @param string $code    Code.
	 * @param string $message Message.
	 * @param int    $status  HTTP status.
	 * @return WP_Error
	 */
	private static function error( $code, $message, $status ) {
		return new WP_Error( $code, $message, array( 'status' => $status ) );
	}
}
