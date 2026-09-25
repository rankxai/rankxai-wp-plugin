<?php
/**
 * Tests in core's Site Health screen.
 *
 * Each returns "good" unless something is really wrong now, because a
 * "recommended" result is also counted by core's own Dashboard widget, and a
 * test that nags is a notice by another route. The robots.txt test asks the
 * site for its own file, so it runs asynchronously and never slows the Site
 * Health screen. A test core already performs is not repeated.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Site Health tests.
 */
class RankXAI_Site_Health {

	/** The REST route core's Site Health screen calls for the robots test. */
	const ROBOTS_ROUTE = '/site-health/robots';

	/**
	 * Register the tests.
	 */
	public static function init() {
		add_filter( 'site_status_tests', array( __CLASS__, 'register' ) );
	}

	/**
	 * Add this plugin's tests to core's list.
	 *
	 * @param array $tests Core's tests.
	 * @return array
	 */
	public static function register( $tests ) {
		if ( ! is_array( $tests ) ) {
			return $tests;
		}
		$tests['async']['rankxai_ai_robots'] = array(
			'label'             => __( 'AI assistants and robots.txt', 'rankxai' ),
			'test'              => rest_url( RankXAI_REST::NAMESPACE_V1 . self::ROBOTS_ROUTE ),
			'has_rest'          => true,
			'async_direct_test' => array( __CLASS__, 'robots_test' ),
		);
		if ( RankXAI_Crawlers::enabled() ) {
			$tests['direct']['rankxai_crawler_errors'] = array(
				'label' => __( 'AI crawlers and error pages', 'rankxai' ),
				'test'  => array( __CLASS__, 'errors_test' ),
			);
		}
		// Core has its own test for this since WordPress 6.9.
		if ( ! isset( $tests['direct']['search_engine_visibility'] ) ) {
			$tests['direct']['rankxai_search_visibility'] = array(
				'label' => __( 'Search engine visibility', 'rankxai' ),
				'test'  => array( __CLASS__, 'visibility_test' ),
			);
		}
		return $tests;
	}

	/**
	 * A result in core's shape.
	 *
	 * @param string $test        Test id.
	 * @param string $status      good, recommended or critical.
	 * @param string $label       Result title.
	 * @param string $description Plain text.
	 * @param string $action_url  Where to fix it, or ''.
	 * @param string $action      Link text.
	 * @return array
	 */
	private static function result( $test, $status, $label, $description, $action_url = '', $action = '' ) {
		return array(
			'label'       => $label,
			'status'      => $status,
			'badge'       => array(
				'label' => __( 'RankX AI', 'rankxai' ),
				'color' => 'blue',
			),
			'description' => '<p>' . esc_html( $description ) . '</p>',
			'actions'     => '' === $action_url ? '' : '<p><a href="' . esc_url( $action_url ) . '">' . esc_html( $action ) . '</a></p>',
			'test'        => $test,
		);
	}

	/**
	 * Does robots.txt block an AI assistant's search or fetch crawler?
	 *
	 * @return array
	 */
	public static function robots_test() {
		$robots = RankXAI_Robots::reading();
		$link   = self::crawlers_page() . '#rankxai-robots';
		if ( 'ok' !== $robots['state'] ) {
			return self::result( 'rankxai_ai_robots', 'good', __( 'robots.txt does not block AI assistants', 'rankxai' ), 'absent' === $robots['state'] ? __( 'This site serves no robots.txt, so AI assistants may read every page.', 'rankxai' ) : __( 'robots.txt could not be read just now, so nothing is reported.', 'rankxai' ) );
		}
		$parsed  = RankXAI_Robots::parse( $robots['body'] );
		$blocked = array();
		foreach ( RankXAI_Robots::assess( $parsed ) as $verdict ) {
			if ( 'blocked' === $verdict['access'] && 'training' !== $verdict['crawler']['purpose'] ) {
				$blocked[] = $verdict['crawler']['assistant'];
			}
		}
		$blocked = array_values( array_unique( $blocked ) );
		if ( ! $blocked ) {
			return self::result( 'rankxai_ai_robots', 'good', __( 'robots.txt lets AI assistants read this site', 'rankxai' ), __( 'No AI search or fetch crawler is blocked by robots.txt.', 'rankxai' ) );
		}
		return self::result(
			'rankxai_ai_robots',
			'recommended',
			__( 'AI search assistants are blocked by robots.txt', 'rankxai' ),
			sprintf(
				/* translators: %s: list of AI assistants. */
				__( 'robots.txt stops %s from reading this site, so they cannot show or cite your pages. If that is deliberate, you can ignore this.', 'rankxai' ),
				implode( ', ', $blocked )
			),
			$link,
			__( 'See the rules and how to change them', 'rankxai' )
		);
	}

	/**
	 * Are AI crawlers getting error answers?
	 *
	 * @return array
	 */
	public static function errors_test() {
		$errors = RankXAI_Crawlers::credible_errors( 7 );
		if ( ! $errors ) {
			return self::result( 'rankxai_crawler_errors', 'good', __( 'AI crawlers are not hitting error pages', 'rankxai' ), __( 'No error answers to AI crawlers in the last 7 days, among the visits that reached WordPress.', 'rankxai' ) );
		}
		return self::result(
			'rankxai_crawler_errors',
			'recommended',
			__( 'AI crawlers are receiving errors', 'rankxai' ),
			sprintf(
				/* translators: %d: number of addresses. */
				_n( 'AI crawlers got an error answer from %d address on this site in the last 7 days.', 'AI crawlers got an error answer from %d addresses on this site in the last 7 days.', count( $errors ), 'rankxai' ),
				count( $errors )
			),
			self::crawlers_page(),
			__( 'See which pages, and what to do', 'rankxai' )
		);
	}

	/**
	 * Is the site asking search engines not to index it?
	 *
	 * @return array
	 */
	public static function visibility_test() {
		if ( '0' !== (string) get_option( 'blog_public' ) ) {
			return self::result( 'rankxai_search_visibility', 'good', __( 'Search engines may index this site', 'rankxai' ), __( 'Settings → Reading does not discourage search engines.', 'rankxai' ) );
		}
		return self::result(
			'rankxai_search_visibility',
			'recommended',
			__( 'Search engines are discouraged on this site', 'rankxai' ),
			__( 'Settings → Reading asks search engines not to index this site, and AI search assistants follow the same request.', 'rankxai' ),
			admin_url( 'options-reading.php' ),
			__( 'Open Reading settings', 'rankxai' )
		);
	}

	/**
	 * The AI crawlers page. Built here because the admin class is not loaded in
	 * the REST request core's Site Health screen makes.
	 *
	 * @return string
	 */
	private static function crawlers_page() {
		return admin_url( 'admin.php?page=rankxai-crawlers' );
	}

	/**
	 * The REST answer for core's asynchronous test.
	 *
	 * @return WP_REST_Response
	 */
	public static function handle_robots_rest() {
		return new WP_REST_Response( self::robots_test(), 200 );
	}
}
