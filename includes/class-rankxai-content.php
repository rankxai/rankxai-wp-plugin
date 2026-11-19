<?php
/**
 * Write a post's body and return the bytes WordPress actually stored.
 *
 * Write and read-back happen in one request, so a page cache cannot answer the
 * read. Kses is not bypassed: doing so would be a stored-XSS risk.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Post body writes.
 */
class RankXAI_Content {

	/**
	 * The fields this route writes, mapped to their `wp_update_post` keys.
	 *
	 * Deliberately small: everything else is left to `wp/v2`.
	 *
	 * @return array<string, string>
	 */
	public static function fields() {
		return array(
			'content' => 'post_content',
			'title'   => 'post_title',
			'excerpt' => 'post_excerpt',
			'slug'    => 'post_name',
		);
	}

	/**
	 * Validate one field.
	 *
	 * An empty `content` or `title` is refused. An empty `excerpt` or `slug` is
	 * allowed; WordPress regenerates a slug.
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
		if ( ( 'content' === $field || 'title' === $field ) && '' === trim( $value ) ) {
			return array(
				'ok'     => false,
				'value'  => '',
				'reason' => 'would blank a live page; clear it in WordPress if that is really the intent',
			);
		}
		return array(
			'ok'     => true,
			'value'  => $value,
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
		foreach ( self::fields() as $field => $unused_column ) {
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
	 * Write, then read back from the same process.
	 *
	 * `wp_update_post()` expects slashed data, as core's REST controller sends.
	 * Without `wp_slash` every backslash is silently stripped.
	 *
	 * @param int                   $post_id Post ID.
	 * @param array<string, string> $values  Sparse map of field => value.
	 * @return array{written: string[], error: WP_Error|null}
	 */
	public static function update( $post_id, $values ) {
		$postarr = array( 'ID' => $post_id );
		$written = array();

		foreach ( self::fields() as $field => $column ) {
			if ( ! array_key_exists( $field, $values ) ) {
				continue;
			}
			$checked = self::check_field( $field, $values[ $field ] );
			if ( ! $checked['ok'] ) {
				// Callers run rejections() first; checked again to be safe.
				continue;
			}
			$postarr[ $column ] = $checked['value'];
			$written[]          = $field;
		}

		if ( 1 === count( $postarr ) ) {
			return array(
				'written' => array(),
				'error'   => new WP_Error( 'rankxai_nothing_to_write', 'No writable field was supplied.' ),
			);
		}

		$result = wp_update_post( wp_slash( $postarr ), true );
		if ( is_wp_error( $result ) ) {
			return array(
				'written' => array(),
				'error'   => $result,
			);
		}

		return array(
			'written' => $written,
			'error'   => null,
		);
	}

	/**
	 * The post in the same shape `wp/v2` returns.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string, mixed>|null
	 */
	public static function describe( $post_id ) {
		// `wp_insert_post` cleans the object cache, so this re-reads the row.
		$post = get_post( $post_id );
		if ( ! $post ) {
			return null;
		}

		return array(
			'id'           => (int) $post->ID,
			'link'         => get_permalink( $post ),
			'slug'         => $post->post_name,
			'status'       => $post->post_status,
			'type'         => $post->post_type,
			'modified_gmt' => mysql_to_rfc3339( $post->post_modified_gmt ),
			'title'        => array(
				'raw'      => $post->post_title,
				'rendered' => get_the_title( $post ),
			),
			'content'      => array(
				'raw'      => $post->post_content,
				'rendered' => self::rendered( $post ),
			),
			'meta'         => self::registered_meta( $post ),
		);
	}

	/**
	 * `the_content` applied, as `wp/v2` returns it.
	 *
	 * No separate `do_blocks` pass: `the_content` already runs it, and rendering
	 * twice collapses whitespace between blocks.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	private static function rendered( $post ) {
		if ( post_password_required( $post ) ) {
			return '';
		}
		$rendered = RankXAI_Markdown::rendered_content( $post, false );
		return is_string( $rendered ) ? $rendered : '';
	}

	/**
	 * The meta `wp/v2` would return: everything registered with `show_in_rest`.
	 *
	 * A post-type registration wins over one for all post types, as in core.
	 *
	 * @param WP_Post $post Post.
	 * @return array<string, mixed>
	 */
	private static function registered_meta( $post ) {
		$registered = array_merge(
			(array) get_registered_meta_keys( 'post', '' ),
			(array) get_registered_meta_keys( 'post', $post->post_type )
		);

		$out = array();
		foreach ( $registered as $key => $args ) {
			if ( empty( $args['show_in_rest'] ) ) {
				continue;
			}
			$single      = ! empty( $args['single'] );
			$out[ $key ] = get_post_meta( $post->ID, $key, $single );
		}
		return $out;
	}
}
