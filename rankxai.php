<?php
/**
 * Plugin Name:       RankX AI
 * Plugin URI:        https://github.com/rankxai/rankxai-wp-plugin
 * Description:       Publishes llms.txt, agents.md and markdown copies of your pages for AI assistants, and writes SEO metadata from your RankX AI account through whichever SEO plugin you use, or none.
 * Version:           0.4.1
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            RankX AI
 * Author URI:        https://rankxai.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rankxai
 * Update URI:        https://github.com/rankxai/rankxai-wp-plugin
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

define( 'RANKXAI_VERSION', '0.4.1' );

/**
 * REST contract version, separate from the plugin version.
 *
 * The platform reads this from /manifest and adapts. Bump it only on a breaking
 * change to an existing route; adding a route or a field is not breaking.
 */
define( 'RANKXAI_CONTRACT_VERSION', 1 );

define( 'RANKXAI_PLUGIN_FILE', __FILE__ );

require_once __DIR__ . '/includes/class-rankxai-seo-registry.php';
require_once __DIR__ . '/includes/class-rankxai-detect.php';
require_once __DIR__ . '/includes/class-rankxai-seo.php';
require_once __DIR__ . '/includes/class-rankxai-head.php';
require_once __DIR__ . '/includes/class-rankxai-content.php';
require_once __DIR__ . '/includes/class-rankxai-schema.php';
require_once __DIR__ . '/includes/class-rankxai-schema-providers.php';
require_once __DIR__ . '/includes/class-rankxai-schema-set.php';
require_once __DIR__ . '/includes/class-rankxai-schema-output.php';
require_once __DIR__ . '/includes/class-rankxai-fill.php';
require_once __DIR__ . '/includes/class-rankxai-documents.php';
require_once __DIR__ . '/includes/class-rankxai-markdown.php';
require_once __DIR__ . '/includes/class-rankxai-twins.php';
require_once __DIR__ . '/includes/class-rankxai-generate.php';
require_once __DIR__ . '/includes/class-rankxai-redirects.php';
require_once __DIR__ . '/includes/class-rankxai-crawlers.php';
require_once __DIR__ . '/includes/class-rankxai-rest.php';

RankXAI_REST::init();
RankXAI_SEO::init();
RankXAI_Head::init();
RankXAI_Schema::init();
RankXAI_Schema_Output::init();
RankXAI_Fill::init();
RankXAI_Documents::init();
RankXAI_Twins::init();
RankXAI_Redirects::init();
RankXAI_Crawlers::init();

// Present only in the GitHub build. The WordPress.org build removes this file and
// the `Update URI` header, because the directory delivers its own updates.
if ( is_readable( __DIR__ . '/includes/class-rankxai-updater.php' ) ) {
	require_once __DIR__ . '/includes/class-rankxai-updater.php';
	RankXAI_Updater::init();
}

// The settings screen exists only in wp-admin, and `admin-post.php` — where its
// form is handled — is part of it. Loading it on a front-end request would cost
// a file read on every page for code that can never run there.
if ( is_admin() ) {
	require_once __DIR__ . '/includes/class-rankxai-admin.php';
	RankXAI_Admin::init();
}
