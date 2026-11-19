<?php
/**
 * What each SEO plugin does with structured data, reported as facts.
 *
 * Per plugin: whether it is active, its version, whether it has a per-post
 * schema store, and which filter adds a node to the graph it prints.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * SEO plugin facts for structured data, plus Rank Math's per-post store.
 */
class RankXAI_Schema_Providers {

	/**
	 * Every SEO plugin we know. The order picks the graph to join when several run.
	 *
	 * @return string[]
	 */
	public static function slugs() {
		return array( 'rankmath', 'yoast', 'aioseo', 'seopress', 'tsf', 'slimseo', 'siteseo', 'surerank' );
	}

	/**
	 * Human names, for messages.
	 *
	 * @return array<string, string>
	 */
	public static function labels() {
		return array(
			'rankmath' => 'Rank Math',
			'yoast'    => 'Yoast SEO',
			'aioseo'   => 'All in One SEO',
			'seopress' => 'SEOPress',
			'tsf'      => 'The SEO Framework',
			'slimseo'  => 'Slim SEO',
			'siteseo'  => 'SiteSEO',
			'surerank' => 'SureRank',
		);
	}

	/**
	 * Is this plugin running on this request?
	 *
	 * @param string $slug Provider slug.
	 * @return bool
	 */
	public static function is_active( $slug ) {
		switch ( $slug ) {
			case 'rankmath':
				return defined( 'RANK_MATH_VERSION' );
			case 'yoast':
				return defined( 'WPSEO_VERSION' );
			case 'aioseo':
				return defined( 'AIOSEO_VERSION' );
			case 'seopress':
				return defined( 'SEOPRESS_VERSION' );
			case 'tsf':
				return defined( 'THE_SEO_FRAMEWORK_VERSION' );
			case 'slimseo':
				return defined( 'SLIM_SEO_VER' );
			case 'siteseo':
				return defined( 'SITESEO_VERSION' );
			case 'surerank':
				return defined( 'SURERANK_VERSION' );
		}
		return false;
	}

	/**
	 * Slugs of every known SEO plugin that is active.
	 *
	 * @return string[]
	 */
	public static function active() {
		$out = array();
		foreach ( self::slugs() as $slug ) {
			if ( self::is_active( $slug ) ) {
				$out[] = $slug;
			}
		}
		return $out;
	}

	/**
	 * Unknown SEO plugins declared through `rankxai_active_seo_plugins`.
	 *
	 * Reported only: we do not know where their graph is.
	 *
	 * @return string[]
	 */
	public static function unknown_active() {
		$known = self::slugs();
		$out   = array();
		foreach ( RankXAI_Detect::active_seo_plugins() as $slug ) {
			if ( ! in_array( $slug, $known, true ) ) {
				$out[] = (string) $slug;
			}
		}
		return $out;
	}

	/**
	 * The plugin's version string, or ''.
	 *
	 * @param string $slug Provider slug.
	 * @return string
	 */
	public static function version( $slug ) {
		$constants = array(
			'rankmath' => 'RANK_MATH_VERSION',
			'yoast'    => 'WPSEO_VERSION',
			'aioseo'   => 'AIOSEO_VERSION',
			'seopress' => 'SEOPRESS_VERSION',
			'tsf'      => 'THE_SEO_FRAMEWORK_VERSION',
			'slimseo'  => 'SLIM_SEO_VER',
			'siteseo'  => 'SITESEO_VERSION',
			'surerank' => 'SURERANK_VERSION',
		);
		if ( isset( $constants[ $slug ] ) && defined( $constants[ $slug ] ) ) {
			return (string) constant( $constants[ $slug ] );
		}
		return '';
	}

