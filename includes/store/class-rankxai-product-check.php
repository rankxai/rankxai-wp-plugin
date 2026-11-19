<?php
/**
 * A free, local check of which product details AI shopping answers need and
 * each product is missing. Nothing is sent anywhere.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * The product check.
 */
class RankXAI_Product_Check {

	/** The last result, kept until a product changes. Not autoloaded. */
	const TRANSIENT = 'rankxai_product_check';

	/** How long a result is kept when nothing changes. */
	const TTL = 12 * HOUR_IN_SECONDS;

	/** Products checked at most, newest first, so the page stays quick. */
	const LIMIT = 500;

	/** Fewer words than this in the description and short description together. */
	const MIN_WORDS = 50;

	/** The "Check again" button. */
	const ACTION = 'rankxai_product_check';

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'save_post_product', array( __CLASS__, 'forget' ) );
		add_action( 'woocommerce_update_product', array( __CLASS__, 'forget' ) );
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle_again' ) );
	}

	/**
	 * Drop the stored result.
	 */
	public static function forget() {
		delete_transient( self::TRANSIENT );
	}

	/**
	 * The checks, key => what is missing, in the order they are shown.
	 *
	 * @return array<string, string>
	 */
	public static function labels() {
		$labels = array(
			'gtin'        => __( 'Barcode (GTIN, UPC, EAN or ISBN)', 'rankxai' ),
			'brand'       => __( 'Brand', 'rankxai' ),
			'image'       => __( 'Main image', 'rankxai' ),
			'alt'         => __( 'Image text description (alt text)', 'rankxai' ),
			'description' => __( 'A description of 50 words or more', 'rankxai' ),
			'category'    => __( 'A category other than the default', 'rankxai' ),
			'price'       => __( 'Price', 'rankxai' ),
		);
		// WooCommerce before 9.2 has no barcode field to fill in.
		if ( ! RankXAI_Woo::has_gtin_field() ) {
			unset( $labels['gtin'] );
		}
		return $labels;
	}

	/**
	 * Where each detail is added in WooCommerce, check key => one sentence.
	 *
	 * @return array<string, string>
	 */
	public static function hints() {
		return array(
			'gtin'        => __( 'Add it in each product’s Inventory tab, under GTIN, UPC, EAN or ISBN.', 'rankxai' ),
			'brand'       => __( 'Create brands under Products › Brands and pick one on each product.', 'rankxai' ),
			'image'       => __( 'Set a product image on each product.', 'rankxai' ),
			'alt'         => __( 'Fill in Alternative Text for the product image in the Media Library.', 'rankxai' ),
			'description' => __( 'Say what the product is, who it is for and what makes it different.', 'rankxai' ),
			'category'    => __( 'Put each product in a category that describes it.', 'rankxai' ),
			'price'       => __( 'Set a regular price on each product (or each variation).', 'rankxai' ),
		);
	}

	/**
	 * The result, from the store or freshly run.
	 *
	 * @param bool $fresh Run it again even when a stored result exists.
	 * @return array{total: int, checked: int, complete: int, counts: array<string, int>, missing: int, products: array, at: string}
	 */
	public static function result( $fresh = false ) {
		if ( ! $fresh ) {
			$stored = get_transient( self::TRANSIENT );
			if ( is_array( $stored ) && isset( $stored['counts'] ) ) {
				return $stored;
			}
		}
		$result = self::run();
		set_transient( self::TRANSIENT, $result, self::TTL );
		return $result;
	}

	/**
	 * Check the newest published products.
	 *
	 * @return array{total: int, checked: int, complete: int, counts: array<string, int>, missing: int, products: array, at: string}
	 */
	private static function run() {
		$labels = self::labels();
		$counts = array_fill_keys( array_keys( $labels ), 0 );
		$total  = (int) wp_count_posts( 'product' )->publish;
		$ids    = wc_get_products(
			array(
				'status'  => 'publish',
				'limit'   => self::LIMIT,
				'orderby' => 'date',
				'order'   => 'DESC',
				'return'  => 'ids',
			)
		);
		$ids    = array_map( 'intval', is_array( $ids ) ? $ids : array() );
		if ( $ids ) {
			// Prime post, meta and term caches in one go.
			get_posts(
				array(
					'post_type'              => 'product',
					'post__in'               => $ids,
					'posts_per_page'         => count( $ids ),
					'no_found_rows'          => true,
					'update_post_meta_cache' => true,
					'update_post_term_cache' => true,
				)
			);
		}

		$products = array();
		$complete = 0;
		foreach ( $ids as $id ) {
			$product = wc_get_product( $id );
			if ( ! $product ) {
				continue;
			}
			$gaps = array_values( array_intersect( array_keys( $labels ), self::gaps( $product ) ) );
			foreach ( $gaps as $gap ) {
				++$counts[ $gap ];
			}
			if ( ! $gaps ) {
				++$complete;
				continue;
			}
			$products[] = array(
				'id'    => $id,
				'title' => html_entity_decode( wp_strip_all_tags( $product->get_name() ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ),
				'gaps'  => $gaps,
			);
		}
		// Most gaps first.
		usort(
			$products,
			function ( $a, $b ) {
				return count( $b['gaps'] ) - count( $a['gaps'] );
			}
		);
		return array(
			'total'    => $total,
			'checked'  => count( $ids ),
			'complete' => $complete,
			'counts'   => $counts,
			'missing'  => count( $products ),
			'products' => array_slice( $products, 0, 10 ),
			'at'       => gmdate( 'c' ),
		);
	}

	/**
	 * What one product is missing.
	 *
	 * @param WC_Product $product Product.
	 * @return string[] Check keys.
	 */
	public static function gaps( $product ) {
		$gaps = array();
		if ( '' === RankXAI_Woo::gtin( $product ) ) {
			$gaps[] = 'gtin';
		}
		if ( ! RankXAI_Woo::brands( $product->get_id() ) ) {
			$gaps[] = 'brand';
		}
		$image = (int) $product->get_image_id();
		if ( $image <= 0 ) {
			$gaps[] = 'image';
		} elseif ( '' === trim( (string) get_post_meta( $image, '_wp_attachment_image_alt', true ) ) ) {
			$gaps[] = 'alt';
		}
		// Split on whitespace, so a description in any language is counted.
		$words = preg_split( '/\s+/u', trim( wp_strip_all_tags( $product->get_description() . ' ' . $product->get_short_description() ) ), -1, PREG_SPLIT_NO_EMPTY );
		if ( count( (array) $words ) < self::MIN_WORDS ) {
			$gaps[] = 'description';
		}
		if ( ! RankXAI_Woo::categories( $product->get_id() ) ) {
			$gaps[] = 'category';
		}
		if ( '' === RankXAI_Woo::price_text( $product ) ) {
			$gaps[] = 'price';
		}
		return $gaps;
	}

	/**
	 * The one-line summary used on the Store page and the Overview.
	 *
	 * @param array $result Result.
	 * @return string
	 */
	public static function headline( $result ) {
		$checked = (int) $result['checked'];
		if ( 0 === $checked ) {
			return __( 'This store has no published products to check yet.', 'rankxai' );
		}
		$missing = $checked - (int) $result['complete'];
		if ( 0 === $missing ) {
			return sprintf(
				/* translators: %d: number of products. */
				_n( 'Your %d product has every detail AI shopping answers use.', 'All %d of your products have every detail AI shopping answers use.', $checked, 'rankxai' ),
				$checked
			);
		}
		return sprintf(
			/* translators: 1: products missing something, 2: products checked. */
			_n( '%1$d of your %2$d product is missing details AI shopping answers use.', '%1$d of your %2$d products are missing details AI shopping answers use.', $checked, 'rankxai' ),
			$missing,
			$checked
		);
	}

	/**
	 * The "Check again" button.
	 */
	public static function handle_again() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to check this store.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION );
		self::result( true );
		wp_safe_redirect( add_query_arg( 'rankxai-checked', '1', admin_url( 'admin.php?page=' . RankXAI_Store_Admin::PAGE ) ) );
		exit;
	}

	/**
	 * The check, as the Store page shows it before an account is connected.
	 */
	public static function render() {
		$result = self::result();
		$labels = self::labels();
		$hints  = self::hints();

		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Your products, as AI shopping answers need them', 'rankxai' ),
				'subtitle' => __( 'Checked here, on your own site. Nothing is sent anywhere.', 'rankxai' ),
				'hero'     => true,
			)
		);
		RankXAI_UI::analysis( self::headline( $result ) );
		if ( (int) $result['checked'] > 0 ) {
			RankXAI_UI::grid_open( 'three' );
			foreach ( $labels as $key => $label ) {
				$count = (int) $result['counts'][ $key ];
				RankXAI_UI::stat(
					$label,
					number_format_i18n( $count ),
					0 === $count
						? __( 'Every product checked has it.', 'rankxai' )
						: _n( 'product is missing it.', 'products are missing it.', $count, 'rankxai' ) . ' ' . $hints[ $key ],
					0 === $count ? 'success' : 'warning'
				);
			}
			RankXAI_UI::grid_close();
		}
		echo '<div class="rankxai-actions">';
		RankXAI_UI::action_form( self::ACTION, __( 'Check again', 'rankxai' ) );
		echo '</div>';
		$notes = array(
			sprintf(
				/* translators: %s: date and time. */
				__( 'Last checked %s.', 'rankxai' ),
				wp_date( (string) get_option( 'date_format' ) . ' ' . (string) get_option( 'time_format' ), (int) strtotime( (string) $result['at'] ) )
			),
		);
		if ( (int) $result['total'] > (int) $result['checked'] ) {
			$notes[] = sprintf(
				/* translators: 1: products checked, 2: published products. */
				__( 'The newest %1$d of your %2$d products were checked. Connecting RankX AI checks every product.', 'rankxai' ),
				(int) $result['checked'],
				(int) $result['total']
			);
		}
		RankXAI_UI::note( implode( ' ', $notes ) );
		RankXAI_UI::card_close();

		if ( ! empty( $result['products'] ) ) {
			RankXAI_UI::card_open(
				array(
					'title'    => __( 'Products to fix first', 'rankxai' ),
					'subtitle' => __( 'The products missing the most. Each link opens the product in WooCommerce.', 'rankxai' ),
				)
			);
			$rows = array();
			foreach ( $result['products'] as $item ) {
				$chips = array();
				foreach ( $item['gaps'] as $gap ) {
					if ( isset( $labels[ $gap ] ) ) {
						$chips[] = RankXAI_UI::chip( $labels[ $gap ], 'warning' );
					}
				}
				$edit   = get_edit_post_link( (int) $item['id'], 'raw' );
				$rows[] = array(
					$edit ? '<a href="' . esc_url( $edit ) . '">' . esc_html( $item['title'] ) . '</a>' : esc_html( $item['title'] ),
					implode( ' ', $chips ),
				);
			}
			RankXAI_UI::table( array( __( 'Product', 'rankxai' ), __( 'Missing', 'rankxai' ) ), $rows, array( 0, 1 ) );
			$more = (int) ( isset( $result['missing'] ) ? $result['missing'] : 0 ) - count( $rows );
			if ( $more > 0 ) {
				RankXAI_UI::note(
					sprintf(
						/* translators: %d: number of products. */
						_n( 'And %d more product with something missing.', 'And %d more products with something missing.', $more, 'rankxai' ),
						$more
					)
				);
			}
			RankXAI_UI::card_close();
		}
	}
}
