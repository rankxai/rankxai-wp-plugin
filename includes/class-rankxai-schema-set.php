<?php
/**
 * A post's schema, managed item by item, wherever it lives.
 *
 * Three places a schema can live, and this reads all three as one list:
 *
 *   - Rank Math's own per-post rows (`rank_math_schema_{Type}`), which its
 *     schema editor shows and can edit;
 *   - our own set (`_rankxai_schemas`), for plugins with no per-post store
 *     and for sites with no SEO plugin at all;
 *   - the older single document (`_rankxai_schema`), written by the dashboard's
 *     AI-readiness publisher. Listed here so nothing is hidden, and never
 *     written here: that publisher owns it.
 *
 * Every write takes the `schemaVersion` the caller last read, under a database
 * lock, and refuses if the set has moved. Post meta writes do not touch
 * `post_modified`, so a timestamp could not protect them.
 *
 * Nothing here decides which schema belongs where, or whether a write worked.
 * It stores what it is sent and reports what is stored.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Per-post schema: read, lock, write.
 */
class RankXAI_Schema_Set {

	/**
	 * Our set: `{version, provider, items[{id, type, schema, createdAt, updatedAt}]}`
	 * as JSON. Protected meta, not registered for REST.
	 */
	const META = '_rankxai_schemas';

	/**
	 * Largest set this site will store, and most items in it.
	 */
	const MAX_BYTES = 262144;
	const MAX_ITEMS = 20;

	/**
	 * Deepest nesting accepted in one schema.
	 */
	const MAX_DEPTH = 12;

