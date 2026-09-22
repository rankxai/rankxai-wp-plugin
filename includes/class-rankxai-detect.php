<?php
/**
 * Which SEO plugin, if any, owns this site's document head.
 *
 * From outside WordPress a plugin that registers neither a REST namespace nor
 * REST meta is invisible, so the platform can only report "unknown". In here it
 * is a constant check and it is definitive.
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
	 * Returns '' for both 'none' and 'multiple': a caller writing into a plugin's
	 * own storage has nothing to target in either case.
	 *
	 * @return string
	 */
	public static function target_plugin() {
		$verdict = self::verdict();
		return ( 'none' === $verdict || 'multiple' === $verdict ) ? '' : $verdict;
	}

	/**
	 * May RankX AI print its own title/description/OG tags?
	 *
	 * Only when nothing else is, so a page never ends up with two titles.
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
