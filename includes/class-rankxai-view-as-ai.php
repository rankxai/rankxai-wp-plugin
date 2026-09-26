<?php
/**
 * "View as AI": what an AI assistant is given for one post.
 *
 * Reached from the "View as AI" link under a post or page in the lists. It
 * shows the Markdown this plugin would serve for the post (even with markdown
 * copies switched off; nothing is published by looking), and compares the
 * text the server sends with the text in the editor. When the server sends far
 * less, the words are probably added by JavaScript in the browser, which many
 * AI crawlers never run.
 *
 * The comparison asks this site for the page once, from this screen. A page
 * that is not public yet, or that the site will not serve to itself, gets the
 * Markdown alone and says why: never a false alarm.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * View as AI.
 */
class RankXAI_View_As_AI {

	/**
	 * Below this share of the editor's words in the page the server sends, the
	 * screen warns. Set by measurement (plan 82 §7.4): real pages on the two
	 * live sites and the builder-heavy fixture all sit far above it, and a body
	 * injected by JavaScript sits near zero.
	 */
	const THRESHOLD = 0.5;

	/** Fewer distinct words than this in the editor is too little to compare. */
	const MIN_WORDS = 20;

	/**
	 * Add the row action.
	 */
	public static function init() {
		add_filter( 'post_row_actions', array( __CLASS__, 'row_action' ), 10, 2 );
		add_filter( 'page_row_actions', array( __CLASS__, 'row_action' ), 10, 2 );
	}

