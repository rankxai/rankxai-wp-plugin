<?php
/**
 * WooCommerce's own rules on which pages are noindex or hidden by "Coming soon".
 *
 * Markdown copies and llms.txt follow them, so a private page is never published
 * at a second address.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * WooCommerce page rules.
 */
class RankXAI_Woo {

	/**
	 * Whether WooCommerce is active.
	 *
	 * @return bool
	 */
	public static function active() {
		return class_exists( 'WooCommerce' ) && function_exists( 'wc_get_page_id' );
	}

	/**
	 * WooCommerce's "Coming soon" mode: 'site', 'store' (store pages only) or '' when live.
	 *
	 * @return string
	 */
	public static function coming_soon() {
		if ( ! self::active() || 'yes' !== get_option( 'woocommerce_coming_soon' ) ) {
			return '';
		}
		return 'yes' === get_option( 'woocommerce_store_pages_only' ) ? 'store' : 'site';
	}

	/**
	 * The pages WooCommerce marks noindex itself: cart, checkout and account.
	 *
	 * @return int[]
	 */
	public static function noindex_page_ids() {
		if ( ! self::active() ) {
			return array();
		}
		return self::positive_ids( array( wc_get_page_id( 'cart' ), wc_get_page_id( 'checkout' ), wc_get_page_id( 'myaccount' ) ) );
	}

