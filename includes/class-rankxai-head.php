<?php
/**
 * Print head tags ourselves when no SEO plugin is doing it.
 *
 * Gated on RankXAI_Detect::may_own_head(), read per request rather than cached:
 * a site that installs Yoast next month hands the head over on the next request,
 * with no reconnect and no cache clear.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Own-head output for sites with no SEO plugin.
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
	 * Print description, canonical, Open Graph and Twitter tags.
	 *
	 * Only fields we hold a value for. Nothing falls back to the post's own title
	 * or excerpt — the theme keeps whatever it already emits.
	 */
	public static function print_tags() {
		$values = self::current_values();
		if ( ! $values ) {
			return;
		}

		$tags = array();
		if ( isset( $values['description'] ) ) {
			$tags[] = sprintf( '<meta name="description" content="%s" />', esc_attr( $values['description'] ) );
		}
		if ( isset( $values['canonical'] ) ) {
			$tags[] = sprintf( '<link rel="canonical" href="%s" />', esc_url( $values['canonical'] ) );
		}

		$og_title = isset( $values['og_title'] ) ? $values['og_title'] : ( isset( $values['title'] ) ? $values['title'] : '' );
		$og_desc  = isset( $values['og_description'] ) ? $values['og_description'] : ( isset( $values['description'] ) ? $values['description'] : '' );
		if ( '' !== $og_title ) {
			$tags[] = sprintf( '<meta property="og:title" content="%s" />', esc_attr( $og_title ) );
		}
		if ( '' !== $og_desc ) {
			$tags[] = sprintf( '<meta property="og:description" content="%s" />', esc_attr( $og_desc ) );
		}

		$tw_title = isset( $values['twitter_title'] ) ? $values['twitter_title'] : $og_title;
		$tw_desc  = isset( $values['twitter_description'] ) ? $values['twitter_description'] : $og_desc;
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
