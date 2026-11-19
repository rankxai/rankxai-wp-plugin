<?php
/**
 * Print head tags ourselves when nothing else is.
 *
 * Two independent cases: with no SEO plugin, the values stored for a post are
 * printed here; and a switched-on fill prints a missing feature (description,
 * Open Graph, Twitter card) from WordPress's own data, never invented text.
 * Both are decided per request.
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
		if ( is_admin() || ! RankXAI_Detect::may_own_head() ) {
			return array();
		}
		// A term archive uses the values stored for the term.
		if ( is_category() || is_tag() || is_tax() ) {
			$term = get_queried_object();
			return $term instanceof WP_Term && in_array( $term->taxonomy, RankXAI_Term_SEO::taxonomies(), true )
				? RankXAI_Term_SEO::get_own( $term->term_id )
				: array();
		}
		if ( ! is_singular() ) {
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
			// A hand-written excerpt only, never one generated from the body.
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
	 * Only fields with a value are printed: a missing excerpt means no description.
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

		// Values are escaped above; kses limits the markup to meta and link tags.
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
