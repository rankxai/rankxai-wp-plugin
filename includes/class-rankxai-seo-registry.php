<?php
/**
 * Where each SEO plugin stores post SEO, and which filters decide what it
 * renders.
 *
 * Two rungs. Storage mirrors our value into the plugin's own fields so it stays
 * visible and editable on the customer's SEO screens. Filters override what the
 * plugin prints, which is a smaller and more stable contract than a storage
 * schema and has the last word at render.
 *
 * Every value here was measured against a live install rather than taken from
 * documentation; `probe/run-filter-matrix.sh` is how to check a new one.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Static map of SEO plugin integrations.
 */
class RankXAI_SEO_Registry {

	/**
	 * The fields this plugin can read and write, in a plugin-neutral vocabulary.
	 *
	 * @return string[]
	 */
	public static function fields() {
		return array( 'title', 'description', 'canonical', 'og_title', 'og_description', 'twitter_title', 'twitter_description' );
	}

	/**
	 * Detection constants, per plugin slug. A constant check is what lets PHP
	 * answer whether there is an SEO plugin at all, which REST cannot.
	 *
	 * @return array<string, string[]>
	 */
	public static function detection() {
		return array(
			'yoast'    => array( 'WPSEO_VERSION' ),
			'rankmath' => array( 'RANK_MATH_VERSION' ),
			'aioseo'   => array( 'AIOSEO_VERSION' ),
			'seopress' => array( 'SEOPRESS_VERSION' ),
			'tsf'      => array( 'THE_SEO_FRAMEWORK_VERSION' ),
		);
	}

	/**
	 * Rung 1 — post meta keys, per plugin.
	 *
	 * AIOSEO is absent because it stores post SEO in its own tables rather than
	 * post meta; RankXAI_SEO handles it through the model API instead. Writing
	 * post meta for AIOSEO would silently do nothing.
	 *
	 * @return array<string, array<string, string>>
	 */
	public static function storage() {
		return array(
			'yoast'    => array(
				'title'               => '_yoast_wpseo_title',
				'description'         => '_yoast_wpseo_metadesc',
				'canonical'           => '_yoast_wpseo_canonical',
				'og_title'            => '_yoast_wpseo_opengraph-title',
				'og_description'      => '_yoast_wpseo_opengraph-description',
				'twitter_title'       => '_yoast_wpseo_twitter-title',
				'twitter_description' => '_yoast_wpseo_twitter-description',
			),
			'rankmath' => array(
				'title'               => 'rank_math_title',
				'description'         => 'rank_math_description',
				'canonical'           => 'rank_math_canonical_url',
				'og_title'            => 'rank_math_facebook_title',
				'og_description'      => 'rank_math_facebook_description',
				'twitter_title'       => 'rank_math_twitter_title',
				'twitter_description' => 'rank_math_twitter_description',
			),
			'seopress' => array(
				'title'               => '_seopress_titles_title',
				'description'         => '_seopress_titles_desc',
				'canonical'           => '_seopress_robots_canonical',
				'og_title'            => '_seopress_social_fb_title',
				'og_description'      => '_seopress_social_fb_desc',
				'twitter_title'       => '_seopress_social_twitter_title',
				'twitter_description' => '_seopress_social_twitter_desc',
			),
			'tsf'      => array(
				'title'       => '_genesis_title',
				'description' => '_genesis_description',
				'canonical'   => '_genesis_canonical_uri',
			),
		);
	}

	/**
	 * Rung 1 for plugins that do not keep post SEO in post meta.
	 *
	 * AIOSEO is the only one, and its writable set cannot be derived from
	 * `storage()` because it has no entry there. Without this the manifest
	 * reported three writable fields on an AIOSEO site where seven write
	 * successfully, and the platform would never try the other four.
	 *
	 * @return array<string, string[]>
	 */
	public static function model_storage() {
		return array(
			'aioseo' => array( 'title', 'description', 'canonical', 'og_title', 'og_description', 'twitter_title', 'twitter_description' ),
		);
	}

