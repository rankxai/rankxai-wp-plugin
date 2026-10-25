<?php
/**
 * Plugin Name:       RankX AI
 * Plugin URI:        https://github.com/rankxai/rankxai-wp-plugin
 * Description:       Publishes llms.txt, agents.md and markdown copies of your pages for AI assistants, writes SEO metadata from your RankX AI account through whichever SEO plugin you use, or none, and on a WooCommerce store brings RankX AI's store app into your dashboard.
 * Version:           0.5.5
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            RankX AI
 * Author URI:        https://rankxai.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rankxai
 * WC requires at least: 8.2
 * WC tested up to:   11.2
 * Update URI:        https://github.com/rankxai/rankxai-wp-plugin
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

define( 'RANKXAI_VERSION', '0.5.5' );

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
require_once __DIR__ . '/includes/class-rankxai-noindex.php';
require_once __DIR__ . '/includes/class-rankxai-term-seo.php';
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
require_once __DIR__ . '/includes/class-rankxai-loopback.php';
require_once __DIR__ . '/includes/class-rankxai-robots.php';
require_once __DIR__ . '/includes/class-rankxai-redirect-requests.php';
require_once __DIR__ . '/includes/class-rankxai-site-health.php';
require_once __DIR__ . '/includes/class-rankxai-scan.php';
require_once __DIR__ . '/includes/class-rankxai-summary.php';
require_once __DIR__ . '/includes/class-rankxai-rest.php';
require_once __DIR__ . '/includes/class-rankxai-app-client.php';
require_once __DIR__ . '/includes/class-rankxai-session-cache.php';
require_once __DIR__ . '/includes/class-rankxai-connection.php';

RankXAI_REST::init();
RankXAI_SEO::init();
RankXAI_Head::init();
RankXAI_Noindex::init();
RankXAI_Term_SEO::init();
RankXAI_Schema::init();
RankXAI_Schema_Output::init();
RankXAI_Fill::init();
RankXAI_Documents::init();
RankXAI_Twins::init();
RankXAI_Redirects::init();
RankXAI_Crawlers::init();
RankXAI_Redirect_Requests::init();
RankXAI_Site_Health::init();
RankXAI_Scan::init();
RankXAI_Connection::init();

// Disconnecting on deactivation removes the token and RankX AI's Application
// Passwords, so RankX AI stops writing to a site that switched it off.
register_deactivation_hook( __FILE__, array( 'RankXAI_Connection', 'on_deactivate' ) );

// The WooCommerce store experience. Plugins load in alphabetical order, so
// WooCommerce is not loaded yet when this file runs: the check waits for
// `plugins_loaded`. The plugin works the same without WooCommerce.
add_action(
	'plugins_loaded',
	function () {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return;
		}
		require_once __DIR__ . '/includes/store/class-rankxai-session.php';
		RankXAI_Session::init();
		if ( is_admin() ) {
			require_once __DIR__ . '/includes/store/class-rankxai-store-admin.php';
			require_once __DIR__ . '/includes/store/class-rankxai-product-panel.php';
			RankXAI_Product_Panel::init();
		}
	}
);

// Compatible with WooCommerce's order tables and its cart and checkout blocks:
// this plugin reads and writes no orders and adds nothing to cart or checkout.
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
		}
	}
);

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
	require_once __DIR__ . '/includes/class-rankxai-ui.php';
	require_once __DIR__ . '/includes/class-rankxai-overview.php';
	require_once __DIR__ . '/includes/class-rankxai-pages.php';
	require_once __DIR__ . '/includes/class-rankxai-crawler-page.php';
	require_once __DIR__ . '/includes/class-rankxai-checks-page.php';
	require_once __DIR__ . '/includes/class-rankxai-view-as-ai.php';
	RankXAI_Admin::init();
	RankXAI_View_As_AI::init();
}
