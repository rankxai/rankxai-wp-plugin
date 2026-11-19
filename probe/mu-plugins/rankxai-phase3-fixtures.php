<?php
/**
 * Plugin Name: RankX AI content route fixtures (probe only)
 * Description: A post type with no revisions, a non-public post type, and two post meta keys, one shown in REST and one not. Probe only, never shipped.
 *
 * A stock WordPress has none of these, so without them the content route's
 * no-revision, not-visible and registered-meta branches would never run.
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

		// Published but not visible to visitors, so `willRender` must be false.
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