	/**
	 * Whether the paid edition is running, and its version when it says.
	 *
	 * @param string $slug Provider slug.
	 * @return array{present: bool, version: string}
	 */
	public static function paid( $slug ) {
		$present = false;
		$version = '';
		switch ( $slug ) {
			case 'rankmath':
				$present = defined( 'RANK_MATH_PRO_VERSION' ) || defined( 'RANK_MATH_PRO_FILE' );
				$version = defined( 'RANK_MATH_PRO_VERSION' ) ? (string) constant( 'RANK_MATH_PRO_VERSION' ) : '';
				break;
			case 'yoast':
				$present = defined( 'WPSEO_PREMIUM_FILE' ) || defined( 'WPSEO_PREMIUM_VERSION' );
				$version = defined( 'WPSEO_PREMIUM_VERSION' ) ? (string) constant( 'WPSEO_PREMIUM_VERSION' ) : '';
				break;
			case 'aioseo':
				$present = function_exists( 'aioseo' ) && ! empty( aioseo()->pro );
				break;
			case 'seopress':
				$present = defined( 'SEOPRESS_PRO_VERSION' );
				$version = $present ? (string) constant( 'SEOPRESS_PRO_VERSION' ) : '';
				break;
			case 'slimseo':
				$present = defined( 'SLIM_SEO_PRO_VER' );
				$version = $present ? (string) constant( 'SLIM_SEO_PRO_VER' ) : '';
				break;
			case 'siteseo':
				$present = defined( 'SITESEO_PRO_VERSION' );
				$version = $present ? (string) constant( 'SITESEO_PRO_VERSION' ) : '';
				break;
			case 'surerank':
				$present = defined( 'SURERANK_PRO_VERSION' );
				$version = $present ? (string) constant( 'SURERANK_PRO_VERSION' ) : '';
				break;
		}
		return array(
			'present' => $present,
			'version' => $version,
		);
	}

	/**
	 * Where the plugin prints its graph, and through which filter a node joins it.
	 *
	 * `hook` is '' for a plugin with no single graph to join.
	 *
	 * @param string $slug Provider slug.
	 * @return array{hook: string, location: string}
	 */
	public static function graph( $slug ) {
		$map = array(
			'rankmath' => array( 'rank_math/json_ld', 'wp_head' ),
			'yoast'    => array( 'wpseo_schema_graph', 'wp_head' ),
			'aioseo'   => array( 'aioseo_schema_output', 'wp_head' ),
			'seopress' => array( '', 'wp_head' ),
			'tsf'      => array( 'the_seo_framework_schema_graph_data', 'wp_head' ),
			'slimseo'  => array( 'slim_seo_schema_graph', 'wp_footer' ),
			// SEOPress and SiteSEO print separate scripts; SureRank's graph has no
			// usable filter. Ours prints beside theirs.
			'siteseo'  => array( '', 'wp_head' ),
			'surerank' => array( '', 'wp_head' ),
		);
		if ( ! isset( $map[ $slug ] ) ) {
			return array(
				'hook'     => '',
				'location' => '',
			);
		}
		return array(
			'hook'     => $map[ $slug ][0],
			'location' => $map[ $slug ][1],
		);
	}

	/**
	 * Whether the plugin's structured data output is switched on.
	 *
	 * Null where the plugin does not expose the answer; null does not mean on.
	 *
	 * @param string $slug Provider slug.
	 * @return bool|null
	 */
	public static function graph_enabled( $slug ) {
		switch ( $slug ) {
			case 'rankmath':
				if ( class_exists( '\RankMath\Helper' ) && method_exists( '\RankMath\Helper', 'is_module_active' ) ) {
					return (bool) \RankMath\Helper::is_module_active( 'rich-snippet' );
				}
				return null;
			case 'yoast':
				if ( class_exists( 'WPSEO_Options' ) && method_exists( 'WPSEO_Options', 'get' ) ) {
					return (bool) WPSEO_Options::get( 'enable_schema', true );
				}
				return null;
			case 'aioseo':
				if ( function_exists( 'aioseo' ) && isset( aioseo()->schema->helpers ) && method_exists( aioseo()->schema->helpers, 'isEnabled' ) ) {
					return (bool) aioseo()->schema->helpers->isEnabled();
				}
				return null;
			case 'slimseo':
				$settings = get_option( 'slim_seo' );
				if ( is_array( $settings ) && ! empty( $settings['features'] ) && is_array( $settings['features'] ) ) {
					return in_array( 'schema', $settings['features'], true );
				}
				// No saved list means the defaults, which include schema.
				return true;
		}
		return null;
	}

