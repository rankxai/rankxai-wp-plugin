<?php
/**
 * The `rankxai/v1` REST surface.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * REST routes.
 */
class RankXAI_REST {

	const NAMESPACE_V1 = 'rankxai/v1';

	/**
	 * Hook route registration.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_filter( 'rest_pre_dispatch', array( __CLASS__, 'never_cache' ), 10, 3 );
	}

	/**
	 * Keep every `rankxai/v1` response out of the site's full-page cache.
	 *
	 * @param mixed           $result  Dispatch result, passed through untouched.
	 * @param WP_REST_Server  $server  Server instance.
	 * @param WP_REST_Request $request Request.
	 * @return mixed
	 */
	public static function never_cache( $result, $server, $request ) {
		$route = is_object( $request ) && method_exists( $request, 'get_route' ) ? (string) $request->get_route() : '';
		if ( 0 !== strpos( $route, '/' . self::NAMESPACE_V1 ) ) {
			return $result;
		}

		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- A de-facto standard constant every major page cache reads. Prefixing it would define something nothing looks at, which is the defect this line exists to prevent.
			define( 'DONOTCACHEPAGE', true );
		}

		/**
		 * LiteSpeed Cache's own control. A no-op without that plugin, and the
		 * hook name is LiteSpeed's, so it is not prefixed.
		 */
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Another plugin's documented public hook; see above.
		do_action( 'litespeed_control_set_nocache', 'RankX AI connector responses are per-request state' );

