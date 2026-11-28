<?php
/**
 * Per-post noindex, through whichever SEO plugin owns the robots meta tag.
 *
 * The value is mirrored into the SEO plugin's own storage, because that plugin
 * prints the tag. When clearing it would leave the post type's default noindex
 * in force, the plugin's explicit "index" value is written instead. With no SEO
 * plugin, core's `wp_robots` prints it.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Per-post noindex.
 */
class RankXAI_Noindex {

	const META = '_rankxai_seo_noindex';

	/**
	 * Print our own value when no SEO plugin owns the head.
	 */
	public static function init() {
		add_filter( 'wp_robots', array( __CLASS__, 'filter_wp_robots' ), 99 );
	}

	/**
	 * Our own value: '1' when we hold "keep search engines out", '' otherwise.
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public static function own( $post_id ) {
		return '1' === (string) get_post_meta( $post_id, self::META, true ) ? '1' : '';
	}

	/**
	 * Whether the post renders as noindex, including the SEO plugin's type default.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function rendered( $post_id ) {
		$target = RankXAI_Detect::target_plugin();
		if ( '' === $target ) {
			return '1' === self::own( $post_id );
		}
		// A per-post value wins ('2' and '-1' mean index); otherwise the type default.
		if ( 'yoast' === $target || 'tsf' === $target ) {
			$key = 'yoast' === $target ? '_yoast_wpseo_meta-robots-noindex' : '_genesis_noindex';
			$own = (string) get_post_meta( $post_id, $key, true );
			if ( '1' === $own ) {
				return true;
			}
			if ( '2' === $own || '-1' === $own ) {
				return false;
			}
			return self::type_default_hides( $target, $post_id );
		}
		return RankXAI_Twins::is_noindexed( $post_id );
	}

	/**
	 * Whether the SEO plugin noindexes this post type by default.
	 *
	 * @param string $target  Target plugin.
	 * @param int    $post_id Post ID.
	 * @return bool
	 */
	private static function type_default_hides( $target, $post_id ) {
		$type = (string) get_post_type( $post_id );
		if ( 'yoast' === $target ) {
			$titles = get_option( 'wpseo_titles', array() );
			return is_array( $titles ) && ! empty( $titles[ 'noindex-' . $type ] );
		}
		if ( 'tsf' === $target ) {
			$settings = get_option( 'autodescription-site-settings', array() );
			return is_array( $settings ) && isset( $settings['noindex_post_types'] ) && is_array( $settings['noindex_post_types'] ) && ! empty( $settings['noindex_post_types'][ $type ] );
		}
		return false;
	}

	/**
	 * Set or clear it, on our own meta and in the active SEO plugin.
	 *
	 * @param int  $post_id Post ID.
	 * @param bool $on      True keeps search engines out.
	 */
	public static function set( $post_id, $on ) {
		if ( $on ) {
			update_post_meta( $post_id, self::META, '1' );
		} else {
			delete_post_meta( $post_id, self::META );
		}
		self::mirror( $post_id, $on );
	}

	/**
	 * Write the value into the active SEO plugin's robots storage.
	 *
	 * @param int  $post_id Post ID.
	 * @param bool $on      True keeps search engines out.
	 */
	private static function mirror( $post_id, $on ) {
		$target = RankXAI_Detect::target_plugin();
		// From the connection, clearing only removes this post's own value, so the SEO plugin's default for the type applies.
		$only_clear = ! $on && RankXAI_Access_Scope::is_connection_request();
		if ( 'aioseo' === $target ) {
			self::aioseo( $post_id, $on );
			return;
		}
		if ( 'rankmath' === $target ) {
			$robots = get_post_meta( $post_id, 'rank_math_robots', true );
			$robots = is_array( $robots ) ? $robots : array();
			$robots = array_values( array_diff( $robots, array( 'index', 'noindex' ) ) );
			// Rank Math needs an explicit directive either way, except when the connection only clears its own value.
			if ( ! $only_clear ) {
				$robots[] = $on ? 'noindex' : 'index';
			}
			if ( $robots ) {
				update_post_meta( $post_id, 'rank_math_robots', $robots );
			} else {
				delete_post_meta( $post_id, 'rank_math_robots' );
			}
			return;
		}
		// Meta key, the noindex value, and the explicit index value for when the
		// type default would still hide the post.
		$scalar = array(
			'yoast'    => array( '_yoast_wpseo_meta-robots-noindex', '1', '2' ),
			'seopress' => array( '_seopress_robots_index', 'yes', '' ),
			'siteseo'  => array( '_siteseo_robots_index', 'yes', '' ),
			'tsf'      => array( '_genesis_noindex', '1', '-1' ),
			'surerank' => array( 'surerank_settings_post_no_index', 'yes', 'no' ),
		);
		if ( ! isset( $scalar[ $target ] ) ) {
			return;
		}
		list( $key, $keep_out, $show ) = $scalar[ $target ];
		if ( $on ) {
			update_post_meta( $post_id, $key, $keep_out );
			return;
		}
		delete_post_meta( $post_id, $key );
		if ( ! $only_clear && '' !== $show && ( self::type_default_hides( $target, $post_id ) || RankXAI_Twins::is_noindexed( $post_id ) ) ) {
			update_post_meta( $post_id, $key, $show );
		}
	}

	/**
	 * All in One SEO keeps robots in its own table. Clearing returns the row to
	 * the default when nothing else was customised.
	 *
	 * @param int  $post_id Post ID.
	 * @param bool $on      True keeps search engines out.
	 */
	private static function aioseo( $post_id, $on ) {
		if ( ! class_exists( '\AIOSEO\Plugin\Common\Models\Post' ) ) {
			return;
		}
		$row = \AIOSEO\Plugin\Common\Models\Post::getPost( $post_id );
		if ( ! $row ) {
			return;
		}
		$row->post_id        = $post_id;
		$row->robots_noindex = $on ? 1 : 0;
		if ( $on ) {
			$row->robots_default = 0;
		} else {
			$custom = false;
			foreach ( array( 'robots_nofollow', 'robots_noarchive', 'robots_nosnippet', 'robots_noimageindex', 'robots_notranslate', 'robots_noodp' ) as $prop ) {
				if ( ! empty( $row->$prop ) ) {
					$custom = true;
				}
			}
			if ( ! $custom ) {
				$row->robots_default = 1;
			}
		}
		$row->save();
	}

	/**
	 * With no SEO plugin, add our value to core's robots tag.
	 *
	 * @param array<string, bool|string> $robots Directives.
	 * @return array<string, bool|string>
	 */
	public static function filter_wp_robots( $robots ) {
		if ( is_admin() || ! is_singular() || ! RankXAI_Detect::may_own_head() ) {
			return $robots;
		}
		$post_id = get_queried_object_id();
		if ( $post_id && '1' === self::own( $post_id ) ) {
			unset( $robots['index'] );
			$robots['noindex'] = true;
		}
		return $robots;
	}
}