	/**
	 * Everything known about one provider.
	 *
	 * @param string $slug Provider slug.
	 * @return array<string, mixed>
	 */
	public static function describe( $slug ) {
		$labels = self::labels();
		$graph  = self::graph( $slug );
		return array(
			'slug'         => $slug,
			'label'        => isset( $labels[ $slug ] ) ? $labels[ $slug ] : $slug,
			'active'       => self::is_active( $slug ),
			'version'      => self::version( $slug ),
			'paid'         => self::paid( $slug ),
			'graphHook'    => $graph['hook'],
			'location'     => $graph['location'],
			'graphEnabled' => self::is_active( $slug ) ? self::graph_enabled( $slug ) : null,
			'nativeStore'  => 'rankmath' === $slug ? self::rankmath_store_state() : array(
				'available' => false,
				'reason'    => 'no_per_post_store',
			),
		);
	}

	/**
	 * Register a callback that adds nodes to this provider's graph.
	 *
	 * The callback takes no arguments and returns the nodes to add.
	 *
	 * @param string   $slug     Provider slug.
	 * @param callable $nodes_cb Returns array of nodes.
	 * @return bool False when the provider has no graph to join.
	 */
	public static function register_inject( $slug, $nodes_cb ) {
		switch ( $slug ) {
			case 'rankmath':
				// After `connect_schema_entities` (99), which would otherwise fold a
				// FAQPage node into its WebPage and delete it.
				add_filter(
					'rank_math/json_ld',
					static function ( $data ) use ( $nodes_cb ) {
						if ( ! is_array( $data ) ) {
							return $data;
						}
						foreach ( call_user_func( $nodes_cb ) as $i => $node ) {
							$data[ 'rankxai-' . $i ] = $node;
						}
						return $data;
					},
					100
				);
				return true;
			case 'yoast':
				add_filter(
					'wpseo_schema_graph',
					static function ( $graph ) use ( $nodes_cb ) {
						if ( ! is_array( $graph ) ) {
							return $graph;
						}
						foreach ( call_user_func( $nodes_cb ) as $node ) {
							$graph[] = $node;
						}
						return $graph;
					},
					20
				);
				return true;
			case 'aioseo':
				add_filter(
					'aioseo_schema_output',
					static function ( $graph ) use ( $nodes_cb ) {
						if ( ! is_array( $graph ) ) {
							return $graph;
						}
						foreach ( call_user_func( $nodes_cb ) as $node ) {
							$graph[] = $node;
						}
						return $graph;
					},
					20
				);
				return true;
			case 'tsf':
				add_filter(
					'the_seo_framework_schema_graph_data',
					static function ( $graph, $args = null ) use ( $nodes_cb ) {
						// A non-null $args is a graph for some other query.
						if ( null !== $args || ! is_array( $graph ) ) {
							return $graph;
						}
						foreach ( call_user_func( $nodes_cb ) as $node ) {
							$graph[] = $node;
						}
						return $graph;
					},
					20,
					2
				);
				return true;
			case 'slimseo':
				add_filter(
					'slim_seo_schema_graph',
					static function ( $graph ) use ( $nodes_cb ) {
						if ( ! is_array( $graph ) ) {
							return $graph;
						}
						foreach ( call_user_func( $nodes_cb ) as $i => $node ) {
							$graph[ 'rankxai-' . $i ] = $node;
						}
						return $graph;
					},
					20
				);
				return true;
		}
		return false;
	}

	// -----------------------------------------------------------------------
	// Rank Math's per-post store
	// -----------------------------------------------------------------------

	/**
	 * Whether Rank Math's per-post schema store can be read and written.
	 *
	 * Checks for the classes and methods used below, so a renamed one reads as
	 * unavailable rather than failing mid-write.
	 *
	 * @return array{available: bool, reason: string}
	 */
	public static function rankmath_store_state() {
		if ( ! defined( 'RANK_MATH_VERSION' ) ) {
			return array(
				'available' => false,
				'reason'    => 'not_active',
			);
		}
		$needs = array(
			array( '\RankMath\Schema\DB', 'get_schemas' ),
			array( '\RankMath\Rest\Sanitize', 'get' ),
		);
		foreach ( $needs as $need ) {
			if ( ! class_exists( $need[0] ) || ! method_exists( $need[0], $need[1] ) ) {
				return array(
					'available' => false,
					'reason'    => 'format_unrecognised',
				);
			}
		}
		if ( ! self::graph_enabled( 'rankmath' ) ) {
			return array(
				'available' => false,
				'reason'    => 'schema_module_off',
			);
		}
		return array(
			'available' => true,
			'reason'    => '',
		);
	}

