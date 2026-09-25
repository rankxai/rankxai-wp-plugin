<?php
/**
 * Print head tags ourselves when nothing else is.
 *
 * Two independent reasons to print, and neither changes the other:
 *
 *   - Own head (`may_own_head`): no SEO plugin at all, so the values stored for
 *     a post through the platform are printed here — as since 0.1.
 *   - Fill (`RankXAI_Fill::on`): the platform observed that nothing on the site
 *     prints a feature (a meta description, Open Graph, a Twitter card) and
 *     switched it on. Those tags fall back to WordPress's own data — the title,
 *     a hand-written excerpt, the featured image — and never to invented text.
 *
 * Both are read per request rather than cached: a site that installs an SEO
 * plugin next month hands the head over on the next request.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Own-head output for sites with no SEO plugin, and gap fills.
 */
class RankXAI_Head {

	/**
	 * Register head output.
	 */
	public static function init() {
		add_filter( 'pre_get_document_title', array( __CLASS__, 'filter_title' ), 99999 );
		add_action( 'wp_head', array( __CLASS__, 'print_tags' ), 1 );
	}

	/**
	 * Values we hold for the current singular view, or an empty array.
	 *
	 * @return array<string, string>
	 */
	private static function current_values() {
		if ( is_admin() || ! is_singular() || ! RankXAI_Detect::may_own_head() ) {
			return array();
		}
		$post_id = get_queried_object_id();
		if ( ! $post_id ) {
			return array();
		}
		return RankXAI_SEO::get_own( $post_id );
	}

	/**
	 * Override the document title.
	 *
	 * @param string $title Incoming title.
	 * @return string
	 */
	public static function filter_title( $title ) {
		$values = self::current_values();
		return isset( $values['title'] ) ? $values['title'] : $title;
	}

	/**
	 * What WordPress itself knows about this view, for the fills.
	 *
	 * @return array{title: string, description: string, url: string, type: string, image: string, site: string}|null
	 */
	private static function wordpress_facts() {
		if ( is_admin() || is_feed() ) {
			return null;
		}
		$site = wp_strip_all_tags( get_bloginfo( 'name' ) );
		if ( is_singular() ) {
			$post = get_queried_object();
			if ( ! $post instanceof WP_Post || post_password_required( $post ) ) {
				return null;
			}
			// A hand-written excerpt only. An excerpt generated from the body is a
			// truncation nobody chose, and we do not publish one as a description.
			$excerpt = has_excerpt( $post ) ? wp_strip_all_tags( $post->post_excerpt ) : '';
			$image   = has_post_thumbnail( $post ) ? (string) get_the_post_thumbnail_url( $post, 'full' ) : '';
			return array(
				'title'       => wp_strip_all_tags( get_the_title( $post ) ),
				'description' => trim( preg_replace( '/\s+/', ' ', $excerpt ) ),
				'url'         => (string) get_permalink( $post ),
				'type'        => 'post' === $post->post_type ? 'article' : 'website',
				'image'       => $image,
				'site'        => $site,
			);
		}
		if ( is_front_page() || is_home() ) {
			$tagline = wp_strip_all_tags( get_bloginfo( 'description' ) );
			// WordPress's own placeholder tagline is not a description of anything.
			if ( 'Just another WordPress site' === $tagline ) {
				$tagline = '';
			}
			return array(
				'title'       => $site,
				'description' => $tagline,
				'url'         => home_url( '/' ),
				'type'        => 'website',
				'image'       => '',
				'site'        => $site,
			);
		}
		return null;
	}

