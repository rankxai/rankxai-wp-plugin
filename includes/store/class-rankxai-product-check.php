<?php
/**
 * A free, local check of which product details AI shopping answers need and
 * each product is missing. Every published product is checked. Nothing is
 * sent anywhere.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * The product check.
 */
class RankXAI_Product_Check {

	/** The result, one entry per product. Not autoloaded. */
	const OPTION = 'rankxai_product_check_state';

	/** The result as stored before every product was checked. */
	const OLD_TRANSIENT = 'rankxai_product_check';

	/** Continues a check in the background. */
	const HOOK = 'rankxai_product_check_batch';

	/** Products read per database query. */
	const BATCH = 100;

	/** Seconds spent checking during a page load before the rest moves to the background. */
	const PAGE_BUDGET = 2;

	/** Seconds per background run. */
	const CRON_BUDGET = 20;

	/** A finished result older than this is checked again in the background. */
	const STALE = WEEK_IN_SECONDS;

	/** Products listed per page. */
	const PER_PAGE = 25;

	/** Fewer words than this in the description and short description together. */
	const MIN_WORDS = 50;

	/** The "Check again" button. */
	const ACTION = 'rankxai_product_check';

	/** Every check, in a fixed order; each has one bit in a product's stored result. */
	const KEYS = array( 'gtin', 'brand', 'image', 'alt', 'description', 'category', 'price' );

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( self::HOOK, array( __CLASS__, 'run_batch' ) );
		add_action( 'woocommerce_new_product', array( __CLASS__, 'recheck' ) );
		add_action( 'woocommerce_update_product', array( __CLASS__, 'recheck' ) );
		add_action( 'transition_post_status', array( __CLASS__, 'status_changed' ), 10, 3 );
		add_action( 'deleted_post', array( __CLASS__, 'drop' ) );
		add_action( 'added_post_meta', array( __CLASS__, 'alt_changed' ), 10, 3 );
		add_action( 'updated_post_meta', array( __CLASS__, 'alt_changed' ), 10, 3 );
		add_action( 'deleted_post_meta', array( __CLASS__, 'alt_changed' ), 10, 3 );
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle_again' ) );
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
	 * The stored state.
	 *
	 * @return array{masks: array<int, int>, cursor: int, done: bool, at: string}|null
	 */
	private static function state() {
		$state = get_option( self::OPTION, null );
		if ( ! is_array( $state ) || ! isset( $state['masks'] ) || ! is_array( $state['masks'] ) ) {
			return null;
		}
		return array(
			'masks'  => $state['masks'],
			'cursor' => (int) ( isset( $state['cursor'] ) ? $state['cursor'] : 0 ),
			'done'   => ! empty( $state['done'] ),
			'at'     => isset( $state['at'] ) ? (string) $state['at'] : '',
		);
	}

	/**
	 * Save the state.
	 *
	 * @param array $state State.
	 */
	private static function save( $state ) {
		update_option( self::OPTION, $state, false );
	}

	/**
	 * Start a check of every product from the beginning.
	 */
	private static function restart() {
		delete_transient( self::OLD_TRANSIENT );
		self::save(
			array(
				'masks'  => array(),
				'cursor' => 0,
				'done'   => false,
				'at'     => '',
			)
		);
	}

	/**
	 * Check products for up to a number of seconds, continuing where the last run stopped.
	 *
	 * @param int $budget Seconds.
	 */
	private static function advance( $budget ) {
		$state = self::state();
		if ( null === $state || $state['done'] ) {
			return;
		}
		$until = microtime( true ) + $budget;
		do {
			$ids = self::next_ids( $state['cursor'], self::BATCH );
			if ( ! $ids ) {
				$state['done'] = true;
				$state['at']   = gmdate( 'c' );
				break;
			}
			self::prime( $ids );
			foreach ( $ids as $id ) {
				$product = wc_get_product( $id );
				if ( $product ) {
					$state['masks'][ $id ] = self::mask( self::gaps( $product ) );
				}
				$state['cursor'] = $id;
			}
		} while ( microtime( true ) < $until );
		self::save( $state );
		if ( ! $state['done'] && ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_single_event( time() + 5, self::HOOK );
		}
	}

