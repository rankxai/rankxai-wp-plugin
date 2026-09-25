<?php
/**
 * What this site's robots.txt says to each AI crawler.
 *
 * A PHP port of the RankX AI platform's robots.txt reader. The two are tested
 * against ONE set of cases (probe/fixtures/robots-fixtures.json, a byte copy of
 * the platform's), because two parsers in two languages cannot share code, only
 * evidence. Change a rule here and the probe fails until the platform agrees.
 *
 * The grammar: grouped User-agent lines, Allow and Disallow, `*` and a trailing
 * `$`, comments, a byte-order mark, any line ending, and the longest match
 * winning with Allow winning a tie. "No rule names this crawler" is not a
 * block: robots.txt is deny-by-exception, so silence means allowed.
 *
 * The file itself is read by asking the site for it, because what the site
 * serves is the truth whether it comes from a real file, from WordPress or from
 * an SEO plugin. Nothing here ever writes robots rules.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reading robots.txt, and a verdict per crawler.
 */
class RankXAI_Robots {

	/** Cached reading of the site's robots.txt. */
	const TRANSIENT = 'rankxai_robots_reading';

	/** How long a reading is used before the file is read again. */
	const TTL = 6 * HOUR_IN_SECONDS;

	/**
	 * The AI crawlers worth naming, by robots.txt token.
	 *
	 * Identical to the platform's list, which the probe asserts field for field.
	 * `registryId` joins a token to the crawler counts; null for a token no
	 * crawler sends as its user agent (Google-Extended, Applebot-Extended).
	 *
	 * @return array<int, array{token: string, assistant: string, purpose: string, consequence: string, registryId: string|null}>
	 */
	public static function crawlers() {
		return array(
			self::entry( 'OAI-SearchBot', 'ChatGPT', 'search', 'ChatGPT cannot include your pages in its search results.', 'oai-searchbot' ),
			self::entry( 'ChatGPT-User', 'ChatGPT', 'user_fetch', 'ChatGPT cannot open your pages when a user asks it to.', 'chatgpt-user' ),
			self::entry( 'GPTBot', 'ChatGPT', 'training', 'OpenAI cannot use your pages to learn what your business is.', 'gptbot' ),
			self::entry( 'Claude-SearchBot', 'Claude', 'search', 'Claude cannot include your pages in its search results.', 'claude-searchbot' ),
			self::entry( 'Claude-User', 'Claude', 'user_fetch', 'Claude cannot open your pages when a user asks it to.', 'claude-user' ),
			self::entry( 'ClaudeBot', 'Claude', 'training', 'Anthropic cannot use your pages to learn what your business is.', 'claudebot' ),
			self::entry( 'PerplexityBot', 'Perplexity', 'search', 'Perplexity cannot index your pages, so it cannot cite you.', 'perplexitybot' ),
			self::entry( 'Perplexity-User', 'Perplexity', 'user_fetch', 'Perplexity cannot open your pages when a user asks it to.', 'perplexity-user' ),
			self::entry( 'Google-Extended', 'Google Gemini / AI Overviews', 'training', 'Google cannot use your pages to ground Gemini or AI Overviews.', null ),
			self::entry( 'Applebot-Extended', 'Apple Intelligence', 'training', 'Apple cannot use your pages for its AI features.', null ),
			self::entry( 'meta-externalagent', 'Meta AI', 'training', 'Meta cannot use your pages to learn what your business is.', 'meta-externalagent' ),
			self::entry( 'Amazonbot', 'Amazon Alexa', 'search', 'Alexa cannot surface your pages in answers.', 'amazonbot' ),
			self::entry( 'Bytespider', 'TikTok / Doubao', 'training', 'ByteDance cannot use your pages for its AI features.', 'bytespider' ),
			self::entry( 'CCBot', 'Common Crawl', 'training', 'Common Crawl cannot archive your pages, which most open models learn from.', 'ccbot' ),
		);
	}

	/**
	 * One crawler entry.
	 *
	 * @param string      $token       User-agent token.
	 * @param string      $assistant   Assistant a customer recognises.
	 * @param string      $purpose     search, user_fetch or training.
	 * @param string      $consequence What a block costs.
	 * @param string|null $registry_id Crawler-count id.
	 * @return array{token: string, assistant: string, purpose: string, consequence: string, registryId: string|null}
	 */
	private static function entry( $token, $assistant, $purpose, $consequence, $registry_id ) {
		return array(
			'token'       => $token,
			'assistant'   => $assistant,
			'purpose'     => $purpose,
			'consequence' => $consequence,
			'registryId'  => $registry_id,
		);
	}

	// -----------------------------------------------------------------------
	// Parsing
	// -----------------------------------------------------------------------

