<?php
/**
 * The four pages under the RankX AI menu.
 *
 * Each page is composed from RankXAI_UI helpers. Every number carries what it
 * covers, and a page with no data says so rather than showing zeros.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Page renderers.
 */
class RankXAI_Pages {

	/**
	 * Refuse to render for an account that cannot manage the site.
	 *
	 * @return bool
	 */
	private static function allowed() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * A success message after a form was handled.
	 *
	 * Core notice markup, printed on our own page only.
	 *
	 * @param string $flag    Query argument the handler set.
	 * @param string $message Text.
	 */
	private static function flash( $flag, $message ) {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Reading a redirect marker, not acting on it.
		if ( isset( $_GET[ $flag ] ) ) {
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( $message ) . '</p></div>';
		}
	}

	// -----------------------------------------------------------------------
	// Overview
	// -----------------------------------------------------------------------

	/**
	 * The Overview page.
	 */
	public static function overview() {
		if ( ! self::allowed() ) {
			return;
		}
		RankXAI_UI::open_page( __( 'RankX AI', 'rankxai' ), __( 'What AI assistants can see on this site, and what to fix.', 'rankxai' ), RankXAI_Admin::PAGE );

		RankXAI_UI::card_open(
			array(
				'title'    => __( 'What AI assistants can see on this site', 'rankxai' ),
				'subtitle' => __( 'The strongest thing we can say from this site alone.', 'rankxai' ),
				'hero'     => true,
			)
		);
		$hero = RankXAI_Overview::hero();
		RankXAI_UI::analysis( $hero['text'] );
		if ( '' !== $hero['action'] ) {
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Built by RankXAI_UI helpers, which escape every value they print.
			echo '<div class="rankxai-actions">' . $hero['action'] . '</div>';
		}
		RankXAI_UI::card_close();

		RankXAI_UI::grid_open( 'two' );
		foreach ( RankXAI_Overview::cards() as $card ) {
			RankXAI_UI::card_open(
				array(
					'title'      => $card['title'],
					'subtitle'   => $card['subtitle'],
					'link'       => $card['link'],
					'link_label' => $card['link_label'],
				)
			);
			echo '<div class="rankxai-card__state">' . wp_kses_post( $card['state'] ) . '</div>';
			echo '<p>' . esc_html( $card['text'] ) . '</p>';
			if ( '' !== $card['action'] ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Built by RankXAI_UI helpers, which escape every value they print.
				echo '<div class="rankxai-actions">' . $card['action'] . '</div>';
			}
			RankXAI_UI::card_close();
		}
		RankXAI_UI::grid_close();

		RankXAI_UI::close_page();
	}

	// -----------------------------------------------------------------------
	// AI crawlers
	// -----------------------------------------------------------------------

	/**
	 * The AI crawlers page.
	 */
	public static function crawlers() {
		if ( ! self::allowed() ) {
			return;
		}
		RankXAI_UI::open_page( __( 'AI crawlers', 'rankxai' ), __( 'Which AI crawlers read this site, and whether robots.txt lets them in.', 'rankxai' ), RankXAI_Admin::PAGE_CRAWLERS );
		self::flash( 'rankxai-saved', __( 'Saved.', 'rankxai' ) );
		self::flash( 'rankxai-cleared', __( 'Crawler counts cleared.', 'rankxai' ) );
		self::flash( 'rankxai-redirect-added', __( 'Redirect added.', 'rankxai' ) );

		RankXAI_Crawler_Page::render();

		RankXAI_UI::close_page();
	}

	// -----------------------------------------------------------------------
	// Site checks
	// -----------------------------------------------------------------------

	/**
	 * The Site checks page.
	 */
	public static function checks() {
		if ( ! self::allowed() ) {
			return;
		}
		RankXAI_UI::open_page( __( 'Site checks', 'rankxai' ), __( 'Broken and redirected links, pages nothing links to, and images with no text description.', 'rankxai' ), RankXAI_Admin::PAGE_CHECKS );
		self::flash( 'rankxai-scan-started', __( 'Site check started. It runs in the background a few pages at a time.', 'rankxai' ) );
		self::flash( 'rankxai-redirect-added', __( 'Redirect added.', 'rankxai' ) );

		RankXAI_Checks_Page::render();

		RankXAI_UI::close_page();
	}

