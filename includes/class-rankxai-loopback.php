<?php
/**
 * Requests from this site to itself, and nowhere else.
 *
 * The site checks read robots.txt and confirm whether an address is missing by
 * asking the site, because only the answer the site actually gives is the
 * truth. Every address is built here from the site's own home URL, so this
 * class cannot be pointed at another host.
 *
 * Confirmation requests to addresses that may be missing run inside WP-Cron,
 * never in an administrator's request: some security plugins throttle a burst
 * of "page not found" answers from any address, and exempt the site's own
 * server only while WP-Cron runs.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Loopback requests.
 */
class RankXAI_Loopback {

	/** Seconds before a loopback gives up. */
	const TIMEOUT = 10;

	/**
	 * The user agent, so these requests can be told apart in a site's own logs.
	 *
	 * @return string
	 */
	public static function user_agent() {
		return 'RankXAI-SiteCheck/' . RANKXAI_VERSION . ' (+https://rankxai.com)';
	}

	/**
	 * An address on this site, with a parameter that no page cache has seen.
	 *
	 * @param string $path Root-relative path, with or without a query.
	 * @return string
	 */
	public static function url( $path ) {
		$url = home_url( '/' . ltrim( (string) $path, '/' ) );
		return add_query_arg( 'rankxai_check', wp_generate_password( 8, false, false ), $url );
	}

	/**
	 * An address at the root of this site's host, which is where robots.txt
	 * lives even when WordPress is installed in a subdirectory.
	 *
	 * @param string $path Root-relative path.
	 * @return string
	 */
	public static function root_url( $path ) {
		$home   = wp_parse_url( home_url( '/' ) );
		$scheme = isset( $home['scheme'] ) ? $home['scheme'] : 'https';
		$host   = isset( $home['host'] ) ? $home['host'] : '';
		$port   = isset( $home['port'] ) ? ':' . (int) $home['port'] : '';
		return $scheme . '://' . $host . $port . '/' . ltrim( (string) $path, '/' );
	}

	/**
	 * Ask this site for an address.
	 *
	 * @param string $url    Built by url() or root_url().
	 * @param string $method 'GET' or 'HEAD'.
	 * @return array{status: int, headers: array<string, string>, body: string, error: string}
	 */
	public static function request( $url, $method = 'GET' ) {
		$home = wp_parse_url( home_url( '/' ), PHP_URL_HOST );
		$host = wp_parse_url( $url, PHP_URL_HOST );
		if ( ! is_string( $home ) || ! is_string( $host ) || strtolower( $home ) !== strtolower( $host ) ) {
			return array(
				'status'  => 0,
				'headers' => array(),
				'body'    => '',
				'error'   => 'not_this_site',
			);
		}

		$response = wp_safe_remote_request(
			$url,
			array(
				'method'              => 'HEAD' === $method ? 'HEAD' : 'GET',
				'timeout'             => self::TIMEOUT,
				'redirection'         => 0,
				'user-agent'          => self::user_agent(),
				'headers'             => array( 'Cache-Control' => 'no-cache' ),
				// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Core's own filter for a request to this site, applied as core's loopback test applies it.
				'sslverify'           => apply_filters( 'https_local_ssl_verify', false ),
				'limit_response_size' => 2 * MB_IN_BYTES,
			)
		);
		if ( is_wp_error( $response ) ) {
			return array(
				'status'  => 0,
				'headers' => array(),
				'body'    => '',
				'error'   => $response->get_error_code(),
			);
		}

		$headers = array();
		$raw     = wp_remote_retrieve_headers( $response );
		// Core returns a case-insensitive dictionary object, not an array.
		if ( is_object( $raw ) && method_exists( $raw, 'getAll' ) ) {
			$raw = $raw->getAll();
		}
		foreach ( (array) $raw as $name => $value ) {
			$headers[ strtolower( (string) $name ) ] = is_array( $value ) ? implode( ', ', $value ) : (string) $value;
		}
		return array(
			'status'  => (int) wp_remote_retrieve_response_code( $response ),
			'headers' => $headers,
			'body'    => (string) wp_remote_retrieve_body( $response ),
			'error'   => '',
		);
	}

	/**
	 * Did a response pass through Cloudflare?
	 *
	 * @param array<string, string> $headers Response headers.
	 * @return bool
	 */
	public static function via_cloudflare( $headers ) {
		return isset( $headers['cf-ray'] ) || ( isset( $headers['server'] ) && false !== stripos( $headers['server'], 'cloudflare' ) );
	}
}
