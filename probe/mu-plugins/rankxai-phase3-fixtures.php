<?php
/**
 * Plugin Name: RankX AI Phase 3 fixtures (probe only)
 * Description: A post type that keeps no revisions and two post meta keys, one REST-registered and one not. NEVER SHIPPED — this lives under probe/ and is export-ignored.
 *
 * ── WHY THESE EXIST ─────────────────────────────────────────────────────────
 *
 * Two branches of the content route cannot be reached on a stock WordPress, and
 * a branch that is never executed is a branch nobody has checked:
 *
 *   `revisionId: null` — real for many custom post types and for every
 *   WooCommerce product, and the platform renders "this object has no version
 *   history" from it. Every built-in type here supports revisions, so without a
 *   type that does not, the null arm is only ever asserted in prose.
 *
 *   `object.meta` — the route reads WordPress's OWN registry rather than a list
 *   of keys, and the whole point is that a key registered with `show_in_rest`
 *   appears while one registered without it does not. Proving that needs both
 *   kinds to exist, and a stock install has neither.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

add_action(
	'init',
	function () {
		register_post_type(
			'rankxai_norev',
			array(
				'label'        => 'RankX AI no-revision fixture',
				'public'       => true,
				'show_in_rest' => true,
				// `revisions` deliberately absent.
				'supports'     => array( 'title', 'editor', 'excerpt' ),
			)
		);

		// PUBLISHED but unreachable by a visitor. `willRender` must be false for
		// one of these, and a stock WordPress has no such type — so without this
		// the distinction between "the status is publish" and "a visitor can see
		// it" is only ever asserted in prose.
		register_post_type(
			'rankxai_hidden',
			array(
				'label'        => 'RankX AI non-public fixture',
				'public'       => false,
				'show_in_rest' => true,
				'supports'     => array( 'title', 'editor' ),
			)
		);

		register_post_meta(
			'post',
			'rankxai_probe_visible',
			array(
				'type'         => 'string',
				'single'       => true,
				'show_in_rest' => true,
				'auth_callback' => function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);

		register_post_meta(
			'post',
			'rankxai_probe_hidden',
			array(
				'type'         => 'string',
				'single'       => true,
				'show_in_rest' => false,
			)
		);
	}
);
