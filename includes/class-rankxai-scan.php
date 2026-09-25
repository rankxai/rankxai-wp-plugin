<?php
/**
 * Site checks: the links this site's own pages make, and what is wrong with them.
 *
 * A scan reads published content a batch at a time in WP-Cron, never on a
 * visitor's request. Each batch stops at 100 posts or two seconds, whichever
 * comes first, and a run of batches stops at ten seconds; the next run picks up
 * at the stored cursor. Links are read from the RENDERED content, the way a
 * visitor sees it, because many themes, blocks and shortcodes only produce
 * their links when the content is rendered.
 *
 * Every finding has three states. A link is "broken" only when this site
 * answered 404 or 410 for it; when the site could not be asked it is "could
 * not check", never broken. A page is an "orphan" only when no link we could
 * see points at it, and the page says what we could see.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * The background scanner and its findings.
 */
class RankXAI_Scan {

	/** Edge table, after the site's own prefix. */
	const TABLE = 'rankxai_links';

	/** Bumped when the table's shape changes. */
	const TABLE_VERSION = '1';

	/** Scan state. Not autoloaded. */
	const OPTION_STATE = 'rankxai_scan_state';

	/** The table version that exists on this site. */
	const OPTION_TABLE = 'rankxai_scan_table';

	/** Images with no alt attribute, per post. Not autoloaded. */
	const OPTION_IMAGES = 'rankxai_scan_images';

	/** One batch of the scan. */
	const HOOK = 'rankxai_scan_batch';

	/** The weekly re-scan, scheduled once a first scan has finished. */
	const HOOK_WEEKLY = 'rankxai_scan_weekly';

	/** Posts read per batch. */
	const BATCH_POSTS = 100;

	/** Seconds one batch may run. */
	const BATCH_SECONDS = 2.0;

	/** Seconds one WP-Cron run may spend on batches. */
	const RUN_SECONDS = 10.0;

	/** Loopback checks per batch. */
	const BATCH_LOOPBACKS = 20;

	/** Most links stored; past this the scan stops reading and says so. */
	const MAX_EDGES = 50000;

	/** A scan with no progress for this long reads as paused. */
	const STALL_SECONDS = DAY_IN_SECONDS;

	/**
	 * Hook the scanner.
	 */
	public static function init() {
		add_action( self::HOOK, array( __CLASS__, 'run' ) );
		add_action( self::HOOK_WEEKLY, array( __CLASS__, 'start' ) );
	}

	// -----------------------------------------------------------------------
	// Table
	// -----------------------------------------------------------------------

	/**
	 * The table name, escaped for SQL.
	 *
	 * @return string
	 */
	public static function table() {
		global $wpdb;
		return esc_sql( $wpdb->prefix . self::TABLE );
	}

