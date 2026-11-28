<?php
/**
 * The search title, description, canonical address, link previews and noindex,
 * and the page's structured data, edited in WordPress.
 *
 * The search fields show only while no SEO plugin is active, because only then
 * does this plugin print them (RankXAI_Head). The structured data box always
 * shows: it is printed with or without an SEO plugin.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Edit box on posts, pages and products, and fields on category and tag screens.
 */
class RankXAI_SEO_Box {

	/** Nonce action and field. */
	const NONCE = 'rankxai_seo_box';

	/** Nonce action and field for the structured data box. */
	const NONCE_SCHEMA = 'rankxai_schema_box';

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'add_meta_boxes', array( __CLASS__, 'register' ) );
		add_action( 'save_post', array( __CLASS__, 'save_post' ), 10, 2 );
		add_action( 'admin_init', array( __CLASS__, 'hook_terms' ) );
	}

	/**
	 * Whether the search title box belongs on this site now.
	 *
	 * @return bool
	 */
	private static function active() {
		return RankXAI_Detect::may_own_head();
	}

	/**
	 * Add the boxes to content types.
	 *
	 * @param string $post_type Post type.
	 */
	public static function register( $post_type ) {
		if ( 'attachment' === $post_type || ! RankXAI_Access_Scope::content_post_type( $post_type ) ) {
			return;
		}
		if ( self::active() ) {
			add_meta_box( 'rankxai-seo', __( 'Search title and description', 'rankxai' ), array( __CLASS__, 'render' ), $post_type, 'normal', 'low' );
		}
		add_meta_box( 'rankxai-schema', __( 'Structured data (JSON-LD)', 'rankxai' ), array( __CLASS__, 'render_schema' ), $post_type, 'normal', 'low' );
	}

	/**
	 * The search title box.
	 *
	 * @param WP_Post $post Post.
	 */
	public static function render( $post ) {
		$values = RankXAI_SEO::get_own( $post->ID );
		wp_nonce_field( self::NONCE, self::NONCE );
		echo '<p>' . esc_html__( 'What search engines and AI assistants show for this page. Leave a field empty to use the page title and excerpt.', 'rankxai' ) . '</p>';
		foreach ( self::post_fields() as $field => $label ) {
			if ( 'og_title' === $field ) {
				echo '<p><strong>' . esc_html__( 'Link previews', 'rankxai' ) . '</strong><br />' . esc_html__( 'Optional. Leave empty to use the search title and description.', 'rankxai' ) . '</p>';
			}
			$id = 'rankxai-seo-' . $field;
			echo '<p><label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label><br />';
			if ( in_array( $field, array( 'description', 'og_description', 'twitter_description' ), true ) ) {
				echo '<textarea class="widefat" rows="2" id="' . esc_attr( $id ) . '" name="rankxai_seo[' . esc_attr( $field ) . ']">' . esc_textarea( isset( $values[ $field ] ) ? $values[ $field ] : '' ) . '</textarea>';
			} else {
				echo '<input class="widefat" type="' . ( 'canonical' === $field ? 'url' : 'text' ) . '" id="' . esc_attr( $id ) . '" name="rankxai_seo[' . esc_attr( $field ) . ']" value="' . esc_attr( isset( $values[ $field ] ) ? $values[ $field ] : '' ) . '" />';
			}
			echo '</p>';
		}
		echo '<p><label><input type="checkbox" name="rankxai_seo_noindex" value="1" ' . checked( '1', RankXAI_Noindex::own( $post->ID ), false ) . ' /> ' . esc_html__( 'Keep search engines out of this page (noindex)', 'rankxai' ) . '</label></p>';
		echo '<p class="description">' . esc_html__( 'Shown here because no SEO plugin is active.', 'rankxai' ) . '</p>';
	}

	/**
	 * The structured data box: one JSON-LD document printed in the page's head.
	 *
	 * @param WP_Post $post Post.
	 */
	public static function render_schema( $post ) {
		$stored = RankXAI_Schema::get( $post->ID );
		wp_nonce_field( self::NONCE_SCHEMA, self::NONCE_SCHEMA );
		echo '<p><label for="rankxai-schema-json">' . esc_html__( 'Structured data for this page, as JSON-LD. Leave empty for none.', 'rankxai' ) . '</label></p>';
		echo '<textarea class="widefat code" rows="6" id="rankxai-schema-json" name="rankxai_schema_json" spellcheck="false">' . esc_textarea( null !== $stored ? $stored['content'] : '' ) . '</textarea>';
		echo '<p class="description">' . esc_html__( 'Printed in a script tag of type application/ld+json. With an SEO plugin active, it joins that plugin\'s structured data. Invalid JSON is not saved.', 'rankxai' ) . '</p>';
	}

	/**
	 * The fields the search title box edits, with labels.
	 *
	 * @return array<string, string>
	 */
	private static function post_fields() {
		return array(
			'title'               => __( 'Search title', 'rankxai' ),
			'description'         => __( 'Search description', 'rankxai' ),
			'canonical'           => __( 'Canonical address (optional)', 'rankxai' ),
			'og_title'            => __( 'Title in link previews (Open Graph)', 'rankxai' ),
			'og_description'      => __( 'Description in link previews (Open Graph)', 'rankxai' ),
			'twitter_title'       => __( 'Title on X (Twitter)', 'rankxai' ),
			'twitter_description' => __( 'Description on X (Twitter)', 'rankxai' ),
		);
	}

	/**
	 * Save the boxes. Each acts only on the edit form's own submission, never on a REST or other save.
	 *
	 * @param int     $post_id Post ID.
	 * @param WP_Post $post    Post.
	 */
	public static function save_post( $post_id, $post ) {
		if ( wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		if ( ! RankXAI_Access_Scope::content_post_type( $post->post_type ) ) {
			return;
		}
		if ( isset( $_POST[ self::NONCE_SCHEMA ] ) && wp_verify_nonce( sanitize_key( wp_unslash( $_POST[ self::NONCE_SCHEMA ] ) ), self::NONCE_SCHEMA ) && isset( $_POST['rankxai_schema_json'] ) ) {
			// Checked as JSON by RankXAI_Schema::rejection(); it is printed escaped for a script element.
			$json = trim( (string) wp_unslash( $_POST['rankxai_schema_json'] ) ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- JSON, validated by RankXAI_Schema::set().
			if ( '' === $json ) {
				RankXAI_Schema::delete( $post_id );
			} else {
				RankXAI_Schema::set( $post_id, $json );
			}
		}
		if ( ! isset( $_POST[ self::NONCE ] ) || ! wp_verify_nonce( sanitize_key( wp_unslash( $_POST[ self::NONCE ] ) ), self::NONCE ) || ! self::active() ) {
			return;
		}
		if ( ! isset( $_POST['rankxai_seo'] ) || ! is_array( $_POST['rankxai_seo'] ) ) {
			return;
		}
		$posted = wp_unslash( $_POST['rankxai_seo'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Each field is checked and sanitised by RankXAI_SEO::check_field() below.
		$values = array();
		foreach ( array_keys( self::post_fields() ) as $field ) {
			if ( isset( $posted[ $field ] ) && is_string( $posted[ $field ] ) ) {
				$checked = RankXAI_SEO::check_field( $field, $posted[ $field ] );
				if ( $checked['ok'] ) {
					$values[ $field ] = $checked['value'];
				}
			}
		}
		if ( $values ) {
			RankXAI_SEO::set( $post_id, $values );
		}
		RankXAI_Noindex::set( $post_id, isset( $_POST['rankxai_seo_noindex'] ) );
	}

	/**
	 * Fields on the category and tag edit screens.
	 */
	public static function hook_terms() {
		if ( ! self::active() ) {
			return;
		}
		foreach ( RankXAI_Term_SEO::taxonomies() as $taxonomy ) {
			add_action( $taxonomy . '_edit_form_fields', array( __CLASS__, 'render_term' ) );
			add_action( 'edited_' . $taxonomy, array( __CLASS__, 'save_term' ), 10, 2 );
		}
	}

	/**
	 * Term fields.
	 *
	 * @param WP_Term $term Term.
	 */
	public static function render_term( $term ) {
		$values = RankXAI_Term_SEO::get_own( $term->term_id );
		wp_nonce_field( self::NONCE, self::NONCE );
		$fields = array(
			'title'       => __( 'Search title', 'rankxai' ),
			'description' => __( 'Search description', 'rankxai' ),
		);
		foreach ( $fields as $field => $label ) {
			$id = 'rankxai-term-seo-' . $field;
			echo '<tr class="form-field"><th scope="row"><label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label></th><td>';
			if ( 'description' === $field ) {
				echo '<textarea rows="3" id="' . esc_attr( $id ) . '" name="rankxai_term_seo[' . esc_attr( $field ) . ']">' . esc_textarea( isset( $values[ $field ] ) ? $values[ $field ] : '' ) . '</textarea>';
			} else {
				echo '<input type="text" id="' . esc_attr( $id ) . '" name="rankxai_term_seo[' . esc_attr( $field ) . ']" value="' . esc_attr( isset( $values[ $field ] ) ? $values[ $field ] : '' ) . '" />';
			}
			echo '<p class="description">' . esc_html__( 'For this archive page in search and AI answers. Shown because no SEO plugin is active.', 'rankxai' ) . '</p></td></tr>';
		}
	}

	/**
	 * Save term fields from the term edit form only.
	 *
	 * @param int $term_id Term ID.
	 * @param int $tt_id   Term taxonomy ID.
	 */
	public static function save_term( $term_id, $tt_id ) {
		if ( ! isset( $_POST[ self::NONCE ] ) || ! wp_verify_nonce( sanitize_key( wp_unslash( $_POST[ self::NONCE ] ) ), self::NONCE ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_term', $term_id ) || ! isset( $_POST['rankxai_term_seo'] ) || ! is_array( $_POST['rankxai_term_seo'] ) ) {
			return;
		}
		$term = get_term( $term_id );
		if ( ! $term instanceof WP_Term || (int) $term->term_taxonomy_id !== (int) $tt_id ) {
			return;
		}
		$posted = wp_unslash( $_POST['rankxai_term_seo'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Each field is sanitised by RankXAI_Term_SEO::set().
		$values = array();
		foreach ( RankXAI_Term_SEO::fields() as $field ) {
			if ( isset( $posted[ $field ] ) && is_string( $posted[ $field ] ) ) {
				$values[ $field ] = sanitize_text_field( $posted[ $field ] );
			}
		}
		if ( $values ) {
			RankXAI_Term_SEO::set( $term_id, $term->taxonomy, $values );
		}
	}
}
