<?php
/**
 * "Add redirect" from the plugin's own pages, for an address AI crawlers or a
 * site check found missing.
 *
 * Rank Math and the Redirection plugin redirect LIVE pages too, so a redirect
 * for an address that works would hide the page. Two checks stand in front of
 * every write: the address must not belong to a published post, and a request
 * to it must answer "not found". The second is a request to this site, so it
 * runs in WP-Cron (see RankXAI_Loopback) and the result is shown when it lands.
 *
 * The redirect goes into the site's own redirect manager when it has one this
 * plugin can write to and read back, otherwise into this plugin's own list,
 * which only ever answers a missing page. It never goes into two.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Pending and settled redirect requests.
 */
class RankXAI_Redirect_Requests {

	/** Requests, newest first. Not autoloaded. */
	const OPTION = 'rankxai_redirect_requests';

	/** The WP-Cron event that confirms and writes one request. */
	const HOOK = 'rankxai_confirm_redirect';

	/** How many requests are kept for the pages to show. */
	const KEEP = 20;

	/** Stored crawler paths are cut at this length, so one this long may be truncated. */
	const MAX_SOURCE = 254;

	/**
	 * Hook the confirmation.
	 */
	public static function init() {
		add_action( self::HOOK, array( __CLASS__, 'confirm' ) );
	}

	/**
	 * Which redirect manager a redirect from this site's own pages goes into.
	 *
	 * @return array{backend: string, label: string, reason: string}
	 */
	public static function backend() {
		$managers = RankXAI_Redirects::managers();
		if ( $managers['redirection']['active'] ) {
			if ( RankXAI_Redirects::redirection_ready() ) {
				return self::choice( 'redirection', __( 'the Redirection plugin', 'rankxai' ), '' );
			}
			return self::choice( '', __( 'the Redirection plugin', 'rankxai' ), __( 'The Redirection plugin manages redirects on this site, and this version of it cannot be written to from here. Add the redirect in Tools → Redirection.', 'rankxai' ) );
		}
		$rank_math = $managers['rank_math'];
		if ( $rank_math['active'] ) {
			if ( $rank_math['ready'] ) {
				return self::choice( 'rank_math', __( 'Rank Math', 'rankxai' ), '' );
			}
			if ( 'module_off' === $rank_math['reason'] ) {
				return self::choice( '', __( 'Rank Math', 'rankxai' ), __( 'Rank Math\'s Redirections module is off. Switch it on in Rank Math → Dashboard → Modules, then add the redirect here. RankX AI never switches another plugin\'s modules.', 'rankxai' ) );
			}
			if ( 'setup_incomplete' === $rank_math['reason'] ) {
				return self::choice( '', __( 'Rank Math', 'rankxai' ), __( 'Rank Math\'s setup wizard has not been completed or skipped, so its redirects are not active yet. Finish it in Rank Math → Dashboard.', 'rankxai' ) );
			}
		}
		foreach ( array(
			'yoast_premium' => __( 'Yoast SEO Premium', 'rankxai' ),
			'aioseo'        => __( 'All in One SEO', 'rankxai' ),
			'seopress_pro'  => __( 'SEOPress PRO', 'rankxai' ),
		) as $key => $label ) {
			if ( ! empty( $managers[ $key ]['active'] ) ) {
				return self::choice(
					'',
					$label,
					sprintf(
						/* translators: %s: name of an SEO plugin. */
						__( '%s manages redirects on this site and keeps them where this plugin cannot read them back, so add the redirect there.', 'rankxai' ),
						$label
					)
				);
			}
		}
		return self::choice( 'own_store', __( 'this plugin\'s own list', 'rankxai' ), '' );
	}

	/**
	 * One backend choice.
	 *
	 * @param string $backend Backend, or '' when none can be used.
	 * @param string $label   Name of it.
	 * @param string $reason  Why none can be used.
	 * @return array{backend: string, label: string, reason: string}
	 */
	private static function choice( $backend, $label, $reason ) {
		return array(
			'backend' => $backend,
			'label'   => $label,
			'reason'  => $reason,
		);
	}

