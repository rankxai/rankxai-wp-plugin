<?php
/**
 * The search title, description and canonical address, edited in WordPress.
 *
 * Shown only while no SEO plugin is active, because only then does this plugin
 * print them (RankXAI_Head). With an SEO plugin, that plugin's own fields apply.
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

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'add_meta_boxes', array( __CLASS__, 'register' ) );
		add_action( 'save_post', array( __CLASS__, 'save_post' ), 10, 2 );
		add_action( 'admin_init', array( __CLASS__, 'hook_terms' ) );
	}

	/**
	 * Whether the box belongs on this site now.
	 *
	 * @return bool
	 */
	private static function active() {
		return RankXAI_Detect::may_own_head();
	}

	/**
	 * Add the box to content types.
	 *
	 * @param string $post_type Post type.
	 */
	public static function register( $post_type ) {
		if ( ! self::active() || 'attachment' === $post_type || ! RankXAI_Access_Scope::content_post_type( $post_type ) ) {
			return;
		}
		add_meta_box( 'rankxai-seo', __( 'Search title and description', 'rankxai' ), array( __CLASS__, 'render' ), $post_type, 'normal', 'low' );
	}

	/**
	 * The box.
	 *
	 * @param WP_Post $post Post.
	 */
	public static function render( $post ) {
		$values = RankXAI_SEO::get_own( $post->ID );
		wp_nonce_field( self::NONCE, self::NONCE );
		echo '<p>' . esc_html__( 'What search engines and AI assistants show for this page. Leave a field empty to use the page title and excerpt.', 'rankxai' ) . '</p>';
		foreach ( self::post_fields() as $field => $label ) {
			$id = 'rankxai-seo-' . $field;
			echo '<p><label for="' . esc_attr( $id ) . '"><strong>' . esc_html( $label ) . '</strong></label><br />';
			if ( 'description' === $field ) {
				echo '<textarea class="widefat" rows="3" id="' . esc_attr( $id ) . '" name="rankxai_seo[' . esc_attr( $field ) . ']">' . esc_textarea( isset( $values[ $field ] ) ? $values[ $field ] : '' ) . '</textarea>';
			} else {
				echo '<input class="widefat" type="' . ( 'canonical' === $field ? 'url' : 'text' ) . '" id="' . esc_attr( $id ) . '" name="rankxai_seo[' . esc_attr( $field ) . ']" value="' . esc_attr( isset( $values[ $field ] ) ? $values[ $field ] : '' ) . '" />';
			}
			echo '</p>';
		}
		echo '<p class="description">' . esc_html__( 'Shown here because no SEO plugin is active. Link previews use the same title and description.', 'rankxai' ) . '</p>';
	}

	/**
	 * The fields the box edits, with labels.
	 *
	 * @return array<string, string>
	 */
	private static function post_fields() {
		return array(
			'title'       => __( 'Search title', 'rankxai' ),
			'description' => __( 'Search description', 'rankxai' ),
			'canonical'   => __( 'Canonical address (optional)', 'rankxai' ),
		);
	}

	/**
	 * Save the box. Acts only on the edit form's own submission, never on a REST or other save.
	 *
	 * @param int     $post_id Post ID.
	 * @param WP_Post $post    Post.
	 */
	public static function save_post( $post_id, $post ) {
		if ( ! isset( $_POST[ self::NONCE ] ) || ! wp_verify_nonce( sanitize_key( wp_unslash( $_POST[ self::NONCE ] ) ), self::NONCE ) ) {
			return;
		}
		if ( wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) || ! current_user_can( 'edit_post', $post_id ) || ! self::active() ) {
			return;
		}
		if ( ! RankXAI_Access_Scope::content_post_type( $post->post_type ) || ! isset( $_POST['rankxai_seo'] ) || ! is_array( $_POST['rankxai_seo'] ) ) {
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
