<?php
/**
 * The pages under the RankX AI menu.
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
	 * @param string $flag    Query argument the handler set.
	 * @param string $message Text.
	 */
	private static function flash( $flag, $message ) {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Display-only redirect marker.
		if ( isset( $_GET[ $flag ] ) ) {
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( $message ) . '</p></div>';
		}
	}

	/**
	 * The outcome of an "Add redirect" request, shown once.
	 */
	private static function redirect_notice() {
		$key    = 'rankxai_redirect_notice_' . get_current_user_id();
		$notice = get_transient( $key );
		if ( ! is_array( $notice ) || empty( $notice['message'] ) ) {
			return;
		}
		delete_transient( $key );
		$class = 'refused' === $notice['state'] ? 'notice-warning' : 'notice-info';
		echo '<div class="notice ' . esc_attr( $class ) . ' is-dismissible"><p>' . esc_html( $notice['message'] ) . '</p></div>';
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
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Display-only redirect marker.
		if ( isset( $_GET['rankxai-store-unavailable'] ) ) {
			echo '<div class="notice notice-info is-dismissible"><p>' . esc_html__( 'The Store page needs WooCommerce. Activate WooCommerce and it comes back, with your RankX AI connection as it was.', 'rankxai' ) . '</p></div>';
		}

		$store = class_exists( 'RankXAI_Product_Check' );
		if ( ! RankXAI_Admin::start_dismissed() ) {
			self::overview_start( $store );
		}
		if ( $store ) {
			self::overview_store();
		}

		RankXAI_UI::card_open(
			array(
				'title'    => __( 'What AI assistants can see on this site', 'rankxai' ),
				'subtitle' => __( 'The strongest thing we can say from this site alone.', 'rankxai' ),
				'hero'     => ! $store,
			)
		);
		$hero = RankXAI_Overview::hero();
		RankXAI_UI::analysis( $hero['text'] );
		if ( '' !== $hero['action'] ) {
			echo '<div class="rankxai-actions">' . wp_kses( $hero['action'], RankXAI_UI::allowed_html() ) . '</div>';
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
			if ( '' !== $card['text'] ) {
				echo '<p>' . esc_html( $card['text'] ) . '</p>';
			}
			if ( ! empty( $card['rows'] ) ) {
				RankXAI_UI::rows( $card['rows'] );
			}
			if ( ! empty( $card['note'] ) ) {
				RankXAI_UI::note( $card['note'] );
			}
			if ( '' !== $card['action'] ) {
				echo '<div class="rankxai-actions">' . wp_kses( $card['action'], RankXAI_UI::allowed_html() ) . '</div>';
			}
			RankXAI_UI::card_close();
		}
		RankXAI_UI::grid_close();

		RankXAI_UI::close_page();
	}

	/**
	 * "Start here": three first steps, until this user hides the card.
	 *
	 * @param bool $store Whether this is a WooCommerce store.
	 */
	private static function overview_start( $store ) {
		$settings = RankXAI_Admin::page_url( RankXAI_Admin::PAGE_SETTINGS );
		if ( $store ) {
			$steps = array(
				array(
					__( 'See what your products are missing for AI shopping answers. It takes a few seconds and nothing leaves your site.', 'rankxai' ),
					RankXAI_UI::button_link( __( 'Open the product check', 'rankxai' ), admin_url( 'admin.php?page=' . RankXAI_Admin::PAGE_STORE ) ),
				),
				array(
					__( 'Publish plain copies of your products and pages, and an llms.txt, so AI crawlers read your words rather than your theme.', 'rankxai' ),
					RankXAI_UI::button_link( __( 'Open Settings', 'rankxai' ), $settings ),
				),
			);
		} else {
			$steps = array(
				array(
					__( 'Check your links: broken links, links through redirects and pages nothing links to. It runs in the background and changes nothing.', 'rankxai' ),
					RankXAI_UI::button_link( __( 'Open Site checks', 'rankxai' ), RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CHECKS ) ),
				),
				array(
					__( 'Publish plain copies of your pages, and an llms.txt, so AI crawlers read your words rather than your theme.', 'rankxai' ),
					RankXAI_UI::button_link( __( 'Open Settings', 'rankxai' ), $settings ),
				),
			);
		}
		$steps[] = RankXAI_Connection::is_connected()
			? array(
				__( 'Your RankX AI account is connected.', 'rankxai' ),
				RankXAI_UI::chip( __( 'Done', 'rankxai' ), 'success' ),
			)
			: array(
				$store
					? __( 'Connect RankX AI to see which of your products ChatGPT and Google’s AI Mode show, and fix what keeps the rest out. Optional; a free trial, then a paid plan.', 'rankxai' )
					: __( 'Connect RankX AI to see how often AI assistants name your business, and to write SEO fixes through your SEO plugin. Optional; a free trial, then a paid plan.', 'rankxai' ),
				RankXAI_Connection::connect_button_html( __( 'Connect RankX AI', 'rankxai' ), 'outline' ),
			);

		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Start here', 'rankxai' ),
				'subtitle' => __( 'Three steps, a few minutes each. Hide this card when you are done.', 'rankxai' ),
			)
		);
		echo '<ol class="rankxai-steps">';
		foreach ( $steps as $step ) {
			echo '<li><p>' . esc_html( $step[0] ) . '</p><div class="rankxai-steps__action">' . wp_kses( $step[1], RankXAI_UI::allowed_html() ) . '</div></li>';
		}
		echo '</ol>';
		echo '<div class="rankxai-actions">';
		RankXAI_UI::action_form( RankXAI_Admin::ACTION_DISMISS_START, __( 'Hide this', 'rankxai' ) );
		echo '</div>';
		RankXAI_UI::card_close();
	}

	/**
	 * The Overview's store card: the product check's headline and top gaps.
	 */
	private static function overview_store() {
		$result    = RankXAI_Product_Check::result();
		$labels    = RankXAI_Product_Check::labels();
		$connected = RankXAI_Connection::is_connected();
		$store_url = admin_url( 'admin.php?page=' . RankXAI_Admin::PAGE_STORE );

		RankXAI_UI::card_open(
			array(
				'title'      => __( 'Your store in AI shopping answers', 'rankxai' ),
				'subtitle'   => __( 'What AI shopping answers need from your products, checked on this site.', 'rankxai' ),
				'hero'       => true,
				'link'       => $store_url,
				'link_label' => $connected ? __( 'Open the Store', 'rankxai' ) : __( 'See every product', 'rankxai' ),
			)
		);
		RankXAI_UI::analysis( RankXAI_Product_Check::headline( $result ) );

		$counts = array_filter( (array) $result['counts'] );
		arsort( $counts );
		$rows = array();
		foreach ( array_slice( $counts, 0, 3, true ) as $key => $count ) {
			if ( isset( $labels[ $key ] ) ) {
				$rows[] = array(
					'label' => $labels[ $key ],
					'chip'  => RankXAI_UI::chip(
						sprintf(
							/* translators: %d: number of products. */
							_n( '%d product missing it', '%d products missing it', (int) $count, 'rankxai' ),
							(int) $count
						),
						'warning'
					),
				);
			}
		}
		if ( $rows ) {
			RankXAI_UI::rows( $rows );
		}

		echo '<div class="rankxai-actions">';
		if ( $connected ) {
			echo wp_kses( RankXAI_UI::button_link( __( 'Open the Store', 'rankxai' ), $store_url, 'primary' ), RankXAI_UI::allowed_html() );
		} else {
			echo wp_kses( RankXAI_UI::button_link( __( 'See what each product is missing', 'rankxai' ), $store_url, 'primary' ), RankXAI_UI::allowed_html() );
			echo wp_kses( RankXAI_Connection::connect_button_html( __( 'Connect RankX AI', 'rankxai' ), 'outline' ), RankXAI_UI::allowed_html() );
		}
		echo '</div>';
		if ( ! $connected ) {
			RankXAI_UI::note( __( 'Connecting RankX AI shows which of your products ChatGPT and Google’s AI Mode show for the questions shoppers ask, and fixes what keeps the rest out. Nothing is sent to RankX AI until you connect.', 'rankxai' ) );
		}
		RankXAI_UI::card_close();
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
		self::redirect_notice();

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
		self::redirect_notice();

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
		self::settings_fill();
		self::settings_personal_data();
		self::settings_keep_data();

		echo '<div><button type="submit" class="rankxai-button rankxai-button--primary">' . esc_html__( 'Save settings', 'rankxai' ) . '</button></div>';
		echo '</form>';

		// Outside the settings form, because forms cannot nest.
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
	 * Root documents, one row for each in the catalogue.
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
		$coming_soon = RankXAI_Woo::coming_soon();
		if ( 'site' === $coming_soon ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'Your site is in WooCommerce’s “Coming soon” mode, so nothing is generated here and markdown copies are not served until it is live. Anything published from a RankX AI account is still served.', 'rankxai' ) . '</p></div>';
		} elseif ( 'store' === $coming_soon ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'Your store is in WooCommerce’s “Coming soon” mode, so products and store pages get no markdown copy and are left out of llms.txt until the store is live.', 'rankxai' ) . '</p></div>';
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
	 * The SEO tags this plugin can add when nothing else on the site prints them.
	 */
	private static function settings_fill() {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Missing SEO tags', 'rankxai' ),
				'subtitle' => __( 'For a site with no SEO plugin. Works without a RankX AI account.', 'rankxai' ),
			)
		);
		$labels   = array(
			'meta_description' => array( __( 'Meta description', 'rankxai' ), __( 'From the excerpt you wrote. A page with no excerpt gets none.', 'rankxai' ) ),
			'open_graph'       => array( __( 'Open Graph tags', 'rankxai' ), __( 'Title, excerpt, address and featured image, for link previews.', 'rankxai' ) ),
			'twitter_card'     => array( __( 'Twitter tags', 'rankxai' ), __( 'The same details, for link previews on X.', 'rankxai' ) ),
			'sitemap'          => array( __( 'Sitemap', 'rankxai' ), __( 'Turns on the sitemap WordPress itself provides, at /wp-sitemap.xml.', 'rankxai' ) ),
			'breadcrumbs'      => array( __( 'Breadcrumbs', 'rankxai' ), __( 'Structured data from a page’s parents or a post’s first category.', 'rankxai' ) ),
		);
		$switches = RankXAI_Fill::switches();
		echo '<div class="rankxai-field"><div class="rankxai-field__label">' . esc_html__( 'Add', 'rankxai' ) . '</div><div>';
		foreach ( $labels as $feature => $label ) {
			echo '<label class="rankxai-check"><input type="checkbox" name="rankxai_fill[' . esc_attr( $feature ) . ']" value="1" ' . checked( ! empty( $switches[ $feature ] ), true, false ) . ' /> <span>' . esc_html( $label[0] ) . '</span></label>';
			echo '<p class="rankxai-field__hint">' . esc_html( $label[1] ) . '</p>';
		}
		if ( RankXAI_Fill::blocked_by() ) {
			echo '<p class="rankxai-field__hint">' . esc_html__( 'An SEO plugin is active, so nothing is added. Use that plugin’s own settings instead.', 'rankxai' ) . '</p>';
		} else {
			echo '<p class="rankxai-field__hint">' . esc_html__( 'Off by default. Each tag is added only while no SEO plugin is active, and stops the moment one is.', 'rankxai' ) . '</p>';
		}
		echo '</div></div>';
		RankXAI_UI::card_close();
	}

	/**
	 * Whether RankX AI may read customer, order, user and comment data.
	 */
	private static function settings_personal_data() {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Customer and order data', 'rankxai' ),
				'subtitle' => __( 'What RankX AI may read about the people who use this site, once connected.', 'rankxai' ),
			)
		);
		echo '<div class="rankxai-field"><div class="rankxai-field__label">' . esc_html__( 'Access', 'rankxai' ) . '</div><div>';
		echo '<label class="rankxai-check"><input type="checkbox" name="rankxai_share_personal_data" value="1" ' . checked( RankXAI_Access_Scope::personal_data_allowed(), true, false ) . ' /> <span>' . esc_html__( 'Let RankX AI read orders, customers, users and comments', 'rankxai' ) . '</span></label>';
		echo '<p class="rankxai-field__hint">' . esc_html__( 'Off by default. While it is off, this site refuses RankX AI any request for orders, refunds, customers, the user list, product reviews or full comment details. Turn it on to use features such as revenue from AI shopping in RankX AI.', 'rankxai' ) . '</p>';
		echo '</div></div>';
		RankXAI_UI::card_close();
	}

	/**
	 * Whether deleting the plugin keeps its settings and data.
	 */
	private static function settings_keep_data() {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'When you delete the plugin', 'rankxai' ),
				'subtitle' => __( 'Deactivating never removes anything. Deleting the plugin from the Plugins screen does, unless you keep it here.', 'rankxai' ),
			)
		);
		echo '<div class="rankxai-field"><div class="rankxai-field__label">' . esc_html__( 'Your data', 'rankxai' ) . '</div><div>';
		echo '<label class="rankxai-check"><input type="checkbox" name="rankxai_keep_data" value="1" ' . checked( (bool) get_option( 'rankxai_keep_data' ), true, false ) . ' /> <span>' . esc_html__( 'Keep RankX AI’s settings and data when the plugin is deleted', 'rankxai' ) . '</span></label>';
		echo '<p class="rankxai-field__hint">' . esc_html__( 'Off: deleting the plugin removes its settings, crawler counts, site check results, structured data and search titles it stored, and its cached copies. On: they stay, ready for a reinstall. Either way the connection to RankX AI is removed, along with the Application Passwords its approval created, and SEO values written into your SEO plugin stay in that plugin.', 'rankxai' ) . '</p>';
		echo '</div></div>';
		RankXAI_UI::card_close();
	}

	/**
	 * This plugin's own redirects, each removable. Hidden when there is nothing
	 * to show.
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
	 * @param array    $rows    Rows of escaped HTML cells, a count and a form.
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
			echo '<td>' . wp_kses( $row[3], RankXAI_UI::allowed_html() ) . '</td>';
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
				'id'       => 'rankxai-account',
			)
		);
		self::flash( 'rankxai-disconnected', __( 'Disconnected from RankX AI.', 'rankxai' ) );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Display-only redirect marker.
		$outcome = isset( $_GET['rankxai-connect'] ) ? sanitize_key( wp_unslash( $_GET['rankxai-connect'] ) ) : '';
		$link    = RankXAI_Connection::link();
		$blocked = RankXAI_Connection::outbound_blocked();

		if ( null !== $link ) {
			if ( 'connected' === $outcome ) {
				echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Connected to RankX AI.', 'rankxai' ) . '</p></div>';
			}
			$name = '' !== $link['project_name'] ? $link['project_name'] : home_url();
			echo '<p>' . esc_html(
				sprintf(
					/* translators: %s: the website's name in RankX AI. */
					__( 'Connected to RankX AI as the website "%s".', 'rankxai' ),
					$name
				)
			) . '</p>';
			if ( '' !== $blocked ) {
				RankXAI_UI::note( $blocked );
			}
			echo '<p class="rankxai-muted">' . esc_html__( 'Disconnecting removes this site’s RankX AI token and the Application Passwords RankX AI’s approval created, so RankX AI can no longer reach the site. A password you created by hand for RankX AI is not removed: delete it in Users › Profile. Your RankX AI account and its data stay.', 'rankxai' ) . '</p>';
			echo '<div class="rankxai-actions">';
			echo wp_kses_post( RankXAI_UI::button_link( __( 'Open in RankX AI', 'rankxai' ), RankXAI_Connection::app_url() . '/overview', 'outline', true ) );
			RankXAI_UI::action_form( RankXAI_Connection::ACTION_DISCONNECT, __( 'Disconnect', 'rankxai' ), array(), 'danger' );
			echo '</div>';
			RankXAI_UI::card_close();
			return;
		}

		$latest = RankXAI_Admin::last_update_received();
		if ( '' !== $latest ) {
			echo '<p>' . esc_html(
				sprintf(
					/* translators: %s: a date. */
					__( 'Last update received from RankX AI: %s.', 'rankxai' ),
					$latest
				)
			) . '</p>';
		}
		echo '<p class="rankxai-muted">' . esc_html__( 'Connect to work on this site from here with your RankX AI account: on a WooCommerce store, the Store page shows how AI assistants show your products and fixes what keeps them out. Connecting opens RankX AI in a new tab, where you sign in or create an account and choose this site. Until you connect, this plugin sends nothing to RankX AI.', 'rankxai' ) . '</p>';
		if ( '' !== $blocked ) {
			RankXAI_UI::note( $blocked );
		}
		echo '<div class="rankxai-actions">';
		echo wp_kses( RankXAI_Connection::connect_button_html( __( 'Connect RankX AI', 'rankxai' ) ), RankXAI_UI::allowed_html() );
		echo wp_kses_post( RankXAI_UI::button_link( __( 'rankxai.com', 'rankxai' ), 'https://rankxai.com', 'outline', true ) );
		echo '</div>';
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
