<?php
/**
 * Writing a post's body, and returning the bytes WordPress actually stored.
 *
 * Over `wp/v2` a write and its read-back are two requests, and a page cache can
 * answer the second. Here they are one, so the platform learns which bytes were
 * lost from the same process that wrote them — and gets the revision id back in
 * the same call.
 *
 * This does not bypass kses. The plugin authenticates with the site's own
 * Application Password and carries no `unfiltered_html`, so writing around the
 * filters would be a stored-XSS vector rather than a fix. What the route adds is
 * the diagnosis: `unfilteredHtml` comes back as a fact about the writing
 * account.
 *
 * Nothing here reports `verified` or judges a write. It returns what is stored
 * and the platform decides.
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
	 * Deliberately small. Status, date, author, parent, featured media,
	 * template, menu order, terms and meta all stay on `wp/v2`, which already
	 * does them correctly.
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
	 * An empty `content` or `title` is refused: blanking a live page's body is
	 * the one operation here with no undo. An empty `excerpt` or `slug` is a
	 * legitimate instruction and is honoured — WordPress regenerates a slug.
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
	 * `wp_update_post()` expects slashed data — core's own REST controller calls
	 * `wp_slash( (array) $post )` first. Without it every backslash is stripped
	 * and the write still returns 200, quietly corrupting code blocks, Windows
	 * paths and escaped block attributes.
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
				// `rejections()` runs first, so this is unreachable today. Kept
				// because a write is the wrong place to depend on that.
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
	 * The post in the same shape `wp/v2` returns, so the platform keeps one
	 * parser for both sources.
	 *
	 * `modified_gmt` goes through `mysql_to_rfc3339()` — the function core's
	 * REST controller uses — because the database and REST formats are different
	 * strings for the same instant, and the platform compares one against the
	 * other across a write.
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
	 * The platform's builder classification reads the rendered body to recognise
	 * an Elementor page, so dropping this field would make such a page classify
	 * as ordinary.
	 *
	 * `rendered_content` is called WITHOUT its block pre-pass: `the_content`
	 * runs `do_blocks` itself at priority 9, and rendering twice collapses the
	 * whitespace between block delimiters, which would stop this matching what
	 * `wp/v2` returns.
	 *
	 * A password-protected post returns '', as core does.
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
	 * Read from WordPress's own registry, because which keys are REST-visible is
	 * a property of the site's plugins rather than something this file can list.
	 * Keys registered for all post types live under the empty subtype; the
	 * post-type-specific registration wins, which is core's precedence.
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
