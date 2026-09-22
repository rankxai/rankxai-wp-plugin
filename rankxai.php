<?php
/**
 * Plugin Name:       RankX AI
 * Plugin URI:        https://github.com/rankxai/rankxai-wp-plugin
 * Description:       Connects this site to RankX AI, so SEO metadata written in your RankX AI account reaches the page — whichever SEO plugin you use, or none.
 * Version:           0.0.1
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            RankX AI
 * Author URI:        https://rankxai.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rankxai
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

define( 'RANKXAI_VERSION', '0.0.1' );

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
require_once __DIR__ . '/includes/class-rankxai-documents.php';
require_once __DIR__ . '/includes/class-rankxai-markdown.php';
require_once __DIR__ . '/includes/class-rankxai-twins.php';
require_once __DIR__ . '/includes/class-rankxai-rest.php';

RankXAI_REST::init();
RankXAI_SEO::init();
RankXAI_Head::init();
RankXAI_Schema::init();
RankXAI_Documents::init();
RankXAI_Twins::init();
