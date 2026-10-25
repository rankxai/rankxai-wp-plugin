<?php
/**
 * RankX AI on WooCommerce's own product screens, once an account is connected.
 *
 * Two things, both for administrators only: an "AI search and data gaps" link
 * under each product in the list, opening that product in the Store page, and
 * a small panel on the product's edit screen with its open gaps and how often
 * it appeared in AI shopping answers. The panel starts closed and makes no
 * request until it is opened; its script loads only on a product's edit
 * screen.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * The product row action and edit-screen panel.
 */
class RankXAI_Product_Panel {

	/** The meta box id. */
	const BOX = 'rankxai-product';

	/**
	 * Hooks, only when the panel can work.
	 */
	public static function init() {
		if ( ! RankXAI_Connection::is_connected() ) {
			return;
		}
		add_action( 'add_meta_boxes_product', array( __CLASS__, 'add_box' ) );
		add_filter( 'postbox_classes_product_' . self::BOX, array( __CLASS__, 'start_closed' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	/**
	 * Whether the current user may use the store app here.
	 *
	 * @return bool
	 */
	private static function allowed() {
		return current_user_can( 'manage_options' ) && RankXAI_Connection::is_connected();
	}

	/**
	 * The Store page's address for one product.
	 *
	 * @param int $product_id WooCommerce product id.
	 * @return string
	 */
	public static function store_url( $product_id ) {
		return admin_url( 'admin.php?page=' . RankXAI_Store_Admin::PAGE ) . '#/products/' . (int) $product_id;
	}

	/**
	 * The link under a product in the Products list.
	 *
	 * @param string[] $actions Row actions.
	 * @param WP_Post  $post    The product.
	 * @return string[]
	 */
	public static function row_action( $actions, $post ) {
		if ( ! $post instanceof WP_Post || 'product' !== $post->post_type || ! self::allowed() ) {
			return $actions;
		}
		$actions['rankxai_store'] = '<a href="' . esc_url( self::store_url( $post->ID ) ) . '">' . esc_html__( 'AI search and data gaps', 'rankxai' ) . '</a>';
		return $actions;
	}

	/**
	 * Add the panel to the product edit screen.
	 */
	public static function add_box() {
		if ( ! self::allowed() ) {
			return;
		}
		add_meta_box( self::BOX, __( 'RankX AI', 'rankxai' ), array( __CLASS__, 'render' ), 'product', 'side', 'default' );
	}

	/**
	 * Start closed, so opening the screen sends nothing.
	 *
	 * @param string[] $classes Postbox classes.
	 * @return string[]
	 */
	public static function start_closed( $classes ) {
		if ( ! in_array( 'closed', $classes, true ) ) {
			$classes[] = 'closed';
		}
		return $classes;
	}

	/**
	 * The panel's contents: filled in by its script when opened.
	 *
	 * @param WP_Post $post The product.
	 */
	public static function render( $post ) {
		echo '<div class="rankxai-product-panel" data-rankxai-product="' . esc_attr( (string) (int) $post->ID ) . '">';
		echo '<div data-rankxai-out aria-live="polite"><p>' . esc_html__( 'Open this panel to see this product\'s open gaps and how often AI shopping answers show it.', 'rankxai' ) . '</p></div>';
		echo '<p><a href="' . esc_url( self::store_url( $post->ID ) ) . '">' . esc_html__( 'Open in the Store page', 'rankxai' ) . '</a></p>';
		echo '</div>';
	}

	/**
	 * The panel's script, on a product's edit screen only.
	 *
	 * @param string $hook_suffix Current screen's hook suffix.
	 */
	public static function enqueue( $hook_suffix ) {
		if ( 'post.php' !== $hook_suffix || ! self::allowed() ) {
			return;
		}
		$screen = get_current_screen();
		if ( ! $screen || 'product' !== $screen->post_type ) {
			return;
		}
		wp_enqueue_script( 'rankxai-product-panel', plugins_url( 'assets/product-panel.js', RANKXAI_PLUGIN_FILE ), array( 'jquery', 'postbox' ), RANKXAI_VERSION, true );
		$config = array(
			'box'        => self::BOX,
			'sessionUrl' => rest_url( RankXAI_REST::NAMESPACE_V1 . '/session' ),
			'nonce'      => wp_create_nonce( 'wp_rest' ),
			'apiBase'    => RankXAI_App_Client::APP_ORIGIN . RankXAI_Store_Admin::API_PATH,
			'text'       => array(
				'loading'    => __( 'Reading this product from RankX AI…', 'rankxai' ),
				'failed'     => __( 'RankX AI could not be reached just now. Try again in a minute.', 'rankxai' ),
				'notChecked' => __( 'This product has not been checked yet. The Store page runs the first check.', 'rankxai' ),
				'ready'      => __( 'Ready to be shown in AI shopping answers.', 'rankxai' ),
				'needsFix'   => __( 'Needs a fix before AI shopping answers can show it:', 'rankxai' ),
				'cantTell'   => __( 'RankX AI cannot tell yet whether AI shopping answers can show it.', 'rankxai' ),
				/* translators: 1: answers showing this product, 2: answers that showed any product, 3: days. */
				'answers'    => __( 'Shown in %1$d of %2$d AI shopping answers that showed products in the last %3$d days.', 'rankxai' ),
				'noAnswers'  => __( 'No AI shopping answers have been checked for this store yet.', 'rankxai' ),
				'more'       => __( 'and more in the Store page.', 'rankxai' ),
			),
		);
		wp_add_inline_script( 'rankxai-product-panel', 'window.rankxaiProductPanel = ' . wp_json_encode( $config ) . ';', 'before' );
	}
}