	/**
	 * Rung 2 — the filters that decide what reaches the <head>.
	 *
	 * Two of these are not the obvious choice. Yoast's `wpseo_title` fires but
	 * does not land, because Yoast takes the document title from core. And
	 * SEOPress's storage keys are not its filter names: the Twitter filters are
	 * `..._twitter_card_title`/`_desc` and the canonical is
	 * `seopress_titles_canonical`.
	 *
	 * @return array<string, array<string, string>>
	 */
	public static function filters() {
		return array(
			'yoast'    => array(
				'title'               => 'pre_get_document_title',
				'description'         => 'wpseo_metadesc',
				'canonical'           => 'wpseo_canonical',
				'og_title'            => 'wpseo_opengraph_title',
				'og_description'      => 'wpseo_opengraph_desc',
				'twitter_title'       => 'wpseo_twitter_title',
				'twitter_description' => 'wpseo_twitter_description',
			),
			'rankmath' => array(
				// Source-confirmed via Helper::do_filter( 'frontend/…' ), which
				// prefixes `rank_math/`. Not confirmed on a live render.
				'title'       => 'rank_math/frontend/title',
				'description' => 'rank_math/frontend/description',
				'canonical'   => 'rank_math/frontend/canonical',
			),
			'seopress' => array(
				// `seopress_titles_title` fires but does not land — SEOPress takes
				// the document title from core, so this is the hook that wins.
				'title'               => 'pre_get_document_title',
				'description'         => 'seopress_titles_desc',
				'canonical'           => 'seopress_titles_canonical',
				'og_title'            => 'seopress_social_og_title',
				'og_description'      => 'seopress_social_og_desc',
				'twitter_title'       => 'seopress_social_twitter_card_title',
				'twitter_description' => 'seopress_social_twitter_card_desc',
			),
			'aioseo'   => array(
				'title'       => 'aioseo_title',
				'description' => 'aioseo_description',
				'canonical'   => 'aioseo_canonical_url',
			),
			'tsf'      => array(
				'title'       => 'the_seo_framework_title_from_generation',
				'description' => 'the_seo_framework_custom_field_description',
			),
		);
	}

	/**
	 * How each SEO plugin records "do not index this post".
	 *
	 * The shapes differ: Rank Math stores an array of robots directives while
	 * the others store a scalar, and three different scalars are in use. A
	 * single equality test would read three of the five as indexable.
	 *
	 * @return array<int, array{key: string, match: string, value: string}>
	 */
	public static function noindex_meta() {
		return array(
			// Yoast SEO.
			array(
				'key'   => '_yoast_wpseo_meta-robots-noindex',
				'match' => 'equals',
				'value' => '1',
			),
			// Rank Math — an array of directives, not a flag.
			array(
				'key'   => 'rank_math_robots',
				'match' => 'array_contains',
				'value' => 'noindex',
			),
			// SEOPress.
			array(
				'key'   => '_seopress_robots_index',
				'match' => 'equals',
				'value' => 'yes',
			),
			// The SEO Framework — 1 is noindex, 0 default, -1 index.
			array(
				'key'   => '_genesis_noindex',
				'match' => 'equals',
				'value' => '1',
			),
			// All in One SEO, current and legacy keys.
			array(
				'key'   => '_aioseo_robots_noindex',
				'match' => 'equals',
				'value' => '1',
			),
			array(
				'key'   => '_aioseop_noindex',
				'match' => 'equals',
				'value' => 'on',
			),
		);
	}

	/**
	 * Our own post meta key for a field — the source of truth both rungs project
	 * from, so a value survives the site switching SEO plugin or removing one.
	 *
	 * @param string $field Field name from self::fields().
	 * @return string
	 */
	public static function own_meta_key( $field ) {
		return '_rankxai_seo_' . $field;
	}
}
