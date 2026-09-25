<?php
/**
 * Fill what the site's SEO setup does not output — only what the platform has
 * observed missing, and only while no SEO plugin we know of is active.
 *
 * The platform reads the rendered pages, sees that a feature (a meta
 * description, Open Graph tags, a sitemap, breadcrumbs) is printed by nothing,
 * and switches that one feature on here. It then reads the pages again and
 * switches it off if the feature now appears twice. This file only holds the
 * switches and answers whether a feature may print on this request.
 *
 * The runtime guard is what lets an SEO plugin installed later win at once: the
 * moment one we know is active, every fill stops, before the platform has
 * looked again.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Feature switches for filling SEO gaps.
 */
class RankXAI_Fill {

	/**
	 * `{features: {feature: bool}, updated: ISO date}`. Not autoloaded: read
	 * once per front-end request by the classes that print.
	 */
	const OPTION = 'rankxai_fill';

	/**
	 * Set when the sitemap switch changes, cleared once rewrite rules are flushed.
	 */
	const OPTION_FLUSH = 'rankxai_fill_flush';

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
		// Core registers its sitemap rewrite rules only on a request where sitemaps
		// are enabled, so a changed switch needs a flush — on the NEXT request, once
		// the new value is the one `init` sees. Measured: /wp-sitemap.xml stayed 404
		// with sitemaps on until the rules were flushed.
		if ( self::switches()['sitemap'] !== $clean['sitemap'] ) {
			update_option( self::OPTION_FLUSH, 1, false );
		}
		update_option(
			self::OPTION,
			array(
				'features' => $clean,
				'updated'  => gmdate( 'c' ),
			),
			false
		);
	}

	/**
	 * SEO plugins whose presence stops every fill, now.
	 *
	 * Every one we know of prints all five features itself when configured, so a
	 * gap on such a site is that plugin's setting or an empty field — which is
	 * fixed in that plugin, never by printing a second copy.
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
		if ( empty( $switches[ $feature ] ) ) {
			return false;
		}
		if ( self::blocked_by() ) {
			return false;
		}
		/**
		 * Filters whether RankX AI fills this SEO feature.
		 *
		 * Return false to stop it, whatever the platform switched on — the door
		 * for an SEO plugin we do not know to turn us off.
		 *
		 * @param bool   $on      True when switched on and nothing blocks it.
		 * @param string $feature meta_description | open_graph | twitter_card | sitemap | breadcrumbs.
		 */
		return (bool) apply_filters( 'rankxai_fill_' . $feature, true, $feature );
	}

	/**
	 * Hook the fills that are not printed by the head class.
	 */
	public static function init() {
		// Core's own sitemap, turned back on. Late, so a plugin that switched it
		// off to serve its own is overruled only when the platform saw no sitemap
		// at all — and the guard above keeps us out of any known SEO plugin's way.
		add_filter( 'wp_sitemaps_enabled', array( __CLASS__, 'filter_sitemaps' ), 999 );
		add_action( 'init', array( __CLASS__, 'maybe_flush' ), 999 );
	}

	/**
	 * Flush rewrite rules once after the sitemap switch changed.
	 */
	public static function maybe_flush() {
		if ( get_option( self::OPTION_FLUSH ) ) {
			delete_option( self::OPTION_FLUSH );
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
	 * Built from WordPress's own structure only: home, then the page's parents or
	 * the post's first category, then the page itself. Nothing is invented.
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
