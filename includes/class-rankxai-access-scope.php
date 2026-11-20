<?php
/**
 * What RankX AI's Application Password may do on this site.
 *
 * Connecting creates an Application Password for the approving administrator.
 * For that password only, every REST request is refused unless it is on the
 * list below, and the password cannot post unfiltered HTML.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Limits on the RankX AI Application Password.
 */
class RankXAI_Access_Scope {

	/** The site owner's switch for customer, order, user and comment data. Off by default. */
	const OPTION_PERSONAL_DATA = 'rankxai_share_personal_data';

	/** Site settings RankX AI may change. */
	const WRITABLE_SETTINGS = array( 'title', 'description', 'timezone', 'date_format', 'time_format', 'start_of_week', 'posts_per_page', 'default_comment_status', 'default_ping_status' );

	/** Post types that hold site structure or design rather than content. */
	const EXCLUDED_POST_TYPES = array( 'wp_template', 'wp_template_part', 'wp_global_styles', 'wp_navigation', 'wp_font_family', 'wp_font_face', 'wp_block', 'nav_menu_item' );

	/** Taxonomies that hold site structure rather than content. */
	const EXCLUDED_TAXONOMIES = array( 'nav_menu', 'wp_theme', 'wp_template_part_area', 'wp_pattern_category' );

	/**
	 * Cached answer for this request.
	 *
	 * @var bool|null
	 */
	private static $ours = null;

	/**
	 * Hook in.
	 */
	public static function init() {
		add_filter( 'rest_pre_dispatch', array( __CLASS__, 'enforce' ), 10, 3 );
		add_filter( 'map_meta_cap', array( __CLASS__, 'no_unfiltered_html' ), 10, 2 );
		add_filter( 'wp_authenticate_application_password_errors', array( __CLASS__, 'rest_only' ), 10, 3 );
	}

