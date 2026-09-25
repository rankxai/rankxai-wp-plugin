<?php
/**
 * What RankX AI pushes to the Overview, and what the Overview reads back.
 *
 * The plugin never calls out: a connected account PUTs a summary here, the same
 * way it pushes the crawler list. One summary is kept per connection, because
 * one site can be connected to two RankX AI projects, and the Overview names
 * the project a summary came from rather than showing whichever wrote last.
 *
 * Everything in a summary is written by a remote caller and becomes admin-page
 * HTML, so only the documented keys are kept, each checked, the whole body is
 * size-capped, and every value is escaped when it is printed.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Pushed summaries.
 */
class RankXAI_Summary {

	/** Summaries, keyed by connection id. Not autoloaded. */
	const OPTION = 'rankxai_summaries';

	/** Largest body accepted. */
	const MAX_BYTES = 16384;

	/** Most connections kept. */
	const MAX_CONNECTIONS = 5;

	/** A summary older than this is labelled stale. */
	const STALE_AFTER = 7 * DAY_IN_SECONDS;

	/**
	 * Validate and store one summary.
	 *
	 * @param mixed  $input Decoded body.
	 * @param string $raw   Raw body, for the size check.
	 * @return array|WP_Error What was stored, or why it was refused.
	 */
	public static function save( $input, $raw ) {
		if ( strlen( (string) $raw ) > self::MAX_BYTES ) {
			return self::error( sprintf( 'the body must be at most %d bytes', self::MAX_BYTES ) );
		}
		if ( ! is_array( $input ) ) {
			return self::error( 'the body must be an object' );
		}
		$id = isset( $input['connectionId'] ) ? $input['connectionId'] : '';
		if ( ! is_string( $id ) || ! preg_match( '/^[A-Za-z0-9-]{1,64}$/', $id ) ) {
			return self::error( 'connectionId must be 1 to 64 letters, digits or hyphens' );
		}
		$at = isset( $input['generatedAt'] ) ? $input['generatedAt'] : '';
		if ( ! is_string( $at ) || false === strtotime( $at ) || strlen( $at ) > 40 ) {
			return self::error( 'generatedAt must be a date' );
		}

		$rates = array();
		foreach ( isset( $input['mentionRates'] ) && is_array( $input['mentionRates'] ) ? array_slice( $input['mentionRates'], 0, 10 ) : array() as $rate ) {
			if ( ! is_array( $rate ) || ! self::text( isset( $rate['label'] ) ? $rate['label'] : null, 40 ) || ! self::count( isset( $rate['mentioned'] ) ? $rate['mentioned'] : null ) || ! self::count( isset( $rate['checks'] ) ? $rate['checks'] : null ) || $rate['mentioned'] > $rate['checks'] ) {
				return self::error( 'each mention rate needs a label, and mentioned and checks as counts with mentioned no more than checks' );
			}
			$rates[] = array(
				'label'     => $rate['label'],
				'mentioned' => (int) $rate['mentioned'],
				'checks'    => (int) $rate['checks'],
			);
		}
		$paths = array();
		$read  = isset( $input['readNotCited'] ) && is_array( $input['readNotCited'] ) ? $input['readNotCited'] : array();
		foreach ( isset( $read['paths'] ) && is_array( $read['paths'] ) ? array_slice( $read['paths'], 0, 20 ) : array() as $path ) {
			if ( ! self::text( $path, 300 ) || '/' !== substr( $path, 0, 1 ) ) {
				return self::error( 'readNotCited.paths must be root-relative paths' );
			}
			$paths[] = $path;
		}
		$app = isset( $input['appUrl'] ) ? $input['appUrl'] : '';
		if ( ! is_string( $app ) || 0 !== strpos( $app, 'https://' ) || strlen( $app ) > 200 ) {
			return self::error( 'appUrl must be an https address' );
		}

		$summary = array(
			'connectionId' => $id,
			'projectName'  => self::text( isset( $input['projectName'] ) ? $input['projectName'] : null, 120 ) ? $input['projectName'] : '',
			'generatedAt'  => $at,
			'windowDays'   => self::count( isset( $input['windowDays'] ) ? $input['windowDays'] : null ) ? (int) $input['windowDays'] : 30,
			'accountState' => isset( $input['accountState'] ) && 'paused' === $input['accountState'] ? 'paused' : 'active',
			'mentionRates' => $rates,
			'readNotCited' => array(
				'count' => self::count( isset( $read['count'] ) ? $read['count'] : null ) ? (int) $read['count'] : count( $paths ),
				'paths' => $paths,
			),
			'openTasks'    => self::count( isset( $input['openTasks'] ) ? $input['openTasks'] : null ) ? (int) $input['openTasks'] : 0,
			'appUrl'       => $app,
			'receivedAt'   => gmdate( 'c' ),
		);

		$all        = self::all();
		$all[ $id ] = $summary;
		uasort(
			$all,
			function ( $a, $b ) {
				return strcmp( $b['receivedAt'], $a['receivedAt'] );
			}
		);
		update_option( self::OPTION, array_slice( $all, 0, self::MAX_CONNECTIONS, true ), false );
		return $summary;
	}

	/**
	 * Is this a string of printable text no longer than a limit?
	 *
	 * @param mixed $value Candidate.
	 * @param int   $max   Most characters.
	 * @return bool
	 */
	private static function text( $value, $max ) {
		return is_string( $value ) && '' !== $value && mb_strlen( $value ) <= $max && ! preg_match( '/[\x00-\x1F\x7F]/', $value );
	}

	/**
	 * Is this a non-negative integer?
	 *
	 * @param mixed $value Candidate.
	 * @return bool
	 */
	private static function count( $value ) {
		return is_int( $value ) && $value >= 0;
	}

	/**
	 * A refusal.
	 *
	 * @param string $message Why.
	 * @return WP_Error
	 */
	private static function error( $message ) {
		return new WP_Error( 'rankxai_summary_invalid', $message, array( 'status' => 400 ) );
	}

	/**
	 * Every stored summary, newest first.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public static function all() {
		$all = get_option( self::OPTION, array() );
		return is_array( $all ) ? $all : array();
	}

	/**
	 * The newest summary, or null.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function latest() {
		$all = self::all();
		return $all ? reset( $all ) : null;
	}

	/**
	 * Is a summary older than the stale mark?
	 *
	 * @param array $summary Summary.
	 * @return bool
	 */
	public static function is_stale( $summary ) {
		return time() - (int) strtotime( (string) $summary['generatedAt'] ) > self::STALE_AFTER;
	}
}