	/**
	 * Our set for a post. Unreadable storage reads as empty.
	 *
	 * @param int $post_id Post ID.
	 * @return array{provider: string, items: array<int, array<string, mixed>>}
	 */
	public static function read_store( $post_id ) {
		$raw   = get_post_meta( $post_id, self::META, true );
		$empty = array(
			'provider' => '',
			'items'    => array(),
		);
		if ( ! is_string( $raw ) || '' === $raw ) {
			return $empty;
		}
		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) || ! isset( $data['items'] ) || ! is_array( $data['items'] ) ) {
			return $empty;
		}
		$items = array();
		foreach ( $data['items'] as $item ) {
			if ( is_array( $item ) && isset( $item['id'], $item['schema'] ) && is_string( $item['id'] ) && is_array( $item['schema'] ) ) {
				$items[] = $item;
			}
		}
		return array(
			'provider' => isset( $data['provider'] ) && is_string( $data['provider'] ) ? $data['provider'] : '',
			'items'    => $items,
		);
	}

	/**
	 * Store our set. An empty set deletes the key.
	 *
	 * @param int                                                              $post_id Post ID.
	 * @param array{provider: string, items: array<int, array<string, mixed>>} $store   Set.
	 * @return bool
	 */
	private static function write_store( $post_id, $store ) {
		if ( empty( $store['items'] ) ) {
			delete_post_meta( $post_id, self::META );
			return true;
		}
		$json = wp_json_encode(
			array(
				'version'  => 1,
				'provider' => (string) $store['provider'],
				'items'    => array_values( $store['items'] ),
			)
		);
		if ( ! is_string( $json ) || strlen( $json ) > self::MAX_BYTES ) {
			return false;
		}
		// `update_metadata` unslashes; JSON is full of backslashes.
		update_post_meta( $post_id, self::META, wp_slash( $json ) );
		return true;
	}

	/**
	 * Nodes from the older single document, as a list.
	 *
	 * @param int $post_id Post ID.
	 * @return array<int, array<string, mixed>>
	 */
	public static function legacy_nodes( $post_id ) {
		$stored = RankXAI_Schema::get( $post_id );
		if ( null === $stored ) {
			return array();
		}
		$doc = json_decode( $stored['content'], true );
		if ( ! is_array( $doc ) ) {
			return array();
		}
		if ( isset( $doc['@graph'] ) && is_array( $doc['@graph'] ) ) {
			$nodes = $doc['@graph'];
		} elseif ( self::is_list( $doc ) ) {
			$nodes = $doc;
		} else {
			$nodes = array( $doc );
		}
		$out = array();
		foreach ( $nodes as $node ) {
			if ( is_array( $node ) && ! self::is_list( $node ) ) {
				unset( $node['@context'] );
				$out[] = $node;
			}
		}
		return $out;
	}

	/**
	 * Every node this plugin prints for a post: the older document, then our set.
	 *
	 * @param int $post_id Post ID.
	 * @return array<int, array<string, mixed>>
	 */
	public static function nodes_to_print( $post_id ) {
		$nodes = self::legacy_nodes( $post_id );
		foreach ( self::read_store( $post_id )['items'] as $item ) {
			$nodes[] = $item['schema'];
		}
		return $nodes;
	}

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------

	/**
	 * Everything the platform reads before deciding anything.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string, mixed>
	 */
	public static function state( $post_id ) {
		$post   = get_post( $post_id );
		$public = $post && is_post_publicly_viewable( $post ) && ! post_password_required( $post );

		$providers = array();
		foreach ( RankXAI_Schema_Providers::slugs() as $slug ) {
			$providers[] = RankXAI_Schema_Providers::describe( $slug );
		}

		$items = self::items( $post_id );

		return array(
			'postId'        => (int) $post_id,
			'postStatus'    => $post ? $post->post_status : '',
			'postType'      => $post ? $post->post_type : '',
			'publicUrl'     => $post ? (string) get_permalink( $post ) : '',
			'public'        => (bool) $public,
			'passwordGated' => $post ? post_password_required( $post ) : false,
			'providers'     => $providers,
			'active'        => RankXAI_Schema_Providers::active(),
			'unknownActive' => RankXAI_Schema_Providers::unknown_active(),
			'printPlan'     => RankXAI_Schema_Output::plan( $post_id ),
			'storeProvider' => self::read_store( $post_id )['provider'],
			'items'         => $items,
			'schemaVersion' => self::version_of( $items ),
			'limits'        => array(
				'maxBytes' => self::MAX_BYTES,
				'maxItems' => self::MAX_ITEMS,
			),
		);
	}

	/**
	 * Every schema this plugin can see stored for a post, as one list.
	 *
	 * @param int $post_id Post ID.
	 * @return array<int, array<string, mixed>>
	 */
	public static function items( $post_id ) {
		$items = array();

		foreach ( RankXAI_Schema_Providers::rankmath_rows( $post_id ) as $mid => $row ) {
			$metadata = isset( $row['metadata'] ) && is_array( $row['metadata'] ) ? $row['metadata'] : array();
			$schema   = $row;
			unset( $schema['metadata'] );
			$items[] = array(
				'id'       => 'rankmath:' . $mid,
				'store'    => 'rankmath',
				'type'     => self::first_type( $schema ),
				'primary'  => ! empty( $metadata['isPrimary'] ),
				'schema'   => $schema,
				'metadata' => $metadata,
			);
		}

		foreach ( self::read_store( $post_id )['items'] as $item ) {
			$items[] = array(
				'id'        => 'rankxai:' . $item['id'],
				'store'     => 'rankxai',
				'type'      => self::first_type( $item['schema'] ),
				'primary'   => null,
				'schema'    => $item['schema'],
				'createdAt' => isset( $item['createdAt'] ) ? (string) $item['createdAt'] : '',
				'updatedAt' => isset( $item['updatedAt'] ) ? (string) $item['updatedAt'] : '',
			);
		}

		foreach ( self::legacy_nodes( $post_id ) as $i => $node ) {
			$items[] = array(
				'id'      => 'legacy:' . $i,
				'store'   => 'legacy',
				'type'    => self::first_type( $node ),
				'primary' => null,
				'schema'  => $node,
			);
		}

		return $items;
	}

	/**
	 * A hash of the whole list: what a writer must present to prove it read the
	 * current state. Keys are sorted first, so two reads of the same data agree.
	 *
	 * @param array<int, array<string, mixed>> $items Items from self::items().
	 * @return string
	 */
	public static function version_of( $items ) {
		$basis = array();
		foreach ( $items as $item ) {
			$basis[] = array(
				'id'       => $item['id'],
				'schema'   => self::canonical( $item['schema'] ),
				'metadata' => isset( $item['metadata'] ) ? self::canonical( $item['metadata'] ) : null,
			);
		}
		return hash( 'sha256', (string) wp_json_encode( $basis ) );
	}

	// -----------------------------------------------------------------------
	// Writes
	// -----------------------------------------------------------------------

	/**
	 * What a store would hold for this schema, without writing it.
	 *
	 * @param string               $store  'rankmath' or 'rankxai'.
	 * @param array<string, mixed> $schema Schema node.
	 * @param string               $target Item id being replaced, or ''.
	 * @param int                  $post_id Post ID.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function normalise( $store, $schema, $target, $post_id ) {
		$shape = self::shape_error( $schema );
		if ( '' !== $shape ) {
			return new WP_Error( 'rankxai_invalid_schema', $shape, array( 'status' => 400 ) );
		}
		unset( $schema['@context'] );
		if ( 'rankxai' === $store ) {
			return array(
				'schema'   => $schema,
				'metadata' => null,
			);
		}
		if ( 'rankmath' === $store ) {
			$available = RankXAI_Schema_Providers::rankmath_store_state();
			if ( ! $available['available'] ) {
				return new WP_Error( 'rankxai_store_unavailable', $available['reason'], array( 'status' => 409 ) );
			}
			$existing = self::rankmath_target_row( $post_id, $target );
			if ( is_wp_error( $existing ) ) {
				return $existing;
			}
			$full = self::rankmath_payload( $post_id, $schema, $existing );
			$norm = RankXAI_Schema_Providers::rankmath_normalise( $full );
			$meta = isset( $norm['metadata'] ) ? $norm['metadata'] : array();
			unset( $norm['metadata'] );
			return array(
				'schema'   => $norm,
				'metadata' => $meta,
			);
		}
		return new WP_Error( 'rankxai_unknown_store', __( 'Unknown schema store.', 'rankxai' ), array( 'status' => 400 ) );
	}

	/**
	 * Add or replace one schema in one store, under the lock.
	 *
	 * @param int                  $post_id  Post ID.
	 * @param string               $store    'rankmath' or 'rankxai'.
	 * @param array<string, mixed> $schema   Schema node.
	 * @param string               $target   Item id to replace, or '' to add.
	 * @param string               $expected The schemaVersion the caller read.
	 * @param string               $provider For 'rankxai': the SEO plugin this set joins, or ''.
	 * @return array<string, mixed>|WP_Error `{id}` of the item written.
	 */
	public static function upsert( $post_id, $store, $schema, $target, $expected, $provider ) {
		$shape = self::shape_error( $schema );
		if ( '' !== $shape ) {
			return new WP_Error( 'rankxai_invalid_schema', $shape, array( 'status' => 400 ) );
		}
		unset( $schema['@context'] );

		return self::locked(
			$post_id,
			$expected,
			function () use ( $post_id, $store, $schema, $target, $provider ) {
				if ( 'rankmath' === $store ) {
					$existing = self::rankmath_target_row( $post_id, $target );
					if ( is_wp_error( $existing ) ) {
						return $existing;
					}
					$mid     = null === $existing ? 0 : $existing['mid'];
					$payload = self::rankmath_payload( $post_id, $schema, $existing );
					$written = RankXAI_Schema_Providers::rankmath_upsert( $post_id, $payload, $mid );
					if ( is_wp_error( $written ) ) {
						return $written;
					}
					return array( 'id' => 'rankmath:' . $written );
				}

				if ( 'rankxai' === $store ) {
					$set = self::read_store( $post_id );
					$now = gmdate( 'c' );
					$id  = '';
					if ( '' !== $target ) {
						$want = self::local_id( $target, 'rankxai' );
						foreach ( $set['items'] as $k => $item ) {
							if ( $item['id'] === $want ) {
								$set['items'][ $k ]['schema']    = $schema;
								$set['items'][ $k ]['type']      = self::first_type( $schema );
								$set['items'][ $k ]['updatedAt'] = $now;
								$id                              = $want;
							}
						}
						if ( '' === $id ) {
							return new WP_Error( 'rankxai_target_not_found', __( 'That schema is not stored on this post.', 'rankxai' ), array( 'status' => 404 ) );
						}
					} else {
						if ( count( $set['items'] ) >= self::MAX_ITEMS ) {
							return new WP_Error( 'rankxai_too_many', __( 'This post already holds the most schemas this site will store.', 'rankxai' ), array( 'status' => 413 ) );
						}
						$id             = 'rx' . strtolower( wp_generate_password( 12, false, false ) );
						$set['items'][] = array(
							'id'        => $id,
							'type'      => self::first_type( $schema ),
							'schema'    => $schema,
							'createdAt' => $now,
							'updatedAt' => $now,
						);
					}
					if ( '' !== $provider ) {
						$set['provider'] = $provider;
					}
					if ( ! self::write_store( $post_id, $set ) ) {
						return new WP_Error( 'rankxai_too_large', __( 'The schemas for this post would be larger than this site will store.', 'rankxai' ), array( 'status' => 413 ) );
					}
					return array( 'id' => 'rankxai:' . $id );
				}

				return new WP_Error( 'rankxai_unknown_store', __( 'Unknown schema store.', 'rankxai' ), array( 'status' => 400 ) );
			}
		);
	}

	/**
	 * Remove one schema, under the lock. Refuses the older document, which the
	 * AI-readiness publisher owns.
	 *
	 * @param int    $post_id  Post ID.
	 * @param string $target   Item id.
	 * @param string $expected The schemaVersion the caller read.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function remove( $post_id, $target, $expected ) {
		return self::locked(
			$post_id,
			$expected,
			function () use ( $post_id, $target ) {
				if ( 0 === strpos( $target, 'rankmath:' ) ) {
					$mid = absint( substr( $target, strlen( 'rankmath:' ) ) );
					if ( ! RankXAI_Schema_Providers::rankmath_delete( $post_id, $mid ) ) {
						return new WP_Error( 'rankxai_target_not_found', __( 'That schema is not stored on this post.', 'rankxai' ), array( 'status' => 404 ) );
					}
					return array( 'id' => $target );
				}
				if ( 0 === strpos( $target, 'rankxai:' ) ) {
					$want  = self::local_id( $target, 'rankxai' );
					$set   = self::read_store( $post_id );
					$found = false;
					foreach ( $set['items'] as $k => $item ) {
						if ( $item['id'] === $want ) {
							unset( $set['items'][ $k ] );
							$found = true;
						}
					}
					if ( ! $found ) {
						return new WP_Error( 'rankxai_target_not_found', __( 'That schema is not stored on this post.', 'rankxai' ), array( 'status' => 404 ) );
					}
					self::write_store( $post_id, $set );
					return array( 'id' => $target );
				}
				return new WP_Error( 'rankxai_target_not_managed', __( 'Only schema written through this route can be removed through it.', 'rankxai' ), array( 'status' => 409 ) );
			}
		);
	}

	/**
	 * Run a write while holding the post's schema lock, if the set has not moved.
	 *
	 * @param int      $post_id  Post ID.
	 * @param string   $expected The schemaVersion the caller read.
	 * @param callable $write    The write; returns an array or WP_Error.
	 * @return array<string, mixed>|WP_Error
	 */
	private static function locked( $post_id, $expected, $write ) {
		global $wpdb;
		$name = 'rankxai_schema_' . get_current_blog_id() . '_' . (int) $post_id;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- A named lock; core has no API for one and it must not be cached.
		$got = $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, %d)', $name, 5 ) );
		if ( '1' !== (string) $got ) {
			return new WP_Error( 'rankxai_lock_unavailable', __( 'Another change to this post’s schema is in progress. Try again in a moment.', 'rankxai' ), array( 'status' => 409 ) );
		}

		try {
			$current = self::version_of( self::items( $post_id ) );
			if ( ! is_string( $expected ) || ! hash_equals( $current, $expected ) ) {
				return new WP_Error(
					'rankxai_schema_moved',
					__( 'This post’s schema changed since it was read. Read it again before writing.', 'rankxai' ),
					array(
						'status'        => 409,
						'schemaVersion' => $current,
					)
				);
			}
			return call_user_func( $write );
		} finally {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Releases the lock taken above.
			$wpdb->query( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );
		}
	}

	// -----------------------------------------------------------------------
	// Rank Math payloads
	// -----------------------------------------------------------------------

	/**
	 * The Rank Math row a write replaces, or null to add one.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $target  Item id, or ''.
	 * @return array{mid: int, row: array<string, mixed>}|null|WP_Error
	 */
	private static function rankmath_target_row( $post_id, $target ) {
		if ( '' === $target ) {
			return null;
		}
		if ( 0 !== strpos( $target, 'rankmath:' ) ) {
			return new WP_Error( 'rankxai_target_not_found', __( 'That schema is not stored in Rank Math on this post.', 'rankxai' ), array( 'status' => 404 ) );
		}
		$mid  = absint( substr( $target, strlen( 'rankmath:' ) ) );
		$rows = RankXAI_Schema_Providers::rankmath_rows( $post_id );
		if ( ! isset( $rows[ $mid ] ) ) {
			return new WP_Error( 'rankxai_target_not_found', __( 'That schema is not stored in Rank Math on this post.', 'rankxai' ), array( 'status' => 404 ) );
		}
		return array(
			'mid' => $mid,
			'row' => $rows[ $mid ],
		);
	}

	/**
	 * The row Rank Math's editor would save: the schema plus its `metadata`.
	 *
	 * A replaced row keeps its own metadata (title, shortcode, primary flag), so
	 * whatever the customer set in Rank Math survives. A new row is marked
	 * primary only when no other row on the post is.
	 *
	 * @param int                                             $post_id  Post ID.
	 * @param array<string, mixed>                            $schema   Schema node.
	 * @param array{mid: int, row: array<string, mixed>}|null $existing Row being replaced.
	 * @return array<string, mixed>
	 */
	private static function rankmath_payload( $post_id, $schema, $existing ) {
		unset( $schema['metadata'] );
		if ( null !== $existing && isset( $existing['row']['metadata'] ) && is_array( $existing['row']['metadata'] ) ) {
			$schema['metadata'] = $existing['row']['metadata'];
			return $schema;
		}
		$has_primary = false;
		foreach ( RankXAI_Schema_Providers::rankmath_rows( $post_id ) as $row ) {
			if ( ! empty( $row['metadata']['isPrimary'] ) ) {
				$has_primary = true;
			}
		}
		$type               = self::first_type( $schema );
		$schema['metadata'] = array(
			'title'     => $type,
			'type'      => 'template',
			'shortcode' => uniqid( 's-' ),
			'isPrimary' => ! $has_primary,
		);
		return $schema;
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	/**
	 * Why this cannot be stored as a schema node, or ''.
	 *
	 * Shape only. Which types are allowed and which properties they need is the
	 * platform's decision.
	 *
	 * @param mixed $schema Candidate.
	 * @return string
	 */
	public static function shape_error( $schema ) {
		if ( ! is_array( $schema ) || array() === $schema || self::is_list( $schema ) ) {
			return __( 'The schema must be a JSON object.', 'rankxai' );
		}
		$type = isset( $schema['@type'] ) ? $schema['@type'] : null;
		$list = is_array( $type ) ? $type : array( $type );
		if ( null === $type || array() === $list ) {
			return __( 'The schema needs an @type.', 'rankxai' );
		}
		foreach ( $list as $t ) {
			if ( ! is_string( $t ) || ! preg_match( '/^[A-Za-z0-9]{1,64}$/', $t ) ) {
				return __( 'The schema’s @type must be a schema.org type name.', 'rankxai' );
			}
		}
		if ( self::depth( $schema ) > self::MAX_DEPTH ) {
			return __( 'The schema is nested too deeply.', 'rankxai' );
		}
		$json = wp_json_encode( $schema );
		if ( ! is_string( $json ) ) {
			return __( 'The schema could not be encoded as JSON.', 'rankxai' );
		}
		if ( strlen( $json ) > self::MAX_BYTES ) {
			return __( 'The schema is larger than this site will store.', 'rankxai' );
		}
		return '';
	}

	/**
	 * The first `@type` of a node, or ''.
	 *
	 * @param array<string, mixed> $node Node.
	 * @return string
	 */
	public static function first_type( $node ) {
		if ( ! is_array( $node ) || ! isset( $node['@type'] ) ) {
			return '';
		}
		$type = $node['@type'];
		if ( is_array( $type ) ) {
			$type = reset( $type );
		}
		return is_string( $type ) ? $type : '';
	}

	/**
	 * `rankxai:abc` → `abc`.
	 *
	 * @param string $id    Item id.
	 * @param string $store Store prefix.
	 * @return string
	 */
	private static function local_id( $id, $store ) {
		$prefix = $store . ':';
		return 0 === strpos( $id, $prefix ) ? substr( $id, strlen( $prefix ) ) : '';
	}

	/**
	 * Keys sorted at every level, lists left in order.
	 *
	 * @param mixed $value Value.
	 * @return mixed
	 */
	public static function canonical( $value ) {
		if ( ! is_array( $value ) ) {
			return $value;
		}
		if ( ! self::is_list( $value ) ) {
			ksort( $value, SORT_STRING );
		}
		foreach ( $value as $k => $v ) {
			$value[ $k ] = self::canonical( $v );
		}
		return $value;
	}

	/**
	 * Is this a JSON array rather than a JSON object?
	 *
	 * @param array<mixed> $value Value.
	 * @return bool
	 */
	public static function is_list( $value ) {
		if ( array() === $value ) {
			return true;
		}
		return array_keys( $value ) === range( 0, count( $value ) - 1 );
	}

	/**
	 * Nesting depth.
	 *
	 * @param mixed $value Value.
	 * @return int
	 */
	private static function depth( $value ) {
		if ( ! is_array( $value ) ) {
			return 0;
		}
		$max = 0;
		foreach ( $value as $v ) {
			$max = max( $max, self::depth( $v ) );
		}
		return 1 + $max;
	}
}