	/**
	 * RankX AI's password works only through the REST API, where the allow list applies, never through XML-RPC.
	 *
	 * @param WP_Error $error Errors so far.
	 * @param WP_User  $user  User.
	 * @param array    $item  The Application Password being used.
	 * @return WP_Error
	 */
	public static function rest_only( $error, $user, $item ) {
		if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST && is_array( $item ) && isset( $item['app_id'] ) && RankXAI_Connection::APP_ID === $item['app_id'] ) {
			$error->add( 'rankxai_rest_only', __( 'RankX AI’s Application Password only works through the REST API.', 'rankxai' ) );
		}
		return $error;
	}

	/**
	 * Whether the site owner lets RankX AI read customer, order, user and comment data.
	 *
	 * @return bool
	 */
	public static function personal_data_allowed() {
		return (bool) get_option( self::OPTION_PERSONAL_DATA );
	}

	/**
	 * RankX AI's password never has `unfiltered_html`, so what it writes is filtered like a non-administrator's.
	 *
	 * @param string[] $caps Primitive capabilities.
	 * @param string   $cap  Capability being checked.
	 * @return string[]
	 */
	public static function no_unfiltered_html( $caps, $cap ) {
		if ( 'unfiltered_html' === $cap && self::is_rankxai_password() ) {
			$caps[] = 'do_not_allow';
		}
		return $caps;
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
		$route  = strtolower( '/' . trim( (string) $route, '/' ) );
		$read   = in_array( $method, array( 'GET', 'HEAD', 'OPTIONS' ), true );

		if ( false !== strpos( $route, 'application-passwords' ) ) {
			return __( 'RankX AI cannot read or create Application Passwords.', 'rankxai' );
		}
		if ( self::is_personal( $method, $route, $request ) && ! self::personal_data_allowed() ) {
			return __( 'Customer, order, user and comment data is off for RankX AI on this site. The site owner can allow it in RankX AI › Settings.', 'rankxai' );
		}
		if ( 'DELETE' === $method && rest_sanitize_boolean( $request->get_param( 'force' ) ) && ! preg_match( '#^/wc/v\d+/webhooks/\d+$#', $route ) ) {
			return __( 'RankX AI only moves things to the trash; it cannot delete them permanently.', 'rankxai' );
		}
		if ( self::allowed( $method, $route, $read, $request ) ) {
			return '';
		}
		return __( 'RankX AI’s connection is not allowed to use this part of the site.', 'rankxai' );
	}

	/**
	 * Whether a request reads personal data: orders, refunds, customers, the user list, product reviews, or comments in full.
	 *
	 * @param string          $method  HTTP method.
	 * @param string          $route   Normalised route.
	 * @param WP_REST_Request $request Request.
	 * @return bool
	 */
	private static function is_personal( $method, $route, $request ) {
		if ( preg_match( '#^/wc/v\d+/(orders|refunds|customers|products/reviews)(/|$)#', $route ) ) {
			return true;
		}
		if ( preg_match( '#^/wp/v2/users(/(?!me$)[^/]+)?$#', $route ) ) {
			return true;
		}
		return (bool) preg_match( '#^/wp/v2/comments(/|$)#', $route ) && 'edit' === $request->get_param( 'context' );
	}

	/**
	 * The allow list.
	 *
	 * @param string          $method  HTTP method.
	 * @param string          $route   Normalised route.
	 * @param bool            $read    Whether the method only reads.
	 * @param WP_REST_Request $request Request.
	 * @return bool
	 */
	private static function allowed( $method, $route, $read, $request ) {
		// This plugin's own routes check their own capabilities.
		if ( preg_match( '#^/rankxai/v1(/|$)#', $route ) ) {
			return true;
		}
		// The Redirection plugin's API: list, add a plain redirect between two paths on this site, remove one.
		if ( preg_match( '#^/redirection/v1/(redirect|group)$#', $route ) && $read ) {
			return true;
		}
		if ( '/redirection/v1/redirect' === $route && 'POST' === $method ) {
			return self::plain_redirect( $request );
		}
		if ( '/redirection/v1/bulk/redirect/delete' === $route && 'POST' === $method ) {
			return true;
		}
		if ( $read && self::readable( $route ) ) {
			return true;
		}
		if ( preg_match( '#^/wp/v2/settings$#', $route ) ) {
			return $read || self::only_params( $request, self::WRITABLE_SETTINGS );
		}
		if ( preg_match( '#^/wp/v2/comments/\d+$#', $route ) ) {
			return $read || ( 'DELETE' !== $method && self::only_params( $request, array( 'status' ) ) );
		}
		if ( self::content_route( $route ) ) {
			return true;
		}
		if ( preg_match( '#^/wc/v\d+/products(/|$)#', $route ) && ! preg_match( '#/batch$#', $route ) ) {
			return true;
		}
		if ( preg_match( '#^/wc/v\d+/webhooks(/(\d+))?$#', $route, $m ) ) {
			return $read || self::own_webhook( $method, isset( $m[2] ) ? (int) $m[2] : 0, $request );
		}
		return false;
	}

	/**
	 * Read-only routes: discovery, site structure and store settings.
	 *
	 * @param string $route Normalised route.
	 * @return bool
	 */
	private static function readable( $route ) {
		$patterns = array(
			'#^/$#',
			'#^/[a-z0-9-]+/v\d+$#',
			'#^/wp/v2/(types|taxonomies|statuses|search|settings|plugins|themes|menus|menu-items|widgets|comments|users|users/me)(/|$)#',
			'#^/wc/v\d+/(system_status|settings|coupons|orders|refunds|customers)(/|$)#',
			'#^/wp-abilities/v1/abilities$#',
		);
		foreach ( $patterns as $pattern ) {
			if ( preg_match( $pattern, $route ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Whether a route belongs to a public post type or taxonomy, for content rather than site structure.
	 *
	 * @param string $route Normalised route.
	 * @return bool
	 */
	private static function content_route( $route ) {
		if ( ! preg_match( '#^/wp/v2/([a-z0-9_-]+)(?:/\d+(?:/(?:revisions|autosaves)(?:/\d+)?)?)?$#', $route, $m ) ) {
			return false;
		}
		$bases = array();
		foreach ( get_post_types( array( 'show_in_rest' => true ), 'objects' ) as $type ) {
			if ( is_post_type_viewable( $type ) && ! in_array( $type->name, self::EXCLUDED_POST_TYPES, true ) ) {
				$bases[] = $type->rest_base ? $type->rest_base : $type->name;
			}
		}
		foreach ( get_taxonomies( array( 'show_in_rest' => true ), 'objects' ) as $taxonomy ) {
			if ( is_taxonomy_viewable( $taxonomy ) && ! in_array( $taxonomy->name, self::EXCLUDED_TAXONOMIES, true ) ) {
				$bases[] = $taxonomy->rest_base ? $taxonomy->rest_base : $taxonomy->name;
			}
		}
		return in_array( $m[1], array_map( 'strtolower', $bases ), true );
	}

	/**
	 * Whether a request carries no parameters other than the allowed ones, wherever they were sent.
	 *
	 * @param WP_REST_Request $request Request.
	 * @param string[]        $allowed Allowed parameter names.
	 * @return bool
	 */
	private static function only_params( $request, $allowed ) {
		$sent = array();
		foreach ( array( $request->get_query_params(), $request->get_body_params(), $request->get_json_params(), $request->get_file_params() ) as $params ) {
			$sent = array_merge( $sent, array_keys( (array) $params ) );
		}
		$sent = array_diff( $sent, array( 'rest_route', '_locale', '_method', '_fields', '_envelope', '_embed', '_wpnonce', '_rxcb', 'context' ) );
		return array() === array_diff( $sent, $allowed );
	}

	/**
	 * A Redirection rule is allowed only as a plain redirect from one path on this site to another.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return bool
	 */
	private static function plain_redirect( $request ) {
		$data = $request->get_param( 'action_data' );
		$to   = is_array( $data ) && isset( $data['url'] ) ? $data['url'] : null;
		$path = '#^/(?![/\\\\])#';
		return ! rest_sanitize_boolean( $request->get_param( 'regex' ) )
			&& in_array( $request->get_param( 'match_type' ), array( null, 'url' ), true )
			&& 'url' === $request->get_param( 'action_type' )
			&& is_string( $request->get_param( 'url' ) ) && preg_match( $path, $request->get_param( 'url' ) )
			&& is_string( $to ) && preg_match( $path, $to );
	}

	/**
	 * A webhook write is allowed only for product topics delivering to RankX AI, and only on RankX AI's own webhooks.
	 *
	 * @param string          $method  HTTP method.
	 * @param int             $id      Webhook ID, or 0 when creating.
	 * @param WP_REST_Request $request Request.
	 * @return bool
	 */
	private static function own_webhook( $method, $id, $request ) {
		$ours = RankXAI_App_Client::APP_ORIGIN . '/api/webhooks/woocommerce';
		if ( $id > 0 ) {
			$existing = function_exists( 'wc_get_webhook' ) ? wc_get_webhook( $id ) : null;
			if ( ! $existing || 0 !== strpos( (string) $existing->get_delivery_url(), $ours ) ) {
				return false;
			}
			if ( 'DELETE' === $method ) {
				return true;
			}
		}
		$url   = $request->get_param( 'delivery_url' );
		$topic = $request->get_param( 'topic' );
		if ( null !== $url && 0 !== strpos( (string) $url, $ours ) ) {
			return false;
		}
		if ( null !== $topic && 0 !== strpos( (string) $topic, 'product.' ) ) {
			return false;
		}
		return $id > 0 || ( null !== $url && null !== $topic );
	}

	/**
	 * Whether this request is signed in with RankX AI's Application Password.
	 *
	 * @return bool
	 */
	public static function is_rankxai_password() {
		if ( null !== self::$ours ) {
			return self::$ours;
		}
		if ( ! function_exists( 'rest_get_authenticated_app_password' ) ) {
			return false;
		}
		$uuid = rest_get_authenticated_app_password();
		if ( ! $uuid ) {
			return false;
		}
		$item       = WP_Application_Passwords::get_user_application_password( get_current_user_id(), $uuid );
		self::$ours = is_array( $item ) && isset( $item['app_id'] ) && RankXAI_Connection::APP_ID === $item['app_id'];
		return self::$ours;
	}
}