	/**
	 * The background run.
	 */
	public static function run_batch() {
		self::advance( self::CRON_BUDGET );
	}

	/**
	 * Published product IDs after a given ID, in order.
	 *
	 * @param int $after ID to continue after.
	 * @param int $limit How many.
	 * @return int[]
	 */
	private static function next_ids( $after, $limit ) {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Pages through every product by ID; the result is stored.
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'product' AND post_status = 'publish' AND ID > %d ORDER BY ID ASC LIMIT %d", $after, $limit ) );
		return array_map( 'intval', (array) $ids );
	}

	/**
	 * Load posts, meta and terms for a batch in a few queries.
	 *
	 * @param int[] $ids Product IDs.
	 */
	private static function prime( $ids ) {
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

	/**
	 * Gap keys as stored bits.
	 *
	 * @param string[] $gaps Check keys.
	 * @return int
	 */
	private static function mask( $gaps ) {
		$mask = 0;
		foreach ( self::KEYS as $bit => $key ) {
			if ( in_array( $key, $gaps, true ) ) {
				$mask |= 1 << $bit;
			}
		}
		return $mask;
	}

	/**
	 * Stored bits as gap keys, limited to the checks shown on this site.
	 *
	 * @param int $mask Bits.
	 * @return string[]
	 */
	private static function unmask( $mask ) {
		$shown = self::labels();
		$gaps  = array();
		foreach ( self::KEYS as $bit => $key ) {
			if ( ( $mask & ( 1 << $bit ) ) && isset( $shown[ $key ] ) ) {
				$gaps[] = $key;
			}
		}
		return $gaps;
	}

	/**
	 * A product was created or saved: check it again.
	 *
	 * @param int $product_id Product ID.
	 */
	public static function recheck( $product_id ) {
		$state = self::state();
		if ( null === $state ) {
			return;
		}
		$product_id = (int) $product_id;
		$product    = wc_get_product( $product_id );
		if ( ! $product || 'publish' !== $product->get_status() ) {
			unset( $state['masks'][ $product_id ] );
		} elseif ( $state['done'] || $product_id <= $state['cursor'] ) {
			// Products after the cursor are reached by the check still running.
			$state['masks'][ $product_id ] = self::mask( self::gaps( $product ) );
		}
		self::save( $state );
	}

	/**
	 * A product was published or unpublished.
	 *
	 * @param string  $new_status New status.
	 * @param string  $old_status Old status.
	 * @param WP_Post $post       Post.
	 */
	public static function status_changed( $new_status, $old_status, $post ) {
		if ( $new_status !== $old_status && $post instanceof WP_Post && 'product' === $post->post_type && 'publish' !== $new_status ) {
			self::drop( $post->ID );
		}
	}

	/**
	 * A product was deleted or unpublished.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function drop( $post_id ) {
		$state = self::state();
		if ( null !== $state && isset( $state['masks'][ (int) $post_id ] ) ) {
			unset( $state['masks'][ (int) $post_id ] );
			self::save( $state );
		}
	}

	/**
	 * An image's alt text changed: check the products that use it as their main image.
	 *
	 * @param int|int[] $meta_ids  Meta ID(s).
	 * @param int       $object_id Attachment ID.
	 * @param string    $meta_key  Meta key.
	 */
	public static function alt_changed( $meta_ids, $object_id, $meta_key ) {
		if ( '_wp_attachment_image_alt' !== $meta_key || null === self::state() ) {
			return;
		}
		$products = get_posts(
			array(
				'post_type'      => 'product',
				'post_status'    => 'publish',
				'fields'         => 'ids',
				'posts_per_page' => 100,
				'no_found_rows'  => true,
				'meta_key'       => '_thumbnail_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- Only when an image's alt text changes.
				'meta_value'     => (int) $object_id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- Only when an image's alt text changes.
			)
		);
		foreach ( $products as $id ) {
			self::recheck( (int) $id );
		}
	}

	/**
	 * The result. Starts a check when there is none, and moves it on during a page load.
	 *
	 * @return array{total: int, checked: int, complete: int, counts: array<string, int>, missing: int, products: array, done: bool, at: string}
	 */
	public static function result() {
		$state = self::state();
		if ( null === $state ) {
			self::restart();
			self::advance( self::PAGE_BUDGET );
		} elseif ( ! $state['done'] ) {
			self::advance( self::PAGE_BUDGET );
		} elseif ( '' === $state['at'] || strtotime( $state['at'] ) < time() - self::STALE ) {
			// Kept up to date as products change; a full check now and then catches anything missed.
			$masks = $state['masks'];
			self::restart();
			$fresh          = self::state();
			$fresh['masks'] = $masks;
			self::save( $fresh );
			self::advance( 0 );
		}
		return self::summarise( self::state() );
	}

	/**
	 * Counts and the list of products with something missing.
	 *
	 * @param array $state State.
	 * @return array
	 */
	private static function summarise( $state ) {
		$labels   = self::labels();
		$counts   = array_fill_keys( array_keys( $labels ), 0 );
		$products = array();
		$complete = 0;
		foreach ( $state['masks'] as $id => $mask ) {
			$gaps = self::unmask( (int) $mask );
			if ( ! $gaps ) {
				++$complete;
				continue;
			}
			foreach ( $gaps as $gap ) {
				++$counts[ $gap ];
			}
			$products[] = array(
				'id'   => (int) $id,
				'gaps' => $gaps,
			);
		}
		// Most gaps first, then oldest product first.
		usort(
			$products,
			function ( $a, $b ) {
				$diff = count( $b['gaps'] ) - count( $a['gaps'] );
				return 0 !== $diff ? $diff : $a['id'] - $b['id'];
			}
		);
		return array(
			'total'    => (int) wp_count_posts( 'product' )->publish,
			'checked'  => count( $state['masks'] ),
			'complete' => $complete,
			'counts'   => $counts,
			'missing'  => count( $products ),
			'products' => $products,
			'done'     => $state['done'],
			'at'       => $state['at'],
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
		$missing = $checked - (int) $result['complete'];
		if ( empty( $result['done'] ) ) {
			return sprintf(
				/* translators: 1: products checked so far, 2: published products, 3: products missing something so far. */
				__( 'Checking your products: %1$d of %2$d so far, %3$d missing details AI shopping answers use.', 'rankxai' ),
				$checked,
				max( $checked, (int) $result['total'] ),
				$missing
			);
		}
		if ( 0 === $checked ) {
			return __( 'This store has no published products to check yet.', 'rankxai' );
		}
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
		wp_clear_scheduled_hook( self::HOOK );
		self::restart();
		self::advance( self::PAGE_BUDGET );
		wp_safe_redirect( self::page_url( array( 'rankxai-checked' => '1' ) ) );
		exit;
	}

	/**
	 * The Store page address, with list filters.
	 *
	 * @param array $args Query arguments.
	 * @return string
	 */
	private static function page_url( $args = array() ) {
		// Once connected, the check is its own view of the Store page; keep it there.
		if ( RankXAI_Connection::is_connected() ) {
			$args['rankxai-view'] = 'check';
		}
		return add_query_arg( $args, admin_url( 'admin.php?page=' . RankXAI_Store_Admin::PAGE ) );
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
				'subtitle' => __( 'Every published product, checked here on your own site. Nothing is sent anywhere.', 'rankxai' ),
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
		if ( $result['done'] && '' !== $result['at'] ) {
			RankXAI_UI::note(
				sprintf(
					/* translators: %s: date and time. */
					__( 'Every product was checked by %s. A product is checked again whenever it is saved.', 'rankxai' ),
					wp_date( (string) get_option( 'date_format' ) . ' ' . (string) get_option( 'time_format' ), (int) strtotime( $result['at'] ) )
				)
			);
		} elseif ( ! $result['done'] ) {
			RankXAI_UI::note( __( 'The rest are being checked in the background. Reload this page to see more.', 'rankxai' ) );
		}
		RankXAI_UI::card_close();

		self::render_list( $result, $labels );
	}

	/**
	 * Every product with something missing, a page at a time, optionally for one detail.
	 *
	 * @param array $result Result.
	 * @param array $labels Labels.
	 */
	private static function render_list( $result, $labels ) {
		if ( empty( $result['products'] ) ) {
			return;
		}
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- Read-only list filters.
		$only = isset( $_GET['rankxai-missing'] ) ? sanitize_key( wp_unslash( $_GET['rankxai-missing'] ) ) : '';
		$page = isset( $_GET['rankxai-page'] ) ? max( 1, absint( $_GET['rankxai-page'] ) ) : 1;
		// phpcs:enable WordPress.Security.NonceVerification.Recommended
		if ( ! isset( $labels[ $only ] ) ) {
			$only = '';
		}
		$items = $result['products'];
		if ( '' !== $only ) {
			$items = array_values(
				array_filter(
					$items,
					function ( $item ) use ( $only ) {
						return in_array( $only, $item['gaps'], true );
					}
				)
			);
		}
		$total = count( $items );
		$pages = max( 1, (int) ceil( $total / self::PER_PAGE ) );
		$page  = min( $page, $pages );
		$slice = array_slice( $items, ( $page - 1 ) * self::PER_PAGE, self::PER_PAGE );

		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Products with something missing', 'rankxai' ),
				'subtitle' => __( 'Most missing first. Each link opens the product in WooCommerce.', 'rankxai' ),
			)
		);

		$filters = array( '<a href="' . esc_url( self::page_url() ) . '"' . ( '' === $only ? ' aria-current="true"' : '' ) . '>' . esc_html__( 'All', 'rankxai' ) . '</a>' );
		foreach ( $labels as $key => $label ) {
			if ( (int) $result['counts'][ $key ] > 0 ) {
				$filters[] = '<a href="' . esc_url( self::page_url( array( 'rankxai-missing' => $key ) ) ) . '"' . ( $key === $only ? ' aria-current="true"' : '' ) . '>' . esc_html( $label ) . ' (' . esc_html( number_format_i18n( (int) $result['counts'][ $key ] ) ) . ')</a>';
			}
		}
		echo '<p class="rankxai-filters">' . wp_kses_post( implode( ' · ', $filters ) ) . '</p>';

		_prime_post_caches( wp_list_pluck( $slice, 'id' ), false, false );
		$rows = array();
		foreach ( $slice as $item ) {
			$chips = array();
			foreach ( $item['gaps'] as $gap ) {
				$chips[] = RankXAI_UI::chip( $labels[ $gap ], 'warning' );
			}
			$title  = html_entity_decode( wp_strip_all_tags( get_the_title( (int) $item['id'] ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			$edit   = get_edit_post_link( (int) $item['id'], 'raw' );
			$rows[] = array(
				$edit ? '<a href="' . esc_url( $edit ) . '">' . esc_html( $title ) . '</a>' : esc_html( $title ),
				implode( ' ', $chips ),
			);
		}
		RankXAI_UI::table( array( __( 'Product', 'rankxai' ), __( 'Missing', 'rankxai' ) ), $rows, array( 0, 1 ) );

		if ( $pages > 1 ) {
			$base  = '' !== $only ? array( 'rankxai-missing' => $only ) : array();
			$links = array();
			if ( $page > 1 ) {
				$links[] = '<a href="' . esc_url( self::page_url( $base + array( 'rankxai-page' => $page - 1 ) ) ) . '">' . esc_html__( '‹ Previous', 'rankxai' ) . '</a>';
			}
			$links[] = esc_html(
				sprintf(
					/* translators: 1: current page, 2: number of pages, 3: number of products. */
					__( 'Page %1$d of %2$d (%3$d products)', 'rankxai' ),
					$page,
					$pages,
					$total
				)
			);
			if ( $page < $pages ) {
				$links[] = '<a href="' . esc_url( self::page_url( $base + array( 'rankxai-page' => $page + 1 ) ) ) . '">' . esc_html__( 'Next ›', 'rankxai' ) . '</a>';
			}
			echo '<p class="rankxai-pager">' . wp_kses_post( implode( ' · ', $links ) ) . '</p>';
		}
		RankXAI_UI::card_close();
	}
}
