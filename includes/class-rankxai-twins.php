<?php
/**
 * Markdown twins: a machine-readable copy of every eligible page.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Serving, routing and settings for markdown twins.
 */
class RankXAI_Twins {

	/**
	 * Settings option. Autoloaded, since it is read on every front-end request.
	 */
	const OPTION_SETTINGS = 'rankxai_twins';

	/**
	 * The site context block. Not autoloaded: read only when a twin is rendered.
	 */
	const OPTION_CONTEXT = 'rankxai_twin_context';

	/** Per-post opt-out. */
	const META_DISABLED = '_rankxai_twin_disabled';

	/** The twin sitemap's path, relative to the site root. */
	const SITEMAP_PATH = 'sitemap-md.xml';

	/**
	 * The largest context block the site will store. It is appended to every twin.
	 */
	const MAX_CONTEXT_BYTES = 4096;

	/** Most twins any one sitemap will list. */
	const MAX_SITEMAP_ENTRIES = 2000;

	/**
	 * What this request is for: '', 'twin', 'twin_hint' or 'sitemap'.
	 *
	 * @var string
	 */
	private static $mode = '';

	/**
	 * Register hooks.
	 */
	public static function init() {
		// Before WordPress parses the request.
		add_action( 'plugins_loaded', array( __CLASS__, 'intercept' ), 0 );
		// Ahead of `redirect_canonical` and the template loader.
		add_action( 'template_redirect', array( __CLASS__, 'handle_request' ), 0 );
		// Not `send_headers`: the queried post is not known there yet.
		add_action( 'template_redirect', array( __CLASS__, 'advertise' ), 1 );
		add_action( 'wp_head', array( __CLASS__, 'head_link' ), 2 );
	}

	// -----------------------------------------------------------------------
	// Settings
	// -----------------------------------------------------------------------

	/**
	 * The stored settings, validated so a malformed value means off.
	 *
	 * @return array{enabled: bool, post_types: string[]}
	 */
	public static function settings() {
		$stored = get_option( self::OPTION_SETTINGS, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}

		$types = isset( $stored['post_types'] ) && is_array( $stored['post_types'] ) ? $stored['post_types'] : self::default_post_types();
		$types = array_values(
			array_filter(
				array_map( 'strval', $types ),
				'is_post_type_viewable'
			)
		);
		if ( ! $types ) {
			$types = self::default_post_types();
		}

		return array(
			'enabled'    => isset( $stored['enabled'] ) && true === $stored['enabled'],
			'post_types' => $types,
		);
	}

	/**
	 * The post types that get a twin when nothing has been chosen.
	 *
	 * @return string[]
	 */
	public static function default_post_types() {
		$types = array();
		// On a store, products are what shoppers ask AI assistants about.
		foreach ( array( 'post', 'page', 'product' ) as $type ) {
			if ( post_type_exists( $type ) && is_post_type_viewable( $type ) ) {
				$types[] = $type;
			}
		}
		return $types;
	}

	/**
	 * Store settings.
	 *
	 * @param bool          $enabled    Whether twins are served.
	 * @param string[]|null $post_types Post types, or null to keep what is stored.
	 * @return void
	 */
	public static function save_settings( $enabled, $post_types ) {
		$current = self::settings();
		$types   = null === $post_types ? $current['post_types'] : array_values(
			array_filter( array_map( 'strval', (array) $post_types ), 'is_post_type_viewable' )
		);
		if ( ! $types ) {
			$types = self::default_post_types();
		}

		update_option(
			self::OPTION_SETTINGS,
			array(
				'enabled'    => (bool) $enabled,
				'post_types' => $types,
			),
			true
		);
	}

	/**
	 * The stored site context block, and when it was stored.
	 *
	 * @return array{content: string, updated: string}
	 */
	public static function context() {
		$stored = get_option( self::OPTION_CONTEXT, array() );
		if ( ! is_array( $stored ) || ! isset( $stored['content'] ) || ! is_string( $stored['content'] ) ) {
			return array(
				'content' => '',
				'updated' => '',
			);
		}
		return array(
			'content' => $stored['content'],
			'updated' => isset( $stored['updated'] ) && is_string( $stored['updated'] ) ? $stored['updated'] : '',
		);
	}