	// -----------------------------------------------------------------------
	// Settings
	// -----------------------------------------------------------------------

	/**
	 * The Settings page.
	 */
	public static function settings() {
		if ( ! self::allowed() ) {
			return;
		}
		RankXAI_UI::open_page( __( 'Settings', 'rankxai' ), __( 'Local switches. Everything here works with or without a RankX AI account.', 'rankxai' ), RankXAI_Admin::PAGE_SETTINGS );
		self::flash( 'rankxai-saved', __( 'Settings saved.', 'rankxai' ) );
		self::flash( 'rankxai-redirect-removed', __( 'Redirect removed.', 'rankxai' ) );

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="rankxai-stack">';
		echo '<input type="hidden" name="action" value="' . esc_attr( RankXAI_Admin::ACTION ) . '" />';
		wp_nonce_field( RankXAI_Admin::ACTION );

		self::settings_twins();
		self::settings_documents();

		echo '<div><button type="submit" class="rankxai-button rankxai-button--primary">' . esc_html__( 'Save settings', 'rankxai' ) . '</button></div>';
		echo '</form>';

		// Outside the settings form: each row is its own form, and forms cannot nest.
		self::settings_redirects();
		self::settings_connection();

		RankXAI_UI::close_page();
	}

	/**
	 * Markdown copies.
	 */
	private static function settings_twins() {
		$twins = RankXAI_Twins::settings();
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Markdown copies', 'rankxai' ),
				'subtitle' => __( 'A plain-text copy of each page, so an AI assistant reads your words rather than your theme\'s markup.', 'rankxai' ),
			)
		);

		echo '<div class="rankxai-field"><div class="rankxai-field__label">' . esc_html__( 'Publish copies', 'rankxai' ) . '</div><div>';
		echo '<label class="rankxai-check"><input type="checkbox" name="rankxai_twins_enabled" value="1" ' . checked( $twins['enabled'], true, false ) . ' /> <span>' . esc_html__( 'Serve a markdown copy of every eligible page', 'rankxai' ) . '</span></label>';
		echo '<p class="rankxai-field__hint">' . esc_html__( 'Off by default. Switching this on publishes new addresses on your site. Each copy carries noindex and links back to the page it came from.', 'rankxai' ) . '</p>';
		echo '</div></div>';

		echo '<div class="rankxai-field"><div class="rankxai-field__label">' . esc_html__( 'Which content', 'rankxai' ) . '</div><div>';
		$available = self::available_post_types();
		if ( $available ) {
			foreach ( $available as $type ) {
				$label = isset( $type->labels->name ) ? (string) $type->labels->name : $type->name;
				echo '<label class="rankxai-check"><input type="checkbox" name="rankxai_twin_post_types[]" value="' . esc_attr( $type->name ) . '" ' . checked( in_array( $type->name, $twins['post_types'], true ), true, false ) . ' /> <span>' . esc_html( $label ) . '</span></label>';
			}
			echo '<p class="rankxai-field__hint">' . esc_html__( 'A page you have marked noindex never gets a copy, whatever is ticked here.', 'rankxai' ) . '</p>';
		} else {
			echo '<p class="rankxai-field__hint">' . esc_html__( 'This site has no public content types.', 'rankxai' ) . '</p>';
		}
		echo '</div></div>';

		if ( $twins['enabled'] ) {
			$sitemap = RankXAI_Twins::sitemap_url();
			echo '<div class="rankxai-field"><div class="rankxai-field__label">' . esc_html__( 'Index of copies', 'rankxai' ) . '</div><div>';
			echo '<a href="' . esc_url( $sitemap ) . '" target="_blank" rel="noopener">' . esc_html( $sitemap ) . '</a>';
			echo '<p class="rankxai-field__hint">' . esc_html__( 'Deliberately not listed in robots.txt: declaring noindex addresses to a search engine earns a warning for each one.', 'rankxai' ) . '</p>';
			echo '</div></div>';
		}

		RankXAI_UI::card_close();
	}

	/**
	 * Root documents.
	 *
	 * Every document in the catalogue gets a row, including the one this plugin
	 * will not compose, so its absence reads as a decision rather than a gap.
	 */
	private static function settings_documents() {
		$generated = RankXAI_Generate::stored_state();
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Root documents', 'rankxai' ),
				'subtitle' => __( 'Served from the root of this site. Nothing is written to your server: WordPress answers when the address is requested.', 'rankxai' ),
			)
		);

		if ( RankXAI_Generate::site_discourages_indexing() ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'This site is set to discourage search engines (Settings → Reading), so nothing is generated here and markdown copies are not served. Anything published from a RankX AI account is still served.', 'rankxai' ) . '</p></div>';
		}

		$supported = RankXAI_Generate::supported();
		foreach ( RankXAI_Documents::catalogue() as $slug => $doc ) {
			$state = RankXAI_Documents::effective( $slug );
			$url   = home_url( '/' . $doc['path'] );

			echo '<div class="rankxai-field"><div class="rankxai-field__label">' . esc_html( $doc['label'] ) . '</div><div>';
			if ( in_array( $slug, $supported, true ) ) {
				echo '<label class="rankxai-check"><input type="checkbox" name="rankxai_generate[' . esc_attr( $slug ) . ']" value="1" ' . checked( ! empty( $generated[ $slug ] ), true, false ) . ' /> <span>' . esc_html__( 'Generate it from the content on this site', 'rankxai' ) . '</span></label>';
			}
			echo '<p class="rankxai-field__hint">' . esc_html( self::describe_document( $state['source'] ) ) . '</p>';
			if ( '' !== $state['content'] || 'file' === $state['source'] ) {
				echo '<p class="rankxai-field__hint"><a href="' . esc_url( $url ) . '" target="_blank" rel="noopener">' . esc_html( $url ) . '</a></p>';
			}
			echo '</div></div>';
		}

		RankXAI_UI::card_close();
	}

	/**
	 * This plugin's own redirects, each removable.
	 *
	 * Shown only when there are some, or when RankX AI would add them to
	 * another plugin, so a site that uses neither sees nothing new.
	 */
	private static function settings_redirects() {
		$items     = RankXAI_Redirects::items()['items'];
		$own       = array_values(
			array_filter(
				$items,
				function ( $item ) {
					return 'own_store' === $item['backend'];
				}
			)
		);
		$managers  = RankXAI_Redirects::managers();
		$elsewhere = '';
		if ( $managers['redirection']['active'] ) {
			$elsewhere = __( 'the Redirection plugin', 'rankxai' );
		} elseif ( $managers['rank_math']['ready'] ) {
			$elsewhere = __( 'Rank Math', 'rankxai' );
		}
		if ( ! $own && '' === $elsewhere ) {
			return;
		}

		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Redirects', 'rankxai' ),
				'subtitle' => __( 'Redirects RankX AI added on this site.', 'rankxai' ),
			)
		);
		if ( '' !== $elsewhere ) {
			echo '<p>' . esc_html(
				sprintf(
					/* translators: %s: the name of another plugin. */
					__( 'Redirects RankX AI adds on this site go into %s, and are managed in its own screens.', 'rankxai' ),
					$elsewhere
				)
			) . '</p>';
		}
		if ( $own ) {
			echo '<p>' . esc_html__( 'These redirects are kept by this plugin. Each one answers only when its old address would otherwise show "page not found". Hit counts are low when a page cache answers a visit without WordPress.', 'rankxai' ) . '</p>';
			$rows = array();
			foreach ( $own as $item ) {
				ob_start();
				RankXAI_UI::action_form( RankXAI_Admin::ACTION_DELETE_REDIRECT, __( 'Remove', 'rankxai' ), array( 'rankxai_redirect_id' => $item['id'] ), 'danger' );
				$form   = (string) ob_get_clean();
				$rows[] = array( '<code>' . esc_html( $item['from'] ) . '</code>', '<code>' . esc_html( $item['to'] ) . '</code>', number_format_i18n( (int) $item['hits'] ), $form );
			}
			self::form_table( array( __( 'From', 'rankxai' ), __( 'To', 'rankxai' ), __( 'Hits', 'rankxai' ), '' ), $rows );
		}
		RankXAI_UI::card_close();
	}

	/**
	 * A table whose last column holds forms, which `wp_kses_post` would strip.
	 *
	 * @param string[] $headers Headers.
	 * @param array    $rows    Rows: two HTML cells (already escaped), a count, and a form (already escaped).
	 */
	private static function form_table( $headers, $rows ) {
		echo '<div class="rankxai-table-wrap"><table class="rankxai-table"><thead><tr>';
		foreach ( $headers as $header ) {
			echo '<th scope="col">' . esc_html( $header ) . '</th>';
		}
		echo '</tr></thead><tbody>';
		foreach ( $rows as $row ) {
			echo '<tr>';
			echo '<td>' . wp_kses_post( $row[0] ) . '</td>';
			echo '<td>' . wp_kses_post( $row[1] ) . '</td>';
			echo '<td class="is-num">' . esc_html( $row[2] ) . '</td>';
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Built by RankXAI_UI::action_form, which escapes every value it prints.
			echo '<td>' . $row[3] . '</td>';
			echo '</tr>';
		}
		echo '</tbody></table></div>';
	}

	/**
	 * What a RankX AI account adds, and when it last sent anything.
	 */
	private static function settings_connection() {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'RankX AI account', 'rankxai' ),
				'subtitle' => __( 'Optional. Everything above works without one.', 'rankxai' ),
			)
		);
		$latest = RankXAI_Admin::last_update_received();
		if ( '' === $latest ) {
			echo '<p>' . esc_html__( 'Nothing has been received from a RankX AI account on this site. Everything above still works.', 'rankxai' ) . '</p>';
		} else {
			echo '<p>' . esc_html(
				sprintf(
					/* translators: %s: a date. */
					__( 'Last update received from RankX AI: %s.', 'rankxai' ),
					$latest
				)
			) . '</p>';
		}
		echo '<p class="rankxai-muted">' . esc_html__( 'With an account connected, this plugin also writes SEO titles, descriptions and social tags into whichever SEO plugin you run, or renders them itself if you run none, publishes structured data into the page head, and fills these documents with your own approved description of the business rather than a list of page titles.', 'rankxai' ) . '</p>';
		echo '<div class="rankxai-actions">' . wp_kses_post( RankXAI_UI::button_link( __( 'rankxai.com', 'rankxai' ), 'https://rankxai.com', 'outline', true ) ) . '</div>';
		RankXAI_UI::card_close();
	}

	/**
	 * One sentence for each state a document can be in.
	 *
	 * @param string $source One of '', 'file', 'stored', 'generated'.
	 * @return string
	 */
	private static function describe_document( $source ) {
		if ( 'file' === $source ) {
			return __( 'A real file already sits at this address on your server, so this plugin leaves it alone.', 'rankxai' );
		}
		if ( 'stored' === $source ) {
			return __( 'Published from a RankX AI account. That is what is being served, and it takes precedence over anything generated here.', 'rankxai' );
		}
		if ( 'generated' === $source ) {
			return __( 'Generated from the pages and posts on this site, and rebuilt on each request so it never goes stale.', 'rankxai' );
		}
		return __( 'Nothing is being served at this address.', 'rankxai' );
	}

	/**
	 * Public post types a copy can be made of.
	 *
	 * @return WP_Post_Type[]
	 */
	private static function available_post_types() {
		$out = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $slug => $type ) {
			if ( 'attachment' === $slug || ! is_post_type_viewable( $type ) ) {
				continue;
			}
			$out[] = $type;
		}
		return $out;
	}
}
