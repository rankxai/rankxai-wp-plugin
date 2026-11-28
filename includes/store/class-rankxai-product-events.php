<?php
/**
 * Tells a connected RankX AI account which products changed, so it re-checks them.
 *
 * Only product IDs and what happened to each (created, updated, moved to the
 * bin, restored) are sent, a minute after the change, with the site's RankX AI
 * token. Nothing is sent until an administrator connects an account.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Product change notices.
 */
class RankXAI_Product_Events {

	/** Products waiting to be reported, id => topic. Not autoloaded. */
	const OPTION = 'rankxai_product_events';

	/** The WP-Cron event that sends them. */
	const HOOK = 'rankxai_send_product_events';

	/** The RankX AI address they are sent to. */
	const PATH = '/api/store-app/wp/product-events';

	/** Seconds between a change and the notice, so one save sends one. */
	const DELAY = 60;

	/** Seconds before a failed send is tried again. */
	const RETRY = 15 * MINUTE_IN_SECONDS;

	/** Most products held while RankX AI cannot be reached. Its nightly check covers the rest. */
	const MAX_QUEUED = 500;

	/** Products per request. */
	const BATCH = 100;

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'woocommerce_new_product', array( __CLASS__, 'created' ) );
		add_action( 'woocommerce_update_product', array( __CLASS__, 'updated' ) );
		add_action( 'wp_trash_post', array( __CLASS__, 'trashed' ) );
		add_action( 'untrashed_post', array( __CLASS__, 'restored' ) );
		add_action( 'before_delete_post', array( __CLASS__, 'deleted' ) );
		add_action( self::HOOK, array( __CLASS__, 'send' ) );
	}

	/**
	 * A product was created.
	 *
	 * @param int $id Product id.
	 */
	public static function created( $id ) {
		self::queue( $id, 'product.created' );
	}

	/**
	 * A product was updated.
	 *
	 * @param int $id Product id.
	 */
	public static function updated( $id ) {
		self::queue( $id, 'product.updated' );
	}

	/**
	 * A post is being moved to the bin.
	 *
	 * @param int $id Post id.
	 */
	public static function trashed( $id ) {
		if ( 'product' === get_post_type( $id ) ) {
			self::queue( $id, 'product.deleted' );
		}
	}

	/**
	 * A post came back from the bin.
	 *
	 * @param int $id Post id.
	 */
	public static function restored( $id ) {
		if ( 'product' === get_post_type( $id ) ) {
			self::queue( $id, 'product.restored' );
		}
	}

	/**
	 * A post is being deleted for good.
	 *
	 * @param int $id Post id.
	 */
	public static function deleted( $id ) {
		if ( 'product' === get_post_type( $id ) ) {
			self::queue( $id, 'product.deleted' );
		}
	}

	/**
	 * Remember a change, and send it a minute from now.
	 *
	 * @param int    $id    Product id.
	 * @param string $topic What happened.
	 */
	public static function queue( $id, $topic ) {
		$id = (int) $id;
		if ( $id <= 0 || ! RankXAI_Connection::is_connected() ) {
			return;
		}
		$queue = self::queued();
		// A product created and then saved again in the same minute is still new.
		if ( ! ( isset( $queue[ $id ] ) && 'product.created' === $queue[ $id ] && 'product.updated' === $topic ) ) {
			unset( $queue[ $id ] );
			$queue[ $id ] = $topic;
		}
		if ( count( $queue ) > self::MAX_QUEUED ) {
			$queue = array_slice( $queue, -self::MAX_QUEUED, null, true );
		}
		update_option( self::OPTION, $queue, false );
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_single_event( time() + self::DELAY, self::HOOK );
		}
	}

	/**
	 * Products waiting, id => topic.
	 *
	 * @return array<int, string>
	 */
	public static function queued() {
		$stored = get_option( self::OPTION, array() );
		$out    = array();
		if ( is_array( $stored ) ) {
			foreach ( $stored as $id => $topic ) {
				if ( (int) $id > 0 && is_string( $topic ) ) {
					$out[ (int) $id ] = $topic;
				}
			}
		}
		return $out;
	}

	/**
	 * WP-Cron: send what is waiting, a hundred at a time.
	 */
	public static function send() {
		if ( ! RankXAI_Connection::is_connected() ) {
			delete_option( self::OPTION );
			return;
		}
		$queue = self::queued();
		while ( $queue ) {
			$batch  = array_slice( $queue, 0, self::BATCH, true );
			$events = array();
			foreach ( $batch as $id => $topic ) {
				$events[] = array(
					'id'    => $id,
					'topic' => $topic,
				);
			}
			$result = RankXAI_App_Client::request(
				'POST',
				self::PATH,
				array(
					'siteUrl' => home_url( '/' ),
					'events'  => $events,
				)
			);
			if ( is_wp_error( $result ) || $result['status'] >= 500 || 429 === $result['status'] ) {
				// RankX AI could not take them now: keep them and try again later.
				wp_schedule_single_event( time() + self::RETRY, self::HOOK );
				return;
			}
			// Sent, or refused for good (a disconnected site): either way they are done. A
			// product changed again since this batch was read stays queued.
			$current = self::queued();
			foreach ( $batch as $id => $topic ) {
				if ( isset( $current[ $id ] ) && $current[ $id ] === $topic ) {
					unset( $current[ $id ] );
				}
				unset( $queue[ $id ] );
			}
			update_option( self::OPTION, $current, false );
		}
	}

	/**
	 * Deactivation: nothing left scheduled.
	 */
	public static function unschedule() {
		wp_clear_scheduled_hook( self::HOOK );
	}
}
