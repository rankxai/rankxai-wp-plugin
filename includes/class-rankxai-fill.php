<?php
/**
 * Switches for filling SEO features the site does not output.
 *
 * Nothing is printed unless the site owner allows it in Settings. RankX AI then
 * switches on only what nothing else prints. Any known SEO plugin being active
 * stops every fill at once.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Feature switches for filling SEO gaps.
 */
class RankXAI_Fill {

	/**
	 * `{features: {feature: bool}, updated: ISO date}`.
	 */
	const OPTION = 'rankxai_fill';

	/**
	 * Set when the sitemap switch changes, cleared once rewrite rules are flushed.
	 */
	const OPTION_FLUSH = 'rankxai_fill_flush';

	/**
	 * The site owner's switch, set only from the Settings page. Off by default.
	 */
	const OPTION_ALLOWED = 'rankxai_fill_allowed';

	/**
	 * Every feature this plugin can fill.
	 *
	 * @return string[]
	 */
	public static function features() {
		return array( 'meta_description', 'open_graph', 'twitter_card', 'sitemap', 'breadcrumbs' );
	}

	/**
	 * The stored switches, every feature present.
	 *
	 * @return array<string, bool>
	 */
	public static function switches() {
		$stored = get_option( self::OPTION );
		$stored = is_array( $stored ) && isset( $stored['features'] ) && is_array( $stored['features'] ) ? $stored['features'] : array();
		$out    = array();
		foreach ( self::features() as $feature ) {
			$out[ $feature ] = ! empty( $stored[ $feature ] );
		}
		return $out;
	}

	/**
	 * Whether the site owner lets RankX AI add missing SEO tags.
	 *
	 * @return bool
	 */
	public static function allowed() {
		return (bool) get_option( self::OPTION_ALLOWED );
	}

	/**
	 * Save the site owner's choice. Turning it off also switches every fill off.
	 *
	 * @param bool $allowed Allowed.
	 * @return void
	 */
	public static function set_allowed( $allowed ) {
		update_option( self::OPTION_ALLOWED, $allowed ? 1 : 0, true );
		if ( ! $allowed && in_array( true, self::switches(), true ) ) {
			self::save( array() );
		}
	}

	/**
	 * Replace the switches. Unknown names are ignored by the caller's check.
	 *
	 * @param array<string, bool> $features Feature => on.
	 * @return void
	 */
	public static function save( $features ) {
		$clean = array();
		foreach ( self::features() as $feature ) {
			$clean[ $feature ] = ! empty( $features[ $feature ] );
		}
		// Core adds its sitemap rewrite rules only when sitemaps are enabled, so a
		// change needs a flush on the next request, once `init` sees the new value.
		if ( self::switches()['sitemap'] !== $clean['sitemap'] ) {
			update_option( self::OPTION_FLUSH, 1, true );
		}
		// Autoloaded: read on every request.
		update_option(
			self::OPTION,
			array(
				'features' => $clean,
				'updated'  => gmdate( 'c' ),
			),
			true
		);
	}

	/**
	 * Active SEO plugins that stop every fill.
	 *
	 * A gap on such a site is fixed in that plugin, never by printing a second copy.
	 *
	 * @return string[]
	 */
	public static function blocked_by() {
		return array_values( array_unique( array_merge( RankXAI_Schema_Providers::active(), RankXAI_Detect::active_seo_plugins() ) ) );
	}

	/**
	 * May this feature print on this request?
	 *
	 * @param string $feature Feature name.
	 * @return bool
	 */
	public static function on( $feature ) {
		$switches = self::switches();
		if ( empty( $switches[ $feature ] ) || ! self::allowed() ) {
			return false;
		}
		if ( self::blocked_by() ) {
			return false;
		}
		/**
		 * Filters whether RankX AI fills this SEO feature.
		 *
		 * Return false to stop it, for example from an SEO plugin we do not detect.
		 *
		 * @param bool   $on      True when allowed, switched on and nothing blocks it.
		 * @param string $feature meta_description | open_graph | twitter_card | sitemap | breadcrumbs.
		 */
		return (bool) apply_filters( 'rankxai_fill_' . $feature, true, $feature );
	}

	/**
	 * Hook the fills that are not printed by the head class.
	 */
	public static function init() {
		// Late, so core's sitemap is turned back on only when the site has none.
		add_filter( 'wp_sitemaps_enabled', array( __CLASS__, 'filter_sitemaps' ), 999 );
		add_action( 'init', array( __CLASS__, 'maybe_flush' ), 999 );
	}

	/**
	 * Flush rewrite rules once after the sitemap switch changed.
	 */
	public static function maybe_flush() {
		if ( get_option( self::OPTION_FLUSH ) ) {
			// Set to 0 rather than deleted, so the next request finds it autoloaded.
			update_option( self::OPTION_FLUSH, 0, true );
			flush_rewrite_rules( false );
		}
	}

	/**
	 * Turn core sitemaps on when the sitemap fill is on.
	 *
	 * @param bool $enabled Incoming.
	 * @return bool
	 */
	public static function filter_sitemaps( $enabled ) {
		return self::on( 'sitemap' ) ? true : $enabled;
	}

	/**
	 * A BreadcrumbList for the current singular view, or null.
	 *
	 * Home, then the page's parents or the post's first category, then the page.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function breadcrumb_node() {
		if ( ! self::on( 'breadcrumbs' ) || ! is_singular() || is_front_page() ) {
			return null;
		}
		$post = get_queried_object();
		if ( ! $post instanceof WP_Post ) {
			return null;
		}
		$trail = array(
			array(
				'name' => wp_strip_all_tags( get_bloginfo( 'name' ) ),
				'url'  => home_url( '/' ),
			),
		);
		if ( is_post_type_hierarchical( $post->post_type ) ) {
			foreach ( array_reverse( get_post_ancestors( $post ) ) as $ancestor ) {
				$trail[] = array(
					'name' => wp_strip_all_tags( get_the_title( $ancestor ) ),
					'url'  => get_permalink( $ancestor ),
				);
			}
		} elseif ( 'post' === $post->post_type ) {
			$cats = get_the_category( $post->ID );
			if ( $cats ) {
				$trail[] = array(
					'name' => wp_strip_all_tags( $cats[0]->name ),
					'url'  => get_category_link( $cats[0] ),
				);
			}
		}
		$trail[] = array(
			'name' => wp_strip_all_tags( get_the_title( $post ) ),
			'url'  => get_permalink( $post ),
		);

		$items = array();
		foreach ( $trail as $i => $crumb ) {
			$items[] = array(
				'@type'    => 'ListItem',
				'position' => $i + 1,
				'name'     => '' !== $crumb['name'] ? $crumb['name'] : $crumb['url'],
				'item'     => $crumb['url'],
			);
		}
		return array(
			'@type'           => 'BreadcrumbList',
			'@id'             => get_permalink( $post ) . '#rankxai-breadcrumb',
			'itemListElement' => $items,
		);
	}
}
