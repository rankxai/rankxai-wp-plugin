<?php
/**
 * Store app sessions, held per WordPress user for the rest of their life.
 *
 * Opening the Store page, and the product panel on a product's edit screen,
 * would otherwise ask RankX AI for a new session each time. A session lasts
 * ten minutes; it is reused while more than two minutes are left, and never
 * when the page says RankX AI refused it.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Per-user session cache.
 */
class RankXAI_Session_Cache {

	/** Transient prefix; the WordPress user id follows. */
	const PREFIX = 'rankxai_store_session_';

	/** Users whose sessions are cached, so all can be cleared. Not autoloaded. */
	const USERS_OPTION = 'rankxai_store_session_users';

	/** A cached session is handed out while at least this much of it is left. */
	const MIN_LEFT = 120;

	/**
	 * The cached session for a user, or null.
	 *
	 * @param int $user_id WordPress user id.
	 * @return array|null
	 */
	public static function get( $user_id ) {
		$cached = get_transient( self::PREFIX . (int) $user_id );
		if ( ! is_array( $cached ) || empty( $cached['token'] ) || ! isset( $cached['expires'] ) ) {
			return null;
		}
		$left = (int) $cached['expires'] - time();
		if ( $left < self::MIN_LEFT ) {
			return null;
		}
		$cached['expiresIn'] = $left;
		return $cached;
	}

	/**
	 * Keep a session for a user.
	 *
	 * @param int    $user_id    WordPress user id.
	 * @param string $token      The session token.
	 * @param string $expires_at When it expires, as RankX AI said.
	 * @param int    $expires_in Seconds it lasts, from now.
	 * @param bool   $can_spend  Whether it may spend credits.
	 */
	public static function put( $user_id, $token, $expires_at, $expires_in, $can_spend ) {
		$life = max( 0, (int) $expires_in - self::MIN_LEFT );
		if ( $life <= 0 ) {
			return;
		}
		set_transient(
			self::PREFIX . (int) $user_id,
			array(
				'token'     => (string) $token,
				'expiresAt' => (string) $expires_at,
				'expires'   => time() + (int) $expires_in,
				'canSpend'  => (bool) $can_spend,
			),
			$life
		);
		$users = get_option( self::USERS_OPTION, array() );
		$users = is_array( $users ) ? $users : array();
		if ( ! in_array( (int) $user_id, $users, true ) ) {
			$users[] = (int) $user_id;
			update_option( self::USERS_OPTION, array_slice( $users, -50 ), false );
		}
	}

	/**
	 * Forget one user's session.
	 *
	 * @param int $user_id WordPress user id.
	 */
	public static function clear( $user_id ) {
		delete_transient( self::PREFIX . (int) $user_id );
	}

	/**
	 * Forget every cached session (the connection changed or ended).
	 */
	public static function clear_all() {
		$users = get_option( self::USERS_OPTION, array() );
		foreach ( is_array( $users ) ? $users : array() as $user_id ) {
			delete_transient( self::PREFIX . (int) $user_id );
		}
		delete_option( self::USERS_OPTION );
	}
}