	/**
	 * Print description, canonical, Open Graph and Twitter tags.
	 *
	 * Own-head tags only for fields we hold a value for. Fill tags only for the
	 * features switched on, and only from values that exist: a missing excerpt
	 * means no description, never a made-up one.
	 */
	public static function print_tags() {
		$values = self::current_values();
		$facts  = null;
		$fill   = array(
			'meta_description' => RankXAI_Fill::on( 'meta_description' ),
			'open_graph'       => RankXAI_Fill::on( 'open_graph' ),
			'twitter_card'     => RankXAI_Fill::on( 'twitter_card' ),
		);
		if ( in_array( true, $fill, true ) ) {
			$facts = self::wordpress_facts();
		}

		$tags = array();

		$description = isset( $values['description'] ) ? $values['description'] : '';
		if ( '' === $description && $fill['meta_description'] && $facts ) {
			$description = $facts['description'];
		}
		if ( '' !== $description ) {
			$tags[] = sprintf( '<meta name="description" content="%s" />', esc_attr( $description ) );
		}
		if ( isset( $values['canonical'] ) ) {
			$tags[] = sprintf( '<link rel="canonical" href="%s" />', esc_url( $values['canonical'] ) );
		}

		$og_title = isset( $values['og_title'] ) ? $values['og_title'] : ( isset( $values['title'] ) ? $values['title'] : '' );
		$og_desc  = isset( $values['og_description'] ) ? $values['og_description'] : ( isset( $values['description'] ) ? $values['description'] : '' );
		if ( $fill['open_graph'] && $facts ) {
			$og_title = '' !== $og_title ? $og_title : $facts['title'];
			$og_desc  = '' !== $og_desc ? $og_desc : $facts['description'];
		}
		if ( '' !== $og_title ) {
			$tags[] = sprintf( '<meta property="og:title" content="%s" />', esc_attr( $og_title ) );
		}
		if ( '' !== $og_desc ) {
			$tags[] = sprintf( '<meta property="og:description" content="%s" />', esc_attr( $og_desc ) );
		}
		if ( $fill['open_graph'] && $facts ) {
			$tags[] = sprintf( '<meta property="og:url" content="%s" />', esc_url( $facts['url'] ) );
			$tags[] = sprintf( '<meta property="og:type" content="%s" />', esc_attr( $facts['type'] ) );
			if ( '' !== $facts['site'] ) {
				$tags[] = sprintf( '<meta property="og:site_name" content="%s" />', esc_attr( $facts['site'] ) );
			}
			if ( '' !== $facts['image'] ) {
				$tags[] = sprintf( '<meta property="og:image" content="%s" />', esc_url( $facts['image'] ) );
			}
		}

		$tw_title = isset( $values['twitter_title'] ) ? $values['twitter_title'] : $og_title;
		$tw_desc  = isset( $values['twitter_description'] ) ? $values['twitter_description'] : $og_desc;
		if ( $fill['twitter_card'] && $facts ) {
			$tw_title = '' !== $tw_title ? $tw_title : $facts['title'];
			$tw_desc  = '' !== $tw_desc ? $tw_desc : $facts['description'];
			$tags[]   = sprintf( '<meta name="twitter:card" content="%s" />', '' !== $facts['image'] ? 'summary_large_image' : 'summary' );
			if ( '' !== $facts['image'] ) {
				$tags[] = sprintf( '<meta name="twitter:image" content="%s" />', esc_url( $facts['image'] ) );
			}
		}
		if ( '' !== $tw_title ) {
			$tags[] = sprintf( '<meta name="twitter:title" content="%s" />', esc_attr( $tw_title ) );
		}
		if ( '' !== $tw_desc ) {
			$tags[] = sprintf( '<meta name="twitter:description" content="%s" />', esc_attr( $tw_desc ) );
		}

		if ( ! $tags ) {
			return;
		}

		// Values are already escaped above; the kses pass bounds the markup to
		// head meta/link tags.
		$allowed = array(
			'meta' => array(
				'name'     => true,
				'property' => true,
				'content'  => true,
			),
			'link' => array(
				'rel'  => true,
				'href' => true,
			),
		);

		echo "\n<!-- RankX AI -->\n";
		echo wp_kses( implode( "\n", $tags ), $allowed );
		echo "\n<!-- /RankX AI -->\n";
	}
}
