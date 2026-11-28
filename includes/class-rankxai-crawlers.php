<?php
/**
 * AI crawler visits: which crawlers fetch which addresses, per day.
 *
 * Off by default. Only daily counts per crawler, address and status are kept:
 * no IP address, no user agent string, no query string.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Crawler visit counters.
 */
class RankXAI_Crawlers {

	/** Table name, after the site's own prefix. */
	const TABLE = 'rankxai_crawler_hits';

	/** Bumped when the table's shape changes, so it is rebuilt once. */
	const TABLE_VERSION = '1';

	/** The switch. Autoloaded: it is read on every front-end request. */
	const OPTION_ENABLED = 'rankxai_crawlers_enabled';

	/** The UTC day retention last ran. */
	const OPTION_PRUNED = 'rankxai_crawlers_pruned';

	/** The table version that exists on this site. */
	const OPTION_TABLE = 'rankxai_crawlers_table';

	/** When counting last started: switched on, or counts cleared while on. */
	const OPTION_ENABLED_AT = 'rankxai_crawlers_enabled_at';

	/** Days of counters kept. */
	const RETENTION_DAYS = 35;

	/** Distinct rows per day before new addresses fold into one. */
	const MAX_ROWS_PER_DAY = 2000;

	/** The path new addresses fold into once a day is full. */
	const OTHER = '(other)';

	/** Longest path stored. */
	const MAX_PATH = 255;

	/**
	 * Hook the recorder.
	 */
	public static function init() {
		add_action( 'shutdown', array( __CLASS__, 'record' ) );
		add_action( 'admin_init', array( __CLASS__, 'maybe_upgrade_table' ) );
		add_action( 'admin_init', array( __CLASS__, 'privacy_policy_text' ) );
	}

	/**
	 * The crawlers counted.
	 *
	 * Tokens are matched case-insensitively anywhere in the user agent. Order
	 * matters only if two tokens could match one agent; none of these do.
	 *
	 * @return array<string, string[]>
	 */
	public static function default_bots() {
		return array(
			'gptbot'             => array( 'GPTBot' ),
			'oai-searchbot'      => array( 'OAI-SearchBot' ),
			'chatgpt-user'       => array( 'ChatGPT-User' ),
			'claudebot'          => array( 'ClaudeBot' ),
			'claude-user'        => array( 'Claude-User' ),
			'claude-searchbot'   => array( 'Claude-SearchBot' ),
			'perplexitybot'      => array( 'PerplexityBot' ),
			'perplexity-user'    => array( 'Perplexity-User' ),
			'googlebot'          => array( 'Googlebot' ),
			'bingbot'            => array( 'bingbot' ),
			'applebot'           => array( 'Applebot' ),
			'ccbot'              => array( 'CCBot' ),
			'meta-externalagent' => array( 'meta-externalagent' ),
			'bytespider'         => array( 'Bytespider' ),
			'amazonbot'          => array( 'Amazonbot' ),
			'duckassistbot'      => array( 'DuckAssistBot' ),
			'mistralai-user'     => array( 'MistralAI-User' ),
		);
	}

	/**
	 * Name, purpose and group for each default crawler.
	 *
	 * @return array<string, array{label: string, purpose: string, group: string}>
	 */
	public static function default_meta() {
		return array(
			'gptbot'             => self::meta_entry( 'ChatGPT training', 'training', 'ai' ),
			'oai-searchbot'      => self::meta_entry( 'ChatGPT search', 'search', 'ai' ),
			'chatgpt-user'       => self::meta_entry( 'ChatGPT, fetching for a user', 'user', 'ai' ),
			'claudebot'          => self::meta_entry( 'Claude training', 'training', 'ai' ),
			'claude-user'        => self::meta_entry( 'Claude, fetching for a user', 'user', 'ai' ),
			'claude-searchbot'   => self::meta_entry( 'Claude search', 'search', 'ai' ),
			'perplexitybot'      => self::meta_entry( 'Perplexity search', 'search', 'ai' ),
			'perplexity-user'    => self::meta_entry( 'Perplexity, fetching for a user', 'user', 'ai' ),
			'googlebot'          => self::meta_entry( 'Google Search', 'search', 'search_engine' ),
			'bingbot'            => self::meta_entry( 'Bing (and Copilot)', 'search', 'search_engine' ),
			'applebot'           => self::meta_entry( 'Apple (Siri and Spotlight)', 'search', 'search_engine' ),
			'ccbot'              => self::meta_entry( 'Common Crawl', 'training', 'ai' ),
			'meta-externalagent' => self::meta_entry( 'Meta AI training', 'training', 'ai' ),
			'bytespider'         => self::meta_entry( 'ByteDance (TikTok) training', 'training', 'ai' ),
			'amazonbot'          => self::meta_entry( 'Amazon (Alexa)', 'search', 'ai' ),
			'duckassistbot'      => self::meta_entry( 'DuckDuckGo DuckAssist', 'user', 'ai' ),
			'mistralai-user'     => self::meta_entry( 'Mistral Le Chat, fetching for a user', 'user', 'ai' ),
		);
	}

