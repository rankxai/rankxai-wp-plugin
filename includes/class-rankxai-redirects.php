<?php
/**
 * Redirects: co-managed where the site has a redirect manager, served by this
 * plugin where it has none.
 *
 * Three facts decide the shape, each measured on a real WordPress:
 *
 * - Rank Math and the Redirection plugin both redirect LIVE pages, not only
 *   missing ones. Our own store answers only when WordPress is about to send a
 *   404, so it can never hide a page that works.
 * - Redirection runs at `init`, Rank Math at `wp`, core's own 404 fixes at
 *   `template_redirect` priority 10. We serve at priority 20, after all of
 *   them, so none of them is ever overridden.
 * - Rank Math has no API for its redirects. Its own model classes do the work
 *   its screen does, so we call those, and check each exists first.
 *
 * Which manager a redirect goes to is decided by the platform, not here. This
 * class reports what it can see and writes only to the backend it is given.
 * The Redirection plugin has its own REST API and is not written through here.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Redirect detection, storage, serving and cache purging.
 */
class RankXAI_Redirects {

	/** Our own redirects, keyed by id. Not autoloaded: read only on a 404. */
	const OPTION = 'rankxai_redirects';

	/** Hit counts for our own redirects, kept apart so a hit rewrites less. */
	const OPTION_HITS = 'rankxai_redirect_hits';

	/** How many redirects our own store holds. */
	const MAX = 500;

	/** Longest path we accept, matching what the platform sends. */
	const MAX_PATH = 2048;

	/** Priority on `template_redirect`. Core's own 404 handling runs at 10. */
	const SERVE_PRIORITY = 20;

	/**
	 * Hook the server.
	 */
	public static function init() {
		add_action( 'template_redirect', array( __CLASS__, 'maybe_serve' ), self::SERVE_PRIORITY );
	}

	// -----------------------------------------------------------------------
	// Detection
	// -----------------------------------------------------------------------

	/**
	 * Every redirect manager we can see, and whether we can work with it.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public static function managers() {
		$rank_math = self::rank_math_state();

		return array(
			'rank_math'     => $rank_math,
			'redirection'   => array(
				'active'  => defined( 'REDIRECTION_VERSION' ),
				'version' => defined( 'REDIRECTION_VERSION' ) ? (string) REDIRECTION_VERSION : null,
			),
			'yoast_premium' => array(
				'active' => defined( 'WPSEO_PREMIUM_VERSION' ) || defined( 'WPSEO_PREMIUM_FILE' ),
			),
			'aioseo'        => array(
				'active' => self::aioseo_redirects_present(),
			),
			'seopress_pro'  => array(
				'active' => defined( 'SEOPRESS_PRO_VERSION' ),
			),
		);
	}

	/**
	 * Rank Math: active, and ready for us to write to.
	 *
	 * `ready` needs three things. Rank Math loads no modules at all until its
	 * setup wizard is completed or skipped, so a module listed as on can still
	 * be doing nothing. The Redirections module must be on. And the model
	 * classes we call must exist on this version.
	 *
	 * @return array{active: bool, ready: bool, reason: string, version: string|null}
	 */
	public static function rank_math_state() {
		$active = defined( 'RANK_MATH_VERSION' );
		$state  = array(
			'active'  => $active,
			'ready'   => false,
			'reason'  => $active ? '' : 'not_installed',
			'version' => $active ? (string) RANK_MATH_VERSION : null,
		);
		if ( ! $active ) {
			return $state;
		}

		if ( ! function_exists( 'rank_math' ) ) {
			$state['reason'] = 'unsupported';
			return $state;
		}
		$rank_math = rank_math();
		if ( ! is_object( $rank_math ) || ! isset( $rank_math->manager ) || null === $rank_math->manager ) {
			$state['reason'] = 'setup_incomplete';
			return $state;
		}

		if ( ! class_exists( '\RankMath\Helper' ) || ! method_exists( '\RankMath\Helper', 'is_module_active' ) ) {
			$state['reason'] = 'unsupported';
			return $state;
		}
		if ( ! \RankMath\Helper::is_module_active( 'redirections' ) ) {
			$state['reason'] = 'module_off';
			return $state;
		}

		$needed = array(
			array( '\RankMath\Redirections\Redirection', 'from' ),
			array( '\RankMath\Redirections\DB', 'get_redirections' ),
			array( '\RankMath\Redirections\DB', 'get_redirection_by_id' ),
			array( '\RankMath\Redirections\DB', 'delete' ),
		);
		foreach ( $needed as $pair ) {
			if ( ! class_exists( $pair[0] ) || ! method_exists( $pair[0], $pair[1] ) ) {
				$state['reason'] = 'unsupported';
				return $state;
			}
		}

		$state['ready'] = true;
		return $state;
	}

