<?php
/**
 * The RankX AI user that the connection signs in as.
 *
 * Connecting creates a user with its own role, which can edit content and
 * products but cannot change plugins, themes, users or settings. RankX AI's
 * Application Password belongs to that user, not to an administrator.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * The connector user, its role and the approval screen.
 */
class RankXAI_Connector {

	/** The role. */
	const ROLE = 'rankxai_connector';

	/** Held by the connector user; lets it use this plugin's REST routes. */
	const CAP = 'rankxai_connect';

	/** The connector user's ID. Not autoloaded. */
	const OPTION_USER = 'rankxai_connector_user';

	/** The administrator who approved the connection. Not autoloaded. */
	const OPTION_APPROVER = 'rankxai_connector_approver';

	/** The approval screen. */
	const PAGE = 'rankxai-authorize';

	/** The approval form. */
	const ACTION = 'rankxai_authorize';

	/** How long an opened approval screen stays usable. */
	const REQUEST_TTL = 30 * MINUTE_IN_SECONDS;

	/** Redirection plugin actions the connector may use: listing redirects only. */
	const REDIRECTION_CAPS = array( 'redirection_cap_redirect_manage' );

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle' ) );
		add_filter( 'rest_index', array( __CLASS__, 'advertise' ) );
		add_filter( 'user_has_cap', array( __CLASS__, 'personal_data_caps' ), 10, 4 );
		add_filter( 'woocommerce_rest_check_permissions', array( __CLASS__, 'woocommerce' ), 10, 4 );
		add_filter( 'redirection_capability_check', array( __CLASS__, 'redirection' ), 10, 2 );
		add_filter( 'wp_insert_post_data', array( __CLASS__, 'author' ), 10, 2 );
		add_filter( 'authenticate', array( __CLASS__, 'no_login' ), 100 );
		add_filter( 'allow_password_reset', array( __CLASS__, 'no_password_reset' ), 10, 2 );
		add_filter( 'editable_roles', array( __CLASS__, 'not_assignable' ) );
	}

	/**
	 * The role is only for the connection user, so it is not offered when adding or editing people.
	 *
	 * @param array $roles Roles.
	 * @return array
	 */
	public static function not_assignable( $roles ) {
		unset( $roles[ self::ROLE ] );
		return $roles;
	}

	/**
	 * What the role can do: content, media and products. Nothing that changes how the site works.
	 *
	 * @return array<string, bool>
	 */
	public static function caps() {
		$caps = array( 'read', 'upload_files', 'manage_categories', self::CAP );
		foreach ( array( 'posts', 'pages', 'products' ) as $type ) {
			foreach ( array( 'edit_%s', 'edit_others_%s', 'edit_published_%s', 'edit_private_%s', 'publish_%s', 'read_private_%s', 'delete_%s', 'delete_others_%s', 'delete_published_%s', 'delete_private_%s' ) as $pattern ) {
				$caps[] = sprintf( $pattern, $type );
			}
		}
		foreach ( array( 'manage_product_terms', 'edit_product_terms', 'delete_product_terms', 'assign_product_terms' ) as $cap ) {
			$caps[] = $cap;
		}
		return array_fill_keys( $caps, true );
	}

	/**
	 * Create the role, or bring its capabilities up to date.
	 */
	public static function ensure_role() {
		$role = get_role( self::ROLE );
		if ( ! $role ) {
			add_role( self::ROLE, __( 'RankX AI', 'rankxai' ), self::caps() );
			return;
		}
		$want = self::caps();
		foreach ( $want as $cap => $grant ) {
			if ( empty( $role->capabilities[ $cap ] ) ) {
				$role->add_cap( $cap, $grant );
			}
		}
		foreach ( array_keys( $role->capabilities ) as $cap ) {
			if ( ! isset( $want[ $cap ] ) ) {
				$role->remove_cap( $cap );
			}
		}
	}

	/**
	 * The connector user's ID, or 0.
	 *
	 * @return int
	 */
	public static function user_id() {
		$id   = (int) get_option( self::OPTION_USER, 0 );
		$user = $id > 0 ? get_userdata( $id ) : false;
		return $user && in_array( self::ROLE, (array) $user->roles, true ) ? $id : 0;
	}

	/**
	 * Whether a user is the connector user.
	 *
	 * @param int $user_id User ID.
	 * @return bool
	 */
	public static function is_connector( $user_id ) {
		$id = self::user_id();
		return $id > 0 && (int) $user_id === $id;
	}

	/**
	 * Whether the current user may use this plugin's REST routes: an administrator or the connector.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( 'manage_options' ) || current_user_can( self::CAP );
	}

	/**
	 * The connector user, created if missing.
	 *
	 * @return int|WP_Error
	 */
	public static function ensure_user() {
		self::ensure_role();
		$id = self::user_id();
		if ( $id > 0 ) {
			return $id;
		}
		$login = 'rankxai';
		$i     = 2;
		while ( username_exists( $login ) && $i < 50 ) {
			$login = 'rankxai-' . $i;
			++$i;
		}
		$id = wp_insert_user(
			array(
				'user_login'   => $login,
				'user_pass'    => wp_generate_password( 64, true, true ),
				'user_email'   => '',
				'display_name' => 'RankX AI',
				'nickname'     => 'RankX AI',
				'role'         => self::ROLE,
				'description'  => __( 'Used by the RankX AI connection. It cannot sign in to wp-admin. Disconnecting RankX AI removes it.', 'rankxai' ),
			)
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		update_option( self::OPTION_USER, (int) $id, false );
		return (int) $id;
	}

	/**
	 * Remove the connector user. Its posts go to the administrator who approved the connection.
	 *
	 * @return bool Whether a user was removed.
	 */
	public static function remove_user() {
		$id = self::user_id();
		delete_option( self::OPTION_USER );
		if ( $id <= 0 ) {
			return false;
		}
		require_once ABSPATH . 'wp-admin/includes/user.php';
		$owner = self::owner_id();
		return (bool) wp_delete_user( $id, $owner > 0 && $owner !== $id ? $owner : null );
	}

	/**
	 * The administrator who approved the connection, or another administrator.
	 *
	 * @return int
	 */
	public static function owner_id() {
		$id   = (int) get_option( self::OPTION_APPROVER, 0 );
		$user = $id > 0 ? get_userdata( $id ) : false;
		if ( $user && user_can( $user, 'manage_options' ) ) {
			return $id;
		}
		$admins = get_users(
			array(
				'role'   => 'administrator',
				'number' => 1,
				'fields' => 'ID',
			)
		);
		return $admins ? (int) $admins[0] : 0;
	}

	/**
	 * Tell RankX AI where to ask for approval, beside WordPress's own Application Password screen.
	 *
	 * @param WP_REST_Response $response The REST index.
	 * @return WP_REST_Response
	 */
	public static function advertise( $response ) {
		if ( ! function_exists( 'wp_is_application_passwords_available' ) || ! wp_is_application_passwords_available() ) {
			return $response;
		}
		$data = $response->get_data();
		if ( ! isset( $data['authentication'] ) || ! is_array( $data['authentication'] ) ) {
			$data['authentication'] = array();
		}
		$data['authentication']['rankxai'] = array(
			'endpoints' => array( 'authorization' => admin_url( 'admin.php?page=' . self::PAGE ) ),
		);
		$response->set_data( $data );
		return $response;
	}

	/**
	 * The approval request from the query string, or a WP_Error.
	 *
	 * @param array $source $_GET, or a request kept by the screen.
	 * @return array|WP_Error
	 */
	private static function request( $source ) {
		$get     = function ( $key ) use ( $source ) {
			return isset( $source[ $key ] ) && is_string( $source[ $key ] ) ? sanitize_text_field( wp_unslash( $source[ $key ] ) ) : '';
		};
		$app_id  = $get( 'app_id' );
		$name    = $get( 'app_name' );
		$success = isset( $source['success_url'] ) && is_string( $source['success_url'] ) ? esc_url_raw( wp_unslash( $source['success_url'] ) ) : '';
		$reject  = isset( $source['reject_url'] ) && is_string( $source['reject_url'] ) ? esc_url_raw( wp_unslash( $source['reject_url'] ) ) : '';
		if ( RankXAI_Connection::APP_ID !== $app_id ) {
			return new WP_Error( 'rankxai_bad_app', __( 'This screen only approves RankX AI.', 'rankxai' ) );
		}
		if ( ! self::ours( $success ) || ( '' !== $reject && ! self::ours( $reject ) ) ) {
			return new WP_Error( 'rankxai_bad_return', __( 'This request does not return to RankX AI, so it was not opened.', 'rankxai' ) );
		}
		return array(
			'app_id'      => $app_id,
			'app_name'    => '' !== $name ? substr( $name, 0, 100 ) : 'RankX AI',
			'success_url' => $success,
			'reject_url'  => '' !== $reject ? $reject : $success,
		);
	}

	/**
	 * Where an opened approval screen keeps its request, for the administrator who opened it.
	 *
	 * @param string $key Random key from the form.
	 * @return string
	 */
	private static function request_key( $key ) {
		return 'rankxai_authorize_' . get_current_user_id() . '_' . md5( $key );
	}

	/**
	 * Whether a URL is on RankX AI's own host, over HTTPS.
	 *
	 * @param string $url URL.
	 * @return bool
	 */
	private static function ours( $url ) {
		$host = (string) wp_parse_url( RankXAI_App_Client::APP_ORIGIN, PHP_URL_HOST );
		return '' !== $url && 'https' === wp_parse_url( $url, PHP_URL_SCHEME ) && strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) ) === $host;
	}

	/**
	 * Render the approval screen.
	 */
	public static function render() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only display; the form below carries a nonce.
		$req = self::request( $_GET );
		echo '<div class="wrap rankxai-authorize"><h1>' . esc_html__( 'Connect RankX AI', 'rankxai' ) . '</h1>';
		if ( is_wp_error( $req ) ) {
			echo '<div class="notice notice-error"><p>' . esc_html( $req->get_error_message() ) . '</p></div></div>';
			return;
		}
		if ( ! wp_is_application_passwords_available() ) {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Application Passwords are turned off on this site, so RankX AI cannot connect.', 'rankxai' ) . '</p></div></div>';
			return;
		}
		$existing = self::user_id();
		echo '<p>' . esc_html__( 'RankX AI will sign in to this site as its own user, called “RankX AI”, with a password only it holds.', 'rankxai' ) . '</p>';
		echo '<p><strong>' . esc_html__( 'That user can:', 'rankxai' ) . '</strong></p><ul class="ul-disc">';
		echo '<li>' . esc_html__( 'create, edit and publish posts, pages and products and their categories and tags: titles, text, excerpts, addresses, status, parent and template, and a product\'s price, stock and other details', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'upload images and set their alt text', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'move content to the trash (never delete it permanently)', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'set a page\'s search title, description, link previews and noindex, in your SEO plugin\'s fields when you have one, and its structured data', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'publish llms.txt and agents.md text and a business summary for the markdown copies (served only if you switch them on, and never in place of text you wrote)', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'save the summary shown on the RankX AI Overview page, and its own connection token', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'read WooCommerce settings and status, the AI crawler counts, the site check results and the list of redirects (only you add or remove redirects, here in wp-admin)', 'rankxai' ) . '</li></ul>';
		echo '<p><strong>' . esc_html__( 'It cannot:', 'rankxai' ) . '</strong></p><ul class="ul-disc">';
		echo '<li>' . esc_html__( 'install, change or remove plugins or themes', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'add, change or remove users', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'change site, store or plugin settings, including redirects, shipping and webhooks', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'trash, unpublish or move the front page, posts page, privacy policy or store pages', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'sign in to wp-admin', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'switch any of this plugin\'s features on or off, or write ai.txt', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'read orders, customers, users or comments, unless you allow it in RankX AI › Settings (and even then it cannot change them)', 'rankxai' ) . '</li></ul>';
		echo '<p>' . esc_html__( 'Content it creates is credited to you. Disconnecting RankX AI removes the user and its password.', 'rankxai' ) . '</p>';
		if ( $existing > 0 ) {
			echo '<p>' . esc_html__( 'RankX AI is already connected. Approving again replaces its password.', 'rankxai' ) . '</p>';
		}
		// The request stays on the server and the form posts only its key: many hosting firewalls refuse a form that posts a web address.
		$key = wp_generate_password( 24, false );
		set_transient( self::request_key( $key ), $req, self::REQUEST_TTL );
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION ) . '" />';
		echo '<input type="hidden" name="request" value="' . esc_attr( $key ) . '" />';
		wp_nonce_field( self::ACTION, '_wpnonce', false );
		echo '<p><button type="submit" name="decision" value="approve" class="button button-primary">' . esc_html__( 'Approve', 'rankxai' ) . '</button> ';
		echo '<button type="submit" name="decision" value="reject" class="button">' . esc_html__( 'Don’t connect', 'rankxai' ) . '</button></p>';
		echo '</form></div>';
	}

	/**
	 * The approval form: create the user and its password, then return to RankX AI.
	 */
	public static function handle() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to connect this site.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION );
		$key    = isset( $_POST['request'] ) ? preg_replace( '/[^A-Za-z0-9]/', '', sanitize_text_field( wp_unslash( $_POST['request'] ) ) ) : '';
		$stored = '' !== $key ? get_transient( self::request_key( $key ) ) : false;
		if ( '' !== $key ) {
			delete_transient( self::request_key( $key ) );
		}
		if ( ! is_array( $stored ) ) {
			wp_die( esc_html__( 'This approval has expired. Start again from RankX AI.', 'rankxai' ), '', array( 'response' => 400 ) );
		}
		$req = self::request( $stored );
		if ( is_wp_error( $req ) ) {
			wp_die( esc_html( $req->get_error_message() ), '', array( 'response' => 400 ) );
		}
		add_filter( 'allowed_redirect_hosts', array( 'RankXAI_Connection', 'allow_app_host' ) );

		$decision = isset( $_POST['decision'] ) ? sanitize_key( wp_unslash( $_POST['decision'] ) ) : '';
		if ( 'approve' !== $decision ) {
			wp_safe_redirect( add_query_arg( 'success', 'false', $req['reject_url'] ) );
			exit;
		}

		$id = self::ensure_user();
		if ( is_wp_error( $id ) ) {
			wp_die( esc_html( $id->get_error_message() ), '', array( 'response' => 500 ) );
		}
		update_option( self::OPTION_APPROVER, get_current_user_id(), false );

		// One password at a time.
		foreach ( WP_Application_Passwords::get_user_application_passwords( $id ) as $item ) {
			if ( isset( $item['app_id'], $item['uuid'] ) && RankXAI_Connection::APP_ID === $item['app_id'] ) {
				WP_Application_Passwords::delete_application_password( $id, $item['uuid'] );
			}
		}
		$created = WP_Application_Passwords::create_new_application_password(
			$id,
			array(
				'name'   => $req['app_name'],
				'app_id' => RankXAI_Connection::APP_ID,
			)
		);
		if ( is_wp_error( $created ) ) {
			wp_die( esc_html( $created->get_error_message() ), '', array( 'response' => 500 ) );
		}
		$user = get_userdata( $id );

		wp_safe_redirect(
			add_query_arg(
				array(
					'site_url'   => rawurlencode( site_url() ),
					'user_login' => rawurlencode( $user->user_login ),
					'password'   => rawurlencode( $created[0] ),
				),
				$req['success_url']
			)
		);
		exit;
	}

	/**
	 * Orders, customers, users and comments, only while the site owner allows it in Settings.
	 *
	 * @param array   $allcaps All capabilities of the user.
	 * @param array   $caps    Required primitive capabilities.
	 * @param array   $args    Arguments.
	 * @param WP_User $user    User.
	 * @return array
	 */
	public static function personal_data_caps( $allcaps, $caps, $args, $user ) {
		if ( empty( $allcaps[ self::CAP ] ) || ! RankXAI_Access_Scope::personal_data_allowed() || ! self::is_connector( $user->ID ) ) {
			return $allcaps;
		}
		// WordPress asks for these to READ orders, the user list and comments in full. Every write to them is
		// still refused by RankXAI_Access_Scope, which lets these routes through for reading only.
		foreach ( array( 'read_private_shop_orders', 'list_users', 'moderate_comments' ) as $cap ) {
			$allcaps[ $cap ] = true;
		}
		return $allcaps;
	}

	/**
	 * WooCommerce: the connector may read store settings and system status. It cannot
	 * change settings or webhooks: this plugin reports product changes itself.
	 *
	 * @param bool   $permission Permission so far.
	 * @param string $context    'read', 'create', 'edit', 'delete' or 'batch'.
	 * @param int    $object_id  Object ID.
	 * @param string $type       Object type.
	 * @return bool
	 */
	public static function woocommerce( $permission, $context, $object_id, $type ) {
		if ( $permission || ! current_user_can( self::CAP ) ) {
			return $permission;
		}
		if ( in_array( $type, array( 'settings', 'system_status' ), true ) ) {
			return 'read' === $context;
		}
		return $permission;
	}

	/**
	 * The Redirection plugin: the connector may list redirects. Only the site's
	 * administrator adds or removes one, in wp-admin.
	 *
	 * @param string $cap      Capability Redirection will check.
	 * @param string $cap_name The Redirection action.
	 * @return string
	 */
	public static function redirection( $cap, $cap_name ) {
		if ( in_array( $cap_name, self::REDIRECTION_CAPS, true ) && current_user_can( self::CAP ) ) {
			return self::CAP;
		}
		return $cap;
	}

	/**
	 * Content RankX AI creates is credited to the administrator who connected it.
	 *
	 * @param array $data    Post data about to be saved.
	 * @param array $postarr Post data as passed in.
	 * @return array
	 */
	public static function author( $data, $postarr ) {
		$id = self::user_id();
		if ( $id > 0 && isset( $data['post_author'] ) && (int) $data['post_author'] === $id && empty( $postarr['ID'] ) ) {
			$owner = self::owner_id();
			if ( $owner > 0 ) {
				$data['post_author'] = $owner;
			}
		}
		return $data;
	}

	/**
	 * The connector user cannot sign in with a username and password.
	 *
	 * @param WP_User|WP_Error|null $user User so far.
	 * @return WP_User|WP_Error|null
	 */
	public static function no_login( $user ) {
		if ( $user instanceof WP_User && self::is_connector( $user->ID ) && ! ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return new WP_Error( 'rankxai_no_login', __( 'This user is only for the RankX AI connection and cannot sign in.', 'rankxai' ) );
		}
		return $user;
	}

	/**
	 * No password reset for the connector user.
	 *
	 * @param bool $allow   Whether to allow.
	 * @param int  $user_id User ID.
	 * @return bool
	 */
	public static function no_password_reset( $allow, $user_id ) {
		return self::is_connector( $user_id ) ? false : $allow;
	}
}
