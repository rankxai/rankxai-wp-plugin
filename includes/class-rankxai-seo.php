<?php
/**
 * Read and write a post's SEO metadata.
 *
 * Our own post meta is the source of truth. It is mirrored into the active SEO
 * plugin's storage and applied through its output filters, so a value survives
 * a change of SEO plugin.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Post SEO metadata.
 */
class RankXAI_SEO {

	/**
	 * Hook the output filters for whichever SEO plugin is active.
	 */
	public static function init() {
		add_action( 'wp', array( __CLASS__, 'register_output_filters' ) );
		add_filter( 'surerank_set_meta', array( __CLASS__, 'filter_surerank_meta' ), 20 );
	}

	/**
	 * Our stored values for a post, field => string.
	 *
	 * Absent fields are omitted rather than returned empty.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string, string>
	 */
	public static function get_own( $post_id ) {
		$out = array();
		foreach ( RankXAI_SEO_Registry::fields() as $field ) {
			$value = get_post_meta( $post_id, RankXAI_SEO_Registry::own_meta_key( $field ), true );
			if ( '' !== $value && null !== $value ) {
				$out[ $field ] = (string) $value;
			}
		}
		return $out;
	}

	/**
	 * What the active SEO plugin currently holds. Empty with no single target plugin.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string, string>
	 */
	public static function get_plugin_stored( $post_id ) {
		$target = RankXAI_Detect::target_plugin();
		if ( '' === $target ) {
			return array();
		}
		if ( 'aioseo' === $target ) {
			return self::aioseo_read( $post_id );
		}
		if ( 'surerank' === $target ) {
			return self::surerank_read( $post_id );
		}
		$map = RankXAI_SEO_Registry::storage();
		if ( ! isset( $map[ $target ] ) ) {
			return array();
		}
		$out = array();
		foreach ( $map[ $target ] as $field => $meta_key ) {
			$value = get_post_meta( $post_id, $meta_key, true );
			if ( '' !== $value && null !== $value ) {
				$out[ $field ] = (string) $value;
			}
		}
		return $out;
	}

	/**
	 * Write. Stores on our own meta, then mirrors into the active plugin.
	 *
	 * An empty string clears a field; a field absent from $values is left alone.
	 *
	 * @param int                   $post_id Post ID.
	 * @param array<string, string> $values  Sparse map of field => value.
	 * @return string[] Fields written.
	 */
	public static function set( $post_id, $values ) {
		$written = array();
		foreach ( RankXAI_SEO_Registry::fields() as $field ) {
			if ( ! array_key_exists( $field, $values ) ) {
				continue;
			}
			$value = self::sanitise_field( $field, $values[ $field ] );
			$key   = RankXAI_SEO_Registry::own_meta_key( $field );
			if ( '' === $value ) {
				delete_post_meta( $post_id, $key );
			} else {
				// `update_metadata` unslashes, so slash first to keep backslashes.
				update_post_meta( $post_id, $key, wp_slash( $value ) );
			}
			$written[] = $field;
		}

		self::mirror_to_plugin( $post_id, $values );

		return $written;
	}

	/**
	 * Per-field sanitisation.
	 *
	 * `canonical` must be an http or https URL; `sanitize_text_field` alone would
	 * let a `javascript:` value through.
	 *
	 * @param string $field Field name.
	 * @param mixed  $value Raw value.
	 * @return string
	 */
	private static function sanitise_field( $field, $value ) {
		$checked = self::check_field( $field, $value );
		return $checked['ok'] ? $checked['value'] : '';
	}

	/**
	 * Validate one field.
	 *
	 * An explicit empty string clears; an invalid value is refused rather than
	 * treated as a clear.
	 *
	 * @param string $field Field name.
	 * @param mixed  $value Raw value.
	 * @return array{ok: bool, value: string, reason: string}
	 */
	public static function check_field( $field, $value ) {
		if ( ! is_string( $value ) ) {
			return array(
				'ok'     => false,
				'value'  => '',
				'reason' => 'must be a string',
			);
		}
		if ( 'canonical' === $field ) {
			$raw = trim( $value );
			if ( '' === $raw ) {
				// Explicit clear.
				return array(
					'ok'     => true,
					'value'  => '',
					'reason' => '',
				);
			}
			$url = esc_url_raw( $raw, array( 'http', 'https' ) );
			if ( '' === $url ) {
				return array(
					'ok'     => false,
					'value'  => '',
					'reason' => 'must be an http or https URL',
				);
			}
			return array(
				'ok'     => true,
				'value'  => $url,
				'reason' => '',
			);
		}
		return array(
			'ok'     => true,
			'value'  => sanitize_text_field( $value ),
			'reason' => '',
		);
	}

