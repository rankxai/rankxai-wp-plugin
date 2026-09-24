<?php
/**
 * The plugin's own settings screen, at Settings → RankX AI.
 *
 * Everything here is a local switch. Nothing on this screen contacts RankX AI,
 * and nothing on it requires an account: markdown copies and the generated root
 * documents are built from this site's own content and work on their own.
 *
 * It is the ONLY place the plugin speaks to an administrator. There is no
 * dashboard widget, no admin notice and no banner anywhere else in wp-admin —
 * the directory's own guidance is that prompts belong on a plugin's settings
 * page and nowhere else, and a plugin that announces itself on every screen is
 * the reason that guidance exists.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Settings screen.
 */
class RankXAI_Admin {

	/** The `admin_post` action this screen submits to. */
	const ACTION = 'rankxai_save_settings';

	/** The `admin_post` action that removes one of our own redirects. */
	const ACTION_DELETE_REDIRECT = 'rankxai_delete_redirect';

	/** Menu slug, and the `page` query argument. */
	const PAGE = 'rankxai';

	/**
	 * Register the screen.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle_save' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_REDIRECT, array( __CLASS__, 'handle_delete_redirect' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( RANKXAI_PLUGIN_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * Add the settings page under Settings.
	 */
	public static function menu() {
		add_options_page(
			__( 'RankX AI', 'rankxai' ),
			__( 'RankX AI', 'rankxai' ),
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render' )
		);
	}

	/**
	 * A Settings link on the Plugins screen.
	 *
	 * @param string[] $links Existing links.
	 * @return string[]
	 */
	public static function action_links( $links ) {
		if ( ! is_array( $links ) ) {
			$links = array();
		}
		array_unshift(
			$links,
			'<a href="' . esc_url( self::page_url() ) . '">' . esc_html__( 'Settings', 'rankxai' ) . '</a>'
		);
		return $links;
	}

	/**
	 * This screen's own URL.
	 *
	 * @return string
	 */
	public static function page_url() {
		return admin_url( 'options-general.php?page=' . self::PAGE );
	}

	// -----------------------------------------------------------------------
	// Saving
	// -----------------------------------------------------------------------