	/**
	 * One meta entry.
	 *
	 * @param string $label   Name a customer recognises.
	 * @param string $purpose training, search or user.
	 * @param string $group   ai or search_engine.
	 * @return array{label: string, purpose: string, group: string}
	 */
	private static function meta_entry( $label, $purpose, $group ) {
		return array(
			'label'   => $label,
			'purpose' => $purpose,
			'group'   => $group,
		);
	}

	/**
	 * Name, purpose and group for a crawler id, or the id itself with no purpose,
	 * so an unknown crawler is still shown.
	 *
	 * @param string $id Crawler id.
	 * @return array{label: string, purpose: string, group: string}
	 */
	public static function meta( $id ) {
		$defaults = self::default_meta();
		if ( isset( $defaults[ $id ] ) ) {
			return $defaults[ $id ];
		}
		return self::meta_entry( $id, '', 'ai' );
	}

	/**
	 * Is counting switched on?
	 *
	 * @return bool
	 */
	public static function enabled() {
		return (bool) get_option( self::OPTION_ENABLED, false );
	}

	/**
	 * Switch counting on or off. Turning it on creates the table.
	 *
	 * @param bool $on New state.
	 */
	public static function set_enabled( $on ) {
		if ( $on ) {
			self::ensure_table();
			// A window of "no visits seen" starts here, not 30 days ago.
			if ( ! self::enabled() ) {
				update_option( self::OPTION_ENABLED_AT, gmdate( 'c' ), false );
			}
		}
		update_option( self::OPTION_ENABLED, $on ? 1 : 0, true );
	}

	/**
	 * When the counts on this site begin, or '' when counting has never run.
	 *
	 * @return string ISO 8601, UTC.
	 */
	public static function enabled_at() {
		$at = get_option( self::OPTION_ENABLED_AT, '' );
		return is_string( $at ) ? $at : '';
	}

	/**
	 * Delete every count. The window of what has been seen starts again now.
	 */
	public static function clear() {
		global $wpdb;
		if ( self::table_exists() ) {
			$table = esc_sql( self::table() );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own table; name escaped above.
			$wpdb->query( "DELETE FROM {$table}" );
		}
		if ( self::enabled() ) {
			update_option( self::OPTION_ENABLED_AT, gmdate( 'c' ), false );
		} else {
			delete_option( self::OPTION_ENABLED_AT );
		}
	}

	/**
	 * The full table name.
	 *
	 * @return string
	 */
	public static function table() {
		global $wpdb;
		return $wpdb->prefix . self::TABLE;
	}