	/**
	 * Check every field before any of them is written. All or nothing.
	 *
	 * @param array<string, mixed> $values Sparse map of field => value.
	 * @return array<string, string> Field => reason, empty when everything is valid.
	 */
	public static function rejections( $values ) {
		$bad = array();
		foreach ( RankXAI_SEO_Registry::fields() as $field ) {
			if ( ! array_key_exists( $field, $values ) ) {
				continue;
			}
			$checked = self::check_field( $field, $values[ $field ] );
			if ( ! $checked['ok'] ) {
				$bad[ $field ] = $checked['reason'];
			}
		}
		return $bad;
	}

	/**
	 * Mirror into the active SEO plugin's own storage.
	 *
	 * @param int                   $post_id Post ID.
	 * @param array<string, string> $values  Sparse map of field => value.
	 */
	private static function mirror_to_plugin( $post_id, $values ) {
		$target = RankXAI_Detect::target_plugin();
		if ( '' === $target ) {
			return;
		}
		if ( 'aioseo' === $target ) {
			self::aioseo_write( $post_id, $values );
			return;
		}
		if ( 'surerank' === $target ) {
			self::surerank_write( $post_id, $values );
			return;
		}
		$map = RankXAI_SEO_Registry::storage();
		if ( ! isset( $map[ $target ] ) ) {
			return;
		}
		foreach ( $map[ $target ] as $field => $meta_key ) {
			if ( ! array_key_exists( $field, $values ) ) {
				continue;
			}
			$value = self::sanitise_field( $field, $values[ $field ] );
			if ( '' === $value ) {
				delete_post_meta( $post_id, $meta_key );
			} else {
				update_post_meta( $post_id, $meta_key, wp_slash( $value ) );
			}
		}
	}

	/**
	 * Where each field lives in SureRank's grouped arrays.
	 *
	 * @return array<string, array{0: string, 1: string}>
	 */
	private static function surerank_map() {
		return array(
			'title'               => array( 'surerank_settings_general', 'page_title' ),
			'description'         => array( 'surerank_settings_general', 'page_description' ),
			'canonical'           => array( 'surerank_settings_general', 'canonical_url' ),
			'og_title'            => array( 'surerank_settings_social', 'facebook_title' ),
			'og_description'      => array( 'surerank_settings_social', 'facebook_description' ),
			'twitter_title'       => array( 'surerank_settings_social', 'twitter_title' ),
			'twitter_description' => array( 'surerank_settings_social', 'twitter_description' ),
		);
	}

	/**
	 * Rewrite each touched SureRank group whole, keeping every key we do not own.
	 *
	 * @param int                   $post_id Post ID.
	 * @param array<string, string> $values  Field => value.
	 * @return void
	 */
	private static function surerank_write( $post_id, $values ) {
		$groups = array();
		foreach ( self::surerank_map() as $field => $where ) {
			if ( ! array_key_exists( $field, $values ) ) {
				continue;
			}
			list( $meta_key, $key ) = $where;
			if ( ! isset( $groups[ $meta_key ] ) ) {
				$current             = get_post_meta( $post_id, $meta_key, true );
				$groups[ $meta_key ] = is_array( $current ) ? $current : array();
			}
			$groups[ $meta_key ][ $key ] = self::sanitise_field( $field, $values[ $field ] );
		}
		foreach ( $groups as $meta_key => $group ) {
			// `update_metadata` unslashes, recursively.
			update_post_meta( $post_id, $meta_key, wp_slash( $group ) );
		}
	}

	/**
	 * What SureRank holds for a post.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string, string>
	 */
	private static function surerank_read( $post_id ) {
		$out   = array();
		$cache = array();
		foreach ( self::surerank_map() as $field => $where ) {
			list( $meta_key, $key ) = $where;
			if ( ! isset( $cache[ $meta_key ] ) ) {
				$group              = get_post_meta( $post_id, $meta_key, true );
				$cache[ $meta_key ] = is_array( $group ) ? $group : array();
			}
			if ( isset( $cache[ $meta_key ][ $key ] ) && '' !== (string) $cache[ $meta_key ][ $key ] ) {
				$out[ $field ] = (string) $cache[ $meta_key ][ $key ];
			}
		}
		return $out;
	}