	/**
	 * Split a robots.txt body into groups.
	 *
	 * Consecutive User-agent lines share one group; a rule line closes the run.
	 * One pass, every line consumed, so it always terminates.
	 *
	 * @param string $body File body.
	 * @return array{groups: array<int, array{agents: string[], rules: array<int, array{kind: string, pattern: string}>}>, ignoredDirectives: string[], unparsedLines: int}
	 */
	public static function parse( $body ) {
		$groups     = array();
		$ignored    = array();
		$unparsed   = 0;
		$current    = -1;
		$collecting = false;

		$body = (string) $body;
		if ( 0 === strpos( $body, "\xEF\xBB\xBF" ) ) {
			$body = substr( $body, 3 );
		}
		$lines = preg_split( '/\r\n|\r|\n/', $body );

		foreach ( (array) $lines as $raw ) {
			$hash = strpos( (string) $raw, '#' );
			$line = trim( false === $hash ? (string) $raw : substr( (string) $raw, 0, $hash ) );
			if ( '' === $line ) {
				continue;
			}
			$colon = strpos( $line, ':' );
			if ( false === $colon ) {
				++$unparsed;
				continue;
			}
			$field = strtolower( trim( substr( $line, 0, $colon ) ) );
			$value = trim( substr( $line, $colon + 1 ) );

			if ( 'user-agent' === $field ) {
				if ( $current < 0 || ! $collecting ) {
					$groups[]   = array(
						'agents' => array(),
						'rules'  => array(),
					);
					$current    = count( $groups ) - 1;
					$collecting = true;
				}
				if ( '' !== $value ) {
					$groups[ $current ]['agents'][] = strtolower( $value );
				}
				continue;
			}

			if ( 'allow' === $field || 'disallow' === $field ) {
				// A rule before any User-agent line is attributed to *, because a
				// stray Disallow at the top of a file is far more likely a real
				// (broken) block than noise.
				if ( $current < 0 ) {
					$groups[] = array(
						'agents' => array( '*' ),
						'rules'  => array(),
					);
					$current  = count( $groups ) - 1;
				}
				$collecting                    = false;
				$groups[ $current ]['rules'][] = array(
					'kind'    => $field,
					'pattern' => $value,
				);
				continue;
			}

			$ignored[] = $field;
		}

		return array(
			'groups'            => $groups,
			'ignoredDirectives' => $ignored,
			'unparsedLines'     => $unparsed,
		);
	}

	/**
	 * Does a pattern match a path? `*` is any run, a trailing `$` anchors the end,
	 * and everything else is literal. An empty pattern matches nothing.
	 *
	 * @param string $pattern Rule pattern.
	 * @param string $path    Path.
	 * @return bool
	 */
	public static function pattern_matches( $pattern, $path ) {
		$pattern = (string) $pattern;
		if ( '' === $pattern ) {
			return false;
		}
		$anchored = '$' === substr( $pattern, -1 );
		$body     = $anchored ? substr( $pattern, 0, -1 ) : $pattern;
		$regex    = str_replace( '\*', '.*', preg_quote( $body, '#' ) );
		$matched  = preg_match( '#^' . $regex . ( $anchored ? '$' : '' ) . '#s', (string) $path );
		// A pattern that cannot be evaluated does not block: it can under-report
		// a block, never invent one.
		return 1 === $matched;
	}

	/**
	 * The group governing an agent: an exact token beats `*`, and groups naming
	 * the same agent are merged.
	 *
	 * @param array  $parsed Parsed file.
	 * @param string $agent  Token.
	 * @return array{agents: string[], rules: array}|null
	 */
	public static function group_for_agent( $parsed, $agent ) {
		$token = strtolower( (string) $agent );
		foreach ( array( $token, '*' ) as $want ) {
			$rules = array();
			$found = false;
			foreach ( $parsed['groups'] as $group ) {
				if ( in_array( $want, $group['agents'], true ) ) {
					$found = true;
					$rules = array_merge( $rules, $group['rules'] );
				}
			}
			if ( $found ) {
				return array(
					'agents' => array( $want ),
					'rules'  => $rules,
				);
			}
		}
		return null;
	}

	/**
	 * May an agent fetch a path? Longest match wins; Allow wins a tie.
	 *
	 * @param array  $parsed Parsed file.
	 * @param string $agent  Token.
	 * @param string $path   Path.
	 * @return array{access: string, decidedBy: string|null, matchedRule: array{kind: string, pattern: string}|null}
	 */
	public static function access_for( $parsed, $agent, $path = '/' ) {
		$group = self::group_for_agent( $parsed, $agent );
		if ( null === $group ) {
			return array(
				'access'      => 'unaddressed',
				'decidedBy'   => null,
				'matchedRule' => null,
			);
		}
		$best     = null;
		$best_len = -1;
		foreach ( $group['rules'] as $rule ) {
			if ( ! self::pattern_matches( $rule['pattern'], $path ) ) {
				continue;
			}
			$len = strlen( $rule['pattern'] );
			if ( null === $best || $len > $best_len || ( $len === $best_len && 'allow' === $rule['kind'] ) ) {
				$best     = $rule;
				$best_len = $len;
			}
		}
		$decided = $group['agents'][0];
		if ( null !== $best && 'disallow' === $best['kind'] ) {
			return array(
				'access'      => 'blocked',
				'decidedBy'   => $decided,
				'matchedRule' => $best,
			);
		}
		return array(
			'access'      => 'allowed',
			'decidedBy'   => $decided,
			'matchedRule' => null,
		);
	}