	/**
	 * Store the site context block.
	 *
	 * @param string $content Block, already bounded by the caller.
	 * @return bool False when it is over the size limit.
	 */
	public static function save_context( $content ) {
		$content = rankxai_sanitize_plain_text( $content );
		if ( strlen( $content ) > self::MAX_CONTEXT_BYTES ) {
			return false;
		}
		if ( '' === trim( $content ) ) {
			delete_option( self::OPTION_CONTEXT );
			return true;
		}
		update_option(
			self::OPTION_CONTEXT,
			array(
				'content' => $content,
				'updated' => gmdate( 'c' ),
			),
			false
		);
		return true;
	}

	/**
	 * Is the feature switched on?
	 *
	 * @return bool
	 */
	public static function is_enabled() {
		$settings = self::settings();

		/**
		 * Filters whether markdown twins are served at all.
		 *
		 * For turning twins off in code, for example on a staging site.
		 *
		 * @param bool $enabled Stored state.
		 */
		return (bool) apply_filters( 'rankxai_twins_enabled', $settings['enabled'] );
	}

	// -----------------------------------------------------------------------
	// Routing
	// -----------------------------------------------------------------------

	/**
	 * Rewrite `REQUEST_URI` so WordPress resolves the underlying page.
	 *
	 * @return void
	 */
	public static function intercept() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Request path only, no form.
		$raw = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
		if ( '' === $raw ) {
			return;
		}

		// When off, leave the request untouched.
		if ( ! self::is_enabled() ) {
			return;
		}