	/**
	 * Let our stored values win in SureRank's `surerank_set_meta`.
	 *
	 * Registered at load, because SureRank builds this array early on `wp`.
	 *
	 * @param mixed $meta SureRank's meta for the current request.
	 * @return mixed
	 */
	public static function filter_surerank_meta( $meta ) {
		if ( ! is_array( $meta ) || is_admin() || ! is_singular() || 'surerank' !== RankXAI_Detect::target_plugin() ) {
			return $meta;
		}
		$post_id = get_queried_object_id();
		$own     = $post_id ? self::get_own( $post_id ) : array();
		foreach ( self::surerank_map() as $field => $where ) {
			if ( isset( $own[ $field ] ) ) {
				$meta[ $where[1] ] = $own[ $field ];
			}
		}
		return $meta;
	}

	/**
	 * Read AIOSEO's values through its model; it keeps post SEO in its own tables.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string, string>
	 */
	private static function aioseo_read( $post_id ) {
		if ( ! class_exists( '\AIOSEO\Plugin\Common\Models\Post' ) ) {
			return array();
		}
		$row = \AIOSEO\Plugin\Common\Models\Post::getPost( $post_id );
		if ( ! $row ) {
			return array();
		}
		$out = array();
		$map = array(
			'title'               => 'title',
			'description'         => 'description',
			'canonical'           => 'canonical_url',
			'og_title'            => 'og_title',
			'og_description'      => 'og_description',
			'twitter_title'       => 'twitter_title',
			'twitter_description' => 'twitter_description',
		);
		foreach ( $map as $field => $prop ) {
			if ( isset( $row->$prop ) && '' !== (string) $row->$prop ) {
				$out[ $field ] = (string) $row->$prop;
			}
		}
		return $out;
	}

	/**
	 * Write into AIOSEO's own table through its model.
	 *
	 * @param int                   $post_id Post ID.
	 * @param array<string, string> $values  Sparse map of field => value.
	 */
	private static function aioseo_write( $post_id, $values ) {
		if ( ! class_exists( '\AIOSEO\Plugin\Common\Models\Post' ) ) {
			return;
		}
		$row = \AIOSEO\Plugin\Common\Models\Post::getPost( $post_id );
		if ( ! $row ) {
			return;
		}
		$map     = array(
			'title'               => 'title',
			'description'         => 'description',
			'canonical'           => 'canonical_url',
			'og_title'            => 'og_title',
			'og_description'      => 'og_description',
			'twitter_title'       => 'twitter_title',
			'twitter_description' => 'twitter_description',
		);
		$touched = false;
		foreach ( $map as $field => $prop ) {
			if ( ! array_key_exists( $field, $values ) ) {
				continue;
			}
			$value      = self::sanitise_field( $field, $values[ $field ] );
			$row->$prop = ( '' === $value ) ? null : $value;
			$touched    = true;
		}
		if ( $touched ) {
			$row->post_id = $post_id;
			$row->save();
		}
	}

	/**
	 * Override what the active SEO plugin prints, for this post only.
	 *
	 * Runs on `wp` to have the queried object; priority 99999 to have the last word.
	 */
	public static function register_output_filters() {
		if ( is_admin() || ! is_singular() ) {
			return;
		}
		$post_id = get_queried_object_id();
		if ( ! $post_id ) {
			return;
		}
		$own = self::get_own( $post_id );
		if ( ! $own ) {
			return;
		}
		$target  = RankXAI_Detect::target_plugin();
		$filters = RankXAI_SEO_Registry::filters();
		if ( '' === $target || ! isset( $filters[ $target ] ) ) {
			return;
		}

		foreach ( $filters[ $target ] as $field => $hook ) {
			// Only override fields we hold, or the plugin's output would be blanked.
			if ( ! isset( $own[ $field ] ) ) {
				continue;
			}
			$value = $own[ $field ];
			add_filter(
				$hook,
				function () use ( $value ) {
					return $value;
				},
				99999
			);
		}
	}
}