	/**
	 * Handle the form.
	 *
	 * On `admin_post` rather than inside the page callback, so the redirect
	 * that stops a refresh resubmitting happens before any output. Capability
	 * is checked here as well as on the menu entry: the menu decides what is
	 * VISIBLE and this decides what is ALLOWED.
	 */
	public static function handle_save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION );

		// Every field is read and validated before anything is stored, so a
		// half-valid form cannot leave half of it applied.
		$twins_on = isset( $_POST['rankxai_twins_enabled'] );

		$post_types = array();
		if ( isset( $_POST['rankxai_twin_post_types'] ) && is_array( $_POST['rankxai_twin_post_types'] ) ) {
			foreach ( wp_unslash( $_POST['rankxai_twin_post_types'] ) as $type ) { // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Each element is sanitized on the next line.
				$type = sanitize_key( (string) $type );
				if ( '' !== $type && post_type_exists( $type ) && is_post_type_viewable( $type ) ) {
					$post_types[] = $type;
				}
			}
		}

		$documents = array();
		foreach ( RankXAI_Generate::supported() as $slug ) {
			$documents[ $slug ] = isset( $_POST['rankxai_generate'][ $slug ] );
		}

		$crawlers_on = isset( $_POST['rankxai_crawlers_enabled'] );

		// A submission that chose no post type keeps what is stored rather than
		// silently falling back to the default set — `null` is "unchanged".
		RankXAI_Twins::save_settings( $twins_on, $post_types ? $post_types : null );
		RankXAI_Generate::save_state( $documents );
		RankXAI_Crawlers::set_enabled( $crawlers_on );

		wp_safe_redirect( add_query_arg( 'rankxai-saved', '1', self::page_url() ) );
		exit;
	}

	/**
	 * Remove one of this plugin's own redirects.
	 *
	 * The site owner can undo anything RankX AI added here without RankX AI
	 * being reachable. Only our own store is touched: a redirect in Rank Math
	 * or the Redirection plugin is removed in that plugin's own screen.
	 */
	public static function handle_delete_redirect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change these settings.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION_DELETE_REDIRECT );

		$id = isset( $_POST['rankxai_redirect_id'] ) ? sanitize_key( wp_unslash( $_POST['rankxai_redirect_id'] ) ) : '';
		if ( '' !== $id ) {
			$result = RankXAI_Redirects::delete( 'own_store', $id );
			if ( '' === $result['error'] ) {
				RankXAI_Redirects::purge( $result['from'] );
			}
		}

		wp_safe_redirect( add_query_arg( 'rankxai-redirect-removed', '1', self::page_url() ) );
		exit;
	}

	// -----------------------------------------------------------------------
	// Rendering
	// -----------------------------------------------------------------------

	/**
	 * The screen.
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$twins     = RankXAI_Twins::settings();
		$generated = RankXAI_Generate::stored_state();

		echo '<div class="wrap">';
		echo '<h1>' . esc_html__( 'RankX AI', 'rankxai' ) . '</h1>';

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Reading a redirect marker, not acting on it.
		if ( isset( $_GET['rankxai-saved'] ) ) {
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'rankxai' ) . '</p></div>';
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Reading a redirect marker, not acting on it.
		if ( isset( $_GET['rankxai-redirect-removed'] ) ) {
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Redirect removed.', 'rankxai' ) . '</p></div>';
		}

		echo '<p>' . esc_html__( 'Everything on this screen is local to this site. It works whether or not the site is connected to a RankX AI account.', 'rankxai' ) . '</p>';

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION ) . '" />';
		wp_nonce_field( self::ACTION );

		self::render_twins( $twins );
		self::render_documents( $generated );
		self::render_crawlers();

		submit_button();
		echo '</form>';

		// Outside the settings form: each row is its own form, and forms cannot nest.
		self::render_redirects();

		self::render_connection();

		echo '</div>';
	}

	/**
	 * This plugin's own redirects, each removable.
	 *
	 * Shown only when there are some, or when RankX AI would add them to
	 * another plugin, so a site that uses neither sees nothing new.
	 */
	private static function render_redirects() {
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

		echo '<h2>' . esc_html__( 'Redirects', 'rankxai' ) . '</h2>';
		if ( '' !== $elsewhere ) {
			echo '<p>' . esc_html(
				sprintf(
					/* translators: %s: the name of another plugin. */
					__( 'Redirects RankX AI adds on this site go into %s, and are managed in its own screens.', 'rankxai' ),
					$elsewhere
				)
			) . '</p>';
		}
		if ( ! $own ) {
			return;
		}

		echo '<p>' . esc_html__( 'These redirects are kept by this plugin. Each one answers only when its old address would otherwise show "page not found". Hit counts are low when a page cache answers a visit without WordPress.', 'rankxai' ) . '</p>';
		echo '<table class="widefat striped"><thead><tr>';
		echo '<th>' . esc_html__( 'From', 'rankxai' ) . '</th>';
		echo '<th>' . esc_html__( 'To', 'rankxai' ) . '</th>';
		echo '<th>' . esc_html__( 'Hits', 'rankxai' ) . '</th>';
		echo '<th></th></tr></thead><tbody>';
		foreach ( $own as $item ) {
			echo '<tr>';
			echo '<td><code>' . esc_html( $item['from'] ) . '</code></td>';
			echo '<td><code>' . esc_html( $item['to'] ) . '</code></td>';
			echo '<td>' . esc_html( (string) $item['hits'] ) . '</td>';
			echo '<td><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
			echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION_DELETE_REDIRECT ) . '" />';
			echo '<input type="hidden" name="rankxai_redirect_id" value="' . esc_attr( $item['id'] ) . '" />';
			wp_nonce_field( self::ACTION_DELETE_REDIRECT );
			submit_button( __( 'Remove', 'rankxai' ), 'delete small', 'submit', false );
			echo '</form></td>';
			echo '</tr>';
		}
		echo '</tbody></table>';
	}

	/**
	 * The markdown copies section.
	 *
	 * @param array{enabled: bool, post_types: string[]} $twins Stored settings.
	 */
	private static function render_twins( $twins ) {
		echo '<h2>' . esc_html__( 'Markdown copies', 'rankxai' ) . '</h2>';
		echo '<p>' . esc_html__( 'Publish a plain-text copy of every page, so an AI assistant reads your words rather than the markup your theme wraps them in. Each copy is generated from the page itself, carries noindex, and links back to the page it came from.', 'rankxai' ) . '</p>';

		echo '<table class="form-table" role="presentation"><tbody>';

		echo '<tr><th scope="row">' . esc_html__( 'Publish copies', 'rankxai' ) . '</th><td>';
		echo '<label><input type="checkbox" name="rankxai_twins_enabled" value="1" ' . checked( $twins['enabled'], true, false ) . ' /> ';
		echo esc_html__( 'Serve a markdown copy of every eligible page', 'rankxai' ) . '</label>';
		echo '<p class="description">' . esc_html__( 'Off by default. Switching this on publishes new addresses on your site.', 'rankxai' ) . '</p>';
		echo '</td></tr>';

		echo '<tr><th scope="row">' . esc_html__( 'Which content', 'rankxai' ) . '</th><td>';
		$available = self::available_post_types();
		if ( $available ) {
			foreach ( $available as $type ) {
				$label = isset( $type->labels->name ) ? (string) $type->labels->name : $type->name;
				echo '<label style="display:block;margin-bottom:4px"><input type="checkbox" name="rankxai_twin_post_types[]" value="' . esc_attr( $type->name ) . '" ';
				echo checked( in_array( $type->name, $twins['post_types'], true ), true, false ) . ' /> ';
				echo esc_html( $label ) . '</label>';
			}
			echo '<p class="description">' . esc_html__( 'A page you have marked noindex never gets a copy, whatever is ticked here.', 'rankxai' ) . '</p>';
		} else {
			echo '<p class="description">' . esc_html__( 'This site has no public content types.', 'rankxai' ) . '</p>';
		}
		echo '</td></tr>';

		if ( $twins['enabled'] ) {
			echo '<tr><th scope="row">' . esc_html__( 'Index of copies', 'rankxai' ) . '</th><td>';
			$sitemap = RankXAI_Twins::sitemap_url();
			echo '<a href="' . esc_url( $sitemap ) . '" target="_blank" rel="noopener">' . esc_html( $sitemap ) . '</a>';
			echo '<p class="description">' . esc_html__( 'Deliberately not listed in robots.txt: declaring noindex addresses to a search engine earns a warning for each one.', 'rankxai' ) . '</p>';
			echo '</td></tr>';
		}

		echo '</tbody></table>';
	}

	/**
	 * The root documents section.
	 *
	 * Every document in the catalogue gets a row, including the one this plugin
	 * will not compose. A screen that simply omitted `ai.txt` would read as the
	 * plugin not knowing about it, when the truth is that it declines to invent
	 * a position on machine-learning licensing for somebody else.
	 *
	 * @param array<string, bool> $generated Stored per-slug generation state.
	 */
	private static function render_documents( $generated ) {
		echo '<h2>' . esc_html__( 'Root documents', 'rankxai' ) . '</h2>';
		echo '<p>' . esc_html__( 'Served from the root address of this site. Nothing is written to your server: WordPress answers when the address is requested. If another plugin already serves one of these, it keeps it.', 'rankxai' ) . '</p>';

		// A ticked box that serves nothing reads as a broken plugin. Say why.
		if ( RankXAI_Generate::site_discourages_indexing() ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'This site is set to discourage search engines (Settings → Reading), so nothing is generated here and markdown copies are not served. Anything published from a RankX AI account is still served.', 'rankxai' ) . '</p></div>';
		}

		echo '<table class="form-table" role="presentation"><tbody>';

		$supported = RankXAI_Generate::supported();
		foreach ( RankXAI_Documents::catalogue() as $slug => $doc ) {
			$state = RankXAI_Documents::effective( $slug );
			$url   = home_url( '/' . $doc['path'] );

			echo '<tr><th scope="row">' . esc_html( $doc['label'] ) . '</th><td>';

			if ( in_array( $slug, $supported, true ) ) {
				echo '<label><input type="checkbox" name="rankxai_generate[' . esc_attr( $slug ) . ']" value="1" ';
				echo checked( ! empty( $generated[ $slug ] ), true, false ) . ' /> ';
				echo esc_html__( 'Generate it from the content on this site', 'rankxai' ) . '</label>';
			}

			echo '<p class="description">' . esc_html( self::describe_document( $state['source'] ) ) . '</p>';

			if ( '' !== $state['content'] || 'file' === $state['source'] ) {
				echo '<p><a href="' . esc_url( $url ) . '" target="_blank" rel="noopener">' . esc_html( $url ) . '</a></p>';
			}
			echo '</td></tr>';
		}

		echo '</tbody></table>';
	}

	/**
	 * The AI crawler visits section.
	 *
	 * Says what is stored before anything else, because the switch is a
	 * decision about this site's visitors' data, and says what cannot be seen,
	 * because a number without that note reads as the whole truth.
	 */
	private static function render_crawlers() {
		$on     = RankXAI_Crawlers::enabled();
		$config = RankXAI_Crawlers::config_summary();
		$caches = RankXAI_Crawlers::page_caches();

		echo '<h2>' . esc_html__( 'AI crawler visits', 'rankxai' ) . '</h2>';
		echo '<p>' . esc_html__( 'Count which AI crawlers, such as GPTBot, ClaudeBot and PerplexityBot, fetch which addresses on this site, per day. Only the crawler\'s name, the address, the response status and a count are kept, for 35 days. No IP address, browser details or anything about human visitors is stored, and nothing is sent anywhere: a connected RankX AI account reads the counts from this site.', 'rankxai' ) . '</p>';

		echo '<table class="form-table" role="presentation"><tbody>';
		echo '<tr><th scope="row">' . esc_html__( 'Count visits', 'rankxai' ) . '</th><td>';
		echo '<label><input type="checkbox" name="rankxai_crawlers_enabled" value="1" ' . checked( $on, true, false ) . ' /> ';
		echo esc_html__( 'Count visits from AI crawlers', 'rankxai' ) . '</label>';
		echo '<p class="description">' . esc_html__( 'Off by default. Each crawler visit adds one small database write.', 'rankxai' ) . '</p>';
		echo '</td></tr>';

		echo '<tr><th scope="row">' . esc_html__( 'What is seen', 'rankxai' ) . '</th><td>';
		if ( $caches ) {
			echo '<p>' . esc_html(
				sprintf(
					/* translators: %s: names of page-cache plugins. */
					__( 'This site runs %s, which answers repeat visits without WordPress running. Only the visits it does not answer are counted, so the real numbers are higher.', 'rankxai' ),
					implode( ', ', $caches )
				)
			) . '</p>';
		}
		echo '<p class="description">' . esc_html__( 'Only visits that reach WordPress are counted. A visit your host or a firewall refuses before WordPress runs is not.', 'rankxai' ) . '</p>';
		if ( $config['prefixes'] > 0 ) {
			echo '<p class="description">' . esc_html__( 'Each visit is also checked against the address ranges the crawler\'s operator publishes, sent here by RankX AI.', 'rankxai' ) . '</p>';
		} else {
			echo '<p class="description">' . esc_html__( 'Crawlers are named from what they say they are. With a RankX AI account connected, each visit is also checked against the address ranges the crawler\'s operator publishes.', 'rankxai' ) . '</p>';
		}
		echo '</td></tr>';
		echo '</tbody></table>';

		if ( ! $on ) {
			return;
		}
		$summary = RankXAI_Crawlers::summary( 7 );
		if ( ! $summary ) {
			echo '<p>' . esc_html__( 'No crawler visits counted in the last 7 days.', 'rankxai' ) . '</p>';
			return;
		}
		echo '<p>' . esc_html__( 'The last 7 days:', 'rankxai' ) . '</p>';
		echo '<table class="widefat striped" style="max-width:720px"><thead><tr>';
		// Without published ranges nothing can be checked, and a column headed
		// "from elsewhere" would imply every visit was an impostor.
		$checked = $config['prefixes'] > 0;
		echo '<th>' . esc_html__( 'Crawler', 'rankxai' ) . '</th>';
		if ( $checked ) {
			echo '<th>' . esc_html__( 'From its published addresses', 'rankxai' ) . '</th>';
			echo '<th>' . esc_html__( 'From other addresses', 'rankxai' ) . '</th>';
		} else {
			echo '<th>' . esc_html__( 'Visits', 'rankxai' ) . '</th>';
		}
		echo '<th>' . esc_html__( 'Addresses', 'rankxai' ) . '</th>';
		echo '</tr></thead><tbody>';
		foreach ( $summary as $row ) {
			echo '<tr><td><code>' . esc_html( $row['bot'] ) . '</code></td>';
			if ( $checked ) {
				echo '<td>' . esc_html( number_format_i18n( $row['in_range'] ) ) . '</td>';
				echo '<td>' . esc_html( number_format_i18n( $row['other'] ) ) . '</td>';
			} else {
				echo '<td>' . esc_html( number_format_i18n( $row['in_range'] + $row['other'] ) ) . '</td>';
			}
			echo '<td>' . esc_html( number_format_i18n( $row['paths'] ) ) . '</td></tr>';
		}
		echo '</tbody></table>';
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

	/**
	 * What, if anything, RankX AI has sent this site.
	 *
	 * The plugin never calls RankX AI (its only outbound request is the GitHub
	 * build's update check), so it cannot ask whether an account is connected. What it can state is a fact it holds locally: the most
	 * recent time something arrived. "Nothing yet" is said plainly rather than
	 * dressed as a problem, because a site using only the local features is
	 * working exactly as intended.
	 */
	private static function render_connection() {
		echo '<h2>' . esc_html__( 'RankX AI account', 'rankxai' ) . '</h2>';

		$latest = self::last_update_received();
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

		echo '<p>' . esc_html__( 'With an account connected, this plugin also writes SEO titles, descriptions and social tags into whichever SEO plugin you run — or renders them itself if you run none — publishes structured data into the page head, and fills these documents with your own approved description of the business rather than a list of page titles.', 'rankxai' ) . '</p>';
		echo '<p><a href="https://rankxai.com" target="_blank" rel="noopener">' . esc_html__( 'rankxai.com', 'rankxai' ) . '</a></p>';
	}

	/**
	 * The newest timestamp across everything the platform writes here.
	 *
	 * @return string A site-formatted date, or '' when nothing has arrived.
	 */
	private static function last_update_received() {
		$stamps = array();

		foreach ( array_keys( RankXAI_Documents::catalogue() ) as $slug ) {
			$stored = RankXAI_Documents::get( $slug );
			if ( null !== $stored && '' !== $stored['updated'] ) {
				$stamps[] = $stored['updated'];
			}
		}
		$context = RankXAI_Twins::context();
		if ( '' !== $context['updated'] ) {
			$stamps[] = $context['updated'];
		}

		if ( ! $stamps ) {
			return '';
		}
		sort( $stamps );
		$newest = strtotime( (string) end( $stamps ) );
		if ( ! $newest ) {
			return '';
		}
		return wp_date( (string) get_option( 'date_format' ) . ' ' . (string) get_option( 'time_format' ), $newest );
	}
}
