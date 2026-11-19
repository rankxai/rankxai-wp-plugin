<?php
/**
 * Which SEO plugin, if any, owns this site's document head.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * SEO plugin detection.
 */
class RankXAI_Detect {

	/**
	 * Slugs of every SEO plugin currently active.
	 *
	 * @return string[]
	 */
	public static function active_seo_plugins() {
		$found = array();
		foreach ( RankXAI_SEO_Registry::detection() as $slug => $constants ) {
			foreach ( $constants as $constant ) {
				if ( defined( $constant ) ) {
					$found[] = $slug;
					break;
				}
			}
		}

		/**
		 * Filters the detected SEO plugins.
		 *
		 * Lets an SEO plugin this list does not know declare itself. A non-empty
		 * array stops RankX AI emitting its own head tags.
		 *
		 * @param string[] $found Detected plugin slugs.
		 */
		return array_values( array_unique( (array) apply_filters( 'rankxai_active_seo_plugins', $found ) ) );
	}

	/**
	 * Active plugins whose name suggests SEO, including ones we do not integrate with.
	 *
	 * A report only, so an unknown SEO plugin is not mistaken for none.
	 *
	 * @return array<int, array{file: string, name: string, version: string}>
	 */
	public static function seo_like_plugins() {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$active = (array) get_option( 'active_plugins', array() );
		$all    = get_plugins();
		$out    = array();
		foreach ( $active as $file ) {
			if ( ! isset( $all[ $file ] ) || 0 === strpos( $file, dirname( plugin_basename( RANKXAI_PLUGIN_FILE ) ) . '/' ) ) {
				continue;
			}
			$name = (string) $all[ $file ]['Name'];
			if ( preg_match( '/seo|schema|surerank|sitemap|open ?graph|structured data|rich snippet/i', $file . ' ' . $name ) ) {
				$out[] = array(
					'file'    => (string) $file,
					'name'    => $name,
					'version' => (string) $all[ $file ]['Version'],
				);
			}
		}
		return $out;
	}

	/**
	 * One of: 'none', a plugin slug, or 'multiple'.
	 *
	 * @return string
	 */
	public static function verdict() {
		$active = self::active_seo_plugins();
		if ( 0 === count( $active ) ) {
			return 'none';
		}
		if ( 1 === count( $active ) ) {
			return $active[0];
		}
		return 'multiple';
	}

	/**
	 * The single plugin we can integrate with, or '' when there is not exactly one.
	 *
	 * @return string
	 */
	public static function target_plugin() {
		$verdict = self::verdict();
		return ( 'none' === $verdict || 'multiple' === $verdict ) ? '' : $verdict;
	}

	/**
	 * Whether RankX AI may print its own head tags (only when no SEO plugin does).
	 *
	 * @return bool
	 */
	public static function may_own_head() {
		if ( 'none' !== self::verdict() ) {
			return false;
		}

		/**
		 * Filters whether RankX AI may output head tags on this site.
		 *
		 * Return false and RankX AI keeps storing SEO on the post but prints
		 * nothing.
		 *
		 * @param bool $may True when no SEO plugin was detected.
		 */
		return (bool) apply_filters( 'rankxai_may_own_head', true );
	}
}