	/**
	 * Every AI crawler's verdict for one path.
	 *
	 * @param array  $parsed Parsed file.
	 * @param string $path   Path.
	 * @return array<int, array{crawler: array, access: string, decidedBy: string|null, matchedRule: array|null}>
	 */
	public static function assess( $parsed, $path = '/' ) {
		$out = array();
		foreach ( self::crawlers() as $crawler ) {
			$decision = self::access_for( $parsed, $crawler['token'], $path );
			$out[]    = array(
				'crawler'     => $crawler,
				'access'      => $decision['access'],
				'decidedBy'   => $decision['decidedBy'],
				'matchedRule' => $decision['matchedRule'],
			);
		}
		return $out;
	}

	/**
	 * Does the file block every agent from the whole site?
	 *
	 * @param array $parsed Parsed file.
	 * @return bool
	 */
	public static function has_blanket_disallow( $parsed ) {
		$agent = 'a-crawler-no-file-will-name';
		$group = self::group_for_agent( $parsed, $agent );
		if ( null === $group || '*' !== $group['agents'][0] ) {
			return false;
		}
		return 'blocked' === self::access_for( $parsed, $agent, '/' )['access'];
	}

	// -----------------------------------------------------------------------
	// Reading the site's file
	// -----------------------------------------------------------------------

	/**
	 * The site's robots.txt as it is served, read at most every few hours.
	 *
	 * One request to this site for a file that answers 200 on almost every
	 * site, so it may run from an administrator's request; a stale reading is
	 * refreshed here and by the daily check.
	 *
	 * @param bool $fresh Ignore the cached reading.
	 * @return array{state: string, httpStatus: int, body: string, cloudflare: bool, outsideWordPress: bool, url: string, readAt: string, source: string}
	 */
	public static function reading( $fresh = false ) {
		if ( ! $fresh ) {
			$cached = get_transient( self::TRANSIENT );
			if ( is_array( $cached ) && isset( $cached['state'] ) ) {
				return $cached;
			}
		}

		$home_path = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		$url       = RankXAI_Loopback::root_url( '/robots.txt' );
		$response  = RankXAI_Loopback::request( add_query_arg( 'rankxai_check', wp_generate_password( 8, false, false ), $url ) );

		$state = 'unreachable';
		if ( 200 === $response['status'] ) {
			$state = 'ok';
		} elseif ( 404 === $response['status'] || 410 === $response['status'] ) {
			$state = 'absent';
		}

		$reading = array(
			'state'            => $state,
			'httpStatus'       => $response['status'],
			'body'             => 'ok' === $state ? substr( $response['body'], 0, 500 * KB_IN_BYTES ) : '',
			'cloudflare'       => RankXAI_Loopback::via_cloudflare( $response['headers'] ),
			'outsideWordPress' => '' !== trim( $home_path, '/' ),
			'url'              => $url,
			'readAt'           => gmdate( 'c' ),
			'source'           => self::source(),
		);
		set_transient( self::TRANSIENT, $reading, self::TTL );
		return $reading;
	}

	/**
	 * Where this site's robots rules are edited.
	 *
	 * A real file wins over everything WordPress would serve; otherwise an SEO
	 * plugin with its own robots.txt editor; otherwise WordPress's own file,
	 * which has no editor.
	 *
	 * @return string 'file', 'yoast', 'rankmath', 'aioseo', 'seopress' or 'core'.
	 */
	public static function source() {
		if ( file_exists( ABSPATH . 'robots.txt' ) ) {
			return 'file';
		}
		foreach ( array(
			'rankmath' => 'RANK_MATH_VERSION',
			'aioseo'   => 'AIOSEO_VERSION',
			'yoast'    => 'WPSEO_VERSION',
			'seopress' => 'SEOPRESS_PRO_VERSION',
		) as $slug => $constant ) {
			if ( defined( $constant ) ) {
				return $slug;
			}
		}
		return 'core';
	}

	/**
	 * One sentence saying where to change the rules.
	 *
	 * @param string $source A value from source().
	 * @return string
	 */
	public static function where_to_edit( $source ) {
		$where = array(
			'file'     => __( 'A robots.txt file in your site\'s main folder answers this address. Edit that file with your host\'s file manager or over FTP.', 'rankxai' ),
			'rankmath' => __( 'Rank Math serves this file. Edit it at Rank Math → General Settings → Edit robots.txt.', 'rankxai' ),
			'aioseo'   => __( 'All in One SEO serves this file. Edit it at All in One SEO → Tools → Robots.txt Editor.', 'rankxai' ),
			'yoast'    => __( 'Edit it at Yoast SEO → Tools → File editor, which creates a robots.txt file for you.', 'rankxai' ),
			'seopress' => __( 'SEOPress PRO can serve this file. Edit it at SEO → PRO → robots.txt.', 'rankxai' ),
			'core'     => __( 'WordPress generates this file itself and has no screen to edit it. Upload a robots.txt file to your site\'s main folder to replace it.', 'rankxai' ),
		);
		return isset( $where[ $source ] ) ? $where[ $source ] : $where['core'];
	}
}