		return $result;
	}

	/**
	 * Can this request read site configuration?
	 *
	 * @return bool
	 */
	public static function can_read() {
		return current_user_can( 'edit_posts' );
	}

	/**
	 * Can this request write to a specific post?
	 *
	 * Checks `edit_post` against the ACTUAL post rather than the blanket
	 * `edit_others_posts`, so the credential's real permissions decide — including
	 * on a site where the connected account is deliberately limited.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return bool|WP_Error
	 */
	public static function can_write_post( $request ) {
		$post_id = (int) $request['id'];
		if ( $post_id <= 0 || ! get_post( $post_id ) ) {
			return new WP_Error(
				'rankxai_not_found',
				__( 'No such post.', 'rankxai' ),
				array( 'status' => 404 )
			);
		}
		return current_user_can( 'edit_post', $post_id );
	}

	/**
	 * Can this request publish a site-wide document?
	 *
	 * @return bool
	 */
	public static function can_manage_documents() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Register every route.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/status',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'handle_status' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/manifest',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'handle_manifest' ),
				'permission_callback' => array( __CLASS__, 'can_read' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/seo/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'handle_seo_get' ),
					'permission_callback' => array( __CLASS__, 'can_write_post' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'handle_seo_set' ),
					'permission_callback' => array( __CLASS__, 'can_write_post' ),
					'args'                => array(
						'fields' => array(
							'required' => true,
							'type'     => 'object',
						),
					),
				),
			)
		);

		// `can_write_post`, the same gate the SEO write uses, because this IS a
		// post edit: `edit_post` against the ACTUAL post rather than a blanket
		// capability, so a deliberately limited connected account is limited
		// here too.
		register_rest_route(
			self::NAMESPACE_V1,
			'/content/(?P<id>\d+)',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle_content_set' ),
				'permission_callback' => array( __CLASS__, 'can_write_post' ),
				'args'                => array(
					'fields' => array(
						'required' => true,
						'type'     => 'object',
					),
				),
			)
		);

		// `can_write_post` rather than `manage_options`: this is a claim about
		// ONE page, written by whoever may edit that page, which is exactly the
		// boundary the block channel it replaces already had. The documents and
		// twins routes use `manage_options` because those are site-wide
		// statements; this is not one.
		register_rest_route(
			self::NAMESPACE_V1,
			'/schema/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'handle_schema_get' ),
					'permission_callback' => array( __CLASS__, 'can_write_post' ),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'handle_schema_put' ),
					'permission_callback' => array( __CLASS__, 'can_write_post' ),
					'args'                => array(
						'content' => array(
							'required' => true,
							'type'     => 'string',
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'handle_schema_delete' ),
					'permission_callback' => array( __CLASS__, 'can_write_post' ),
				),
			)
		);

		// Per-post schema, item by item, across every store a schema can live in
		// (Rank Math's own rows, our set, the older single document). The same
		// `can_write_post` gate as `/schema`, for the same reason: a claim about ONE
		// page, made by whoever may edit that page.
		register_rest_route(
			self::NAMESPACE_V1,
			'/schema-set/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'handle_schema_set_get' ),
					'permission_callback' => array( __CLASS__, 'can_write_post' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'handle_schema_set_write' ),
					'permission_callback' => array( __CLASS__, 'can_write_post' ),
					'args'                => array(
						'op' => array(
							'required' => true,
							'type'     => 'string',
							'enum'     => array( 'upsert', 'delete' ),
						),
					),
				),
			)
		);

		// Site-level facts about the SEO plugins, for a caller that has not
		// chosen a page yet. The same `can_read` gate as `/manifest`.
		register_rest_route(
			self::NAMESPACE_V1,
			'/schema-providers',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'handle_schema_providers' ),
				'permission_callback' => array( __CLASS__, 'can_read' ),
			)
		);

		// Gap fills are site-wide head output, so `manage_options`, as the documents
		// and twins routes. The platform switches a feature on only after reading
		// the rendered pages and finding nothing prints it.
		register_rest_route(
			self::NAMESPACE_V1,
			'/fill',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'handle_fill_get' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'handle_fill_put' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
				),
			)
		);

		// Read-only: what a store would hold for a schema, so a preview shows the
		// provider's own sanitising rather than a guess at it.
		register_rest_route(
			self::NAMESPACE_V1,
			'/schema-set/(?P<id>\d+)/normalise',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle_schema_set_normalise' ),
				'permission_callback' => array( __CLASS__, 'can_write_post' ),
			)
		);

		// The slug is constrained IN THE ROUTE PATTERN to the three we serve, so
		// an unknown one is a 404 from WordPress's own router and never reaches a
		// handler. That is one layer; `RankXAI_Documents` re-checks against its
		// own catalogue, because a route pattern is not a validator and the day
		// somebody widens the pattern is the day the second check earns itself.
		register_rest_route(
			self::NAMESPACE_V1,
			'/documents/(?P<slug>llms_txt|agents_md|ai_txt)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'handle_document_get' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'handle_document_put' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
					'args'                => array(
						'content' => array(
							'required' => true,
							'type'     => 'string',
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'handle_document_delete' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
				),
			)
		);

		// `manage_options`, for the same reason the documents route uses it: this
		// switch publishes NEW PUBLIC URLs across the whole site. It is closer to
		// editing robots.txt than to editing a page, and the account that
		// connected the site may deliberately have been limited.
		register_rest_route(
			self::NAMESPACE_V1,
			'/twins',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'handle_twins_get' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'handle_twins_put' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
				),
			)
		);

		// Redirects are site-wide, so `manage_options`, the same capability the
		// Redirection plugin requires for its own routes.
		register_rest_route(
			self::NAMESPACE_V1,
			'/redirects',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'handle_redirects_get' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'handle_redirects_create' ),
					'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
				),
			)
		);

		// The backend is constrained in the route pattern, so an unknown one
		// never reaches the handler.
		register_rest_route(
			self::NAMESPACE_V1,
			'/redirects/(?P<backend>rank_math|own_store)/(?P<id>[a-z0-9]{1,32})',
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => array( __CLASS__, 'handle_redirects_delete' ),
				'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/redirects/purge',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle_redirects_purge' ),
				'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/redirects/not-found',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'handle_redirects_not_found' ),
				'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
			)
		);

		// Crawler counters are read, and the crawler list is updated, by the
		// platform. There is deliberately no route that switches counting on:
		// that is a choice for this site's administrator, on its own screen.
		register_rest_route(
			self::NAMESPACE_V1,
			'/crawlers',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'handle_crawlers_get' ),
				'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/crawlers/config',
			array(
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => array( __CLASS__, 'handle_crawlers_config' ),
				'permission_callback' => array( __CLASS__, 'can_manage_documents' ),
			)
		);
	}

	/**
	 * Crawler counters from a day onwards, a page at a time.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_crawlers_get( $request ) {
		$today = gmdate( 'Y-m-d' );
		$floor = gmdate( 'Y-m-d', strtotime( $today . ' -' . ( RankXAI_Crawlers::RETENTION_DAYS - 1 ) . ' days' ) );

		$since = $request->get_param( 'since' );
		if ( null === $since || '' === $since ) {
			$since = $floor;
		} elseif ( ! is_string( $since ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $since ) ) {
			return new WP_Error( 'rankxai_crawlers_bad_since', 'since must be a date, YYYY-MM-DD', array( 'status' => 400 ) );
		}

		$offset = $request->get_param( 'offset' );
		$limit  = $request->get_param( 'limit' );
		$offset = is_numeric( $offset ) ? max( 0, (int) $offset ) : 0;
		$limit  = is_numeric( $limit ) ? min( 2000, max( 0, (int) $limit ) ) : 1000;

		$page = RankXAI_Crawlers::rows( $since, $offset, $limit );

		return new WP_REST_Response(
			array(
				'enabled'       => RankXAI_Crawlers::enabled(),
				'retentionDays' => RankXAI_Crawlers::RETENTION_DAYS,
				'maxRowsPerDay' => RankXAI_Crawlers::MAX_ROWS_PER_DAY,
				'today'         => $today,
				'since'         => $since,
				'offset'        => $offset,
				'total'         => $page['total'],
				'rows'          => $page['rows'],
				'config'        => RankXAI_Crawlers::config_summary(),
				'pageCaches'    => RankXAI_Crawlers::page_caches(),
			),
			200
		);
	}

	/**
	 * Store the crawler list and the address ranges RankX AI publishes.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_crawlers_config( $request ) {
		$saved = RankXAI_Crawlers::save_config( $request->get_json_params() );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		return new WP_REST_Response( $saved, 200 );
	}

	/**
	 * Every redirect manager on the site, and the redirects we can read.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_redirects_get( $request ) {
		$from = $request->get_param( 'from' );
		if ( null !== $from && '' !== $from ) {
			$reason = RankXAI_Redirects::path_rejection( $from );
			if ( '' !== $reason ) {
				return new WP_Error( 'rankxai_redirect_bad_path', sprintf( 'from %s', $reason ), array( 'status' => 400 ) );
			}
		}
		$listed = RankXAI_Redirects::items( is_string( $from ) ? $from : '' );

		return new WP_REST_Response(
			array(
				'managers' => RankXAI_Redirects::managers(),
				'store'    => array(
					'count' => count( RankXAI_Redirects::stored() ),
					'max'   => RankXAI_Redirects::MAX,
				),
				'items'    => $listed['items'],
				'totals'   => $listed['totals'],
				// Where the site lives. A subdirectory install changes what a
				// path means to every redirect manager.
				'homePath' => (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ),
			),
			200
		);
	}

	/**
	 * Create a redirect on the backend the platform chose.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_redirects_create( $request ) {
		$backend = $request->get_param( 'backend' );
		$from    = $request->get_param( 'from' );
		$to      = $request->get_param( 'to' );
		$code    = null === $request->get_param( 'code' ) ? 301 : $request->get_param( 'code' );

		if ( ! in_array( $backend, array( 'rank_math', 'own_store' ), true ) ) {
			return new WP_Error( 'rankxai_redirect_bad_backend', __( '`backend` must be rank_math or own_store.', 'rankxai' ), array( 'status' => 400 ) );
		}
		foreach ( array(
			'from' => $from,
			'to'   => $to,
		) as $field => $value ) {
			$reason = RankXAI_Redirects::path_rejection( $value );
			if ( '' !== $reason ) {
				return new WP_Error( 'rankxai_redirect_bad_path', sprintf( '%s %s', $field, $reason ), array( 'status' => 400 ) );
			}
		}
		if ( ! in_array( $code, array( 301, 302 ), true ) ) {
			return new WP_Error( 'rankxai_redirect_bad_code', __( '`code` must be 301 or 302.', 'rankxai' ), array( 'status' => 400 ) );
		}

		$result = RankXAI_Redirects::create( $backend, $from, $to, $code );
		if ( '' !== $result['error'] ) {
			$status = 'rejected' === $result['error'] || 'not_stored' === $result['error'] ? 422 : 409;
			return new WP_Error(
				'rankxai_redirect_' . $result['error'],
				self::redirect_error_message( $result['error'] ),
				array(
					'status'   => $status,
					'managers' => RankXAI_Redirects::managers(),
				)
			);
		}

		return new WP_REST_Response(
			array(
				'item'   => $result['item'],
				'purged' => RankXAI_Redirects::purge( RankXAI_Redirects::normalise( $from ) ),
			),
			200
		);
	}

	/**
	 * Delete a redirect.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_redirects_delete( $request ) {
		$backend = (string) $request['backend'];
		$result  = RankXAI_Redirects::delete( $backend, (string) $request['id'] );
		if ( '' !== $result['error'] ) {
			return new WP_Error(
				'rankxai_redirect_' . $result['error'],
				self::redirect_error_message( $result['error'] ),
				array( 'status' => 'not_found' === $result['error'] ? 404 : 409 )
			);
		}

		return new WP_REST_Response(
			array(
				'backend'   => $backend,
				'from'      => $result['from'],
				// What is still there for that source, so the caller can check
				// the row is gone rather than trusting this response.
				'remaining' => '' === $result['from'] ? array() : RankXAI_Redirects::items( $result['from'] )['items'],
				'purged'    => '' === $result['from'] ? array() : RankXAI_Redirects::purge( $result['from'] ),
			),
			200
		);
	}

	/**
	 * Purge one path from the page caches, for a redirect written elsewhere.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_redirects_purge( $request ) {
		$path   = $request->get_param( 'path' );
		$reason = RankXAI_Redirects::path_rejection( $path );
		if ( '' !== $reason ) {
			return new WP_Error( 'rankxai_redirect_bad_path', sprintf( 'path %s', $reason ), array( 'status' => 400 ) );
		}
		return new WP_REST_Response( array( 'purged' => RankXAI_Redirects::purge( RankXAI_Redirects::normalise( $path ) ) ), 200 );
	}

	/**
	 * Visitor 404s from the site's own redirect manager, when it keeps a log.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function handle_redirects_not_found( $request ) {
		$limit = (int) $request->get_param( 'limit' );
		return new WP_REST_Response( RankXAI_Redirects::not_found( $limit > 0 ? $limit : 100 ), 200 );
	}

	/**
	 * One sentence per refusal code.
	 *
	 * @param string $code Refusal code.
	 * @return string
	 */
	private static function redirect_error_message( $code ) {
		$messages = array(
			'exists'      => __( 'That address already has a redirect in this manager.', 'rankxai' ),
			'limit'       => __( 'This site already holds the most redirects this plugin will store.', 'rankxai' ),
			'unavailable' => __( 'That redirect manager is not available on this site.', 'rankxai' ),
			'rejected'    => __( 'The redirect manager refused the redirect.', 'rankxai' ),
			'not_stored'  => __( 'The redirect was sent and could not be read back.', 'rankxai' ),
			'not_found'   => __( 'No such redirect.', 'rankxai' ),
		);
		return isset( $messages[ $code ] ) ? $messages[ $code ] : $code;
	}

	/**
	 * Write a post's body, and return the bytes WordPress stored.
	 *
	 * The response carries no verdict. `object` is the post in `wp/v2`'s own
	 * shape, `revisionId` saves a second round trip, and `unfilteredHtml` says
	 * whether the writing account can store script tags at all.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_content_set( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}

		$fields = $request->get_param( 'fields' );
		if ( ! is_array( $fields ) ) {
			return new WP_Error( 'rankxai_bad_fields', __( '`fields` must be an object.', 'rankxai' ), array( 'status' => 400 ) );
		}

		$known   = array_keys( RankXAI_Content::fields() );
		$unknown = array_values( array_diff( array_keys( $fields ), $known ) );
		if ( $unknown ) {
			// REFUSED, not ignored — the SEO route's rule, and it matters more
			// here. A caller that sent `status` expecting a publish, and got a
			// 200 with the post still a draft, has been told the opposite of
			// what happened. Everything outside this set belongs on `wp/v2`.
			return new WP_Error(
				'rankxai_unknown_field',
				sprintf(
					/* translators: %s: comma-separated list of field names. */
					__( 'Unknown field(s): %s', 'rankxai' ),
					implode( ', ', $unknown )
				),
				array(
					'status' => 400,
					'known'  => $known,
				)
			);
		}

		// A body carrying no writable field is a malformed REQUEST, not a failed
		// write, so it is a 400 beside the other two refusals rather than the
		// 422 the write path would otherwise produce. A caller that sent `{}` by
		// mistake and got "unprocessable" would go looking at its post.
		if ( ! array_intersect( $known, array_keys( $fields ) ) ) {
			return new WP_Error(
				'rankxai_no_fields',
				sprintf(
					/* translators: %s: comma-separated list of field names. */
					__( 'No writable field was supplied. Known fields: %s.', 'rankxai' ),
					implode( ', ', $known )
				),
				array( 'status' => 400 )
			);
		}

		$rejected = RankXAI_Content::rejections( $fields );
		if ( $rejected ) {
			$detail = array();
			foreach ( $rejected as $field => $reason ) {
				$detail[] = $field . ' (' . $reason . ')';
			}
			return new WP_Error(
				'rankxai_invalid_field',
				sprintf(
					/* translators: %s: comma-separated list of fields and why each was refused. */
					__( 'Refused, nothing was written: %s', 'rankxai' ),
					implode( ', ', $detail )
				),
				array(
					'status'   => 400,
					'rejected' => $rejected,
				)
			);
		}

		$result = RankXAI_Content::update( $post_id, $fields );
		if ( null !== $result['error'] ) {
			return new WP_Error(
				'rankxai_write_failed',
				$result['error']->get_error_message(),
				array( 'status' => 422 )
			);
		}

		$object = RankXAI_Content::describe( $post_id );
		if ( null === $object ) {
			// The write landed and the post vanished between the two statements.
			// Reported rather than papered over with an empty object: a caller
			// told "here is what is stored" about a post that is not there would
			// record a verified write of nothing.
			return new WP_Error(
				'rankxai_read_back_failed',
				__( 'The write was applied and the post could not be read back.', 'rankxai' ),
				array( 'status' => 500 )
			);
		}

		return new WP_REST_Response(
			array(
				'postId'         => $post_id,
				'written'        => $result['written'],
				'object'         => $object,
				'revisionId'     => self::latest_revision_id( $post_id ),
				// Not a verdict — a capability of the account that just wrote.
				// It is what separates "WordPress stripped your script tag" from
				// "something else on this site did", which have different
				// remedies and only one of them is fixable by the customer.
				'unfilteredHtml' => current_user_can( 'unfiltered_html' ),
			),
			200
		);
	}

	/**
	 * The newest revision of a post, or null where the type keeps none.
	 *
	 * Null is a FACT about the post type, not a failure: many custom post types
	 * and WooCommerce products have no revision support at all, and the platform
	 * renders "this object has no version history" for exactly that.
	 *
	 * @param int $post_id Post ID.
	 * @return int|null
	 */
	private static function latest_revision_id( $post_id ) {
		$revisions = wp_get_post_revisions(
			$post_id,
			array(
				'numberposts' => 1,
				'fields'      => 'ids',
			)
		);
		if ( ! is_array( $revisions ) || ! $revisions ) {
			return null;
		}
		$first = reset( $revisions );
		return $first ? (int) $first : null;
	}

	/**
	 * Read a post's stored JSON-LD.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_schema_get( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( self::schema_state( $post_id ), 200 );
	}

	/**
	 * Store a post's JSON-LD.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_schema_put( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}

		$content = $request->get_param( 'content' );
		$reason  = RankXAI_Schema::rejection( $content );
		if ( '' !== $reason ) {
			return new WP_Error(
				'rankxai_invalid_schema',
				sprintf(
					/* translators: %s: why the graph was refused. */
					__( 'Refused, nothing was written: the graph %s.', 'rankxai' ),
					$reason
				),
				array( 'status' => 400 )
			);
		}

		RankXAI_Schema::set( $post_id, $content );

		// The stored bytes come back; nothing here reports `verified`.
		return new WP_REST_Response( self::schema_state( $post_id ), 200 );
	}

	/**
	 * Remove a post's JSON-LD. Idempotent.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_schema_delete( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}
		RankXAI_Schema::delete( $post_id );
		return new WP_REST_Response( self::schema_state( $post_id ), 200 );
	}

	/**
	 * The fill switches, and what would stop them printing right now.
	 *
	 * @return WP_REST_Response
	 */
	public static function handle_fill_get() {
		return new WP_REST_Response(
			array(
				'features'       => RankXAI_Fill::switches(),
				'supported'      => RankXAI_Fill::features(),
				'blockedBy'      => RankXAI_Fill::blocked_by(),
				'seoLikePlugins' => RankXAI_Detect::seo_like_plugins(),
			),
			200
		);
	}

	/**
	 * Replace the fill switches. Every feature named must be one this plugin
	 * fills; the whole request is refused otherwise.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_fill_put( $request ) {
		$features = $request->get_param( 'features' );
		if ( ! is_array( $features ) ) {
			return new WP_Error( 'rankxai_fill_bad_features', __( '`features` must be an object of feature => true/false.', 'rankxai' ), array( 'status' => 400 ) );
		}
		$unknown = array_diff( array_keys( $features ), RankXAI_Fill::features() );
		if ( $unknown ) {
			return new WP_Error(
				'rankxai_fill_unknown_feature',
				sprintf(
					/* translators: %s: comma-separated feature names. */
					__( 'Unknown feature(s): %s', 'rankxai' ),
					implode( ', ', $unknown )
				),
				array( 'status' => 400 )
			);
		}
		foreach ( $features as $value ) {
			if ( ! is_bool( $value ) ) {
				return new WP_Error( 'rankxai_fill_bad_features', __( 'Each feature must be true or false.', 'rankxai' ), array( 'status' => 400 ) );
			}
		}
		// Features not named keep their current value.
		RankXAI_Fill::save( array_merge( RankXAI_Fill::switches(), $features ) );
		return self::handle_fill_get();
	}

	/**
	 * Which SEO plugins run on this site, and what each does with structured data.
	 *
	 * @return WP_REST_Response
	 */
	public static function handle_schema_providers() {
		$providers = array();
		foreach ( RankXAI_Schema_Providers::slugs() as $slug ) {
			$providers[] = RankXAI_Schema_Providers::describe( $slug );
		}
		return new WP_REST_Response(
			array(
				'providers'     => $providers,
				'active'        => RankXAI_Schema_Providers::active(),
				'unknownActive' => RankXAI_Schema_Providers::unknown_active(),
				'seoLike'       => RankXAI_Detect::seo_like_plugins(),
			),
			200
		);
	}

	/**
	 * Every schema stored for a post, and every fact about the site's SEO
	 * plugins the platform needs to decide what to do with one.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_schema_set_get( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( RankXAI_Schema_Set::state( $post_id ), 200 );
	}

	/**
	 * What a store would hold for a schema, without writing it.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_schema_set_normalise( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}
		$result = RankXAI_Schema_Set::normalise(
			(string) $request->get_param( 'store' ),
			$request->get_param( 'schema' ),
			(string) $request->get_param( 'target' ),
			$post_id
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return new WP_REST_Response( array( 'normalised' => $result ), 200 );
	}

	/**
	 * Add, replace or remove one schema, then report what is stored.
	 *
	 * The response carries the state AFTER the write. Comparing it against what
	 * was sent is the caller's job.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_schema_set_write( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}
		$expected = $request->get_param( 'expectedSchemaVersion' );
		if ( ! is_string( $expected ) || '' === $expected ) {
			return new WP_Error( 'rankxai_version_required', __( '`expectedSchemaVersion` is required: read the post’s schema first.', 'rankxai' ), array( 'status' => 400 ) );
		}
		$target = (string) $request->get_param( 'target' );

		if ( 'delete' === $request->get_param( 'op' ) ) {
			$result = RankXAI_Schema_Set::remove( $post_id, $target, $expected );
		} else {
			$provider = (string) $request->get_param( 'provider' );
			if ( '' !== $provider && ! in_array( $provider, RankXAI_Schema_Providers::slugs(), true ) ) {
				return new WP_Error( 'rankxai_unknown_provider', __( 'Unknown SEO plugin.', 'rankxai' ), array( 'status' => 400 ) );
			}
			$result = RankXAI_Schema_Set::upsert(
				$post_id,
				(string) $request->get_param( 'store' ),
				$request->get_param( 'schema' ),
				$target,
				$expected,
				$provider
			);
		}
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		// A meta write does not touch the post, so no page cache notices it.
		$purged = array();
		$post   = get_post( $post_id );
		if ( $post && is_post_publicly_viewable( $post ) ) {
			$path = wp_parse_url( (string) get_permalink( $post ), PHP_URL_PATH );
			clean_post_cache( $post_id );
			$purged = RankXAI_Redirects::purge( is_string( $path ) && '' !== $path ? $path : '/' );
		}

		return new WP_REST_Response(
			array(
				'written' => $result,
				'purged'  => $purged,
				'state'   => RankXAI_Schema_Set::state( $post_id ),
			),
			200
		);
	}

	/**
	 * One shape for all three schema verbs.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string, mixed>
	 */
	private static function schema_state( $post_id ) {
		$stored = RankXAI_Schema::get( $post_id );
		$post   = get_post( $post_id );

		// `is_post_publicly_viewable()` rather than `'publish' === post_status`,
		// which is what this was first. That comparison is right about the STATUS
		// and silent about the TYPE: a post type registered `public => false` can
		// hold published posts that no visitor can reach, and the platform turns
		// this field into a sentence telling a customer their structured data is
		// live. Core has the exact predicate and has since 5.7, well under the
		// 6.0 floor. Password protection is a separate question and is still
		// asked separately.
		$public = $post && is_post_publicly_viewable( $post ) && ! post_password_required( $post );

		return array(
			'postId'     => $post_id,
			'stored'     => null !== $stored,
			'content'    => null !== $stored ? $stored['content'] : '',
			'updated'    => null !== $stored ? $stored['updated'] : '',
			'willRender' => null !== $stored && $public,
			'postStatus' => $post ? $post->post_status : '',
			'publicUrl'  => $post ? get_permalink( $post ) : '',
		);
	}

	/**
	 * Read the markdown-twin state.
	 *
	 * @return WP_REST_Response
	 */
	public static function handle_twins_get() {
		return new WP_REST_Response( RankXAI_Twins::state(), 200 );
	}

	/**
	 * Write the markdown-twin settings and the site context block.
	 *
	 * Every field is OPTIONAL and only a field that was SENT is written, so the
	 * platform can flip the switch without restating the context and can refresh
	 * the context without touching the switch. A body that omits a field must
	 * never be read as a request to clear it.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_twins_put( $request ) {
		$enabled = null;
		if ( null !== $request->get_param( 'enabled' ) ) {
			$raw = $request->get_param( 'enabled' );
			if ( ! is_bool( $raw ) ) {
				return new WP_Error( 'rankxai_twins_bad_enabled', __( '`enabled` must be true or false.', 'rankxai' ), array( 'status' => 400 ) );
			}
			$enabled = $raw;
		}

		$post_types = null;
		if ( null !== $request->get_param( 'postTypes' ) ) {
			$raw = $request->get_param( 'postTypes' );
			if ( ! is_array( $raw ) ) {
				return new WP_Error( 'rankxai_twins_bad_types', __( '`postTypes` must be an array.', 'rankxai' ), array( 'status' => 400 ) );
			}
			$post_types = $raw;
		}

		$context = null;
		if ( null !== $request->get_param( 'context' ) ) {
			$context = $request->get_param( 'context' );
			if ( ! is_string( $context ) ) {
				return new WP_Error( 'rankxai_twins_bad_context', __( '`context` must be a string.', 'rankxai' ), array( 'status' => 400 ) );
			}
			if ( strlen( $context ) > RankXAI_Twins::MAX_CONTEXT_BYTES ) {
				return new WP_Error(
					'rankxai_twins_context_too_large',
					sprintf(
						/* translators: %d: maximum size in bytes. */
						__( 'That context block is larger than the %d bytes this site will store.', 'rankxai' ),
						RankXAI_Twins::MAX_CONTEXT_BYTES
					),
					array( 'status' => 413 )
				);
			}
		}

		// Everything is validated before anything is written. Writing the
		// settings first and then refusing the context would change the site
		// and report failure.
		if ( null !== $enabled || null !== $post_types ) {
			$current = RankXAI_Twins::settings();
			RankXAI_Twins::save_settings(
				null === $enabled ? $current['enabled'] : $enabled,
				$post_types
			);
		}

		if ( null !== $context ) {
			RankXAI_Twins::save_context( $context );
		}

		// The state comes back; comparing it against what was sent is the
		// caller's job.
		return self::handle_twins_get();
	}

	/**
	 * Read a stored root document, and say whether it is actually being served.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function handle_document_get( $request ) {
		$slug      = (string) $request['slug'];
		$doc       = RankXAI_Documents::get( $slug );
		$catalogue = RankXAI_Documents::catalogue();
		$blocked   = RankXAI_Documents::file_exists_on_disk( $slug );

		return new WP_REST_Response(
			array(
				'slug'             => $slug,
				'stored'           => null !== $doc,
				'content'          => null !== $doc ? $doc['content'] : '',
				'updated'          => null !== $doc ? $doc['updated'] : '',
				// FALSE when a real file owns the path. Never conflated with `stored`.
				'serving'          => null !== $doc && ! $blocked,
				'fileOnDisk'       => $blocked,

				/*
				 * `serving` answers "is the document you sent what answers".
				 * WHAT answers is a wider question the moment this site can
				 * generate one of its own, and after a DELETE the two diverge:
				 * the stored document is gone and the address still replies.
				 * A separate field, so neither answer has to change meaning.
				 */
				'generatedLocally' => RankXAI_Generate::is_local( $slug ),
				'servingSource'    => RankXAI_Documents::effective( $slug )['source'],
				'publicUrl'        => home_url( '/' . $catalogue[ $slug ]['path'] ),
			),
			200
		);
	}

	/**
	 * Store a root document.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_document_put( $request ) {
		$slug    = (string) $request['slug'];
		$content = $request->get_param( 'content' );

		if ( ! is_string( $content ) ) {
			return new WP_Error( 'rankxai_document_bad_content', __( '`content` must be a string.', 'rankxai' ), array( 'status' => 400 ) );
		}

		if ( strlen( $content ) > RankXAI_Documents::MAX_BYTES ) {
			return new WP_Error(
				'rankxai_document_too_large',
				sprintf(
					/* translators: %d: maximum size in bytes. */
					__( 'That document is larger than the %d bytes this site will store.', 'rankxai' ),
					RankXAI_Documents::MAX_BYTES
				),
				array( 'status' => 413 )
			);
		}

		if ( ! RankXAI_Documents::set( $slug, $content ) ) {
			return new WP_Error( 'rankxai_document_unknown', __( 'Unknown document.', 'rankxai' ), array( 'status' => 404 ) );
		}

		// The stored bytes come back; comparing them against what was sent is
		// the caller's job.
		return self::handle_document_get( $request );
	}

	/**
	 * Remove a root document.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_document_delete( $request ) {
		$slug = (string) $request['slug'];
		if ( ! RankXAI_Documents::delete( $slug ) ) {
			return new WP_Error( 'rankxai_document_unknown', __( 'Unknown document.', 'rankxai' ), array( 'status' => 404 ) );
		}
		return self::handle_document_get( $request );
	}

	/**
	 * Presence only, and deliberately no version: this is the one unauthenticated
	 * route.
	 *
	 * @return WP_REST_Response
	 */
	public static function handle_status() {
		return new WP_REST_Response( array( 'rankxai' => true ), 200 );
	}

	/**
	 * One call that answers what the platform would otherwise need several round
	 * trips and some guessing for.
	 *
	 * @return WP_REST_Response
	 */
	public static function handle_manifest() {
		$verdict = RankXAI_Detect::verdict();

		return new WP_REST_Response(
			array(
				'contractVersion' => RANKXAI_CONTRACT_VERSION,
				'pluginVersion'   => RANKXAI_VERSION,
				'wpVersion'       => get_bloginfo( 'version' ),
				'phpVersion'      => PHP_VERSION,
				'isMultisite'     => is_multisite(),
				'seo'             => array(
					// 'none' is the value the REST API cannot determine from outside,
					// and the reason this endpoint is worth a round trip.
					'verdict'        => $verdict,
					'activePlugins'  => RankXAI_Detect::active_seo_plugins(),
					'targetPlugin'   => RankXAI_Detect::target_plugin(),
					'mayOwnHead'     => RankXAI_Detect::may_own_head(),
					'writableFields' => self::writable_fields(),
				),
				'capabilities'    => array( 'seo.read', 'seo.write', 'manifest', 'documents.read', 'documents.write', 'twins.read', 'twins.write', 'content.write', 'schema.read', 'schema.write', 'schema.set', 'seo.fill', 'redirects.read', 'redirects.write', 'crawlers.read', 'crawlers.config' ),
				// Which root documents this contract serves, so the platform
				// offers exactly what this install can publish rather than
				// discovering a 404 after the customer pressed the button.
				'documents'       => array_keys( RankXAI_Documents::catalogue() ),
			),
			200
		);
	}

	/**
	 * Which fields we can actually write on this site, on either rung.
	 *
	 * @return string[]
	 */
	private static function writable_fields() {
		$target = RankXAI_Detect::target_plugin();
		if ( '' === $target ) {
			// No plugin to mirror into. We still hold every field on our own meta,
			// and with `mayOwnHead` we render them ourselves.
			return RankXAI_Detect::may_own_head() ? RankXAI_SEO_Registry::fields() : array();
		}
		$storage = RankXAI_SEO_Registry::storage();
		$model   = RankXAI_SEO_Registry::model_storage();
		$filters = RankXAI_SEO_Registry::filters();
		$fields  = array_merge(
			isset( $storage[ $target ] ) ? array_keys( $storage[ $target ] ) : array(),
			// Without this AIOSEO reports three fields and writes seven.
			isset( $model[ $target ] ) ? $model[ $target ] : array(),
			isset( $filters[ $target ] ) ? array_keys( $filters[ $target ] ) : array()
		);
		return array_values( array_unique( $fields ) );
	}

	/**
	 * Read a post's SEO, ours and the plugin's, side by side.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_seo_get( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response(
			array(
				'postId'       => $post_id,
				'rankxai'      => RankXAI_SEO::get_own( $post_id ),
				'pluginStored' => RankXAI_SEO::get_plugin_stored( $post_id ),
				'targetPlugin' => RankXAI_Detect::target_plugin(),
			),
			200
		);
	}

	/**
	 * Write, then return what is STORED.
	 *
	 * The response never says `verified`. It reports what the database holds
	 * after the write, and the caller compares that against what it sent.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_seo_set( $request ) {
		$post_id = (int) $request['id'];
		if ( ! get_post( $post_id ) ) {
			return new WP_Error( 'rankxai_not_found', __( 'No such post.', 'rankxai' ), array( 'status' => 404 ) );
		}

		$fields = $request->get_param( 'fields' );
		if ( ! is_array( $fields ) ) {
			return new WP_Error( 'rankxai_bad_fields', __( '`fields` must be an object.', 'rankxai' ), array( 'status' => 400 ) );
		}

		$known   = RankXAI_SEO_Registry::fields();
		$unknown = array_values( array_diff( array_keys( $fields ), $known ) );
		if ( $unknown ) {
			// Refused rather than ignored: a caller that sent `metaTitle` expecting it
			// to be written needs to be told, not to get a 200 and no effect.
			return new WP_Error(
				'rankxai_unknown_field',
				sprintf(
					/* translators: %s: comma-separated list of field names. */
					__( 'Unknown field(s): %s', 'rankxai' ),
					implode( ', ', $unknown )
				),
				array(
					'status' => 400,
					'known'  => $known,
				)
			);
		}

		// Validate every field before writing any of them. Coercing an invalid
		// value to '' would clear whatever was already on the post, so the whole
		// request is refused and the error names each field.
		$rejected = RankXAI_SEO::rejections( $fields );
		if ( $rejected ) {
			$detail = array();
			foreach ( $rejected as $field => $reason ) {
				$detail[] = $field . ' (' . $reason . ')';
			}
			return new WP_Error(
				'rankxai_invalid_field',
				sprintf(
					/* translators: %s: comma-separated list of fields and why each was refused. */
					__( 'Refused, nothing was written: %s', 'rankxai' ),
					implode( ', ', $detail )
				),
				array(
					'status'   => 400,
					'rejected' => $rejected,
				)
			);
		}

		$written = RankXAI_SEO::set( $post_id, $fields );

		return new WP_REST_Response(
			array(
				'postId'       => $post_id,
				'written'      => $written,
				'stored'       => RankXAI_SEO::get_own( $post_id ),
				'pluginStored' => RankXAI_SEO::get_plugin_stored( $post_id ),
				'targetPlugin' => RankXAI_Detect::target_plugin(),
			),
			200
		);
	}
}
