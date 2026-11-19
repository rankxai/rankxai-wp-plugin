<?php
/**
 * Print a post's schema once: inside the SEO plugin's graph, or on its own.
 *
 * Decided per request, so a page never carries two graphs. If the SEO plugin's
 * graph never asks for our nodes, they are printed in the footer instead.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Schema output.
 */
class RankXAI_Schema_Output {

	/**
	 * Nodes for this request.
	 *
	 * @var array<int, array<string, mixed>>
	 */
	private static $nodes = array();

	/**
	 * Whether the SEO plugin's graph took our nodes on this request.
	 *
	 * @var bool
	 */
	private static $joined = false;

	/**
	 * Hook the per-request decision.
	 */
	public static function init() {
		add_action( 'wp', array( __CLASS__, 'prepare' ), 20 );
	}

	/**
	 * How this post's schema will be printed.
	 *
	 * @param int $post_id Post ID.
	 * @return array{kind: string, provider: string, hook: string, location: string}
	 */
	public static function plan( $post_id ) {
		$active  = RankXAI_Schema_Providers::active();
		$unknown = RankXAI_Schema_Providers::unknown_active();

		if ( ! $active && ! $unknown ) {
			return self::plan_row( 'standalone', '', '', 'wp_head' );
		}
		if ( ! $active ) {
			// An unknown SEO plugin: there is no graph we can join.
			return self::plan_row( 'separate_script', '', '', 'wp_head' );
		}

		$provider = $active[0];
		$chosen   = RankXAI_Schema_Set::read_store( $post_id )['provider'];
		if ( '' !== $chosen && in_array( $chosen, $active, true ) ) {
			$provider = $chosen;
		}

		$graph = RankXAI_Schema_Providers::graph( $provider );
		if ( '' === $graph['hook'] ) {
			return self::plan_row( 'separate_script', $provider, '', 'wp_head' );
		}
		if ( false === RankXAI_Schema_Providers::graph_enabled( $provider ) ) {
			// Its structured data is switched off, so there is no graph to join.
			return self::plan_row( 'separate_script', $provider, '', 'wp_head' );
		}
		return self::plan_row( 'inject', $provider, $graph['hook'], $graph['location'] );
	}

	/**
	 * One plan row.
	 *
	 * @param string $kind     standalone | inject | separate_script.
	 * @param string $provider Provider slug or ''.
	 * @param string $hook     Filter joined, or ''.
	 * @param string $location Where it prints.
	 * @return array{kind: string, provider: string, hook: string, location: string}
	 */
	private static function plan_row( $kind, $provider, $hook, $location ) {
		return array(
			'kind'     => $kind,
			'provider' => $provider,
			'hook'     => $hook,
			'location' => $location,
		);
	}

	/**
	 * Decide, once the main query is known.
	 */
	public static function prepare() {
		if ( is_admin() || is_feed() || ! is_singular() ) {
			return;
		}
		$post_id = get_queried_object_id();
		if ( ! $post_id || post_password_required( $post_id ) ) {
			// A graph would publish what the password withholds.
			return;
		}
		$nodes = RankXAI_Schema_Set::nodes_to_print( $post_id );
		// A breadcrumb fill joins the same graph.
		$crumb = RankXAI_Fill::breadcrumb_node();
		if ( $crumb ) {
			$nodes[] = $crumb;
		}
		if ( ! $nodes ) {
			return;
		}
		self::$nodes  = $nodes;
		self::$joined = false;

		$plan = self::plan( $post_id );
		if ( 'inject' === $plan['kind'] && RankXAI_Schema_Providers::register_inject( $plan['provider'], array( __CLASS__, 'take' ) ) ) {
			add_action( 'wp_footer', array( __CLASS__, 'fallback' ), 1000 );
			return;
		}
		add_action( 'wp_head', array( __CLASS__, 'print_own' ), 20 );
	}

	/**
	 * Hand our nodes to the SEO plugin's graph, and remember that it asked.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function take() {
		self::$joined = true;
		return self::$nodes;
	}

	/**
	 * The graph was never built on this request: print ours rather than lose it.
	 */
	public static function fallback() {
		if ( ! self::$joined && self::$nodes ) {
			self::print_script( self::$nodes );
		}
	}

	/**
	 * Print our own graph in the head.
	 */
	public static function print_own() {
		if ( self::$nodes ) {
			self::print_script( self::$nodes );
		}
	}

	/**
	 * One script element holding one graph.
	 *
	 * @param array<int, array<string, mixed>> $nodes Nodes.
	 */
	private static function print_script( $nodes ) {
		$json = wp_json_encode(
			array(
				'@context' => 'https://schema.org',
				'@graph'   => array_values( $nodes ),
			),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		);
		if ( ! is_string( $json ) ) {
			return;
		}
		// Core's helper prints the element the way WordPress prints its own.
		wp_print_inline_script_tag(
			RankXAI_Schema::escape_for_script( $json ),
			array(
				'type'  => 'application/ld+json',
				'class' => 'rankxai-schema',
			)
		);
	}
}