	/**
	 * Can this address be offered an "Add redirect" button at all?
	 *
	 * @param string $path Source path.
	 * @return bool
	 */
	public static function offerable( $path ) {
		return '' === RankXAI_Redirects::path_rejection( $path )
			&& strlen( $path ) <= self::MAX_SOURCE
			&& ! RankXAI_Crawlers::is_probe_path( $path );
	}

	/**
	 * The published post an address belongs to, or 0.
	 *
	 * @param string $path Root-relative path.
	 * @return int
	 */
	private static function live_post( $path ) {
		$id = url_to_postid( home_url( $path ) );
		return $id > 0 && 'publish' === get_post_status( $id ) ? $id : 0;
	}

	/**
	 * Is this a destination a redirect may point at: the home page, or a
	 * published post or page on this site?
	 *
	 * @param string $path Root-relative path.
	 * @return bool
	 */
	public static function valid_destination( $path ) {
		if ( '' !== RankXAI_Redirects::path_rejection( $path ) ) {
			return false;
		}
		return '/' === RankXAI_Redirects::normalise( $path ) || self::live_post( $path ) > 0;
	}

	/**
	 * Destinations to choose from: the 100 most recently updated published pages
	 * and posts. Any other published address can be typed as a path.
	 *
	 * @return array<int, array{path: string, title: string}>
	 */
	public static function destinations() {
		$out   = array(
			array(
				'path'  => '/',
				'title' => __( 'Home page', 'rankxai' ),
			),
		);
		$query = new WP_Query(
			array(
				'post_type'              => array( 'page', 'post' ),
				'post_status'            => 'publish',
				'posts_per_page'         => 100,
				'orderby'                => 'modified',
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			)
		);
		foreach ( $query->posts as $post ) {
			$path = (string) wp_parse_url( (string) get_permalink( $post ), PHP_URL_PATH );
			if ( '' !== $path && '' === RankXAI_Redirects::path_rejection( $path ) ) {
				$out[] = array(
					'path'  => $path,
					'title' => get_the_title( $post ),
				);
			}
		}
		return $out;
	}