	/**
	 * Create or update the table.
	 *
	 * The primary key uses an MD5 of the path rather than the path itself, so
	 * the key stays well inside the index length limits of the oldest MySQL
	 * versions WordPress supports.
	 */
	public static function ensure_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table   = esc_sql( self::table() );
		$charset = $wpdb->get_charset_collate();
		// phpcs:ignore PluginCheck.Security.DirectDB.UnescapedDBParameter -- Name escaped above; dbDelta takes no placeholders.
		dbDelta(
			"CREATE TABLE {$table} (
  day date NOT NULL,
  bot varchar(40) NOT NULL,
  in_range tinyint(1) NOT NULL DEFAULT 0,
  status smallint(5) unsigned NOT NULL DEFAULT 0,
  path_hash char(32) NOT NULL,
  path varchar(255) NOT NULL,
  hits int(10) unsigned NOT NULL DEFAULT 0,
  last_seen datetime NOT NULL,
  PRIMARY KEY  (day,bot,in_range,status,path_hash)
) {$charset};"
		);
		update_option( self::OPTION_TABLE, self::TABLE_VERSION, false );
	}

	/**
	 * Rebuild the table once after an update that changed its shape.
	 */
	public static function maybe_upgrade_table() {
		if ( self::enabled() && self::TABLE_VERSION !== get_option( self::OPTION_TABLE ) ) {
			self::ensure_table();
		}
	}

	/**
	 * Does the table exist?
	 *
	 * @return bool
	 */
	public static function table_exists() {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Existence check on the plugin's own table.
		return $table === $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );
	}

	// -----------------------------------------------------------------------
	// Recording
	// -----------------------------------------------------------------------

	/**
	 * Count this request, if it is a crawler fetching a front-end address.
	 *
	 * Runs at `shutdown`, so the status is the one actually sent.
	 */
	public static function record() {
		if ( ! self::enabled() || ! self::is_front_end_fetch() ) {
			return;
		}

		$agent = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
		$bot   = self::match_bot( $agent );
		if ( '' === $bot ) {
			return;
		}

		$status = http_response_code();
		self::count(
			gmdate( 'Y-m-d' ),
			$bot,
			self::address_in_range( $bot ),
			is_int( $status ) ? $status : 200,
			self::request_path()
		);
	}

	/**
	 * A GET or HEAD for a front-end address.
	 *
	 * @return bool
	 */
	private static function is_front_end_fetch() {
		$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( sanitize_key( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) : '';
		if ( 'GET' !== $method && 'HEAD' !== $method ) {
			return false;
		}
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
			return false;
		}
		if ( ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
			return false;
		}
		global $pagenow;
		return 'wp-login.php' !== $pagenow;
	}

	/**
	 * Which crawler this user agent names, or ''.
	 *
	 * @param string $agent User agent.
	 * @return string
	 */
	public static function match_bot( $agent ) {
		if ( '' === $agent ) {
			return '';
		}
		foreach ( self::bots() as $id => $tokens ) {
			foreach ( $tokens as $token ) {
				if ( '' !== $token && false !== stripos( $agent, $token ) ) {
					return $id;
				}
			}
		}
		return '';
	}

	/**
	 * The crawlers counted.
	 *
	 * @return array<string, string[]>
	 */
	public static function bots() {
		return self::default_bots();
	}

	/**
	 * The path requested, without its query string.
	 *
	 * A query string can carry personal data, so it is dropped, except for the
	 * plugin's own markdown-copy address.
	 *
	 * @return string
	 */
	public static function request_path() {
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? rankxai_sanitize_path( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/'; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Sanitised by rankxai_sanitize_path().
		$path = wp_parse_url( $uri, PHP_URL_PATH );
		$path = is_string( $path ) && '' !== $path ? $path : '/';
		$path = preg_replace( '/[\x00-\x1F\x7F]/', '', $path );

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read only, no action taken.
		if ( isset( $_GET['format'] ) && 'md' === sanitize_key( wp_unslash( $_GET['format'] ) ) ) {
			$path .= '?format=md';
		}
		if ( strlen( $path ) > self::MAX_PATH ) {
			$path = substr( $path, 0, self::MAX_PATH );
		}
		return wp_check_invalid_utf8( $path, true );
	}

	/**
	 * Is the request's address inside this crawler's published ranges?
	 *
	 * @param string $bot Crawler id.
	 * @return bool
	 */
	public static function address_in_range( $bot ) {
		$ranges = self::ranges();
		if ( empty( $ranges['bots'][ $bot ] ) ) {
			return false;
		}
		$ip = self::client_address( $ranges['proxies'] );
		if ( '' === $ip ) {
			return false;
		}
		foreach ( $ranges['bots'][ $bot ] as $prefix ) {
			if ( self::ip_in_prefix( $ip, $prefix ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The connecting address, or the one Cloudflare forwarded.
	 *
	 * `CF-Connecting-IP` is a header anyone can send, so it is believed only
	 * when the connection itself comes from a Cloudflare address.
	 *
	 * @param string[] $proxies Cloudflare's ranges.
	 * @return string
	 */
	private static function client_address( $proxies ) {
		$remote = isset( $_SERVER['REMOTE_ADDR'] ) ? filter_var( sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ), FILTER_VALIDATE_IP ) : false;
		if ( false === $remote ) {
			return '';
		}
		if ( $proxies && isset( $_SERVER['HTTP_CF_CONNECTING_IP'] ) ) {
			foreach ( $proxies as $prefix ) {
				if ( self::ip_in_prefix( $remote, $prefix ) ) {
					$forwarded = filter_var( sanitize_text_field( wp_unslash( $_SERVER['HTTP_CF_CONNECTING_IP'] ) ), FILTER_VALIDATE_IP );
					return false === $forwarded ? '' : $forwarded;
				}
			}
		}
		return $remote;
	}

	/**
	 * Is an address inside a CIDR prefix? IPv4 and IPv6.
	 *
	 * @param string $ip     Address.
	 * @param string $prefix CIDR, e.g. 192.0.2.0/24.
	 * @return bool
	 */
	public static function ip_in_prefix( $ip, $prefix ) {
		$parts = explode( '/', (string) $prefix, 2 );
		$net   = @inet_pton( $parts[0] ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- inet_pton warns on bad input.
		$addr  = @inet_pton( (string) $ip ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- As above.
		if ( false === $net || false === $addr || strlen( $net ) !== strlen( $addr ) ) {
			return false;
		}
		$max  = strlen( $net ) * 8;
		$bits = isset( $parts[1] ) ? (int) $parts[1] : $max;
		if ( $bits < 0 || $bits > $max ) {
			return false;
		}
		$whole = intdiv( $bits, 8 );
		if ( substr( $net, 0, $whole ) !== substr( $addr, 0, $whole ) ) {
			return false;
		}
		$rest = $bits % 8;
		if ( 0 === $rest ) {
			return true;
		}
		$mask = ( 0xFF << ( 8 - $rest ) ) & 0xFF;
		return ( ord( $net[ $whole ] ) & $mask ) === ( ord( $addr[ $whole ] ) & $mask );
	}

	/**
	 * Add one to a counter.
	 *
	 * One atomic statement for a known row. A new row is checked against the
	 * day's cap afterwards, and folded into `(other)` if it went over.
	 *
	 * @param string $day      UTC day, Y-m-d.
	 * @param string $bot      Crawler id.
	 * @param bool   $in_range Address inside the operator's ranges.
	 * @param int    $status   HTTP status sent.
	 * @param string $path     Address.
	 */
	public static function count( $day, $bot, $in_range, $status, $path ) {
		global $wpdb;
		$table = esc_sql( self::table() );
		$now   = gmdate( 'Y-m-d H:i:s' );
		$flag  = $in_range ? 1 : 0;

		$suppress = $wpdb->suppress_errors( true );
		$inserted = self::upsert( $day, $bot, $flag, $status, $path, $now );

		if ( 1 === $inserted && self::OTHER !== $path ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own table.
			$rows = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE day = %s", $day ) );
			if ( $rows > self::MAX_ROWS_PER_DAY ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- As above.
				$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE day = %s AND bot = %s AND in_range = %d AND status = %d AND path_hash = %s", $day, $bot, $flag, $status, md5( $path ) ) );
				self::upsert( $day, $bot, $flag, $status, self::OTHER, $now );
			}
		}
		$wpdb->suppress_errors( $suppress );

		self::maybe_prune( $day );
	}

	/**
	 * Insert a row with one hit, or add one to it.
	 *
	 * @param string $day    UTC day.
	 * @param string $bot    Crawler id.
	 * @param int    $flag   1 when the address was in range.
	 * @param int    $status HTTP status.
	 * @param string $path   Address.
	 * @param string $now    UTC timestamp.
	 * @return int 1 when a row was created, 2 when one was updated, 0 on failure.
	 */
	private static function upsert( $day, $bot, $flag, $status, $path, $now ) {
		global $wpdb;
		$table = esc_sql( self::table() );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own table; atomic counter.
		$result = $wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$table} (day, bot, in_range, status, path_hash, path, hits, last_seen) VALUES (%s, %s, %d, %d, %s, %s, 1, %s) ON DUPLICATE KEY UPDATE hits = hits + 1, last_seen = VALUES(last_seen)", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- As above.
				$day,
				$bot,
				$flag,
				$status,
				md5( $path ),
				$path,
				$now
			)
		);
		return is_int( $result ) ? $result : 0;
	}

	/**
	 * Drop counters past retention, at most once a UTC day.
	 *
	 * @param string $today UTC day.
	 */
	public static function maybe_prune( $today ) {
		if ( get_option( self::OPTION_PRUNED ) === $today ) {
			return;
		}
		update_option( self::OPTION_PRUNED, $today, true );
		self::prune( $today );
	}

	/**
	 * Delete everything older than the retention window.
	 *
	 * @param string $today UTC day.
	 */
	public static function prune( $today ) {
		global $wpdb;
		$table  = esc_sql( self::table() );
		$cutoff = gmdate( 'Y-m-d', strtotime( $today . ' -' . ( self::RETENTION_DAYS - 1 ) . ' days' ) );
		$prev   = $wpdb->suppress_errors( true );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own table.
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE day < %s", $cutoff ) );
		$wpdb->suppress_errors( $prev );
	}

	// -----------------------------------------------------------------------
	// Reading
	// -----------------------------------------------------------------------

	/**
	 * Counters from a day onwards, a page at a time.
	 *
	 * @param string $since  First UTC day, Y-m-d.
	 * @param int    $offset Rows to skip.
	 * @param int    $limit  Rows to return.
	 * @return array{total: int, rows: array<int, array<string, mixed>>}
	 */
	public static function rows( $since, $offset, $limit ) {
		global $wpdb;
		if ( ! self::table_exists() ) {
			return array(
				'total' => 0,
				'rows'  => array(),
			);
		}
		self::prune( gmdate( 'Y-m-d' ) );
		$table = esc_sql( self::table() );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own table.
		$total = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE day >= %s", $since ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own table.
		$raw  = $wpdb->get_results( $wpdb->prepare( "SELECT day, bot, in_range, status, path, hits, last_seen FROM {$table} WHERE day >= %s ORDER BY day, bot, in_range, status, path_hash LIMIT %d OFFSET %d", $since, $limit, $offset ), ARRAY_A );
		$rows = array();
		foreach ( (array) $raw as $r ) {
			$rows[] = array(
				'day'      => (string) $r['day'],
				'bot'      => (string) $r['bot'],
				'inRange'  => 1 === (int) $r['in_range'],
				'status'   => (int) $r['status'],
				'path'     => (string) $r['path'],
				'hits'     => (int) $r['hits'],
				'lastSeen' => mysql_to_rfc3339( (string) $r['last_seen'] ),
			);
		}
		return array(
			'total' => $total,
			'rows'  => $rows,
		);
	}

	/**
	 * Per-crawler totals over the last few days, for the settings screen.
	 *
	 * @param int $days Days to cover, including today.
	 * @return array<int, array{bot: string, in_range: int, other: int, paths: int}>
	 */
	public static function summary( $days = 7 ) {
		global $wpdb;
		if ( ! self::table_exists() ) {
			return array();
		}
		$table = esc_sql( self::table() );
		$since = gmdate( 'Y-m-d', time() - ( $days - 1 ) * DAY_IN_SECONDS );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own table.
		$raw = $wpdb->get_results( $wpdb->prepare( "SELECT bot, SUM(CASE WHEN in_range = 1 THEN hits ELSE 0 END) AS in_range, SUM(CASE WHEN in_range = 0 THEN hits ELSE 0 END) AS other, COUNT(DISTINCT path_hash) AS paths FROM {$table} WHERE day >= %s GROUP BY bot ORDER BY SUM(hits) DESC", $since ), ARRAY_A );
		$out = array();
		foreach ( (array) $raw as $r ) {
			$out[] = array(
				'bot'      => (string) $r['bot'],
				'in_range' => (int) $r['in_range'],
				'other'    => (int) $r['other'],
				'paths'    => (int) $r['paths'],
			);
		}
		return $out;
	}

	/**
	 * Is a path shaped like a probe for software, rather than a page?
	 *
	 * A crawler asking for /wp-login.php or /.env is not a missing page anyone
	 * should redirect, and a user agent that says it is ClaudeBot while probing
	 * for files is a common disguise.
	 *
	 * @param string $path Path.
	 * @return bool
	 */
	public static function is_probe_path( $path ) {
		return (bool) preg_match( '#(\.php\b|/wp-login|/wp-admin|/xmlrpc|/\.env|/\.git|/cgi-bin|\.(sql|bak|zip|tar|gz|ini|log)$)#i', (string) $path );
	}

	/**
	 * The first UTC day a report covers: the window, or when counting started if later.
	 *
	 * @param int $days Window length, including today.
	 * @return string Y-m-d.
	 */
	public static function window_start( $days ) {
		$since = gmdate( 'Y-m-d', time() - ( max( 1, (int) $days ) - 1 ) * DAY_IN_SECONDS );
		$at    = self::enabled_at();
		if ( '' !== $at ) {
			$started = gmdate( 'Y-m-d', (int) strtotime( $at ) );
			if ( $started > $since ) {
				return $started;
			}
		}
		return $since;
	}

	/**
	 * Everything the AI crawlers page shows, from counts already stored.
	 *
	 * @param int $days Window length, including today.
	 * @return array{since: string, bots: array, errors: array, daily: array<string, int>}
	 */
	public static function report( $days ) {
		global $wpdb;
		$out = array(
			'since'  => self::window_start( $days ),
			'bots'   => array(),
			'errors' => array(),
			'daily'  => array(),
		);
		if ( ! self::table_exists() ) {
			return $out;
		}
		$table = esc_sql( self::table() );
		$since = $out['since'];

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own table; name escaped above.
		$totals = $wpdb->get_results( $wpdb->prepare( "SELECT bot, SUM(hits) AS hits, SUM(CASE WHEN in_range = 1 THEN hits ELSE 0 END) AS in_range, SUM(CASE WHEN status >= 400 THEN hits ELSE 0 END) AS errors, COUNT(DISTINCT path_hash) AS paths, MAX(last_seen) AS last_seen FROM {$table} WHERE day >= %s GROUP BY bot ORDER BY SUM(hits) DESC", $since ), ARRAY_A );
		foreach ( (array) $totals as $r ) {
			$out['bots'][ (string) $r['bot'] ] = array(
				'hits'     => (int) $r['hits'],
				'inRange'  => (int) $r['in_range'],
				'errors'   => (int) $r['errors'],
				'paths'    => (int) $r['paths'],
				'lastSeen' => (string) $r['last_seen'],
				'top'      => array(),
			);
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- As above.
		$top = $wpdb->get_results( $wpdb->prepare( "SELECT bot, path, SUM(hits) AS hits FROM {$table} WHERE day >= %s AND status < 400 AND path <> %s GROUP BY bot, path_hash, path ORDER BY hits DESC LIMIT 2000", $since, self::OTHER ), ARRAY_A );
		foreach ( (array) $top as $r ) {
			$bot = (string) $r['bot'];
			if ( isset( $out['bots'][ $bot ] ) && count( $out['bots'][ $bot ]['top'] ) < 5 ) {
				$out['bots'][ $bot ]['top'][] = array(
					'path' => (string) $r['path'],
					'hits' => (int) $r['hits'],
				);
			}
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- As above.
		$errors = $wpdb->get_results( $wpdb->prepare( "SELECT path, status, bot, SUM(hits) AS hits, MAX(in_range) AS in_range, COUNT(DISTINCT day) AS days, MAX(day) AS last_day FROM {$table} WHERE day >= %s AND status >= 400 AND path <> %s GROUP BY path_hash, path, status, bot ORDER BY hits DESC LIMIT 500", $since, self::OTHER ), ARRAY_A );
		foreach ( (array) $errors as $r ) {
			$key = (string) $r['path'] . '|' . (int) $r['status'];
			if ( ! isset( $out['errors'][ $key ] ) ) {
				$out['errors'][ $key ] = array(
					'path'    => (string) $r['path'],
					'status'  => (int) $r['status'],
					'hits'    => 0,
					'bots'    => array(),
					'inRange' => false,
					'days'    => 0,
					'lastDay' => '',
				);
			}
			$row            = &$out['errors'][ $key ];
			$row['hits']   += (int) $r['hits'];
			$row['bots'][]  = (string) $r['bot'];
			$row['inRange'] = $row['inRange'] || 1 === (int) $r['in_range'];
			$row['days']    = max( $row['days'], (int) $r['days'] );
			$row['lastDay'] = max( $row['lastDay'], (string) $r['last_day'] );
			unset( $row );
		}
		$out['errors'] = array_values( $out['errors'] );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- As above.
		$daily = $wpdb->get_results( $wpdb->prepare( "SELECT day, SUM(hits) AS hits FROM {$table} WHERE day >= %s GROUP BY day ORDER BY day", $since ), ARRAY_A );
		foreach ( (array) $daily as $r ) {
			$out['daily'][ (string) $r['day'] ] = (int) $r['hits'];
		}
		return $out;
	}

	/**
	 * Error answers AI crawlers received that are worth a site owner's time.
	 *
	 * From a visit inside the operator's published ranges, or from unverified
	 * visits on at least two different days, so one spoofed request cannot
	 * raise a count on the Dashboard. Probe-shaped paths are left out.
	 *
	 * @param int $days Window length, including today.
	 * @return array<int, array{path: string, status: int, hits: int}>
	 */
	public static function credible_errors( $days = 7 ) {
		if ( ! self::enabled() ) {
			return array();
		}
		$out = array();
		foreach ( self::report( $days )['errors'] as $row ) {
			if ( self::is_probe_path( $row['path'] ) ) {
				continue;
			}
			if ( $row['inRange'] || $row['days'] >= 2 ) {
				$out[] = array(
					'path'   => $row['path'],
					'status' => $row['status'],
					'hits'   => $row['hits'],
				);
			}
		}
		return $out;
	}

	// -----------------------------------------------------------------------
	// Published address ranges, shipped with the plugin
	// -----------------------------------------------------------------------

	/**
	 * The address ranges each operator publishes, as shipped in includes/data/crawler-ranges.php.
	 *
	 * @return array{updated: string, version: string, bots: array<string, string[]>, proxies: string[]}
	 */
	public static function published() {
		static $cache = null;
		if ( null !== $cache ) {
			return $cache;
		}
		$data  = include __DIR__ . '/data/crawler-ranges.php';
		$data  = is_array( $data ) ? $data : array();
		$cache = array(
			'updated' => isset( $data['updated'] ) && is_string( $data['updated'] ) ? $data['updated'] : '',
			'version' => isset( $data['version'] ) && is_string( $data['version'] ) ? $data['version'] : '',
			'bots'    => isset( $data['bots'] ) && is_array( $data['bots'] ) ? $data['bots'] : array(),
			'proxies' => isset( $data['proxies'] ) && is_array( $data['proxies'] ) ? $data['proxies'] : array(),
		);
		return $cache;
	}

	/**
	 * The address ranges visits are checked against.
	 *
	 * @return array{bots: array<string, string[]>, proxies: string[]}
	 */
	public static function ranges() {
		$published = self::published();
		return array(
			'bots'    => $published['bots'],
			'proxies' => $published['proxies'],
		);
	}

	/**
	 * Which ranges are in use, for the REST API and the admin pages.
	 *
	 * @return array{version: string, updated: string, bots: int, prefixes: int, proxies: int}
	 */
	public static function config_summary() {
		$published = self::published();
		$prefixes  = 0;
		foreach ( $published['bots'] as $list ) {
			$prefixes += is_array( $list ) ? count( $list ) : 0;
		}
		return array(
			'version'  => $published['version'],
			'updated'  => $published['updated'],
			'bots'     => count( self::bots() ),
			'prefixes' => $prefixes,
			'proxies'  => count( $published['proxies'] ),
		);
	}

	// -----------------------------------------------------------------------
	// Page caches and privacy
	// -----------------------------------------------------------------------

	/**
	 * Page caches this site runs that can answer without WordPress.
	 *
	 * @return string[]
	 */
	public static function page_caches() {
		$found = array();
		$named = array(
			'LSCWP_V'               => 'LiteSpeed Cache',
			'WP_ROCKET_VERSION'     => 'WP Rocket',
			'W3TC'                  => 'W3 Total Cache',
			'WPCACHEHOME'           => 'WP Super Cache',
			'BREEZE_VERSION'        => 'Breeze',
			'WPHB_VERSION'          => 'Hummingbird',
			'CACHE_ENABLER_VERSION' => 'Cache Enabler',
		);
		foreach ( $named as $constant => $label ) {
			if ( defined( $constant ) ) {
				$found[] = $label;
			}
		}
		if ( class_exists( 'WpFastestCache' ) ) {
			$found[] = 'WP Fastest Cache';
		}
		if ( ! $found && defined( 'WP_CACHE' ) && WP_CACHE ) {
			$found[] = 'a page cache';
		}
		return $found;
	}

	/**
	 * Suggested text for the site's privacy policy.
	 */
	public static function privacy_policy_text() {
		if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
			return;
		}
		wp_add_privacy_policy_content(
			__( 'RankX AI', 'rankxai' ),
			'<p>' . esc_html__( 'When AI crawler counting is switched on, this site counts visits from known AI crawlers, such as GPTBot and ClaudeBot, per address and per day. It stores the crawler\'s name, the address visited, the response status and a count. It does not store IP addresses, browser details or anything about human visitors. Counts are kept for 35 days.', 'rankxai' ) . '</p>'
		);
	}
}