	/**
	 * Rank Math's schema rows for a post, keyed by meta id.
	 *
	 * Read from the database, bypassing Rank Math's per-request copy, so a read
	 * straight after a write is current.
	 *
	 * @param int $post_id Post ID.
	 * @return array<int, array<string, mixed>>
	 */
	public static function rankmath_rows( $post_id ) {
		$state = self::rankmath_store_state();
		if ( ! $state['available'] ) {
			return array();
		}
		$rows = \RankMath\Schema\DB::get_schemas( $post_id, 'postmeta', true );
		$out  = array();
		if ( ! is_array( $rows ) ) {
			return $out;
		}
		foreach ( $rows as $key => $value ) {
			$mid = absint( str_replace( 'schema-', '', (string) $key ) );
			if ( $mid > 0 && is_array( $value ) ) {
				$out[ $mid ] = $value;
			}
		}
		ksort( $out );
		return $out;
	}

	/**
	 * What Rank Math would store for this schema, without storing it.
	 *
	 * The same steps as its `updateSchemas` route: its sanitiser, `@type` reduced
	 * to letters and digits, then `wp_kses_post_deep`.
	 *
	 * @param array<string, mixed> $schema Schema including `metadata`.
	 * @return array<string, mixed>
	 */
	public static function rankmath_normalise( $schema ) {
		$schema = \RankMath\Rest\Sanitize::get()->sanitize( 'rank_math_schema', $schema );
		if ( isset( $schema['@type'] ) ) {
			if ( is_array( $schema['@type'] ) ) {
				foreach ( $schema['@type'] as $k => $t ) {
					$schema['@type'][ $k ] = preg_replace( '/[^a-zA-Z0-9]/', '', (string) $t );
				}
			} else {
				$schema['@type'] = preg_replace( '/[^a-zA-Z0-9]/', '', (string) $schema['@type'] );
			}
		}
		return wp_kses_post_deep( $schema );
	}

	/**
	 * Add or replace one row through Rank Math's own `updateSchemas` route.
	 *
	 * Using its own route gives exactly what its editor produces. The value is
	 * slashed because `add_metadata` unslashes.
	 *
	 * @param int                  $post_id Post ID.
	 * @param array<string, mixed> $schema  Schema including `metadata`.
	 * @param int                  $mid     Existing meta id to replace, or 0 to add.
	 * @return int|WP_Error Meta id written.
	 */
	public static function rankmath_upsert( $post_id, $schema, $mid ) {
		$key     = $mid > 0 ? 'schema-' . $mid : 'new-rankxai';
		$request = new WP_REST_Request( 'POST', '/rankmath/v1/updateSchemas' );
		$request->set_param( 'objectType', 'post' );
		$request->set_param( 'objectID', (int) $post_id );
		$request->set_param( 'schemas', array( $key => wp_slash( $schema ) ) );

		$response = rest_do_request( $request );
		if ( $response->is_error() ) {
			$error = $response->as_error();
			return new WP_Error( 'rankxai_provider_refused', $error->get_error_message(), array( 'status' => 409 ) );
		}
		if ( $mid > 0 ) {
			return $mid;
		}
		$data = $response->get_data();
		if ( is_array( $data ) && ! empty( $data[ $key ] ) ) {
			return (int) $data[ $key ];
		}
		return new WP_Error( 'rankxai_provider_refused', __( 'Rank Math did not report the new schema row.', 'rankxai' ), array( 'status' => 409 ) );
	}

	/**
	 * Remove one row the way Rank Math's editor does.
	 *
	 * Unlike its editor, this leaves `rank_math_rich_snippet` alone, so removing
	 * the last row we added restores Rank Math's default schema.
	 *
	 * @param int $post_id Post ID.
	 * @param int $mid     Meta id.
	 * @return bool
	 */
	public static function rankmath_delete( $post_id, $mid ) {
		$rows = self::rankmath_rows( $post_id );
		if ( ! isset( $rows[ $mid ] ) ) {
			return false;
		}
		$row = $rows[ $mid ];
		if ( ! empty( $row['metadata']['shortcode'] ) ) {
			delete_metadata( 'post', $post_id, 'rank_math_shortcode_schema_' . $row['metadata']['shortcode'] );
		}
		return (bool) delete_metadata_by_mid( 'post', $mid );
	}
}
