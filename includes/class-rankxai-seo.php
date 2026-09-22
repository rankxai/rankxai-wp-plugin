<?php
/**
 * Reading and writing a post's SEO metadata, on both rungs.
 *
 * Our own post meta is the source of truth; the active plugin's storage and
 * its output filters are both projections of it, so a value survives the site
 * switching SEO plugin or removing one.
 *
 * This decides nothing about content and never reports `verified` — it stores
 * the strings it is given and returns what is stored. The platform holds the
 * rules and does the comparing.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Post SEO metadata, on both rungs.
 */
class RankXAI_SEO {

	/**
	 * Hook rung 2 for whichever plugin is active.
	 */
	public static function init() {
		add_action( 'wp', array( __CLASS__, 'register_output_filters' ) );
	}

	/**
	 * Our stored values for a post, field => string.
	 *
	 * Absent fields are omitted rather than returned empty, because "no
	 * opinion" and "should be blank" are different instructions and the write
	 * path honours both.
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
	 * What the active plugin currently holds, so the platform can see whether
	 * the mirror landed. Empty when there is no single target plugin.
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
	 * An empty string clears a field; a field absent from $values is left
	 * alone. That is why this takes a sparse array rather than a complete
	 * record.
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
				update_post_meta( $post_id, $key, $value );
			}
			$written[] = $field;
		}

		self::mirror_to_plugin( $post_id, $values );

		return $written;
	}

	/**
	 * Per-field sanitisation.
	 *
	 * `canonical` is validated as an http/https URL. `sanitize_text_field`
	 * would pass a `javascript:` value through, and this ends up both in our
	 * own <head> and mirrored into another plugin's canonical field.
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
	 * Validate one field. Three outcomes, kept distinct on purpose.
	 *
	 * Returning '' for a value we refuse would mean CLEAR, so a refused value
	 * would delete the good one already on the post and report success. An
	 * explicit empty string still clears; an invalid value leaves the field
	 * alone and the whole request is refused.
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
	 * Check every field before any of them is written. All or nothing — a
	 * partial write reporting success leaves the caller unable to tell which
	 * half landed.
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
	 * Rung 1 — mirror into the active plugin's own storage.
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
				update_post_meta( $post_id, $meta_key, $value );
			}
		}
	}

	/**
	 * AIOSEO keeps post SEO in its own tables, so post meta cannot reach it.
	 * Its model is the supported route.
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
	 * Rung 2 — override what the active plugin prints, for this post only.
	 *
	 * Registered on `wp` because it needs the queried object, and at priority
	 * 99999 so it is the last word.
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
			// Only override a field we hold — hooking one we do not would replace
			// the plugin's own output with an empty string.
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