	/**
	 * Whether AIOSEO's redirect tables exist. AIOSEO keeps its redirect manager
	 * in its own tables and publishes no API for them.
	 *
	 * @return bool
	 */
	private static function aioseo_redirects_present() {
		if ( ! defined( 'AIOSEO_VERSION' ) ) {
			return false;
		}
		global $wpdb;
		$table = $wpdb->prefix . 'aioseo_redirects';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- A one-off existence check on an admin-only route; core has no API for it.
		$found = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );
		return $found === $table;
	}

	// -----------------------------------------------------------------------
	// Input shape
	// -----------------------------------------------------------------------

	/**
	 * Why a path is malformed, or '' when it is fine.
	 *
	 * Shape only: a root-relative path, no scheme, no host, no query. What a
	 * redirect may point at is the platform's decision, made before it calls.
	 *
	 * @param mixed $path Candidate path.
	 * @return string
	 */
	public static function path_rejection( $path ) {
		if ( ! is_string( $path ) || '' === $path ) {
			return 'must be a non-empty string';
		}
		if ( strlen( $path ) > self::MAX_PATH ) {
			return 'is too long';
		}
		if ( '/' !== $path[0] || ( strlen( $path ) > 1 && '/' === $path[1] ) ) {
			return 'must start with a single /';
		}
		if ( preg_match( '/[\x00-\x20\x7f\\\\]/', $path ) ) {
			return 'contains a space, a backslash or a control character';
		}
		if ( false !== strpos( $path, '?' ) || false !== strpos( $path, '#' ) ) {
			return 'must not carry a query or a fragment';
		}
		return '';
	}

	/**
	 * A path as we compare it: decoded, and without a trailing slash.
	 *
	 * @param string $path Path.
	 * @return string
	 */
	public static function normalise( $path ) {
		$path = rawurldecode( $path );
		if ( strlen( $path ) > 1 ) {
			$path = rtrim( $path, '/' );
		}
		return '' === $path ? '/' : $path;
	}

	// -----------------------------------------------------------------------
	// Listing
	// -----------------------------------------------------------------------

	/**
	 * Redirects from every backend we can read, optionally for one source path.
	 *
	 * @param string $from  Source path, or '' for all.
	 * @param int    $limit Most rows per backend.
	 * @return array{items: array<int, array<string, mixed>>, totals: array<string, int>}
	 */
	public static function items( $from = '', $limit = 200 ) {
		$want   = '' === $from ? '' : self::normalise( $from );
		$items  = array();
		$totals = array();

		$own                 = self::own_items( $want );
		$totals['own_store'] = count( self::stored() );
		$items               = array_merge( $items, array_slice( $own, 0, $limit ) );

		if ( self::rank_math_state()['ready'] ) {
			$rm                  = self::rank_math_items( $want, $limit );
			$totals['rank_math'] = $rm['total'];
			$items               = array_merge( $items, $rm['items'] );
		}

		return array(
			'items'  => $items,
			'totals' => $totals,
		);
	}

	/**
	 * Our stored redirects.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public static function stored() {
		$stored = get_option( self::OPTION, array() );
		return is_array( $stored ) ? $stored : array();
	}

	/**
	 * Our stored redirects in the shared item shape.
	 *
	 * @param string $want Normalised source path, or '' for all.
	 * @return array<int, array<string, mixed>>
	 */
	private static function own_items( $want ) {
		$hits  = get_option( self::OPTION_HITS, array() );
		$hits  = is_array( $hits ) ? $hits : array();
		$items = array();
		foreach ( self::stored() as $id => $row ) {
			if ( ! is_array( $row ) || ! isset( $row['from'], $row['to'] ) ) {
				continue;
			}
			if ( '' !== $want && self::normalise( (string) $row['from'] ) !== $want ) {
				continue;
			}
			$hit     = isset( $hits[ $id ] ) && is_array( $hits[ $id ] ) ? $hits[ $id ] : array();
			$items[] = array(
				'id'      => (string) $id,
				'backend' => 'own_store',
				'from'    => (string) $row['from'],
				'to'      => (string) $row['to'],
				'code'    => isset( $row['code'] ) ? (int) $row['code'] : 301,
				'hits'    => isset( $hit['count'] ) ? (int) $hit['count'] : 0,
				'lastHit' => isset( $hit['last'] ) ? (string) $hit['last'] : '',
				'match'   => 'exact',
				'created' => isset( $row['created'] ) ? (string) $row['created'] : '',
			);
		}
		return $items;
	}

	/**
	 * Rank Math's active redirects in the shared item shape.
	 *
	 * @param string $want  Normalised source path, or '' for all.
	 * @param int    $limit Most rows.
	 * @return array{items: array<int, array<string, mixed>>, total: int}
	 */
	private static function rank_math_items( $want, $limit ) {
		$args = array(
			'limit'  => $limit,
			'status' => 'active',
		);
		if ( '' !== $want ) {
			// Rank Math stores exact patterns without the leading slash, and
			// its search is a LIKE over the serialized sources.
			$args['search'] = ltrim( $want, '/' );
		}
		$result = \RankMath\Redirections\DB::get_redirections( $args );
		$rows   = isset( $result['redirections'] ) && is_array( $result['redirections'] ) ? $result['redirections'] : array();

		$items = array();
		foreach ( $rows as $row ) {
			foreach ( self::rank_math_sources( $row ) as $source ) {
				$from = 'exact' === $source['comparison'] ? '/' . ltrim( (string) $source['pattern'], '/' ) : (string) $source['pattern'];
				if ( '' !== $want && ( 'exact' !== $source['comparison'] || self::normalise( $from ) !== $want ) ) {
					continue;
				}
				$items[] = array(
					'id'      => (string) $row['id'],
					'backend' => 'rank_math',
					'from'    => $from,
					'to'      => (string) $row['url_to'],
					'code'    => (int) $row['header_code'],
					'hits'    => (int) $row['hits'],
					'lastHit' => '0000-00-00 00:00:00' === (string) $row['last_accessed'] ? '' : (string) $row['last_accessed'],
					'match'   => (string) $source['comparison'],
					'created' => (string) $row['created'],
				);
			}
		}

		return array(
			'items' => $items,
			'total' => isset( $result['count'] ) ? (int) $result['count'] : count( $rows ),
		);
	}

	/**
	 * A Rank Math row's sources, whether or not they are still serialized.
	 *
	 * @param array<string, mixed> $row Row.
	 * @return array<int, array{pattern: string, comparison: string}>
	 */
	private static function rank_math_sources( $row ) {
		$sources = isset( $row['sources'] ) ? maybe_unserialize( $row['sources'] ) : array();
		$out     = array();
		if ( ! is_array( $sources ) ) {
			return $out;
		}
		foreach ( $sources as $source ) {
			if ( is_array( $source ) && isset( $source['pattern'] ) ) {
				$out[] = array(
					'pattern'    => (string) $source['pattern'],
					'comparison' => isset( $source['comparison'] ) ? (string) $source['comparison'] : 'exact',
				);
			}
		}
		return $out;
	}

	// -----------------------------------------------------------------------
	// Writing
	// -----------------------------------------------------------------------

	/**
	 * Create a redirect on the backend the caller chose.
	 *
	 * @param string $backend 'rank_math' or 'own_store'.
	 * @param string $from    Source path, already shape-checked.
	 * @param string $to      Target path, already shape-checked.
	 * @param int    $code    301 or 302.
	 * @return array{item: array<string, mixed>|null, error: string}
	 */
	public static function create( $backend, $from, $to, $code ) {
		$existing = self::items( $from, 50 )['items'];
		foreach ( $existing as $item ) {
			if ( $item['backend'] === $backend ) {
				return array(
					'item'  => null,
					'error' => 'exists',
				);
			}
		}

		if ( 'own_store' === $backend ) {
			$stored = self::stored();
			if ( count( $stored ) >= self::MAX ) {
				return array(
					'item'  => null,
					'error' => 'limit',
				);
			}
			$id            = strtolower( wp_generate_password( 12, false, false ) );
			$stored[ $id ] = array(
				'from'    => self::normalise( $from ),
				'to'      => $to,
				'code'    => $code,
				'created' => gmdate( 'c' ),
			);
			update_option( self::OPTION, $stored, false );
		} elseif ( 'rank_math' === $backend ) {
			if ( ! self::rank_math_state()['ready'] ) {
				return array(
					'item'  => null,
					'error' => 'unavailable',
				);
			}
			$saved = \RankMath\Redirections\Redirection::from(
				array(
					'sources'     => array(
						array(
							'pattern'    => self::normalise( $from ),
							'comparison' => 'exact',
						),
					),
					'url_to'      => $to,
					'header_code' => (string) $code,
				)
			)->save();
			if ( ! $saved ) {
				return array(
					'item'  => null,
					'error' => 'rejected',
				);
			}
		} else {
			return array(
				'item'  => null,
				'error' => 'unavailable',
			);
		}

		// Read back from the store we wrote to, never from what we sent.
		foreach ( self::items( $from, 50 )['items'] as $item ) {
			if ( $item['backend'] === $backend ) {
				return array(
					'item'  => $item,
					'error' => '',
				);
			}
		}
		return array(
			'item'  => null,
			'error' => 'not_stored',
		);
	}

	/**
	 * Delete a redirect by backend and id.
	 *
	 * @param string $backend 'rank_math' or 'own_store'.
	 * @param string $id      Id within that backend.
	 * @return array{from: string, error: string}
	 */
	public static function delete( $backend, $id ) {
		if ( 'own_store' === $backend ) {
			$stored = self::stored();
			if ( ! isset( $stored[ $id ] ) ) {
				return array(
					'from'  => '',
					'error' => 'not_found',
				);
			}
			$from = (string) $stored[ $id ]['from'];
			unset( $stored[ $id ] );
			update_option( self::OPTION, $stored, false );

			$hits = get_option( self::OPTION_HITS, array() );
			if ( is_array( $hits ) && isset( $hits[ $id ] ) ) {
				unset( $hits[ $id ] );
				update_option( self::OPTION_HITS, $hits, false );
			}
			return array(
				'from'  => $from,
				'error' => '',
			);
		}

		if ( 'rank_math' === $backend ) {
			if ( ! self::rank_math_state()['ready'] ) {
				return array(
					'from'  => '',
					'error' => 'unavailable',
				);
			}
			$row = \RankMath\Redirections\DB::get_redirection_by_id( (int) $id );
			if ( ! is_array( $row ) ) {
				return array(
					'from'  => '',
					'error' => 'not_found',
				);
			}
			$sources = self::rank_math_sources( $row );
			$from    = $sources ? '/' . ltrim( $sources[0]['pattern'], '/' ) : '';
			// `delete` rather than trashing: it is what clears Rank Math's own
			// lookup cache, and a trashed row can keep answering from it.
			\RankMath\Redirections\DB::delete( array( (int) $id ) );
			return array(
				'from'  => $from,
				'error' => '',
			);
		}

		return array(
			'from'  => '',
			'error' => 'unavailable',
		);
	}

	// -----------------------------------------------------------------------
	// Serving
	// -----------------------------------------------------------------------

	/**
	 * Answer a 404 with one of our redirects, if one matches.
	 *
	 * Runs only when WordPress has decided the request is a 404, and after
	 * core's own old-slug and canonical fixes have had their turn.
	 */
	public static function maybe_serve() {
		if ( ! is_404() ) {
			return;
		}
		$stored = self::stored();
		if ( ! $stored ) {
			return;
		}
		// Not `sanitize_text_field`: it strips percent-encoded octets, so an
		// address with any non-ASCII character could never match. The value is
		// only compared against stored paths, never output or stored.
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- See above.
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$path = wp_parse_url( $uri, PHP_URL_PATH );
		if ( ! is_string( $path ) || '' === $path ) {
			return;
		}
		$path = self::normalise( $path );

		foreach ( $stored as $id => $row ) {
			if ( ! is_array( $row ) || ! isset( $row['from'], $row['to'] ) || self::normalise( (string) $row['from'] ) !== $path ) {
				continue;
			}
			self::count_hit( (string) $id );
			$code = isset( $row['code'] ) && 302 === (int) $row['code'] ? 302 : 301;
			if ( wp_safe_redirect( (string) $row['to'], $code, 'RankX AI' ) ) {
				exit;
			}
			return;
		}
	}

	/**
	 * Count a hit on one of our redirects.
	 *
	 * @param string $id Redirect id.
	 */
	private static function count_hit( $id ) {
		$hits = get_option( self::OPTION_HITS, array() );
		$hits = is_array( $hits ) ? $hits : array();
		$prev = isset( $hits[ $id ]['count'] ) ? (int) $hits[ $id ]['count'] : 0;

		$hits[ $id ] = array(
			'count' => $prev + 1,
			'last'  => gmdate( 'c' ),
		);
		update_option( self::OPTION_HITS, $hits, false );
	}

	// -----------------------------------------------------------------------
	// Visitor 404s
	// -----------------------------------------------------------------------

	/**
	 * Rank Math's 404 Monitor log, when that module is on.
	 *
	 * @param int $limit Most rows.
	 * @return array{available: bool, source: string, items: array<int, array<string, mixed>>}
	 */
	public static function not_found( $limit = 100 ) {
		$off = array(
			'available' => false,
			'source'    => '',
			'items'     => array(),
		);
		if ( ! defined( 'RANK_MATH_VERSION' ) || ! class_exists( '\RankMath\Helper' ) || ! method_exists( '\RankMath\Helper', 'is_module_active' ) ) {
			return $off;
		}
		if ( ! \RankMath\Helper::is_module_active( '404-monitor' ) ) {
			return $off;
		}

		global $wpdb;
		$table = $wpdb->prefix . 'rank_math_404_logs';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Reading Rank Math's own log table; it exposes no API for it.
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name is our prefix plus a constant.
				"SELECT uri, MAX(accessed) AS last_seen, SUM(times_accessed) AS hits FROM {$table} GROUP BY uri ORDER BY hits DESC LIMIT %d",
				max( 1, min( 500, (int) $limit ) )
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return $off;
		}

		$items = array();
		foreach ( $rows as $row ) {
			$uri     = (string) $row['uri'];
			$items[] = array(
				'path'     => '/' . ltrim( $uri, '/' ),
				'hits'     => (int) $row['hits'],
				'lastSeen' => (string) $row['last_seen'],
			);
		}
		return array(
			'available' => true,
			'source'    => 'rank_math',
			'items'     => $items,
		);
	}

	// -----------------------------------------------------------------------
	// Page caches
	// -----------------------------------------------------------------------

	/**
	 * Purge one path from every page cache we recognise.
	 *
	 * Returns the caches we ASKED, not ones that confirmed. None of these hooks
	 * reports whether anything was actually removed.
	 *
	 * @param string $path Root-relative path.
	 * @return string[]
	 */
	public static function purge( $path ) {
		$url    = home_url( $path );
		$called = array();

		if ( defined( 'LSCWP_V' ) ) {
			// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- LiteSpeed Cache's documented public hook.
			do_action( 'litespeed_purge_url', $url );
			$called[] = 'litespeed';
		}
		if ( function_exists( 'rocket_clean_files' ) ) {
			rocket_clean_files( array( $url ) );
			$called[] = 'wp_rocket';
		}
		if ( function_exists( 'w3tc_flush_url' ) ) {
			w3tc_flush_url( $url );
			$called[] = 'w3_total_cache';
		}
		if ( function_exists( 'wpsc_delete_url_cache' ) ) {
			wpsc_delete_url_cache( $url );
			$called[] = 'wp_super_cache';
		}
		if ( function_exists( 'sg_cachepress_purge_cache' ) ) {
			sg_cachepress_purge_cache( $url );
			$called[] = 'siteground';
		}

		return $called;
	}
}
