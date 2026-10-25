<?php
/**
 * A term's search title and description (a product category, a tag, a post
 * category), on both rungs, as RankXAI_SEO does for posts.
 *
 * Our own term meta is the source of truth. Rung 1 mirrors it into the active
 * SEO plugin's own term storage, so it stays visible and editable on that
 * plugin's screens; rung 2 overrides what the plugin prints on the term's
 * archive page through the same filters the post path uses. Where each plugin
 * keeps term SEO was read from its own source in wp-env and is proved by
 * `probe/verify-term-seo-noindex.mjs`, which renders the archive page.
 *
 * All in One SEO Lite has no term SEO of its own (it ships no term model), so
 * there is nothing to mirror into; rung 2 still prints our value on the page.
 *
 * This stores the strings it is given and returns what is stored. It never
 * says `verified`: the platform compares.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Term SEO metadata.
 */
class RankXAI_Term_SEO {

	/**
	 * The fields a term carries.
	 *
	 * @return string[]
	 */
	public static function fields() {
		return array( 'title', 'description' );
	}

	/**
	 * The taxonomies whose archives have a public page to describe.
	 *
	 * @return string[]
	 */
	public static function taxonomies() {
		return array( 'product_cat', 'product_tag', 'category', 'post_tag' );
	}

	/**
	 * Rung 2 on term archives.
	 */
	public static function init() {
		add_action( 'wp', array( __CLASS__, 'register_output_filters' ) );
	}

	/**
	 * Our stored values for a term, field => string; absent fields omitted.
	 *
	 * @param int $term_id Term ID.
	 * @return array<string, string>
	 */
	public static function get_own( $term_id ) {
		$out = array();
		foreach ( self::fields() as $field ) {
			$value = get_term_meta( $term_id, RankXAI_SEO_Registry::own_meta_key( $field ), true );
			if ( '' !== $value && null !== $value && false !== $value ) {
				$out[ $field ] = (string) $value;
			}
		}
		return $out;
	}

	/**
	 * What the active SEO plugin holds for a term.
	 *
	 * @param int    $term_id  Term ID.
	 * @param string $taxonomy Taxonomy.
	 * @return array<string, string>
	 */
	public static function get_plugin_stored( $term_id, $taxonomy ) {
		$out    = array();
		$target = RankXAI_Detect::target_plugin();
		if ( 'yoast' === $target && class_exists( 'WPSEO_Taxonomy_Meta' ) ) {
			foreach ( array(
				'title'       => 'title',
				'description' => 'desc',
			) as $field => $key ) {
				$value = WPSEO_Taxonomy_Meta::get_term_meta( $term_id, $taxonomy, $key );
				if ( is_string( $value ) && '' !== $value ) {
					$out[ $field ] = $value;
				}
			}
			return $out;
		}
		$grouped = self::grouped_storage();
		if ( isset( $grouped[ $target ] ) ) {
			list( $meta_key, $keys ) = $grouped[ $target ];
			$group                   = get_term_meta( $term_id, $meta_key, true );
			foreach ( $keys as $field => $key ) {
				if ( is_array( $group ) && isset( $group[ $key ] ) && '' !== (string) $group[ $key ] ) {
					$out[ $field ] = (string) $group[ $key ];
				}
			}
			return $out;
		}
		$scalar = self::scalar_storage();
		if ( isset( $scalar[ $target ] ) ) {
			foreach ( $scalar[ $target ] as $field => $meta_key ) {
				$value = get_term_meta( $term_id, $meta_key, true );
				if ( '' !== $value && null !== $value && false !== $value ) {
					$out[ $field ] = (string) $value;
				}
			}
		}
		return $out;
	}

	/**
	 * Plugins that keep term SEO as one term meta key per field.
	 *
	 * @return array<string, array<string, string>>
	 */
	private static function scalar_storage() {
		return array(
			'rankmath' => array(
				'title'       => 'rank_math_title',
				'description' => 'rank_math_description',
			),
			'seopress' => array(
				'title'       => '_seopress_titles_title',
				'description' => '_seopress_titles_desc',
			),
			'siteseo'  => array(
				'title'       => '_siteseo_titles_title',
				'description' => '_siteseo_titles_desc',
			),
		);
	}

	/**
	 * Plugins that keep term SEO in one array: the meta key and field => key.
	 *
	 * @return array<string, array{0: string, 1: array<string, string>}>
	 */
	private static function grouped_storage() {
		return array(
			'tsf'      => array(
				'autodescription-term-settings',
				array(
					'title'       => 'doctitle',
					'description' => 'description',
				),
			),
			'surerank' => array(
				'surerank_settings_general',
				array(
					'title'       => 'page_title',
					'description' => 'page_description',
				),
			),
		);
	}

