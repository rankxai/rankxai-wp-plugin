<?php
/**
 * Limits on what RankX AI's Application Password may do.
 *
 * The password could otherwise do anything its administrator can, so actions
 * RankX AI never needs are refused for that password only.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Limits on the RankX AI Application Password.
 */
class RankXAI_Access_Scope {

	/**
	 * Hook in.
	 */
	public static function init() {
		add_filter( 'rest_pre_dispatch', array( __CLASS__, 'enforce' ), 10, 3 );
	}

	/**
	 * Refuse a request that RankX AI's password is not allowed to make.
	 *
	 * @param mixed           $result  Response so far, normally null.
	 * @param WP_REST_Server  $server  Server.
	 * @param WP_REST_Request $request Request.
	 * @return mixed
	 */
	public static function enforce( $result, $server, $request ) {
		if ( null !== $result || ! self::is_rankxai_password() ) {
			return $result;
		}
		$reason = self::refusal( $request->get_method(), $request->get_route(), $request );
		if ( '' === $reason ) {
			return $result;
		}
		return new WP_Error( 'rankxai_not_allowed', $reason, array( 'status' => 403 ) );
	}

	/**
	 * Why a request is refused, or '' when it is allowed.
	 *
	 * @param string          $method  HTTP method.
	 * @param string          $route   REST route.
	 * @param WP_REST_Request $request Request.
	 * @return string
	 */
	public static function refusal( $method, $route, $request ) {
		$method = strtoupper( (string) $method );
		$route  = strtolower( '/' . ltrim( (string) $route, '/' ) );
		$write  = 'GET' !== $method && 'HEAD' !== $method;

		if ( false !== strpos( $route, 'application-passwords' ) ) {
			return __( 'RankX AI cannot read or create Application Passwords.', 'rankxai' );
		}
		if ( ! $write ) {
			return '';
		}
		// A batch carries other requests inside it, which this check cannot see.
		if ( preg_match( '#/batch(/v\d+)?$#', $route ) ) {
			return __( 'RankX AI does not send batch requests.', 'rankxai' );
		}
		if ( preg_match( '#^/wp/v2/(plugins|themes)(/|$)#', $route ) ) {
			return __( 'RankX AI cannot install, activate or change plugins and themes.', 'rankxai' );
		}
		// A WooCommerce customer is a WordPress user.
		if ( preg_match( '#^/wp/v2/users(/|$)#', $route ) || preg_match( '#^/wc/v\d+/customers(/|$)#', $route ) ) {
			return __( 'RankX AI cannot create, change or delete users.', 'rankxai' );
		}
		if ( preg_match( '#(^|/)refunds(/|$)#', $route ) ) {
			return __( 'RankX AI cannot issue refunds.', 'rankxai' );
		}
		if ( 'DELETE' === $method && rest_sanitize_boolean( $request->get_param( 'force' ) ) ) {
			return __( 'RankX AI only moves things to the trash; it cannot delete them permanently.', 'rankxai' );
		}
		if ( preg_match( '#^/wp/v2/settings/?$#', $route ) && ( null !== $request->get_param( 'siteurl' ) || null !== $request->get_param( 'home' ) ) ) {
			return __( 'RankX AI cannot change the site address.', 'rankxai' );
		}
		return '';
	}

	/**
	 * Whether this request is signed in with RankX AI's Application Password.
	 *
	 * @return bool
	 */
	private static function is_rankxai_password() {
		if ( ! function_exists( 'rest_get_authenticated_app_password' ) ) {
			return false;
		}
		$uuid = rest_get_authenticated_app_password();
		if ( ! $uuid ) {
			return false;
		}
		$item = WP_Application_Passwords::get_user_application_password( get_current_user_id(), $uuid );
		return is_array( $item ) && isset( $item['app_id'] ) && RankXAI_Connection::APP_ID === $item['app_id'];
	}
}