	/**
	 * The pages "Coming soon" hides when only the store is hidden.
	 *
	 * @return int[]
	 */
	public static function store_page_ids() {
		if ( ! self::active() ) {
			return array();
		}
		$pages = array(
			'shop'        => wc_get_page_id( 'shop' ),
			'cart'        => wc_get_page_id( 'cart' ),
			'checkout'    => wc_get_page_id( 'checkout' ),
			'myaccount'   => wc_get_page_id( 'myaccount' ),
			'terms'       => function_exists( 'wc_terms_and_conditions_page_id' ) ? wc_terms_and_conditions_page_id() : 0,
			'coming_soon' => wc_get_page_id( 'coming_soon' ),
		);
		/** This filter is documented in woocommerce/src/Admin/WCAdminHelper.php */
		$pages = apply_filters( 'woocommerce_store_pages', $pages ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- WooCommerce's own filter.
		return self::positive_ids( is_array( $pages ) ? array_values( $pages ) : array() );
	}

	/**
	 * Whether WooCommerce currently hides this post from visitors.
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	public static function hides( $post ) {
		$mode = self::coming_soon();
		if ( '' === $mode || ! $post instanceof WP_Post ) {
			return false;
		}
		if ( 'site' === $mode ) {
			return true;
		}
		return 'product' === $post->post_type || in_array( (int) $post->ID, self::store_page_ids(), true );
	}

	/**
	 * Whether WooCommerce marks this post noindex itself.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function noindexes( $post_id ) {
		return in_array( (int) $post_id, self::noindex_page_ids(), true );
	}

	/**
	 * A product's key facts as label => plain text, or empty for a non-product.
	 *
	 * @param WP_Post $post Post.
	 * @return array<string, string>
	 */
	public static function product_facts( $post ) {
		if ( ! self::active() || ! $post instanceof WP_Post || 'product' !== $post->post_type || ! function_exists( 'wc_get_product' ) ) {
			return array();
		}
		$product = wc_get_product( $post->ID );
		if ( ! $product ) {
			return array();
		}
		$facts = array();

		$price = self::price_text( $product );
		if ( '' !== $price ) {
			$facts[ __( 'Price', 'rankxai' ) ] = $price;
		}
		$stock  = array(
			'instock'     => __( 'In stock', 'rankxai' ),
			'outofstock'  => __( 'Out of stock', 'rankxai' ),
			'onbackorder' => __( 'Available on backorder', 'rankxai' ),
		);
		$status = (string) $product->get_stock_status();
		if ( isset( $stock[ $status ] ) ) {
			$facts[ __( 'Availability', 'rankxai' ) ] = $stock[ $status ];
		}
		$sku = (string) $product->get_sku();
		if ( '' !== $sku ) {
			$facts[ __( 'SKU', 'rankxai' ) ] = $sku;
		}
		$gtin = self::gtin( $product );
		if ( '' !== $gtin ) {
			$facts[ __( 'GTIN', 'rankxai' ) ] = $gtin;
		}
		$brands = self::brands( $post->ID );
		if ( $brands ) {
			$facts[ __( 'Brand', 'rankxai' ) ] = implode( ', ', $brands );
		}
		$categories = self::categories( $post->ID );
		if ( $categories ) {
			$facts[ __( 'Categories', 'rankxai' ) ] = implode( ', ', $categories );
		}
		foreach ( array_slice( self::attributes( $product ), 0, 10, true ) as $name => $values ) {
			$facts[ $name ] = $values;
		}
		$count = (int) $product->get_review_count();
		if ( $count > 0 ) {
			$facts[ __( 'Rating', 'rankxai' ) ] = sprintf(
				/* translators: 1: average rating, 2: number of reviews. */
				_n( '%1$s out of 5 (%2$d review)', '%1$s out of 5 (%2$d reviews)', $count, 'rankxai' ),
				number_format_i18n( (float) $product->get_average_rating(), 1 ),
				$count
			);
		}
		return $facts;
	}

	/**
	 * A product's price as plain text, with a range or the regular price where relevant.
	 *
	 * @param WC_Product $product Product.
	 * @return string
	 */
	public static function price_text( $product ) {
		$plain = function ( $amount ) {
			return html_entity_decode( wp_strip_all_tags( wc_price( $amount ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		};
		if ( $product->is_type( 'variable' ) ) {
			$min = $product->get_variation_price( 'min' );
			$max = $product->get_variation_price( 'max' );
			if ( '' === (string) $min ) {
				return '';
			}
			return (string) $min === (string) $max ? $plain( $min ) : $plain( $min ) . ' – ' . $plain( $max );
		}
		$price = $product->get_price();
		if ( '' === (string) $price ) {
			return '';
		}
		$text = $plain( $price );
		if ( $product->is_on_sale() && '' !== (string) $product->get_regular_price() ) {
			/* translators: %s: the regular price. */
			$text .= ' ' . sprintf( __( '(was %s)', 'rankxai' ), $plain( $product->get_regular_price() ) );
		}
		return $text;
	}

	/**
	 * The product's barcode, or the first variation's (WooCommerce 9.2 and later).
	 *
	 * @param WC_Product $product Product.
	 * @return string
	 */
	public static function gtin( $product ) {
		if ( ! method_exists( $product, 'get_global_unique_id' ) ) {
			return '';
		}
		$gtin = (string) $product->get_global_unique_id();
		if ( '' !== $gtin || ! $product->is_type( 'variable' ) ) {
			return $gtin;
		}
		foreach ( $product->get_children() as $child_id ) {
			$child = wc_get_product( $child_id );
			if ( $child && '' !== (string) $child->get_global_unique_id() ) {
				return (string) $child->get_global_unique_id();
			}
		}
		return '';
	}

	/**
	 * Whether this WooCommerce has its own barcode field (9.2 and later).
	 *
	 * @return bool
	 */
	public static function has_gtin_field() {
		return self::active() && method_exists( 'WC_Product', 'get_global_unique_id' );
	}

	/**
	 * Brand names, from `product_brand` or else a "Brand" attribute.
	 *
	 * @param int $product_id Product ID.
	 * @return string[]
	 */
	public static function brands( $product_id ) {
		$names = array();
		if ( taxonomy_exists( 'product_brand' ) ) {
			$terms = get_the_terms( $product_id, 'product_brand' );
			if ( is_array( $terms ) ) {
				$names = wp_list_pluck( $terms, 'name' );
			}
		}
		if ( ! $names && taxonomy_exists( 'pa_brand' ) ) {
			$terms = get_the_terms( $product_id, 'pa_brand' );
			if ( is_array( $terms ) ) {
				$names = wp_list_pluck( $terms, 'name' );
			}
		}
		return array_values( array_map( 'strval', $names ) );
	}

	/**
	 * Category names, without the store's default category ("Uncategorized").
	 *
	 * @param int $product_id Product ID.
	 * @return string[]
	 */
	public static function categories( $product_id ) {
		$terms   = get_the_terms( $product_id, 'product_cat' );
		$default = (int) get_option( 'default_product_cat', 0 );
		$names   = array();
		if ( is_array( $terms ) ) {
			foreach ( $terms as $term ) {
				if ( (int) $term->term_id !== $default ) {
					$names[] = (string) $term->name;
				}
			}
		}
		return $names;
	}

	/**
	 * Attributes shown on the product page, name => values.
	 *
	 * @param WC_Product $product Product.
	 * @return array<string, string>
	 */
	private static function attributes( $product ) {
		$out = array();
		foreach ( $product->get_attributes() as $attribute ) {
			if ( ! is_object( $attribute ) || ! method_exists( $attribute, 'get_visible' ) || ! $attribute->get_visible() ) {
				continue;
			}
			$name = (string) wc_attribute_label( $attribute->get_name(), $product );
			if ( 'brand' === strtolower( $name ) ) {
				continue;
			}
			if ( $attribute->is_taxonomy() ) {
				$values = wc_get_product_terms( $product->get_id(), $attribute->get_name(), array( 'fields' => 'names' ) );
			} else {
				$values = $attribute->get_options();
			}
			$values = array_filter( array_map( 'strval', (array) $values ) );
			if ( '' !== $name && $values ) {
				$out[ $name ] = implode( ', ', $values );
			}
		}
		return $out;
	}

	/**
	 * Keep the IDs of pages that exist.
	 *
	 * @param array $ids Candidate IDs.
	 * @return int[]
	 */
	private static function positive_ids( $ids ) {
		$out = array();
		foreach ( $ids as $id ) {
			if ( (int) $id > 0 ) {
				$out[] = (int) $id;
			}
		}
		return array_values( array_unique( $out ) );
	}
}
