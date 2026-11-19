<?php
/**
 * Per-post JSON-LD stored in post meta and printed in the head.
 *
 * Kses strips `<script>` from post content for users without `unfiltered_html`,
 * but it does not filter post meta, so a graph stored here survives.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Per-post JSON-LD.
 */
class RankXAI_Schema {

	/**
	 * Meta key for the graph. Not registered with `show_in_rest`, so nothing
	 * can write it without the validation below.
	 */
	const META_GRAPH = '_rankxai_schema';

	/**
	 * Meta key for when the graph was last written.
	 */
	const META_UPDATED = '_rankxai_schema_updated';

	/**
	 * The largest graph this site will store.
	 */
	const MAX_BYTES = 262144;

	/**
	 * Nothing to hook: RankXAI_Schema_Output prints this graph.
	 */
	public static function init() {}

	/**
	 * The stored graph, or null.
	 *
	 * @param int $post_id Post ID.
	 * @return array{content: string, updated: string}|null
	 */
	public static function get( $post_id ) {
		$content = get_post_meta( $post_id, self::META_GRAPH, true );
		if ( ! is_string( $content ) || '' === $content ) {
			return null;
		}
		$updated = get_post_meta( $post_id, self::META_UPDATED, true );
		return array(
			'content' => $content,
			'updated' => is_string( $updated ) ? $updated : '',
		);
	}

	/**
	 * Why this graph cannot be stored, or '' when it can.
	 *
	 * Malformed JSON is refused: a crawler may then discard every graph on the page.
	 *
	 * @param mixed $content Candidate graph.
	 * @return string Reason, or ''.
	 */
	public static function rejection( $content ) {
		if ( ! is_string( $content ) ) {
			return 'must be a string';
		}
		if ( '' === trim( $content ) ) {
			return 'must not be empty';
		}
		if ( strlen( $content ) > self::MAX_BYTES ) {
			return sprintf( 'is larger than the %d bytes this site will store', self::MAX_BYTES );
		}
		if ( null === json_decode( $content ) ) {
			return 'is not valid JSON';
		}
		return '';
	}

	/**
	 * Store a graph.
	 *
	 * Slashed first, because `update_metadata()` unslashes and would strip the
	 * JSON's backslashes.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $content Graph JSON.
	 * @return bool
	 */
	public static function set( $post_id, $content ) {
		if ( '' !== self::rejection( $content ) ) {
			return false;
		}
		update_post_meta( $post_id, self::META_GRAPH, wp_slash( $content ) );
		update_post_meta( $post_id, self::META_UPDATED, wp_slash( gmdate( 'c' ) ) );
		return true;
	}

	/**
	 * Remove a graph. Idempotent.
	 *
	 * @param int $post_id Post ID.
	 * @return void
	 */
	public static function delete( $post_id ) {
		delete_post_meta( $post_id, self::META_GRAPH );
		delete_post_meta( $post_id, self::META_UPDATED );
	}

	/**
	 * JSON escaped for the inside of a `<script>` element.
	 *
	 * `<` becomes `\u003c` so a value holding `</script>` cannot close the
	 * element. The escapes mean the same in JSON, so the graph is unchanged.
	 *
	 * @param string $json Graph JSON.
	 * @return string
	 */
	public static function escape_for_script( $json ) {
		return str_replace(
			array( '<', '>', '&' ),
			array( '\\u003c', '\\u003e', '\\u0026' ),
			$json
		);
	}
}