		// This rewrites `REQUEST_URI`, so keep it to GET and HEAD on public paths.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Request method only.
		$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) : 'GET';
		if ( 'GET' !== $method && 'HEAD' !== $method ) {
			return;
		}

		$path  = (string) wp_parse_url( $raw, PHP_URL_PATH );
		$query = (string) wp_parse_url( $raw, PHP_URL_QUERY );

		foreach ( array( '/wp-admin/', '/wp-json/', '/wp-includes/', '/wp-content/', '/wp-login.php' ) as $reserved ) {
			if ( false !== strpos( $path, $reserved ) ) {
				return;
			}
		}

		// Leave root documents such as `/agents.md` to RankXAI_Documents.
		if ( null !== RankXAI_Documents::slug_for_request( $raw ) ) {
			return;
		}

		$trimmed = self::strip_home_path( trim( $path, '/' ) );

		if ( self::SITEMAP_PATH === $trimmed ) {
			self::$mode = 'sitemap';
			self::rewrite( '/', $query );
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- A format hint on a public GET.
		$format = isset( $_GET['format'] ) ? strtolower( sanitize_text_field( wp_unslash( $_GET['format'] ) ) ) : '';
		if ( 'md' === $format ) {
			// A hint only: nothing is rewritten, and an ineligible page stays HTML.
			self::$mode = 'twin_hint';
			return;
		}

		if ( '.md' !== strtolower( substr( $path, -3 ) ) ) {
			return;
		}

		$base = substr( $path, 0, -3 );
		if ( '/index' === substr( $base, -6 ) ) {
			// `/x/index.md` addresses `/x/`; `/index.md` addresses the front page.
			$base = substr( $base, 0, -5 );
		}
		if ( '' === $base ) {
			$base = '/';
		}

		self::$mode = 'twin';
		self::rewrite( $base, $query );
	}

	/**
	 * Remove the site's own subdirectory, if any, from a request path.
	 *
	 * @param string $trimmed Path with leading and trailing slashes removed.
	 * @return string
	 */
	private static function strip_home_path( $trimmed ) {
		$home = trim( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ), '/' );
		if ( '' !== $home && 0 === strpos( $trimmed, $home . '/' ) ) {
			return substr( $trimmed, strlen( $home ) + 1 );
		}
		return $trimmed;
	}

	/**
	 * Replace `REQUEST_URI` before `WP::parse_request()` reads it.
	 *
	 * The trailing slash follows the permalink structure, so nothing is redirected.
	 *
	 * @param string $path  New path.
	 * @param string $query Query string, without the `?`.
	 * @return void
	 */
	private static function rewrite( $path, $query ) {
		if ( ! isset( $_SERVER['RANKXAI_REQUEST_URI'] ) && isset( $_SERVER['REQUEST_URI'] ) ) {
			// Keep the original URL for anything running later, such as a cache plugin.
			// phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- Verbatim copy, not used as input here.
			$_SERVER['RANKXAI_REQUEST_URI'] = $_SERVER['REQUEST_URI'];
		}

		// Not `user_trailingslashit()`: `$wp_rewrite` does not exist yet at
		// `plugins_loaded`. Same check as `WP_Rewrite::init()`.
		$structure = (string) get_option( 'permalink_structure' );
		if ( '/' !== $path && '' !== $structure && '/' === substr( $structure, -1 ) ) {
			$path = trailingslashit( $path );
		}
		$_SERVER['REQUEST_URI'] = '' !== $query ? $path . '?' . $query : $path;
	}

	/**
	 * Serve a twin, the sitemap, or a negotiated markdown body.
	 *
	 * @return void
	 */
	public static function handle_request() {
		if ( 'sitemap' === self::$mode ) {
			if ( self::is_enabled() ) {
				self::render_sitemap();
			} else {
				self::send_404();
			}
			return;
		}

		if ( 'twin' === self::$mode || 'twin_hint' === self::$mode ) {
			$post     = is_singular() ? get_queried_object() : null;
			$servable = self::is_enabled() && $post instanceof WP_Post && self::is_eligible( $post );
			if ( $servable ) {
				// `?format=md` is a separate address, so it gets `noindex` like `.md`.
				self::serve( $post, true );
				return;
			}
			if ( 'twin' === self::$mode ) {
				// A `.md` URL with nothing eligible behind it is a 404.
				self::send_404();
			}
			return;
		}

		self::maybe_negotiate();
	}

	/**
	 * Serve markdown at the canonical URL when the client asked for it.
	 *
	 * @return void
	 */
	private static function maybe_negotiate() {
		if ( is_admin() || is_feed() || is_embed() || ! is_singular() ) {
			return;
		}
		if ( ! self::is_enabled() || ! self::client_prefers_markdown() ) {
			return;
		}
		$post = get_queried_object();
		if ( ! $post instanceof WP_Post || ! self::is_eligible( $post ) ) {
			return;
		}
		self::serve( $post, false );
	}

	/**
	 * Did the client ask for markdown, at least as strongly as for HTML?
	 *
	 * Browsers never ask for `text/markdown`, so visitors always get HTML.
	 *
	 * @return bool
	 */
	public static function client_prefers_markdown() {
		if ( empty( $_SERVER['HTTP_ACCEPT'] ) ) {
			return false;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Request header only.
		$accept = strtolower( sanitize_text_field( wp_unslash( $_SERVER['HTTP_ACCEPT'] ) ) );

		$markdown = -1.0;
		$html     = -1.0;

		foreach ( explode( ',', $accept ) as $chunk ) {
			$parts = explode( ';', $chunk );
			$type  = trim( array_shift( $parts ) );
			if ( '' === $type ) {
				continue;
			}
			$quality = 1.0;
			foreach ( $parts as $param ) {
				$param = trim( $param );
				if ( 0 === strpos( $param, 'q=' ) ) {
					$quality = (float) substr( $param, 2 );
				}
			}
			if ( 'text/markdown' === $type || 'text/x-markdown' === $type ) {
				$markdown = max( $markdown, $quality );
			} elseif ( 'text/html' === $type || 'application/xhtml+xml' === $type ) {
				$html = max( $html, $quality );
			}
		}

		if ( $markdown <= 0 ) {
			return false;
		}
		return $markdown >= $html;
	}

	/**
	 * Advertise the twin on an ordinary HTML response.
	 *
	 * @return void
	 */
	public static function advertise() {
		if ( headers_sent() || is_admin() || is_feed() || is_embed() || ! is_singular() ) {
			return;
		}
		if ( ! self::is_enabled() ) {
			return;
		}
		$post = get_queried_object();
		if ( ! $post instanceof WP_Post || ! self::is_eligible( $post ) ) {
			return;
		}

		// Always sent, so caches key on Accept for the negotiated response.
		header( 'Vary: Accept', false );

		$twin = self::twin_url( $post );
		if ( '' === $twin ) {
			return;
		}
		header( 'Link: <' . esc_url_raw( $twin ) . '>; rel="alternate"; type="text/markdown"', false );
	}

	/**
	 * The same advertisement as a `<link>` in the document head.
	 *
	 * @return void
	 */
	public static function head_link() {
		if ( is_admin() || ! is_singular() || ! self::is_enabled() ) {
			return;
		}
		$post = get_queried_object();
		if ( ! $post instanceof WP_Post || ! self::is_eligible( $post ) ) {
			return;
		}
		$twin = self::twin_url( $post );
		if ( '' === $twin ) {
			return;
		}
		printf(
			'<link rel="alternate" type="text/markdown" href="%s" />' . "\n",
			esc_url( $twin )
		);
	}

	// -----------------------------------------------------------------------
	// Rendering
	// -----------------------------------------------------------------------

	/**
	 * Emit the markdown body and exit.
	 *
	 * @param WP_Post $post      Post to render.
	 * @param bool    $is_md_url Whether this is a copy's own address (`.md` or `?format=md`).
	 * @return void
	 */
	private static function serve( $post, $is_md_url ) {
		// Without our headers the copy would go out as HTML, so leave the normal page to WordPress.
		if ( headers_sent() ) {
			return;
		}
		$markdown = self::markdown_for( $post );

		self::prevent_page_cache();

		if ( ! headers_sent() ) {
			// Drop any X-Robots-Tag another plugin queued; ours is the only one.
			header_remove( 'X-Robots-Tag' );

			status_header( 200 );
			header( 'Content-Type: text/markdown; charset=utf-8', true );
			header( 'Vary: Accept', true );
			header( 'X-Content-Type-Options: nosniff', true );
			header( 'X-RankXAI-Source: markdown-twin', true );

			if ( $is_md_url ) {
				// `noindex` stops indexing, not fetching. No canonical, by design.
				header( 'X-Robots-Tag: noindex, follow', true );
				header( 'Link: <' . esc_url_raw( get_permalink( $post ) ) . '>; rel="alternate"; type="text/html"', true );
			}
		}

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Markdown body; escaping would corrupt it.
		echo $markdown;
		exit;
	}

	/**
	 * Keep a markdown response out of the site's full-page cache.
	 *
	 * @return void
	 */
	private static function prevent_page_cache() {
		/**
		 * Filters whether markdown responses bypass the page cache.
		 *
		 * @param bool $bypass Default true.
		 */
		if ( ! apply_filters( 'rankxai_twins_bypass_page_cache', true ) ) {
			return;
		}
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Standard constant read by page caches.
			define( 'DONOTCACHEPAGE', true );
		}
		if ( ! headers_sent() ) {
			header( 'Cache-Control: private, no-store', true );
		}
	}

	/**
	 * Build (and cache) the twin for a post.
	 *
	 * Editing the post or the context block changes the cache key.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	public static function markdown_for( $post ) {
		$context = self::context();
		// Price and stock change without a post edit, so product facts are in the key.
		$key = 'rankxai_md_' . $post->ID . '_' . md5(
			(string) $post->post_modified_gmt . '|' . get_permalink( $post ) . '|' . $context['updated'] . '|' . RANKXAI_VERSION . '|' . wp_json_encode( RankXAI_Woo::product_facts( $post ) )
		);

		/**
		 * Filters how long a rendered twin stays cached. Return 0 to disable.
		 *
		 * @param int $ttl Seconds.
		 */
		$ttl = (int) apply_filters( 'rankxai_twin_cache_ttl', DAY_IN_SECONDS );

		if ( $ttl > 0 ) {
			$cached = get_transient( $key );
			if ( is_string( $cached ) && '' !== $cached ) {
				return $cached;
			}
		}

		$markdown = RankXAI_Markdown::document( $post, self::description_for( $post ), $context['content'] );

		if ( $ttl > 0 ) {
			set_transient( $key, $markdown, $ttl );
		}

		return $markdown;
	}

	/**
	 * The best available description of a post.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	private static function description_for( $post ) {
		$own = RankXAI_SEO::get_own( $post->ID );
		if ( isset( $own['description'] ) && '' !== trim( (string) $own['description'] ) ) {
			return RankXAI_Markdown::plain( $own['description'] );
		}

		foreach ( RankXAI_SEO_Registry::storage() as $keys ) {
			if ( ! isset( $keys['description'] ) ) {
				continue;
			}
			$value = get_post_meta( $post->ID, $keys['description'], true );
			if ( ! is_string( $value ) || '' === trim( $value ) ) {
				continue;
			}
			// Skip unresolved template variables such as Yoast's `%%excerpt%%`.
			if ( false !== strpos( $value, '%%' ) || false !== strpos( $value, '%sep%' ) ) {
				continue;
			}
			return RankXAI_Markdown::plain( $value );
		}

		return RankXAI_Markdown::plain( get_the_excerpt( $post ) );
	}

	/**
	 * Turn the current request into an ordinary WordPress 404.
	 *
	 * @return void
	 */
	private static function send_404() {
		global $wp_query;
		if ( $wp_query instanceof WP_Query ) {
			$wp_query->set_404();
		}
		add_filter( 'redirect_canonical', '__return_false', 99 );
		status_header( 404 );
		nocache_headers();
	}

	// -----------------------------------------------------------------------
	// Eligibility
	// -----------------------------------------------------------------------

	/**
	 * Is this post served a twin right now (feature on and post qualifies)?
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	public static function is_eligible( $post ) {
		return self::is_enabled() && self::qualifies( $post );
	}

	/**
	 * Would this post get a twin if the feature were on?
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	public static function qualifies( $post ) {
		if ( ! $post instanceof WP_Post ) {
			return false;
		}
		if ( 'publish' !== $post->post_status || '' !== (string) $post->post_password ) {
			return false;
		}

		$settings = self::settings();
		if ( ! in_array( $post->post_type, $settings['post_types'], true ) ) {
			return false;
		}

		// "Discourage search engines" is set.
		if ( '0' === (string) get_option( 'blog_public', '1' ) ) {
			return false;
		}

		if ( get_post_meta( $post->ID, self::META_DISABLED, true ) ) {
			return false;
		}

		// Hidden by WooCommerce's "Coming soon".
		if ( RankXAI_Woo::hides( $post ) ) {
			return false;
		}

		// A noindex post gets no twin at all, not a noindex one.
		if ( self::is_noindexed( $post->ID ) ) {
			return false;
		}

		/**
		 * Filters whether one post gets a markdown twin.
		 *
		 * @param bool    $eligible Current decision.
		 * @param WP_Post $post     Post.
		 */
		return (bool) apply_filters( 'rankxai_twin_eligible', true, $post );
	}

	/**
	 * Has an SEO plugin, or WooCommerce, marked this post `noindex`?
	 *
	 * The meta keys come from `RankXAI_SEO_Registry`.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function is_noindexed( $post_id ) {
		// Cart, checkout and account: WooCommerce marks them noindex itself.
		if ( RankXAI_Woo::noindexes( $post_id ) ) {
			return true;
		}
		foreach ( RankXAI_SEO_Registry::noindex_meta() as $rule ) {
			$value = get_post_meta( $post_id, $rule['key'], true );
			if ( 'array_contains' === $rule['match'] ) {
				if ( is_array( $value ) && in_array( 'noindex', $value, true ) ) {
					return true;
				}
				continue;
			}
			if ( is_scalar( $value ) && (string) $value === $rule['value'] ) {
				return true;
			}
		}
		return self::noindexed_by_default( $post_id );
	}

	/**
	 * Noindex inherited from an SEO plugin's per-type default (SureRank, AIOSEO).
	 *
	 * @param int $post_id Post id.
	 * @return bool
	 */
	private static function noindexed_by_default( $post_id ) {
		$type = get_post_type( $post_id );
		if ( ! $type ) {
			return false;
		}
		if ( defined( 'SURERANK_VERSION' ) ) {
			$own = get_post_meta( $post_id, 'surerank_settings_post_no_index', true );
			if ( '' === $own || null === $own ) {
				$global = get_option( 'surerank_settings', array() );
				if ( is_array( $global ) && isset( $global['no_index'] ) && is_array( $global['no_index'] ) && in_array( $type, $global['no_index'], true ) ) {
					return true;
				}
			}
		}
		if ( defined( 'AIOSEO_VERSION' ) && function_exists( 'aioseo' ) ) {
			try {
				$meta = aioseo()->meta->metaData->getMetaData( get_post( $post_id ) );
				if ( ! empty( $meta ) && empty( $meta->robots_default ) ) {
					return ! empty( $meta->robots_noindex );
				}
				// Read the type's setting from the raw option; AIOSEO's options
				// object is not reliable across versions.
				$stored = json_decode( (string) get_option( 'aioseo_options_dynamic', '' ), true );
				$robots = isset( $stored['searchAppearance']['postTypes'][ $type ]['advanced']['robotsMeta'] ) ? $stored['searchAppearance']['postTypes'][ $type ]['advanced']['robotsMeta'] : null;
				if ( is_array( $robots ) ) {
					return empty( $robots['default'] ) && ! empty( $robots['noindex'] );
				}
			} catch ( \Throwable $e ) {
				// An unfamiliar AIOSEO version: rely on post meta alone.
				return false;
			}
		}
		return false;
	}

	// -----------------------------------------------------------------------
	// URLs and the sitemap
	// -----------------------------------------------------------------------

	/**
	 * The twin URL for a post, or '' when none can be formed.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	public static function twin_url( $post ) {
		if ( ! $post instanceof WP_Post ) {
			return '';
		}
		$permalink = get_permalink( $post );
		if ( ! is_string( $permalink ) || '' === $permalink ) {
			return '';
		}

		// Plain permalinks use query strings, so the format hint is the twin URL.
		if ( '' === (string) get_option( 'permalink_structure' ) || false !== strpos( $permalink, '?' ) ) {
			return add_query_arg( 'format', 'md', $permalink );
		}
		if ( false !== strpos( $permalink, '#' ) ) {
			return '';
		}

		$base = untrailingslashit( $permalink );
		if ( '' === $base || untrailingslashit( home_url( '/' ) ) === $base ) {
			// The front page gets `/index.md`, but only when it is a static page.
			return 'page' === (string) get_option( 'show_on_front' ) ? home_url( '/index.md' ) : '';
		}

		$suffixed = $base . '.md';

		// A page slugged `agents` would give `/agents.md`, a root document's
		// address, so use the `?format=md` form instead.
		$path = (string) wp_parse_url( $suffixed, PHP_URL_PATH );
		if ( null !== RankXAI_Documents::slug_for_request( $path ) ) {
			return add_query_arg( 'format', 'md', $permalink );
		}

		return $suffixed;
	}

	/** The twin sitemap's URL.
	 *
	 * @return string
	 */
	public static function sitemap_url() {
		return home_url( '/' . self::SITEMAP_PATH );
	}

	/**
	 * Every eligible post with a usable twin URL, newest first.
	 *
	 * @param int $limit Maximum rows.
	 * @return WP_Post[]
	 */
	public static function eligible_posts( $limit ) {
		$settings = self::settings();
		if ( ! $settings['post_types'] ) {
			return array();
		}

		$query = new WP_Query(
			array(
				'post_type'              => $settings['post_types'],
				'post_status'            => 'publish',
				'posts_per_page'         => max( 1, min( (int) $limit, 50000 ) ),
				'has_password'           => false,
				'orderby'                => 'modified',
				'order'                  => 'DESC',
				'ignore_sticky_posts'    => true,
				'no_found_rows'          => true,
				'update_post_term_cache' => false,
			)
		);

		$out = array();
		foreach ( $query->posts as $post ) {
			// `qualifies()`, not `is_eligible()`: this list must work while twins are off.
			if ( self::qualifies( $post ) && '' !== self::twin_url( $post ) ) {
				$out[] = $post;
			}
		}
		return $out;
	}

	/**
	 * Render the twin sitemap and exit.
	 *
	 * @return void
	 */
	private static function render_sitemap() {
		$posts = self::eligible_posts( self::MAX_SITEMAP_ENTRIES );

		$xml  = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
		$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
		foreach ( $posts as $post ) {
			$modified = get_post_modified_time( 'c', true, $post );
			$xml     .= "\t<url>\n\t\t<loc>" . esc_url( self::twin_url( $post ) ) . "</loc>\n";
			if ( is_string( $modified ) && '' !== $modified ) {
				$xml .= "\t\t<lastmod>" . esc_html( $modified ) . "</lastmod>\n";
			}
			$xml .= "\t</url>\n";
		}
		$xml .= '</urlset>' . "\n";

		if ( headers_sent() ) {
			return;
		}
		self::prevent_page_cache();

		if ( ! headers_sent() ) {
			header_remove( 'X-Robots-Tag' );
			status_header( 200 );
			header( 'Content-Type: application/xml; charset=utf-8', true );
			header( 'X-Content-Type-Options: nosniff', true );
			header( 'X-RankXAI-Source: markdown-twin-sitemap', true );
			header( 'X-Robots-Tag: noindex, follow', true );
		}

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Each value escaped above.
		echo $xml;
		exit;
	}

	/**
	 * Size figures for the largest eligible page.
	 *
	 * @param WP_Post[] $posts Eligible posts.
	 * @return array<string, mixed>|null
	 */
	private static function sample_from( $posts ) {
		$best      = null;
		$best_size = 0;
		foreach ( $posts as $post ) {
			$size = strlen( (string) $post->post_content );
			if ( $size > $best_size ) {
				$best      = $post;
				$best_size = $size;
			}
		}
		if ( null === $best ) {
			return null;
		}

		$source = RankXAI_Markdown::rendered_content( $best );
		if ( '' === trim( $source ) ) {
			return null;
		}
		$twin = self::markdown_for( $best );

		return array(
			'url'         => self::twin_url( $best ),
			'htmlUrl'     => get_permalink( $best ),
			'title'       => RankXAI_Markdown::plain( get_the_title( $best ) ),
			'sourceBytes' => strlen( $source ),
			'twinBytes'   => strlen( $twin ),
		);
	}

	/**
	 * A state summary for the `/twins` REST read.
	 *
	 * `sample` is null when there is no eligible page to measure.
	 *
	 * @return array<string, mixed>
	 */
	public static function state() {
		$settings = self::settings();
		$context  = self::context();
		$posts    = self::eligible_posts( self::MAX_SITEMAP_ENTRIES );

		$sample = self::sample_from( $posts );

		return array(
			'enabled'         => $settings['enabled'],
			'postTypes'       => $settings['post_types'],
			'availableTypes'  => self::default_post_types(),
			'eligibleCount'   => count( $posts ),
			'sitemapUrl'      => self::sitemap_url(),
			'contextBytes'    => strlen( $context['content'] ),
			'contextUpdated'  => $context['updated'],
			'maxContextBytes' => self::MAX_CONTEXT_BYTES,
			'sample'          => $sample,
		);
	}
}
