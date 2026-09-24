<?php
/**
 * JSON-LD in `wp_head`, rather than a `<script>` inside the post body.
 *
 * WordPress strips `<script>` from post content, via kses, for any user without
 * `unfiltered_html` — multisite non-super-admins, sites with
 * `DISALLOW_UNFILTERED_HTML`, anywhere a security plugin has removed it — and
 * the write still returns 200. It does not filter post meta, so a graph stored
 * here survives and renders.
 *
 * The platform keeps its own block-based path for sites without this plugin.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Per-post JSON-LD.
 */
class RankXAI_Schema {

	/**
	 * Where the graph lives. Protected meta, and deliberately not registered
	 * with `show_in_rest` — that would be a write surface skipping the
	 * validation below.
	 */
	const META_GRAPH = '_rankxai_schema';

	/**
	 * When it was last written. A separate key, so the graph meta holds the
	 * exact bytes and nothing else.
	 */
	const META_UPDATED = '_rankxai_schema_updated';

	/**
	 * The largest graph this site will store. A bound on a request body, not a
	 * product limit.
	 */
	const MAX_BYTES = 262144;

	/**
	 * Nothing to hook: `RankXAI_Schema_Output` prints this document together
	 * with the rest of the post's schema, inside the SEO plugin's graph when
	 * there is one, so a page never carries two graphs.
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
	 * Malformed JSON is refused rather than stored: a crawler that cannot parse
	 * it may discard every graph on the page, including the SEO plugin's.
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
	 * `update_metadata()` unslashes the value before storing it, and a JSON
	 * document is full of backslashes — without `wp_slash` it reliably stops
	 * parsing.
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
	 * `<` becomes `\u003c` so a value containing `</script>` cannot close the
	 * element early. Inside a JSON string these escapes mean the same as the
	 * characters, so the graph is unchanged and applying it twice is a no-op.
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