	/**
	 * The link under a post in the list.
	 *
	 * @param string[] $actions Row actions.
	 * @param WP_Post  $post    Post.
	 * @return string[]
	 */
	public static function row_action( $actions, $post ) {
		if ( ! $post instanceof WP_Post || ! is_post_type_viewable( $post->post_type ) || ! current_user_can( 'edit_post', $post->ID ) ) {
			return $actions;
		}
		$url                        = add_query_arg(
			array(
				'page' => RankXAI_Admin::PAGE_VIEW,
				'post' => (int) $post->ID,
			),
			admin_url( 'admin.php' )
		);
		$actions['rankxai_view_ai'] = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'View as AI', 'rankxai' ) . '</a>';
		return $actions;
	}

	/**
	 * The post asked for, if the user may edit it.
	 *
	 * @return WP_Post|null
	 */
	private static function requested_post() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Choosing which post to display; nothing is changed.
		$id   = isset( $_GET['post'] ) ? absint( wp_unslash( $_GET['post'] ) ) : 0;
		$post = $id ? get_post( $id ) : null;
		return $post instanceof WP_Post && current_user_can( 'edit_post', $post->ID ) ? $post : null;
	}

	/**
	 * Refuse before wp-admin prints anything, so the refusal is a real 403.
	 * Hooked to the screen's `load-` action.
	 */
	public static function guard() {
		if ( null === self::requested_post() ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to view this post.', 'rankxai' ), '', array( 'response' => 403 ) );
		}
	}

	/**
	 * The screen.
	 */
	public static function render() {
		$post = self::requested_post();
		if ( null === $post ) {
			return;
		}

		RankXAI_UI::open_page(
			__( 'View as AI', 'rankxai' ),
			sprintf(
				/* translators: %s: post title. */
				__( 'What an AI assistant is given for "%s".', 'rankxai' ),
				wp_strip_all_tags( get_the_title( $post ) )
			),
			''
		);

		$comparison = self::compare( $post );
		self::comparison_card( $comparison );
		self::signals_card( $post, $comparison );
		self::markdown_card( $post );

		RankXAI_UI::close_page();
	}

	// -----------------------------------------------------------------------
	// Comparison
	// -----------------------------------------------------------------------

	/**
	 * Compare what the server sends with what the editor holds.
	 *
	 * @param WP_Post $post Post.
	 * @return array{state: string, coverage: float, editorWords: int, deliveredWords: int, status: int, html: string}
	 */
	public static function compare( $post ) {
		$out = array(
			'state'          => 'not_public',
			'coverage'       => 0.0,
			'editorWords'    => 0,
			'deliveredWords' => 0,
			'status'         => 0,
			'html'           => '',
		);
		// A draft, a scheduled or private post, or a password-protected one
		// cannot be fetched as a crawler would, so there is nothing to compare.
		if ( 'publish' !== $post->post_status || '' !== $post->post_password ) {
			return $out;
		}
		$editor             = self::words( self::editor_text( $post ) );
		$out['editorWords'] = count( $editor );

		// Fetched even when there is too little to compare: the noindex and
		// canonical signals come from the page itself.
		$path          = (string) wp_parse_url( (string) get_permalink( $post ), PHP_URL_PATH );
		$query         = (string) wp_parse_url( (string) get_permalink( $post ), PHP_URL_QUERY );
		$response      = RankXAI_Loopback::request( RankXAI_Loopback::url( $path . ( '' === $query ? '' : '?' . $query ) ), 'GET' );
		$out['status'] = $response['status'];
		if ( 200 !== $response['status'] ) {
			$out['state'] = count( $editor ) < self::MIN_WORDS ? 'too_short' : 'could_not_check';
			return $out;
		}
		$out['html']           = $response['body'];
		$delivered             = self::words( self::visible_text( $response['body'] ) );
		$out['deliveredWords'] = count( $delivered );
		if ( count( $editor ) < self::MIN_WORDS ) {
			$out['state'] = 'too_short';
			return $out;
		}
		$found           = count( array_intersect_key( $editor, $delivered ) );
		$out['coverage'] = $found / count( $editor );
		$out['state']    = $out['coverage'] < self::THRESHOLD ? 'missing' : 'ok';
		return $out;
	}

	/**
	 * The words the author wrote, from the stored content: block comments and
	 * shortcode tags removed, the words inside a shortcode kept, and scripts
	 * and styles dropped with their contents.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	public static function editor_text( $post ) {
		$text = (string) $post->post_content;
		$text = preg_replace( '/<!--.*?-->/s', ' ', $text );
		$text = preg_replace( '/\[\/?[A-Za-z0-9_-]+[^\]]*\]/', ' ', (string) $text );
		return wp_strip_all_tags( (string) $text );
	}

	/**
	 * The text a visitor would read on the page the server sends, without the
	 * site's chrome: scripts, styles, headers, footers, menus and sidebars go
	 * first, or a long footer hides a missing body.
	 *
	 * @param string $html Whole page.
	 * @return string
	 */
	public static function visible_text( $html ) {
		if ( '' === trim( (string) $html ) || ! class_exists( 'DOMDocument' ) ) {
			return '';
		}
		$dom      = new DOMDocument( '1.0', 'UTF-8' );
		$previous = libxml_use_internal_errors( true );
		$loaded   = $dom->loadHTML( '<?xml encoding="utf-8" ?>' . $html, LIBXML_NOERROR | LIBXML_NOWARNING );
		libxml_clear_errors();
		libxml_use_internal_errors( $previous );
		if ( ! $loaded ) {
			return '';
		}
		$remove = array();
		foreach ( array( 'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'header', 'footer', 'nav', 'aside', 'form' ) as $tag ) {
			foreach ( $dom->getElementsByTagName( $tag ) as $node ) {
				$remove[] = $node;
			}
		}
		$xpath = new DOMXPath( $dom );
		foreach ( $xpath->query( '//*[@role="banner" or @role="navigation" or @role="contentinfo" or @role="complementary"]' ) as $node ) {
			$remove[] = $node;
		}
		// phpcs:disable WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM properties.
		foreach ( $remove as $node ) {
			if ( $node->parentNode ) {
				$node->parentNode->removeChild( $node );
			}
		}
		// phpcs:enable WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
		$body = $dom->getElementsByTagName( 'body' );
		return 0 === $body->length ? '' : (string) $body->item( 0 )->textContent;
	}

	/**
	 * Distinct words of four letters or more, lower-cased, as keys.
	 *
	 * @param string $text Text.
	 * @return array<string, true>
	 */
	public static function words( $text ) {
		$out = array();
		foreach ( (array) preg_split( '/[^\p{L}\p{N}]+/u', mb_strtolower( html_entity_decode( (string) $text, ENT_QUOTES, 'UTF-8' ) ) ) as $word ) {
			if ( mb_strlen( (string) $word ) >= 4 ) {
				$out[ (string) $word ] = true;
			}
		}
		return $out;
	}

	// -----------------------------------------------------------------------
	// Rendering
	// -----------------------------------------------------------------------

	/**
	 * The comparison, as the page's hero.
	 *
	 * @param array $c Comparison.
	 */
	private static function comparison_card( $c ) {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Does the server send your words?', 'rankxai' ),
				'subtitle' => __( 'The text in the page this site sends, set against the text in the editor.', 'rankxai' ),
				'hero'     => true,
			)
		);
		if ( 'not_public' === $c['state'] ) {
			RankXAI_UI::analysis( __( 'This post is not public yet (a draft, scheduled, private or password-protected), so we cannot see what the server sends. The Markdown below is what an assistant would be given once it is published.', 'rankxai' ) );
		} elseif ( 'too_short' === $c['state'] ) {
			RankXAI_UI::analysis( __( 'There is too little text in the editor to compare. A page built entirely in a page builder that keeps its content elsewhere looks like this too.', 'rankxai' ) );
		} elseif ( 'could_not_check' === $c['state'] ) {
			RankXAI_UI::analysis(
				0 === $c['status']
					? __( 'This site did not answer a request to itself, so we could not see what it sends. That is a reading problem, not a finding about the page.', 'rankxai' )
					: sprintf(
						/* translators: %d: HTTP status code. */
						__( 'This site answered %d when asked for the page, so we could not compare. A staging site behind a password answers like this.', 'rankxai' ),
						(int) $c['status']
					)
			);
		} else {
			RankXAI_UI::grid_open( 'three' );
			RankXAI_UI::stat( __( 'Editor words found in the page', 'rankxai' ), round( 100 * $c['coverage'] ) . '%', __( 'Share of the distinct words in the editor that appear in the page the server sends.', 'rankxai' ), 'missing' === $c['state'] ? 'danger' : 'neutral' );
			RankXAI_UI::stat( __( 'Distinct words in the editor', 'rankxai' ), number_format_i18n( $c['editorWords'] ), __( 'Words of four letters or more.', 'rankxai' ) );
			RankXAI_UI::stat( __( 'Distinct words the server sends', 'rankxai' ), number_format_i18n( $c['deliveredWords'] ), __( 'In the page body, without menus, header and footer.', 'rankxai' ) );
			RankXAI_UI::grid_close();
			RankXAI_UI::analysis(
				'missing' === $c['state']
					? __( 'Most of this page\'s text is not in the HTML the server sends. AI crawlers that don\'t run JavaScript may not see it.', 'rankxai' )
					: __( 'The server sends the page\'s text, so an AI crawler that does not run JavaScript still reads it.', 'rankxai' )
			);
			RankXAI_UI::note(
				sprintf(
					/* translators: %d: a percentage. */
					__( 'The warning appears below %d%%.', 'rankxai' ),
					(int) round( 100 * self::THRESHOLD )
				)
			);
		}
		RankXAI_UI::card_close();
	}

	/**
	 * Noindex, canonical and robots.txt for this address.
	 *
	 * @param WP_Post $post Post.
	 * @param array   $c    Comparison, whose HTML carries the canonical tag.
	 */
	private static function signals_card( $post, $c ) {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'What tells assistants whether to use it', 'rankxai' ),
				'subtitle' => __( 'Noindex, the canonical address, and robots.txt for this page.', 'rankxai' ),
			)
		);
		$noindex   = RankXAI_Twins::is_noindexed( $post->ID );
		$canonical = self::canonical( $c['html'] );
		$rows      = array(
			array( __( 'Search engines and assistants may index it', 'rankxai' ), $noindex ? RankXAI_UI::chip( __( 'No, it is marked noindex', 'rankxai' ), 'warning' ) : RankXAI_UI::chip( __( 'Yes', 'rankxai' ), 'success' ) ),
			array(
				__( 'Canonical address', 'rankxai' ),
				null === $canonical
					? esc_html__( 'Not known until the page can be read', 'rankxai' )
					: ( '' === $canonical ? esc_html__( 'None printed', 'rankxai' ) : '<code>' . esc_html( $canonical ) . '</code>' ),
			),
		);
		$robots    = RankXAI_Robots::reading();
		$path      = self::public_path( $post );
		if ( 'ok' === $robots['state'] ) {
			$parsed = RankXAI_Robots::parse( $robots['body'] );
			foreach ( RankXAI_Robots::crawlers() as $crawler ) {
				if ( 'training' === $crawler['purpose'] ) {
					continue;
				}
				$access = RankXAI_Robots::access_for( $parsed, $crawler['token'], $path )['access'];
				$rows[] = array(
					sprintf(
						/* translators: 1: assistant, 2: crawler token. */
						__( '%1$s (%2$s) may read it', 'rankxai' ),
						$crawler['assistant'],
						$crawler['token']
					),
					'blocked' === $access ? RankXAI_UI::chip( __( 'Blocked by robots.txt', 'rankxai' ), 'warning' ) : RankXAI_UI::chip( __( 'Yes', 'rankxai' ), 'success' ),
				);
			}
		} else {
			$rows[] = array( __( 'robots.txt', 'rankxai' ), 'absent' === $robots['state'] ? esc_html__( 'None served, so every crawler may read it', 'rankxai' ) : esc_html__( 'Could not be read', 'rankxai' ) );
		}
		RankXAI_UI::table( array( __( 'Signal', 'rankxai' ), __( 'For this page', 'rankxai' ) ), $rows, array( 1 ) );
		RankXAI_UI::card_close();
	}

	/**
	 * The canonical address the page prints, '' when it prints none, or null
	 * when the page could not be read: the SEO plugin decides it on output, so
	 * it is not guessed.
	 *
	 * @param string $html Page HTML, or ''.
	 * @return string|null
	 */
	private static function canonical( $html ) {
		if ( '' === $html ) {
			return null;
		}
		if ( preg_match( '/<link[^>]+rel=["\']canonical["\'][^>]*>/i', $html, $tag ) && preg_match( '/href=["\']([^"\']+)["\']/i', $tag[0], $href ) ) {
			return html_entity_decode( $href[1], ENT_QUOTES, 'UTF-8' );
		}
		return '';
	}

	/**
	 * The path the post has, or will have once published: a draft's permalink
	 * is `?p=`, which robots.txt rules for its real address would not match.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	private static function public_path( $post ) {
		$url = (string) get_permalink( $post );
		if ( 'publish' !== $post->post_status && function_exists( 'get_sample_permalink' ) ) {
			list( $template, $name ) = get_sample_permalink( $post->ID );
			$url                     = str_replace( array( '%pagename%', '%postname%' ), $name, (string) $template );
		}
		$path = (string) wp_parse_url( $url, PHP_URL_PATH );
		return '' === $path ? '/' : $path;
	}

	/**
	 * The Markdown this plugin serves an assistant for the post.
	 *
	 * @param WP_Post $post Post.
	 */
	private static function markdown_card( $post ) {
		$twins = RankXAI_Twins::settings();
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'The Markdown an assistant is given', 'rankxai' ),
				'subtitle' => $twins['enabled']
					? __( 'Served as this page\'s markdown copy.', 'rankxai' )
					: __( 'Shown here only. Markdown copies are switched off, so nothing is published.', 'rankxai' ),
			)
		);
		$context = RankXAI_Twins::context();
		// An assistant is never logged in. Rendered as the admin, a page that
		// greets its reader shows their name and a log-out link.
		$user = get_current_user_id();
		wp_set_current_user( 0 );
		try {
			$markdown = RankXAI_Markdown::document( $post, '', $context['content'] );
		} finally {
			wp_set_current_user( $user );
		}
		echo '<pre class="rankxai-pre">' . esc_html( $markdown ) . '</pre>';
		RankXAI_UI::card_close();
	}
}
