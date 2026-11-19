<?php
/**
 * Records which SEO output filters fire on a front-end request, across five SEO
 * plugins. Probe only, never shipped.
 *
 * @package RankXAI
 */

if (! defined('ABSPATH')) {
	exit;
}

define('RANKXAI_PROBE_LOG', '/tmp/rankxai-probe.json'); // wp-content is not writable by www-data here

/**
 * Candidate output filters, per plugin.
 *
 * @return array
 */
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
		// SEOPress and TSF names are taken from each plugin's source.
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

/*
 * Off by default: the sentinels replace every page's title, which would break the
 * other probes. run-filter-matrix.sh turns them on for its own run.
 *
 *   wp option update rankxai_probe_sentinels 1     # measure which filters fire
 *   wp option delete rankxai_probe_sentinels       # leave the pages alone
 */
foreach ((get_option('rankxai_probe_sentinels') ? rankxai_probe_filters() : array()) as $plugin => $hooks) {
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

/** After the page renders, write what fired and which SEO plugin is active. */
add_action('shutdown', function () {
	if (is_admin() || (defined('DOING_AJAX') && DOING_AJAX) || (defined('WP_CLI') && WP_CLI)) {
		return;
	}
	if (! function_exists('is_plugin_active')) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}

	// Which SEO plugins are active.
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
		// REST alone cannot report 'none'; PHP can.
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
 * Another plugin serving /llms.txt from `init`, to check that the plugin leaves an
 * address it does not own alone. Off by default, or it would take the URL everywhere.
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

// For verify-fill.mjs: turns a fill off through `rankxai_fill_{feature}`, as
// another SEO plugin would.
add_filter(
	'rankxai_fill_open_graph',
	static function ( $on ) {
		return get_option( 'rankxai_probe_fill_off' ) ? false : $on;
	}
);

// An unknown SEO plugin printing its own meta description, which the fill must
// notice and stop duplicating.
add_action(
	'wp_head',
	static function () {
		if ( get_option( 'rankxai_probe_print_desc' ) ) {
			echo '<meta name="description" content="printed by an unknown plugin" />' . "\n";
		}
	},
	2
);