	/**
	 * Ask for a redirect. Refuses at once what can be refused at once, and
	 * otherwise schedules the check that writes it.
	 *
	 * @param string $from   Source path.
	 * @param string $to     Destination path.
	 * @param string $source 'crawlers' or 'checks', for the page that shows the result.
	 * @return array{state: string, message: string}
	 */
	public static function request( $from, $to, $source ) {
		if ( ! self::offerable( $from ) ) {
			return self::verdict( 'refused', __( 'That address cannot be redirected from here.', 'rankxai' ) );
		}
		if ( ! self::valid_destination( $to ) ) {
			return self::verdict( 'refused', __( 'Choose a published page on this site as the destination.', 'rankxai' ) );
		}
		if ( RankXAI_Redirects::normalise( $from ) === RankXAI_Redirects::normalise( $to ) ) {
			return self::verdict( 'refused', __( 'A redirect cannot point at its own address.', 'rankxai' ) );
		}
		if ( self::live_post( $from ) > 0 ) {
			return self::verdict( 'refused', __( 'That address is a published page, so a redirect would hide it. Nothing was added.', 'rankxai' ) );
		}
		$backend = self::backend();
		if ( '' === $backend['backend'] ) {
			return self::verdict( 'refused', $backend['reason'] );
		}

		$id         = strtolower( wp_generate_password( 10, false, false ) );
		$requests   = self::all();
		$requests[] = array(
			'id'        => $id,
			'from'      => RankXAI_Redirects::normalise( $from ),
			'asked'     => $from,
			'to'        => $to,
			'backend'   => $backend['backend'],
			'source'    => 'checks' === $source ? 'checks' : 'crawlers',
			'state'     => 'checking',
			'message'   => '',
			'requested' => gmdate( 'c' ),
		);
		self::save( $requests );

		wp_schedule_single_event( time(), self::HOOK, array( $id ) );
		if ( ! ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) ) {
			spawn_cron();
		}
		return self::verdict( 'checking', __( 'Checking that the address is still missing, then adding the redirect. The result appears here in a moment.', 'rankxai' ) );
	}

	/**
	 * A verdict to show.
	 *
	 * @param string $state   State.
	 * @param string $message Sentence.
	 * @return array{state: string, message: string}
	 */
	private static function verdict( $state, $message ) {
		return array(
			'state'   => $state,
			'message' => $message,
		);
	}

	/**
	 * WP-Cron: confirm the address is missing, then write the redirect.
	 *
	 * @param string $id Request id.
	 */
	public static function confirm( $id ) {
		$requests = self::all();
		$index    = null;
		foreach ( $requests as $i => $request ) {
			if ( $request['id'] === $id && 'checking' === $request['state'] ) {
				$index = $i;
			}
		}
		if ( null === $index ) {
			return;
		}
		$request = $requests[ $index ];
		// Ask for the address exactly as it was found: without its trailing slash a
		// live page answers core's canonical redirect instead of 200.
		$asked = isset( $request['asked'] ) ? $request['asked'] : $request['from'];

		$response = RankXAI_Loopback::request( RankXAI_Loopback::url( $asked ), 'HEAD' );
		if ( 405 === $response['status'] ) {
			$response = RankXAI_Loopback::request( RankXAI_Loopback::url( $asked ), 'GET' );
		}
		$status = $response['status'];

		if ( 404 === $status || 410 === $status ) {
			$result = 'redirection' === $request['backend']
				? RankXAI_Redirects::create_in_redirection( $request['from'], $request['to'], 301 )
				: RankXAI_Redirects::create( $request['backend'], $request['from'], $request['to'], 301 );
			if ( '' === $result['error'] ) {
				RankXAI_Redirects::purge( $request['from'] );
				$request['state']   = 'added';
				$request['message'] = __( 'Added. The address answered "not found", so the redirect cannot hide a page.', 'rankxai' );
			} elseif ( 'exists' === $result['error'] ) {
				$request['state']   = 'refused';
				$request['message'] = __( 'That address already has a redirect.', 'rankxai' );
			} else {
				$request['state']   = 'failed';
				$request['message'] = __( 'The redirect manager did not store the redirect.', 'rankxai' );
			}
		} elseif ( $status >= 200 && $status < 400 ) {
			$request['state']   = 'refused';
			$request['message'] = sprintf(
				/* translators: %d: an HTTP status code. */
				__( 'Not added: the address now answers %d, so it is not missing and a redirect could hide a working page.', 'rankxai' ),
				$status
			);
		} else {
			$request['state']   = 'could_not_check';
			$request['message'] = 0 === $status
				? __( 'Not added: this site did not answer a request to itself, so we could not confirm the address is missing.', 'rankxai' )
				: sprintf(
					/* translators: %d: an HTTP status code. */
					__( 'Not added: the address answered %d, so we could not confirm it is missing.', 'rankxai' ),
					$status
				);
		}
		$request['settled'] = gmdate( 'c' );
		$requests[ $index ] = $request;
		self::save( $requests );
	}

	/**
	 * Every stored request, oldest first.
	 *
	 * @return array<int, array<string, string>>
	 */
	public static function all() {
		$stored = get_option( self::OPTION, array() );
		return is_array( $stored ) ? array_values( $stored ) : array();
	}

	/**
	 * Recent requests from one page, newest first.
	 *
	 * @param string $source 'crawlers' or 'checks'.
	 * @return array<int, array<string, string>>
	 */
	public static function recent( $source ) {
		$out = array();
		foreach ( array_reverse( self::all() ) as $request ) {
			if ( $request['source'] === $source ) {
				$out[] = $request;
			}
		}
		return array_slice( $out, 0, 5 );
	}

	/**
	 * Store requests, keeping the newest few.
	 *
	 * @param array $requests Requests, oldest first.
	 */
	private static function save( $requests ) {
		update_option( self::OPTION, array_slice( array_values( $requests ), -self::KEEP ), false );
	}
}
