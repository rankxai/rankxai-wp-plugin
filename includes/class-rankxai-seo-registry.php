<?php
/**
 * Where each SEO plugin stores post SEO, and which filters decide what it prints.
 *
 * Values are mirrored into the plugin's own fields so they stay editable in its
 * screens, and its output filters have the last word at render.
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
	 * Detection constants, per plugin slug.
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
			'siteseo'  => array( 'SITESEO_VERSION' ),
			'surerank' => array( 'SURERANK_VERSION' ),
		);
	}

	/**
	 * Post meta keys, per plugin.
	 *
	 * AIOSEO is absent: it stores post SEO in its own tables, so post meta
	 * writes would do nothing. See model_storage().
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
			// SiteSEO has no output filters, so storage is the whole integration.
			'siteseo'  => array(
				'title'               => '_siteseo_titles_title',
				'description'         => '_siteseo_titles_desc',
				'canonical'           => '_siteseo_robots_canonical',
				'og_title'            => '_siteseo_social_fb_title',
				'og_description'      => '_siteseo_social_fb_desc',
				'twitter_title'       => '_siteseo_social_twitter_title',
				'twitter_description' => '_siteseo_social_twitter_desc',
			),
		);
	}

	/**
	 * Writable fields for plugins that do not keep post SEO in plain post meta.
	 *
	 * @return array<string, string[]>
	 */
	public static function model_storage() {
		return array(
			'aioseo'   => array( 'title', 'description', 'canonical', 'og_title', 'og_description', 'twitter_title', 'twitter_description' ),
			// SureRank keeps post SEO in grouped arrays, rewritten a group at a time.
			'surerank' => array( 'title', 'description', 'canonical', 'og_title', 'og_description', 'twitter_title', 'twitter_description' ),
		);
	}

	/**
	 * The filters that decide what reaches the head.
	 *
	 * Yoast and SEOPress take the document title from core, so
	 * `pre_get_document_title` is the one that wins for them.
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
				// Rank Math's Helper::do_filter() adds the `rank_math/` prefix.
				'title'       => 'rank_math/frontend/title',
				'description' => 'rank_math/frontend/description',
				'canonical'   => 'rank_math/frontend/canonical',
			),
			'seopress' => array(
				// `seopress_titles_title` fires but does not reach the page.
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
			// SiteSEO takes the title through core's filter at priority 15.
			'siteseo'  => array(
				'title' => 'pre_get_document_title',
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
	 * Rank Math stores an array of directives; the others use differing scalars.
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
			// Rank Math: an array of directives.
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
			// The SEO Framework: 1 noindex, 0 default, -1 index.
			array(
				'key'   => '_genesis_noindex',
				'match' => 'equals',
				'value' => '1',
			),
			// SiteSEO: 'yes' when on, deleted when off.
			array(
				'key'   => '_siteseo_robots_index',
				'match' => 'equals',
				'value' => 'yes',
			),
			// SureRank.
			array(
				'key'   => 'surerank_settings_post_no_index',
				'match' => 'equals',
				'value' => 'yes',
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
	 * Our own post meta key for a field, so a value survives a change of SEO plugin.
	 *
	 * @param string $field Field name from self::fields().
	 * @return string
	 */
	public static function own_meta_key( $field ) {
		return '_rankxai_seo_' . $field;
	}
}
