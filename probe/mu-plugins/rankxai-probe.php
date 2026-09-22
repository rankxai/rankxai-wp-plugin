<?php
/**
 * Which SEO output filters actually fire, measured rather than read.
 *
 * Registers a sentinel on every candidate output filter across the five major SEO
 * plugins and records which ones ACTUALLY FIRE on a real front-end request. Reading
 * a plugin's documentation tells you a filter is documented; only this tells you it
 * runs, at what priority it can be beaten, and whether the value reaches the page.
 *
 * NOT shipped. Lives under probe/ and is mapped into wp-env only.
 */

if (! defined('ABSPATH')) {
	exit;
}

define('RANKXAI_PROBE_LOG', '/tmp/rankxai-probe.json'); // wp-content is not writable by www-data here

/** Filters we believe exist, per plugin. The point of the probe is to find out. */
function rankxai_probe_filters() {
	return array(
		'yoast' => array(
			'wpseo_title', 'wpseo_metadesc', 'wpseo_canonical',
			'wpseo_opengraph_title', 'wpseo_opengraph_desc',
			'wpseo_twitter_title', 'wpseo_twitter_description',
		),
		'rankmath' => array(
			'rank_math/frontend/title', 'rank_math/frontend/description',
			'rank_math/frontend/canonical',
			'rank_math/opengraph/facebook/og_title', 'rank_math/opengraph/facebook/og_description',
			'rank_math/opengraph/twitter/twitter_title', 'rank_math/opengraph/twitter/twitter_description',
		),
		// SEOPress and TSF below were MEASURED out of the plugin sources. Written from
		// memory first, and four of SEOPress's seven and five of TSF's six did not exist
		// — `seopress_social_twitter_title` and `seopress_robots_canonical` among them.
		'seopress' => array(
			'seopress_titles_title', 'seopress_titles_desc', 'seopress_titles_canonical',
			'seopress_social_og_title', 'seopress_social_og_desc',
			'seopress_social_twitter_card_title', 'seopress_social_twitter_card_desc',
		),
		'aioseo' => array(
			'aioseo_title', 'aioseo_description', 'aioseo_canonical_url',
			'aioseo_facebook_tags', 'aioseo_twitter_tags',
		),
		'tsf' => array(
			'the_seo_framework_title_from_generation', 'the_seo_framework_pre_get_document_title',
			'the_seo_framework_generated_description', 'the_seo_framework_custom_field_description',
			'the_seo_framework_overwrite_titles',
		),
		'core' => array('pre_get_document_title', 'document_title_parts'),
	);
}

$GLOBALS['rankxai_probe_fired'] = array();

foreach (rankxai_probe_filters() as $plugin => $hooks) {
	foreach ($hooks as $hook) {
		// Priority 99999: we want to be the last word.
		add_filter($hook, function ($value) use ($hook, $plugin) {
			$GLOBALS['rankxai_probe_fired'][$hook] = array(
				'plugin'    => $plugin,
				'wasType'   => gettype($value),
				'wasLength' => is_string($value) ? strlen($value) : null,
			);
			// Arrays (aioseo_*_tags) must stay arrays or the plugin fatals.
			if (is_array($value)) {
				return $value;
			}
			return 'RANKXAI_SENTINEL_' . strtoupper(str_replace(array('/', '-'), '_', $hook));
		}, 99999);
	}
}

/** Dump what fired, plus the environment facts Phase 0 needs, after the page renders. */
add_action('shutdown', function () {
	if (is_admin() || (defined('DOING_AJAX') && DOING_AJAX) || (defined('WP_CLI') && WP_CLI)) {
		return;
	}
	if (! function_exists('is_plugin_active')) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}

	// The V1 capability: can PHP definitively answer "is there an SEO plugin?"
	$detect = array(
		'yoast'    => defined('WPSEO_VERSION'),
		'rankmath' => defined('RANK_MATH_VERSION'),
		'aioseo'   => defined('AIOSEO_VERSION'),
		'seopress' => defined('SEOPRESS_VERSION'),
		'tsf'      => function_exists('the_seo_framework') || defined('THE_SEO_FRAMEWORK_VERSION'),
	);
	$active = array_values(array_filter(array_keys($detect), function ($k) use ($detect) { return $detect[$k]; }));

	global $wpdb;
	$tables = $wpdb->get_col("SHOW TABLES LIKE '%redirect%'");
	$aioseo_tables = $wpdb->get_col("SHOW TABLES LIKE '%aioseo%'");

	$payload = array(
		'generatedAt'      => gmdate('c'),
		'url'              => isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '',
		'activeSeoPlugins' => $active,
		// This is the answer REST cannot give — 'none' is PRODUCIBLE from here.
		'seoPluginVerdict' => count($active) === 0 ? 'none' : (count($active) === 1 ? $active[0] : 'multiple'),
		'filtersFired'     => $GLOBALS['rankxai_probe_fired'],
		'redirectTables'   => $tables,
		'aioseoTables'     => $aioseo_tables,
		'aioseoModelClass' => class_exists('\\AIOSEO\\Plugin\\Common\\Models\\Post'),
		'aioseoFn'         => function_exists('aioseo'),
		'unfilteredHtml'   => array(
			'currentUserCan' => current_user_can('unfiltered_html'),
			'constDisallow'  => defined('DISALLOW_UNFILTERED_HTML') ? DISALLOW_UNFILTERED_HTML : null,
			'isMultisite'    => is_multisite(),
		),
		'wpVersion'        => get_bloginfo('version'),
		'phpVersion'       => PHP_VERSION,
	);

	file_put_contents(RANKXAI_PROBE_LOG, wp_json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}, 99999);

/**
 * Phase 0 item: can a plugin serve /llms.txt as a VIRTUAL route (no file on disk),
 * and what happens when a physical file exists at the same path?
 *
 * BEHIND AN OPTION, DEFAULT OFF — and that is not tidiness. Unconditional, this
 * claims `/llms.txt` at `init` priority 0, ahead of the plugin's own route at
 * 99, so it OWNED the URL permanently in every rig it was installed in. The
 * no-account probe then measured this fixture instead of the generator and
 * reported six failures that read exactly like product defects: no header, no
 * nosniff, no section, no fixture page. The same class as the containers that
 * had gone blind — a rig artefact producing a confident wrong answer.
 *
 * Switched on it is now a CONTROLLED COMPETITOR, which is worth more than it
 * was as a default: it is the only way to prove the promise that a plugin
 * already serving one of these addresses keeps it.
 *
 *   wp option update rankxai_phase0_llms 1     # take the URL
 *   wp option delete rankxai_phase0_llms       # give it back
 */
add_action('init', function () {
	if (!get_option('rankxai_phase0_llms')) {
		return;
	}
	$path = isset($_SERVER['REQUEST_URI']) ? parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) : '';
	if ($path !== '/llms.txt') {
		return;
	}
	header('Content-Type: text/plain; charset=utf-8');
	header('X-RankXAI-Source: virtual-route');
	header('X-RankXAI-Probe: phase0-competitor');
	echo "# RankX AI virtual llms.txt\nserved-by: plugin init hook\n";
	exit;
}, 0);