	/**
	 * Validate every field before writing any. Same rule as posts.
	 *
	 * @param array<string, mixed> $values Sparse map of field => value.
	 * @return array<string, string> Field => reason, empty when everything is valid.
	 */
	public static function rejections( $values ) {
		$bad = array();
		foreach ( self::fields() as $field ) {
			if ( array_key_exists( $field, $values ) && ! is_string( $values[ $field ] ) ) {
				$bad[ $field ] = 'must be a string';
			}
		}
		return $bad;
	}

	/**
	 * Write. An empty string clears a field; an absent field is left alone.
	 *
	 * @param int                   $term_id  Term ID.
	 * @param string                $taxonomy Taxonomy.
	 * @param array<string, string> $values   Sparse map of field => value.
	 * @return string[] Fields written.
	 */
	public static function set( $term_id, $taxonomy, $values ) {
		$written = array();
		$clean   = array();
		foreach ( self::fields() as $field ) {
			if ( ! array_key_exists( $field, $values ) ) {
				continue;
			}
			$value           = sanitize_text_field( (string) $values[ $field ] );
			$clean[ $field ] = $value;
			$key             = RankXAI_SEO_Registry::own_meta_key( $field );
			if ( '' === $value ) {
				delete_term_meta( $term_id, $key );
			} else {
				// `update_metadata` unslashes, so an unslashed value loses every backslash.
				update_term_meta( $term_id, $key, wp_slash( $value ) );
			}
			$written[] = $field;
		}
		if ( $clean ) {
			self::mirror( $term_id, $taxonomy, $clean );
		}
		return $written;
	}

	/**
	 * Rung 1 — the active SEO plugin's own term storage.
	 *
	 * @param int                   $term_id  Term ID.
	 * @param string                $taxonomy Taxonomy.
	 * @param array<string, string> $clean    Sanitised field => value.
	 */
	private static function mirror( $term_id, $taxonomy, $clean ) {
		$target = RankXAI_Detect::target_plugin();
		if ( 'yoast' === $target && class_exists( 'WPSEO_Taxonomy_Meta' ) ) {
			$meta = array();
			if ( array_key_exists( 'title', $clean ) ) {
				$meta['wpseo_title'] = $clean['title'];
			}
			if ( array_key_exists( 'description', $clean ) ) {
				$meta['wpseo_desc'] = $clean['description'];
			}
			WPSEO_Taxonomy_Meta::set_values( $term_id, $taxonomy, $meta );
			// Yoast renders from its indexables, rebuilt for a term on `edited_term`
			// (its Indexable_Term_Watcher). The term's SEO did change, so core's own
			// hook is the honest signal; calling Yoast's internal classes would tie
			// this to one Yoast version.
			$term = get_term( $term_id, $taxonomy );
			if ( $term instanceof WP_Term ) {
				do_action( 'edited_term', $term_id, (int) $term->term_taxonomy_id, $taxonomy, array() ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core's hook, fired so the SEO plugin rebuilds the term.
			}
			return;
		}
		$grouped = self::grouped_storage();
		if ( isset( $grouped[ $target ] ) ) {
			list( $meta_key, $keys ) = $grouped[ $target ];
			$group                   = get_term_meta( $term_id, $meta_key, true );
			$group                   = is_array( $group ) ? $group : array();
			foreach ( $keys as $field => $key ) {
				if ( array_key_exists( $field, $clean ) ) {
					$group[ $key ] = $clean[ $field ];
				}
			}
			update_term_meta( $term_id, $meta_key, wp_slash( $group ) );
			return;
		}
		$scalar = self::scalar_storage();
		if ( isset( $scalar[ $target ] ) ) {
			foreach ( $scalar[ $target ] as $field => $meta_key ) {
				if ( ! array_key_exists( $field, $clean ) ) {
					continue;
				}
				if ( '' === $clean[ $field ] ) {
					delete_term_meta( $term_id, $meta_key );
				} else {
					update_term_meta( $term_id, $meta_key, wp_slash( $clean[ $field ] ) );
				}
			}
		}
	}

	/**
	 * Rung 2 — what the active plugin prints on this term's archive.
	 */
	public static function register_output_filters() {
		if ( is_admin() || ! ( is_category() || is_tag() || is_tax() ) ) {
			return;
		}
		$term = get_queried_object();
		if ( ! $term instanceof WP_Term || ! in_array( $term->taxonomy, self::taxonomies(), true ) ) {
			return;
		}
		$own = self::get_own( $term->term_id );
		if ( ! $own ) {
			return;
		}
		$target  = RankXAI_Detect::target_plugin();
		$filters = RankXAI_SEO_Registry::filters();
		if ( '' === $target || ! isset( $filters[ $target ] ) ) {
			return;
		}
		foreach ( $filters[ $target ] as $field => $hook ) {
			if ( ! isset( $own[ $field ] ) ) {
				continue;
			}
			$value = $own[ $field ];
			add_filter(
				$hook,
				function () use ( $value ) {
					return $value;
				},
				99999
			);
		}
	}
}