	/**
	 * Create or update the table.
	 */
	public static function ensure_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$table   = self::table();
		$charset = $wpdb->get_charset_collate();
		// phpcs:ignore PluginCheck.Security.DirectDB.UnescapedDBParameter -- The table name is the site prefix and a constant, escaped in table(); dbDelta takes no placeholders.
		dbDelta(
			"CREATE TABLE {$table} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  from_id bigint(20) unsigned NOT NULL DEFAULT 0,
  from_kind varchar(20) NOT NULL DEFAULT 'post',
  to_hash char(32) NOT NULL,
  to_path varchar(1024) NOT NULL,
  anchor varchar(191) NOT NULL DEFAULT '',
  state varchar(20) NOT NULL DEFAULT 'pending',
  http_status smallint(5) unsigned NOT NULL DEFAULT 0,
  target_id bigint(20) unsigned NOT NULL DEFAULT 0,
  final_path varchar(1024) NOT NULL DEFAULT '',
  PRIMARY KEY  (id),
  KEY to_hash (to_hash),
  KEY from_id (from_id),
  KEY state (state)
) {$charset};"
		);
		update_option( self::OPTION_TABLE, self::TABLE_VERSION, false );
	}

	/**
	 * Does the table exist?
	 *
	 * @return bool
	 */
	public static function table_exists() {
		global $wpdb;
		$name = $wpdb->prefix . self::TABLE;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Existence check on this plugin's own table; no core API.
		return $name === $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $name ) ) );
	}

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------

	/**
	 * The scan's stored state.
	 *
	 * @return array<string, mixed>
	 */
	public static function state() {
		$state = get_option( self::OPTION_STATE, array() );
		return is_array( $state ) ? $state : array();
	}

	/**
	 * Store the scan's state.
	 *
	 * @param array $state State.
	 */
	private static function save_state( $state ) {
		update_option( self::OPTION_STATE, $state, false );
	}

	/**
	 * Where a scan is, in words the page can show.
	 *
	 * @return string 'never', 'running', 'paused' or 'done'.
	 */
	public static function status() {
		$state = self::state();
		if ( empty( $state['started'] ) ) {
			return 'never';
		}
		if ( 'done' === $state['phase'] ) {
			return 'done';
		}
		$last = ! empty( $state['lastBatch'] ) ? (int) strtotime( $state['lastBatch'] ) : (int) strtotime( $state['started'] );
		return time() - $last > self::STALL_SECONDS ? 'paused' : 'running';
	}

	/**
	 * The post types a scan reads: the ones this site's sitemap lists.
	 *
	 * Not every "viewable" type. Themes register template types (Blocksy's
	 * content blocks, for one) that are viewable and never linked, and reading
	 * them would list every one as an orphan.
	 *
	 * @return string[]
	 */
	public static function post_types() {
		$types = array();
		if ( function_exists( 'wp_sitemaps_get_server' ) ) {
			$server   = wp_sitemaps_get_server();
			$provider = $server && isset( $server->registry ) ? $server->registry->get_provider( 'posts' ) : null;
			if ( $provider && method_exists( $provider, 'get_object_subtypes' ) ) {
				$types = array_keys( (array) $provider->get_object_subtypes() );
			}
		}
		if ( ! $types ) {
			$types = array_values( array_diff( get_post_types( array( 'public' => true ) ), array( 'attachment' ) ) );
		}
		// An SEO plugin that keeps a type out of its own sitemap has decided it
		// is not a page anyone should find.
		$rank_math = get_option( 'rank-math-options-sitemap' );
		$yoast     = get_option( 'wpseo_titles' );
		$out       = array();
		foreach ( $types as $type ) {
			if ( defined( 'RANK_MATH_VERSION' ) && is_array( $rank_math ) && isset( $rank_math[ 'pt_' . $type . '_sitemap' ] ) && 'off' === $rank_math[ 'pt_' . $type . '_sitemap' ] ) {
				continue;
			}
			if ( defined( 'WPSEO_VERSION' ) && is_array( $yoast ) && ! empty( $yoast[ 'noindex-' . $type ] ) ) {
				continue;
			}
			$out[] = $type;
		}
		return $out;
	}

	// -----------------------------------------------------------------------
	// Running
	// -----------------------------------------------------------------------

	/**
	 * Start a scan: forget the last one and schedule the first batch.
	 */
	public static function start() {
		global $wpdb;
		self::ensure_table();
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- This plugin's own table; the name is escaped in table().
		$wpdb->query( "TRUNCATE TABLE {$table}" );
		delete_option( self::OPTION_IMAGES );

		$types = self::post_types();
		$total = 0;
		foreach ( $types as $type ) {
			$counts = wp_count_posts( $type );
			$total += isset( $counts->publish ) ? (int) $counts->publish : 0;
		}
		self::save_state(
			array(
				'id'         => strtolower( wp_generate_password( 8, false, false ) ),
				'started'    => gmdate( 'c' ),
				'phase'      => 'collect',
				'types'      => $types,
				'cursor'     => 0,
				'total'      => $total,
				'scanned'    => 0,
				'capped'     => false,
				'lastBatch'  => '',
				'finished'   => '',
				'blockTheme' => function_exists( 'wp_is_block_theme' ) && wp_is_block_theme(),
			)
		);
		self::schedule();
	}

	/**
	 * Schedule the next batch, once.
	 */
	private static function schedule() {
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_single_event( time(), self::HOOK );
		}
	}

	/**
	 * WP-Cron: run batches until the scan is done or this run's time is up.
	 */
	public static function run() {
		// One run at a time: WP-Cron can fire the same event twice when two
		// requests arrive together.
		if ( get_transient( 'rankxai_scan_lock' ) ) {
			return;
		}
		set_transient( 'rankxai_scan_lock', 1, MINUTE_IN_SECONDS );

		$started = microtime( true );
		while ( microtime( true ) - $started < self::RUN_SECONDS ) {
			$state = self::state();
			if ( empty( $state['phase'] ) || 'done' === $state['phase'] ) {
				break;
			}
			$batch = microtime( true );
			$phase = (string) $state['phase'];
			if ( 'collect' === $state['phase'] ) {
				self::collect_batch( $state );
			} elseif ( 'navigation' === $state['phase'] ) {
				self::navigation( $state );
			} else {
				self::confirm_batch( $state );
			}
			// Kept per phase so the budget can be checked, on the probe rig and on a
			// real site. A confirmation batch can overrun by one loopback, which
			// cannot be stopped half way; a reading batch by one page render.
			$took  = (int) round( ( microtime( true ) - $batch ) * 1000 );
			$after = self::state();
			$key   = 'slowestMs_' . $phase;
			if ( $after && $took > ( isset( $after[ $key ] ) ? (int) $after[ $key ] : 0 ) ) {
				$after[ $key ] = $took;
				self::save_state( $after );
			}
		}

		delete_transient( 'rankxai_scan_lock' );
		$state = self::state();
		if ( ! empty( $state['phase'] ) && 'done' !== $state['phase'] ) {
			wp_schedule_single_event( time() + 5, self::HOOK );
		}
	}

	/**
	 * Read up to one batch of posts and store their links.
	 *
	 * @param array $state Scan state.
	 */
	private static function collect_batch( $state ) {
		global $wpdb;
		$began = microtime( true );
		$types = array_values( array_filter( (array) $state['types'], 'is_string' ) );
		$ids   = array();
		if ( $types ) {
			$in = implode( ',', array_fill( 0, count( $types ), '%s' ) );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare,WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- A keyset page over core's posts table: WP_Query has no "ID greater than". The IN list is one placeholder per type.
			$ids = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_status = 'publish' AND post_type IN ({$in}) AND ID > %d ORDER BY ID ASC LIMIT %d", array_merge( $types, array( (int) $state['cursor'], self::BATCH_POSTS ) ) ) );
		}

		$images = get_option( self::OPTION_IMAGES, array() );
		$images = is_array( $images ) ? $images : array();
		$edges  = self::edge_count();
		$broke  = false;
		foreach ( $ids as $id ) {
			if ( microtime( true ) - $began > self::BATCH_SECONDS ) {
				$broke = true;
				break;
			}
			$post            = get_post( $id );
			$state['cursor'] = (int) $id;
			++$state['scanned'];
			// A password-protected post shows a form to readers and crawlers alike.
			if ( ! $post instanceof WP_Post || '' !== $post->post_password ) {
				continue;
			}
			$permalink = (string) get_permalink( $post );
			self::insert_self( $post, $permalink );
			$found = self::extract( RankXAI_Markdown::rendered_content( $post ), $permalink );
			foreach ( $found['links'] as $link ) {
				if ( $edges >= self::MAX_EDGES ) {
					$state['capped'] = true;
					break;
				}
				self::insert_edge( (int) $id, 'post', $link['path'], $link['anchor'] );
				++$edges;
			}
			if ( $found['missingAlt'] > 0 || $found['emptyAlt'] > 0 ) {
				$images[ (int) $id ] = array(
					'missing' => $found['missingAlt'],
					'empty'   => $found['emptyAlt'],
				);
			}
		}
		update_option( self::OPTION_IMAGES, $images, false );

		// A short page read in full means there are no more posts.
		if ( $state['capped'] || ( ! $broke && count( $ids ) < self::BATCH_POSTS ) ) {
			$state['phase'] = 'navigation';
		}
		$state['lastBatch'] = gmdate( 'c' );
		self::save_state( $state );
	}

	/**
	 * Store the links in navigation: classic menus in theme locations and, on a
	 * block theme, the navigation, header and footer the theme renders.
	 *
	 * An unused navigation post on a classic theme is never read: counting its
	 * links would hide real orphans.
	 *
	 * @param array $state Scan state.
	 */
	private static function navigation( $state ) {
		$locations = get_nav_menu_locations();
		$menus     = array_unique( array_filter( array_map( 'intval', (array) $locations ) ) );
		foreach ( $menus as $menu_id ) {
			foreach ( (array) wp_get_nav_menu_items( $menu_id ) as $item ) {
				$path = self::internal_path( isset( $item->url ) ? (string) $item->url : '', home_url( '/' ) );
				if ( '' !== $path ) {
					self::insert_edge( (int) $menu_id, 'menu', $path, isset( $item->title ) ? (string) $item->title : '' );
				}
			}
		}
		if ( ! empty( $state['blockTheme'] ) ) {
			$sources = array();
			foreach ( get_posts(
				array(
					'post_type'      => array( 'wp_navigation', 'wp_block' ),
					'post_status'    => 'publish',
					'posts_per_page' => 100,
				)
			) as $post ) {
				$sources[] = array( (int) $post->ID, (string) $post->post_content );
			}
			if ( function_exists( 'get_block_templates' ) ) {
				foreach ( get_block_templates( array(), 'wp_template_part' ) as $part ) {
					if ( in_array( isset( $part->area ) ? $part->area : '', array( 'header', 'footer' ), true ) ) {
						$sources[] = array( isset( $part->wp_id ) ? (int) $part->wp_id : 0, (string) $part->content );
					}
				}
			}
			foreach ( $sources as $source ) {
				$html  = function_exists( 'do_blocks' ) ? do_blocks( $source[1] ) : $source[1];
				$found = self::extract( $html, home_url( '/' ) );
				foreach ( $found['links'] as $link ) {
					self::insert_edge( $source[0], 'menu', $link['path'], $link['anchor'] );
				}
				// A navigation block stores its links as block attributes, not HTML.
				if ( preg_match_all( '/"url"\s*:\s*"([^"]+)"/', $source[1], $matches ) ) {
					foreach ( $matches[1] as $url ) {
						$path = self::internal_path( stripslashes( $url ), home_url( '/' ) );
						if ( '' !== $path ) {
							self::insert_edge( $source[0], 'menu', $path, '' );
						}
					}
				}
			}
		}
		$state['phase']     = 'confirm';
		$state['lastBatch'] = gmdate( 'c' );
		self::save_state( $state );
	}

	/**
	 * Resolve and, where needed, confirm one batch of link targets.
	 *
	 * @param array $state Scan state.
	 */
	private static function confirm_batch( $state ) {
		global $wpdb;
		$table = self::table();
		$began = microtime( true );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- This plugin's own table; the name is escaped in table().
		$targets = $wpdb->get_results( $wpdb->prepare( "SELECT to_hash, MIN(to_path) AS to_path FROM {$table} WHERE state = %s GROUP BY to_hash LIMIT %d", 'pending', 200 ), ARRAY_A );
		if ( ! $targets ) {
			$state['phase']     = 'done';
			$state['finished']  = gmdate( 'c' );
			$state['lastBatch'] = gmdate( 'c' );
			self::save_state( $state );
			if ( ! wp_next_scheduled( self::HOOK_WEEKLY ) ) {
				wp_schedule_event( time() + WEEK_IN_SECONDS, 'weekly', self::HOOK_WEEKLY );
			}
			return;
		}
		$loopbacks = 0;
		foreach ( $targets as $target ) {
			if ( microtime( true ) - $began > self::BATCH_SECONDS ) {
				break;
			}
			$result = self::resolve( (string) $target['to_path'] );
			if ( 'loopback' === $result['state'] ) {
				if ( $loopbacks >= self::BATCH_LOOPBACKS ) {
					continue;
				}
				++$loopbacks;
				$result = self::confirm( (string) $target['to_path'] );
			}
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- This plugin's own table; update() takes the name as data.
			$wpdb->update(
				$wpdb->prefix . self::TABLE,
				array(
					'state'       => $result['state'],
					'http_status' => $result['status'],
					'target_id'   => $result['post'],
					'final_path'  => substr( $result['final'], 0, 1024 ),
				),
				array(
					'to_hash' => (string) $target['to_hash'],
					'state'   => 'pending',
				)
			);
		}
		$state['lastBatch'] = gmdate( 'c' );
		self::save_state( $state );
	}

	/**
	 * What a link's target is, without asking the site where possible.
	 *
	 * @param string $path Root-relative path, with any query.
	 * @return array{state: string, status: int, post: int, final: string}
	 */
	public static function resolve( $path ) {
		$plain = (string) wp_parse_url( $path, PHP_URL_PATH );
		$home  = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		if ( '' === $plain || rtrim( $plain, '/' ) === rtrim( $home, '/' ) ) {
			return self::verdict( 'ok', 200, (int) get_option( 'page_on_front' ), '' );
		}

		// An upload is checked on disk: a resized copy has no post of its own.
		$uploads = wp_upload_dir( null, false );
		$base    = (string) wp_parse_url( (string) $uploads['baseurl'], PHP_URL_PATH );
		if ( '' !== $base && 0 === strpos( $plain, trailingslashit( $base ) ) ) {
			$file = trailingslashit( (string) $uploads['basedir'] ) . rawurldecode( substr( $plain, strlen( trailingslashit( $base ) ) ) );
			return file_exists( $file ) ? self::verdict( 'ok', 200, 0, '' ) : self::verdict( 'broken', 404, 0, '' );
		}

		$post = url_to_postid( home_url( $path ) );
		if ( $post > 0 && 'publish' === get_post_status( $post ) && false === strpos( $path, '?' ) ) {
			$canonical = (string) wp_parse_url( (string) get_permalink( $post ), PHP_URL_PATH );
			// The link names the post by an address the site will redirect.
			if ( '' !== $canonical && rtrim( $canonical, '/' ) !== rtrim( $plain, '/' ) ) {
				return self::verdict( 'loopback', 0, $post, '' );
			}
			return self::verdict( 'ok', 200, $post, '' );
		}
		$attachment = attachment_url_to_postid( home_url( $path ) );
		if ( $attachment > 0 ) {
			return self::verdict( 'ok', 200, $attachment, '' );
		}
		return self::verdict( 'loopback', 0, $post > 0 ? $post : 0, '' );
	}

	/**
	 * Ask the site for an address, in WP-Cron.
	 *
	 * @param string $path Root-relative path.
	 * @return array{state: string, status: int, post: int, final: string}
	 */
	public static function confirm( $path ) {
		$response = RankXAI_Loopback::request( RankXAI_Loopback::url( $path ), 'HEAD' );
		if ( 405 === $response['status'] ) {
			$response = RankXAI_Loopback::request( RankXAI_Loopback::url( $path ), 'GET' );
		}
		$status = $response['status'];
		if ( 404 === $status || 410 === $status ) {
			return self::verdict( 'broken', $status, 0, '' );
		}
		if ( $status >= 200 && $status < 300 ) {
			return self::verdict( 'ok', $status, url_to_postid( home_url( $path ) ), '' );
		}
		if ( in_array( $status, array( 301, 302, 307, 308 ), true ) ) {
			$location = isset( $response['headers']['location'] ) ? (string) $response['headers']['location'] : '';
			$final    = self::internal_path( remove_query_arg( 'rankxai_check', $location ), home_url( '/' ) );
			if ( '' !== $final && rtrim( (string) wp_parse_url( $final, PHP_URL_PATH ), '/' ) === rtrim( (string) wp_parse_url( $path, PHP_URL_PATH ), '/' ) ) {
				// Only a trailing slash differs: the page is fine.
				return self::verdict( 'ok', $status, url_to_postid( home_url( $final_path ) ), $final );
			}
			return self::verdict( 'redirects', $status, '' === $final ? 0 : url_to_postid( home_url( $final_path ) ), '' === $final ? $location : $final );
		}
		return self::verdict( 'could_not_check', $status, 0, '' );
	}

	/**
	 * One resolution.
	 *
	 * @param string $state  ok, broken, redirects, could_not_check or loopback.
	 * @param int    $status HTTP status, or 0.
	 * @param int    $post   The post it resolved to, or 0.
	 * @param string $final_path Where a redirect goes, or ''.
	 * @return array{state: string, status: int, post: int, final: string}
	 */
	private static function verdict( $state, $status, $post, $final_path ) {
		return array(
			'state'  => $state,
			'status' => (int) $status,
			'post'   => (int) $post,
			'final'  => (string) $final_path,
		);
	}

	// -----------------------------------------------------------------------
	// Findings
	// -----------------------------------------------------------------------

	/**
	 * Everything a finished scan found, for the Site checks page and RankX AI.
	 *
	 * @return array<string, mixed>
	 */
	public static function findings() {
		global $wpdb;
		$state = self::state();
		$out   = array(
			'status'        => self::status(),
			'started'       => isset( $state['started'] ) ? (string) $state['started'] : '',
			'finished'      => isset( $state['finished'] ) ? (string) $state['finished'] : '',
			'scanned'       => isset( $state['scanned'] ) ? (int) $state['scanned'] : 0,
			'total'         => isset( $state['total'] ) ? (int) $state['total'] : 0,
			'capped'        => ! empty( $state['capped'] ),
			'types'         => isset( $state['types'] ) ? (array) $state['types'] : array(),
			'links'         => 0,
			'broken'        => array(),
			'redirects'     => array(),
			'couldNotCheck' => 0,
			'orphans'       => array(),
			'weak'          => array(),
			'unlinkedPosts' => array(),
			'missingAlt'    => array(),
			'emptyAlt'      => 0,
			'libraryNoAlt'  => array(
				'empty' => 0,
				'total' => 0,
			),
		);
		if ( 'done' !== $out['status'] || ! self::table_exists() ) {
			return $out;
		}
		$table = self::table();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- This plugin's own table; the name is escaped in table().
		$out['links'] = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE from_kind = 'post'" );

		// Broken and redirected targets, each with the pages that link to it.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- As above.
		$rows = $wpdb->get_results( "SELECT to_hash, MIN(to_path) AS to_path, MIN(state) AS state, MAX(http_status) AS http_status, MAX(final_path) AS final_path, GROUP_CONCAT(DISTINCT CASE WHEN from_kind = 'post' THEN from_id END) AS sources FROM {$table} WHERE state IN ('broken','redirects') GROUP BY to_hash ORDER BY COUNT(*) DESC LIMIT 200", ARRAY_A );
		foreach ( (array) $rows as $r ) {
			$item = array(
				'path'    => (string) $r['to_path'],
				'status'  => (int) $r['http_status'],
				'final'   => (string) $r['final_path'],
				'sources' => array_values( array_filter( array_map( 'intval', explode( ',', (string) $r['sources'] ) ) ) ),
			);
			if ( 'broken' === $r['state'] ) {
				$out['broken'][] = $item;
			} else {
				$out['redirects'][] = $item;
			}
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- As above.
		$out['couldNotCheck'] = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT to_hash) FROM {$table} WHERE state IN ('could_not_check','pending')" );

		// Inbound links per post, and which posts a menu links to. A store page
		// (shop, cart, checkout, account) lists products by itself, so its links
		// are a listing, not a link someone wrote, and are not counted.
		$listing = implode( ',', array_map( 'intval', array_merge( array( 0 ), self::store_pages() ) ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- As above; $listing is a list of integers.
		$inbound  = $wpdb->get_results( "SELECT target_id, COUNT(DISTINCT CASE WHEN from_kind = 'post' AND from_id <> target_id AND from_id NOT IN ({$listing}) THEN from_id END) AS posts, MAX(CASE WHEN from_kind = 'menu' THEN 1 ELSE 0 END) AS in_menu FROM {$table} WHERE target_id > 0 GROUP BY target_id", ARRAY_A );
		$links_to = array();
		$in_menu  = array();
		foreach ( (array) $inbound as $r ) {
			$links_to[ (int) $r['target_id'] ] = (int) $r['posts'];
			if ( 1 === (int) $r['in_menu'] ) {
				$in_menu[ (int) $r['target_id'] ] = true;
			}
		}

		$reached = self::reached_by_definition();
		$visits  = self::crawler_visits_by_path();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- This plugin's own table; the name is escaped in table().
		$scanned = $wpdb->get_results( "SELECT from_id, to_path, anchor, final_path FROM {$table} WHERE from_kind = 'self' ORDER BY from_id DESC", ARRAY_A );
		foreach ( (array) $scanned as $row ) {
			$id   = (int) $row['from_id'];
			$type = (string) $row['final_path'];
			if ( isset( $reached[ $id ] ) || 'publish' !== get_post_status( $id ) || RankXAI_Twins::is_noindexed( $id ) ) {
				continue;
			}
			$count = isset( $links_to[ $id ] ) ? $links_to[ $id ] : 0;
			$path  = (string) $row['to_path'];
			// Rows come newest first (highest id), so a stable sort keeps recency
			// as the tie-break after crawler visits.
			$item = array(
				'id'      => $id,
				'title'   => (string) $row['anchor'],
				'path'    => $path,
				'type'    => $type,
				'inbound' => $count,
				'visits'  => isset( $visits[ rtrim( $path, '/' ) ] ) ? $visits[ rtrim( $path, '/' ) ] : 0,
			);
			if ( 'page' === $type ) {
				if ( isset( $in_menu[ $id ] ) ) {
					continue;
				}
				if ( 0 === $count ) {
					$out['orphans'][] = $item;
				} elseif ( 1 === $count ) {
					$out['weak'][] = $item;
				}
			} elseif ( 0 === $count && ! isset( $in_menu[ $id ] ) ) {
				$out['unlinkedPosts'][] = $item;
			}
		}
		foreach ( array( 'orphans', 'weak', 'unlinkedPosts' ) as $list ) {
			usort(
				$out[ $list ],
				function ( $a, $b ) {
					if ( $a['visits'] !== $b['visits'] ) {
						return $b['visits'] - $a['visits'];
					}
					return $b['id'] - $a['id'];
				}
			);
		}

		$images = get_option( self::OPTION_IMAGES, array() );
		foreach ( is_array( $images ) ? $images : array() as $id => $counts ) {
			if ( ! empty( $counts['missing'] ) ) {
				$out['missingAlt'][] = array(
					'id'      => (int) $id,
					'title'   => get_the_title( (int) $id ),
					'missing' => (int) $counts['missing'],
				);
			}
			$out['emptyAlt'] += isset( $counts['empty'] ) ? (int) $counts['empty'] : 0;
		}
		$out['libraryNoAlt'] = self::library_alt();
		return $out;
	}

	/**
	 * WooCommerce's shop, cart, checkout and account pages.
	 *
	 * @return int[]
	 */
	private static function store_pages() {
		$ids = array();
		if ( function_exists( 'wc_get_page_id' ) ) {
			foreach ( array( 'shop', 'cart', 'checkout', 'myaccount' ) as $page ) {
				$id = (int) wc_get_page_id( $page );
				if ( $id > 0 ) {
					$ids[] = $id;
				}
			}
		}
		return $ids;
	}

	/**
	 * Pages reached by definition rather than by a link: the front page, the
	 * posts page, and a shop's own cart, checkout, account and shop pages.
	 *
	 * @return array<int, bool>
	 */
	private static function reached_by_definition() {
		$ids = array_merge( array( (int) get_option( 'page_on_front' ), (int) get_option( 'page_for_posts' ) ), self::store_pages() );
		if ( function_exists( 'wc_get_page_id' ) ) {
			$ids[] = (int) wc_get_page_id( 'terms' );
		}
		$out = array();
		foreach ( $ids as $id ) {
			if ( $id > 0 ) {
				$out[ $id ] = true;
			}
		}
		return $out;
	}

	/**
	 * AI crawler visits per path over the counts kept, for ordering.
	 *
	 * @return array<string, int>
	 */
	private static function crawler_visits_by_path() {
		$out = array();
		if ( ! RankXAI_Crawlers::table_exists() ) {
			return $out;
		}
		foreach ( RankXAI_Crawlers::report( RankXAI_Crawlers::RETENTION_DAYS )['bots'] as $row ) {
			foreach ( $row['top'] as $top ) {
				$key         = rtrim( $top['path'], '/' );
				$out[ $key ] = ( isset( $out[ $key ] ) ? $out[ $key ] : 0 ) + $top['hits'];
			}
		}
		return $out;
	}

	/**
	 * Images in the media library with no text description. Informational only:
	 * an image nobody placed on a page is not a problem on any page.
	 *
	 * @return array{empty: int, total: int}
	 */
	private static function library_alt() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- One count over core's tables on an admin screen; no core API counts this.
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_mime_type LIKE 'image/%'" );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- As above.
		$empty = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} p LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = '_wp_attachment_image_alt' WHERE p.post_type = 'attachment' AND p.post_mime_type LIKE 'image/%' AND ( m.meta_value IS NULL OR TRIM( m.meta_value ) = '' )" );
		return array(
			'empty' => $empty,
			'total' => $total,
		);
	}

	/**
	 * Candidates to link FROM, for "link to it from a related page": a page's
	 * parent and siblings, a post's newest neighbours in its first category.
	 * Chosen from structure, not from what the pages say.
	 *
	 * @param int $id Post id.
	 * @return array<int, array{id: int, title: string}>
	 */
	public static function link_candidates( $id ) {
		$post = get_post( $id );
		if ( ! $post instanceof WP_Post ) {
			return array();
		}
		$ids = array();
		if ( 'page' === $post->post_type ) {
			if ( $post->post_parent ) {
				$ids[] = (int) $post->post_parent;
			}
			$ids = array_merge(
				$ids,
				get_posts(
					array(
						'post_type'      => 'page',
						'post_status'    => 'publish',
						'post_parent'    => (int) $post->post_parent,
						'exclude'        => array( $id ),
						'posts_per_page' => 3,
						'fields'         => 'ids',
					)
				)
			);
		} else {
			$cats = wp_get_post_categories( $id );
			if ( $cats ) {
				$ids = get_posts(
					array(
						'post_type'      => $post->post_type,
						'post_status'    => 'publish',
						'category'       => (int) $cats[0],
						'exclude'        => array( $id ),
						'posts_per_page' => 3,
						'fields'         => 'ids',
					)
				);
			}
		}
		$out = array();
		foreach ( array_slice( array_unique( array_map( 'intval', $ids ) ), 0, 3 ) as $candidate ) {
			if ( 'publish' === get_post_status( $candidate ) ) {
				$out[] = array(
					'id'    => $candidate,
					'title' => get_the_title( $candidate ),
				);
			}
		}
		return $out;
	}

	// -----------------------------------------------------------------------
	// Extraction
	// -----------------------------------------------------------------------

	/**
	 * Internal links and image alt text in rendered HTML.
	 *
	 * @param string $html Rendered content.
	 * @param string $base The page's own address, to resolve relative links.
	 * @return array{links: array<int, array{path: string, anchor: string}>, missingAlt: int, emptyAlt: int}
	 */
	public static function extract( $html, $base ) {
		$out  = array(
			'links'      => array(),
			'missingAlt' => 0,
			'emptyAlt'   => 0,
		);
		$html = (string) $html;
		if ( '' === trim( $html ) || ! class_exists( 'DOMDocument' ) ) {
			return $out;
		}
		$dom      = new DOMDocument( '1.0', 'UTF-8' );
		$previous = libxml_use_internal_errors( true );
		$loaded   = $dom->loadHTML( '<?xml encoding="utf-8" ?><html><body>' . $html . '</body></html>', LIBXML_NOERROR | LIBXML_NOWARNING );
		libxml_clear_errors();
		libxml_use_internal_errors( $previous );
		if ( ! $loaded ) {
			return $out;
		}
		$self = self::internal_path( $base, home_url( '/' ) );
		$seen = array();
		foreach ( $dom->getElementsByTagName( 'a' ) as $a ) {
			$href = trim( (string) $a->getAttribute( 'href' ) );
			$path = self::internal_path( $href, $base );
			if ( '' === $path || isset( $seen[ $path ] ) || rtrim( $path, '/' ) === rtrim( $self, '/' ) ) {
				continue;
			}
			$seen[ $path ]  = true;
			$out['links'][] = array(
				'path'   => $path,
				'anchor' => mb_substr( trim( preg_replace( '/\s+/', ' ', (string) $a->textContent ) ), 0, 190 ),
			);
		}
		foreach ( $dom->getElementsByTagName( 'img' ) as $img ) {
			if ( ! $img->hasAttribute( 'alt' ) ) {
				++$out['missingAlt'];
			} elseif ( '' === trim( (string) $img->getAttribute( 'alt' ) ) ) {
				++$out['emptyAlt'];
			}
		}
		return $out;
	}

	/**
	 * A link as a root-relative path on this site, or '' when it is not one.
	 *
	 * Fragments are dropped; a query is kept, since `?p=12` is a real address.
	 *
	 * @param string $href Link as written.
	 * @param string $base Address it appears on.
	 * @return string
	 */
	public static function internal_path( $href, $base ) {
		$href = trim( (string) $href );
		if ( '' === $href || '#' === $href[0] || preg_match( '#^(mailto|tel|javascript|data|sms|ftp):#i', $href ) ) {
			return '';
		}
		$home = wp_parse_url( home_url( '/' ) );
		if ( 0 === strpos( $href, '//' ) ) {
			$href = ( isset( $home['scheme'] ) ? $home['scheme'] : 'https' ) . ':' . $href;
		}
		$parts = wp_parse_url( $href );
		if ( false === $parts ) {
			return '';
		}
		if ( isset( $parts['host'] ) ) {
			$host = strtolower( preg_replace( '/^www\./i', '', (string) $parts['host'] ) );
			$ours = strtolower( preg_replace( '/^www\./i', '', isset( $home['host'] ) ? (string) $home['host'] : '' ) );
			if ( $host !== $ours ) {
				return '';
			}
			$path = isset( $parts['path'] ) ? (string) $parts['path'] : '/';
		} elseif ( isset( $parts['path'] ) && '/' === substr( (string) $parts['path'], 0, 1 ) ) {
			$path = (string) $parts['path'];
		} elseif ( isset( $parts['path'] ) ) {
			$dir  = (string) wp_parse_url( $base, PHP_URL_PATH );
			$dir  = '/' === substr( $dir, -1 ) ? $dir : trailingslashit( dirname( $dir ) );
			$path = $dir . (string) $parts['path'];
		} else {
			$path = (string) wp_parse_url( $base, PHP_URL_PATH );
		}
		if ( '' === $path ) {
			$path = '/';
		}
		// Admin, login and feeds are not pages a reader follows.
		if ( preg_match( '#^/(wp-admin|wp-login\.php|wp-json|xmlrpc\.php)#', $path ) ) {
			return '';
		}
		if ( isset( $parts['query'] ) && '' !== $parts['query'] ) {
			parse_str( (string) $parts['query'], $query );
			foreach ( array_keys( $query ) as $key ) {
				if ( 0 === strpos( (string) $key, 'utm_' ) || in_array( $key, array( 'fbclid', 'gclid', 'rankxai_check' ), true ) ) {
					unset( $query[ $key ] );
				}
			}
			if ( $query ) {
				$path .= '?' . http_build_query( $query );
			}
		}
		return substr( $path, 0, 1024 );
	}

	/**
	 * Store one link.
	 *
	 * @param int    $from_id   Post or menu id.
	 * @param string $from_kind 'post' or 'menu'.
	 * @param string $path      Target path.
	 * @param string $anchor    Anchor text.
	 */
	private static function insert_edge( $from_id, $from_kind, $path, $anchor ) {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- This plugin's own table; insert() takes the name as data.
		$wpdb->insert(
			$wpdb->prefix . self::TABLE,
			array(
				'from_id'   => $from_id,
				'from_kind' => $from_kind,
				'to_hash'   => md5( self::key( $path ) ),
				'to_path'   => $path,
				'anchor'    => $anchor,
			)
		);
	}

	/**
	 * Store a scanned post's own address, title and type, so findings need not
	 * load every post again.
	 *
	 * @param WP_Post $post      Post.
	 * @param string  $permalink Its address.
	 */
	private static function insert_self( $post, $permalink ) {
		global $wpdb;
		$path = (string) wp_parse_url( $permalink, PHP_URL_PATH );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- This plugin's own table; insert() takes the name as data.
		$wpdb->insert(
			$wpdb->prefix . self::TABLE,
			array(
				'from_id'    => (int) $post->ID,
				'from_kind'  => 'self',
				'to_hash'    => md5( self::key( $path ) ),
				'to_path'    => '' === $path ? '/' : $path,
				'anchor'     => mb_substr( wp_strip_all_tags( get_the_title( $post ) ), 0, 190 ),
				'state'      => 'self',
				'target_id'  => (int) $post->ID,
				'final_path' => $post->post_type,
			)
		);
	}

	/**
	 * The comparison key for a path: without a trailing slash, lower-cased.
	 *
	 * @param string $path Path.
	 * @return string
	 */
	private static function key( $path ) {
		$plain = rtrim( (string) wp_parse_url( $path, PHP_URL_PATH ), '/' );
		$query = (string) wp_parse_url( $path, PHP_URL_QUERY );
		return strtolower( '' === $plain ? '/' : $plain ) . ( '' === $query ? '' : '?' . $query );
	}

	/**
	 * How many links are stored.
	 *
	 * @return int
	 */
	private static function edge_count() {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- This plugin's own table; the name is escaped in table().
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}
}
