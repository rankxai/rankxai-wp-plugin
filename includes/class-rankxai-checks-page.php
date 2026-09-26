<?php
/**
 * The Site checks page: broken and redirected internal links, pages nothing
 * links to, and images with no text description.
 *
 * Every list says what the scan could see. A link is "broken" only when this
 * site answered "not found"; a page is an orphan only when no link we could
 * see points at it, and the page says which links we could see.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Site checks page content.
 */
class RankXAI_Checks_Page {

	/**
	 * Render the page body.
	 */
	public static function render() {
		$findings = RankXAI_Scan::findings();
		self::hero( $findings );
		if ( 'done' === $findings['status'] ) {
			self::broken_card( $findings );
			self::redirects_card( $findings );
			self::orphans_card( $findings );
			self::unlinked_card( $findings );
			self::images_card( $findings );
			RankXAI_Crawler_Page::requests( 'checks' );
		}
		self::coverage_card( $findings );
	}

	/**
	 * The hero: where the scan is, and the strongest thing it found.
	 *
	 * @param array $findings Findings.
	 */
	private static function hero( $findings ) {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'What the last site check found', 'rankxai' ),
				'subtitle' => self::subtitle( $findings ),
				'hero'     => true,
			)
		);
		$status = $findings['status'];
		if ( 'never' === $status ) {
			echo '<p>' . esc_html__( 'A site check reads your published pages a few at a time in the background, the way a visitor sees them, and lists the links that are broken or go through a redirect, the pages nothing links to, and the images with no text description. It changes nothing on your site.', 'rankxai' ) . '</p>';
			self::scan_button( __( 'Run the first site check', 'rankxai' ) );
		} elseif ( 'running' === $status || 'paused' === $status ) {
			$state = RankXAI_Scan::state();
			RankXAI_UI::progress(
				(int) $state['scanned'],
				max( 1, (int) $state['total'] ),
				sprintf(
					/* translators: 1: pages scanned, 2: total pages. */
					__( 'Scanned %1$s of %2$s pages.', 'rankxai' ),
					number_format_i18n( (int) $state['scanned'] ),
					number_format_i18n( (int) $state['total'] )
				)
			);
			if ( ! empty( $state['lastBatch'] ) ) {
				RankXAI_UI::note(
					sprintf(
						/* translators: %s: a date and time. */
						__( 'Last batch ran at %s.', 'rankxai' ),
						self::when( (string) $state['lastBatch'] )
					)
				);
			}
			if ( 'paused' === $status ) {
				RankXAI_UI::analysis( __( 'Paused: WordPress\'s scheduled tasks are not running on this site, so the check cannot continue. They run when someone visits the site; if your host switched them off, ask it to run wp-cron.php on a schedule.', 'rankxai' ) );
			} elseif ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
				RankXAI_UI::note( __( 'WordPress\'s own scheduler is switched off here (DISABLE_WP_CRON), so the check runs only when your host\'s scheduled task calls wp-cron.php.', 'rankxai' ) );
			}
		} else {
			$broken    = count( $findings['broken'] );
			$redirects = count( $findings['redirects'] );
			$orphans   = count( $findings['orphans'] );
			RankXAI_UI::grid_open( 'three' );
			RankXAI_UI::stat( __( 'Broken internal links', 'rankxai' ), number_format_i18n( $broken ), __( 'Links to an address on this site that answered "not found".', 'rankxai' ), $broken > 0 ? 'danger' : 'neutral' );
			RankXAI_UI::stat( __( 'Links through a redirect', 'rankxai' ), number_format_i18n( $redirects ), __( 'Links that work, but make a crawler take an extra step.', 'rankxai' ) );
			RankXAI_UI::stat( __( 'Pages nothing links to', 'rankxai' ), number_format_i18n( $orphans ), __( 'Pages with no link from your content or menus.', 'rankxai' ) );
			RankXAI_UI::grid_close();
			RankXAI_UI::analysis( self::headline( $findings ) );
			self::scan_button( __( 'Check again', 'rankxai' ), 'outline' );
		}
		RankXAI_UI::card_close();
	}

	/**
	 * The hero's one sentence: the strongest true statement, problems first.
	 *
	 * @param array $findings Findings.
	 * @return string
	 */
	public static function headline( $findings ) {
		$broken = count( $findings['broken'] );
		if ( $broken > 0 ) {
			return sprintf(
				/* translators: %s: number of links. */
				_n( '%s internal link leads to a page that no longer exists. Visitors and AI crawlers who follow it hit "not found".', '%s internal links lead to a page that no longer exists. Visitors and AI crawlers who follow them hit "not found".', $broken, 'rankxai' ),
				number_format_i18n( $broken )
			);
		}
		$redirects = count( $findings['redirects'] );
		if ( $redirects > 0 ) {
			return sprintf(
				/* translators: %s: number of links. */
				_n( '%s link goes through a redirect. Point it straight at the final page.', '%s links go through a redirect. Point them straight at the final page.', $redirects, 'rankxai' ),
				number_format_i18n( $redirects )
			);
		}
		$orphans = count( $findings['orphans'] );
		if ( $orphans > 0 ) {
			return sprintf(
				/* translators: %s: number of pages. */
				_n( '%s page has no link to it from your content or menus, so crawlers that follow links will not find it.', '%s pages have no link to them from your content or menus, so crawlers that follow links will not find them.', $orphans, 'rankxai' ),
				number_format_i18n( $orphans )
			);
		}
		return sprintf(
			/* translators: %s: number of links. */
			__( 'Every one of the %s internal links we could see leads straight to a working page, and every page has a link to it.', 'rankxai' ),
			number_format_i18n( $findings['links'] )
		);
	}

	/**
	 * The hero's subtitle.
	 *
	 * @param array $findings Findings.
	 * @return string
	 */
	private static function subtitle( $findings ) {
		if ( 'done' === $findings['status'] && '' !== $findings['finished'] ) {
			return sprintf(
				/* translators: 1: number of pages, 2: a date and time. */
				__( '%1$s pages read, finished %2$s.', 'rankxai' ),
				number_format_i18n( $findings['scanned'] ),
				self::when( $findings['finished'] )
			);
		}
		if ( 'never' === $findings['status'] ) {
			return __( 'No site check has run yet.', 'rankxai' );
		}
		return __( 'A site check is running in the background.', 'rankxai' );
	}

	/**
	 * A date in the site's own format.
	 *
	 * @param string $iso ISO 8601.
	 * @return string
	 */
	private static function when( $iso ) {
		return wp_date( (string) get_option( 'date_format' ) . ' ' . (string) get_option( 'time_format' ), (int) strtotime( $iso ) );
	}

	/**
	 * The "Scan now" form.
	 *
	 * @param string $label   Button label.
	 * @param string $variant Button variant.
	 */
	private static function scan_button( $label, $variant = 'primary' ) {
		echo '<div class="rankxai-actions">';
		RankXAI_UI::action_form( RankXAI_Admin::ACTION_SCAN, $label, array(), $variant );
		echo '</div>';
	}

	/**
	 * Links to "Edit" each of a few pages.
	 *
	 * @param int[] $ids Post ids.
	 * @return string HTML.
	 */
	private static function edit_links( $ids ) {
		$links = array();
		foreach ( array_slice( $ids, 0, 5 ) as $id ) {
			$url     = get_edit_post_link( $id, 'raw' );
			$title   = get_the_title( $id );
			$links[] = $url ? '<a href="' . esc_url( $url ) . '">' . esc_html( '' === $title ? '#' . $id : $title ) . '</a>' : esc_html( $title );
		}
		$more = count( $ids ) - 5;
		if ( $more > 0 ) {
			$links[] = esc_html(
				sprintf(
					/* translators: %d: number of pages. */
					_n( 'and %d more', 'and %d more', $more, 'rankxai' ),
					$more
				)
			);
		}
		return implode( ', ', $links );
	}

	/**
	 * Broken internal links.
	 *
	 * @param array $findings Findings.
	 */
	private static function broken_card( $findings ) {
		if ( ! $findings['broken'] ) {
			return;
		}
		$backend = RankXAI_Redirect_Requests::backend();
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Broken internal links', 'rankxai' ),
				'subtitle' => __( 'This site answered "not found" for each of these addresses.', 'rankxai' ),
			)
		);
		echo '<div class="rankxai-table-wrap"><table class="rankxai-table"><thead><tr>';
		foreach ( array( __( 'Missing address', 'rankxai' ), __( 'Linked from', 'rankxai' ), __( 'Fix it yourself', 'rankxai' ), __( 'Fix it here', 'rankxai' ) ) as $header ) {
			echo '<th scope="col">' . esc_html( $header ) . '</th>';
		}
		echo '</tr></thead><tbody>';
		$forms = false;
		foreach ( $findings['broken'] as $item ) {
			echo '<tr><td><code>' . esc_html( $item['path'] ) . '</code></td>';
			echo '<td>' . wp_kses_post( self::edit_links( $item['sources'] ) ) . '</td>';
			echo '<td>' . esc_html__( 'Edit the linking page and point the link at the right page, or remove it.', 'rankxai' ) . '</td><td>';
			$path = (string) wp_parse_url( $item['path'], PHP_URL_PATH );
			if ( '' !== $backend['backend'] && RankXAI_Redirect_Requests::offerable( $path ) && false === strpos( $item['path'], '?' ) ) {
				RankXAI_Crawler_Page::redirect_form( $path, 'checks' );
				$forms = true;
			} elseif ( '' !== $backend['reason'] ) {
				echo esc_html( $backend['reason'] );
			} else {
				echo '—';
			}
			echo '</td></tr>';
		}
		echo '</tbody></table></div>';
		if ( $forms ) {
			RankXAI_Crawler_Page::destinations_list();
		}
		RankXAI_UI::card_close();
	}

	/**
	 * Links that go through a redirect.
	 *
	 * @param array $findings Findings.
	 */
	private static function redirects_card( $findings ) {
		if ( ! $findings['redirects'] ) {
			return;
		}
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Links through a redirect', 'rankxai' ),
				'subtitle' => __( 'These work, but each makes a visitor or a crawler take an extra step. Point them straight at the final page.', 'rankxai' ),
			)
		);
		$rows = array();
		foreach ( $findings['redirects'] as $item ) {
			$rows[] = array(
				'<code>' . esc_html( $item['path'] ) . '</code>',
				'' === $item['final'] ? esc_html__( 'Somewhere else', 'rankxai' ) : '<code>' . esc_html( $item['final'] ) . '</code>',
				self::edit_links( $item['sources'] ),
			);
		}
		RankXAI_UI::table( array( __( 'Link points at', 'rankxai' ), __( 'Final page', 'rankxai' ), __( 'Edit the page', 'rankxai' ) ), $rows, array( 0, 1, 2 ) );
		RankXAI_UI::card_close();
	}

	/**
	 * Orphan pages, and pages with a single link.
	 *
	 * @param array $findings Findings.
	 */
	private static function orphans_card( $findings ) {
		if ( ! $findings['orphans'] && ! $findings['weak'] ) {
			return;
		}
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Pages nothing links to', 'rankxai' ),
				'subtitle' => __( 'No links to these pages were found in your content or menus.', 'rankxai' ),
			)
		);
		foreach ( array(
			'orphans' => __( 'No links at all', 'rankxai' ),
			'weak'    => __( 'Only one link', 'rankxai' ),
		) as $list => $label ) {
			if ( ! $findings[ $list ] ) {
				continue;
			}
			echo '<h3 class="rankxai-card__title">' . esc_html( $label ) . '</h3>';
			$rows = array();
			foreach ( array_slice( $findings[ $list ], 0, 30 ) as $item ) {
				$candidates = RankXAI_Scan::link_candidates( $item['id'] );
				$rows[]     = array(
					self::post_cell( $item ),
					$item['visits'] > 0 ? esc_html( number_format_i18n( $item['visits'] ) ) : '—',
					$candidates
						? esc_html__( 'Link to it from a related page:', 'rankxai' ) . ' ' . self::edit_links( wp_list_pluck( $candidates, 'id' ) )
						: esc_html__( 'Link to it from a page on the same subject, or add it to a menu.', 'rankxai' ),
				);
			}
			RankXAI_UI::table( array( __( 'Page', 'rankxai' ), __( 'AI crawler visits', 'rankxai' ), __( 'Fix it yourself', 'rankxai' ) ), $rows, array( 0, 1, 2 ), array( 1 ) );
		}
		RankXAI_UI::note( __( 'Your home page, posts page and shop pages are reached by design and are never listed. Pages you have marked noindex are left out too.', 'rankxai' ) );
		RankXAI_UI::card_close();
	}

	/**
	 * Posts and products with no link from another page. Archives still list
	 * them, so this is advice, not an orphan claim.
	 *
	 * @param array $findings Findings.
	 */
	private static function unlinked_card( $findings ) {
		if ( ! $findings['unlinkedPosts'] ) {
			return;
		}
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Posts with no links from your other pages', 'rankxai' ),
				'subtitle' => __( 'Archives and the shop still list these. AI crawlers follow links in the text, so a link from a related page helps them find each one.', 'rankxai' ),
			)
		);
		$rows = array();
		foreach ( array_slice( $findings['unlinkedPosts'], 0, 30 ) as $item ) {
			$candidates = RankXAI_Scan::link_candidates( $item['id'] );
			$rows[]     = array(
				self::post_cell( $item ),
				$candidates ? self::edit_links( wp_list_pluck( $candidates, 'id' ) ) : '—',
			);
		}
		RankXAI_UI::table( array( __( 'Post', 'rankxai' ), __( 'Pages that could link to it', 'rankxai' ) ), $rows, array( 0, 1 ) );
		if ( count( $findings['unlinkedPosts'] ) > 30 ) {
			RankXAI_UI::note(
				sprintf(
					/* translators: %d: number of posts. */
					__( '%d more are not shown.', 'rankxai' ),
					count( $findings['unlinkedPosts'] ) - 30
				)
			);
		}
		RankXAI_UI::card_close();
	}

	/**
	 * A page's title, linked to its editor, with its address beneath.
	 *
	 * @param array $item Finding.
	 * @return string HTML.
	 */
	private static function post_cell( $item ) {
		$url = get_edit_post_link( $item['id'], 'raw' );
		$t   = '' === $item['title'] ? '#' . $item['id'] : $item['title'];
		return ( $url ? '<a href="' . esc_url( $url ) . '"><strong>' . esc_html( $t ) . '</strong></a>' : '<strong>' . esc_html( $t ) . '</strong>' ) . '<br><code>' . esc_html( $item['path'] ) . '</code>';
	}

	/**
	 * Images with no text description.
	 *
	 * @param array $findings Findings.
	 */
	private static function images_card( $findings ) {
		$library = $findings['libraryNoAlt'];
		if ( ! $findings['missingAlt'] && 0 === $findings['emptyAlt'] && 0 === $library['empty'] ) {
			return;
		}
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Images and text descriptions', 'rankxai' ),
				'subtitle' => __( 'Alt text is how an AI assistant, and a screen reader, knows what an image shows.', 'rankxai' ),
			)
		);
		if ( $findings['missingAlt'] ) {
			echo '<p>' . esc_html__( 'These pages have images with no alt attribute at all:', 'rankxai' ) . '</p>';
			$rows = array();
			foreach ( array_slice( $findings['missingAlt'], 0, 30 ) as $item ) {
				$rows[] = array( self::edit_links( array( $item['id'] ) ), number_format_i18n( $item['missing'] ) );
			}
			RankXAI_UI::table( array( __( 'Page', 'rankxai' ), __( 'Images', 'rankxai' ) ), $rows, array( 0 ), array( 1 ) );
		}
		if ( $findings['emptyAlt'] > 0 ) {
			RankXAI_UI::note(
				sprintf(
					/* translators: %s: number of images. */
					_n( '%s image on your pages has an empty text description. That is right for a decorative image; if it shows something, describe it.', '%s images on your pages have an empty text description. That is right for a decorative image; if one shows something, describe it.', $findings['emptyAlt'], 'rankxai' ),
					number_format_i18n( $findings['emptyAlt'] )
				)
			);
		}
		if ( $library['empty'] > 0 ) {
			RankXAI_UI::note(
				sprintf(
					/* translators: 1: images without alt text, 2: all images in the library. */
					_n( 'For information: %1$s of %2$s images in your media library has no alt text. Many are never placed on a page, so this is not a problem on its own; the text is set in Media.', 'For information: %1$s of %2$s images in your media library have no alt text. Many are never placed on a page, so this is not a problem on its own; the text is set in Media.', $library['empty'], 'rankxai' ),
					number_format_i18n( $library['empty'] ),
					number_format_i18n( $library['total'] )
				)
			);
		}
		echo '<div class="rankxai-actions">' . wp_kses_post( RankXAI_UI::button_link( __( 'Open the media library', 'rankxai' ), admin_url( 'upload.php?mode=list' ), 'outline' ) ) . '</div>';
		RankXAI_UI::card_close();
	}

	/**
	 * What a site check covers, and what it cannot see.
	 *
	 * @param array $findings Findings.
	 */
	private static function coverage_card( $findings ) {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'What a site check covers', 'rankxai' ),
				'subtitle' => __( 'Read this before acting on an "orphan" or a "broken" link.', 'rankxai' ),
			)
		);
		$types = array();
		foreach ( $findings['types'] ? $findings['types'] : RankXAI_Scan::post_types() as $type ) {
			$object  = get_post_type_object( $type );
			$types[] = $object && isset( $object->labels->name ) ? $object->labels->name : $type;
		}
		echo '<ul class="rankxai-rows">';
		echo '<li>' . esc_html(
			sprintf(
				/* translators: %s: list of content types. */
				__( 'Reads: published %s (the types your sitemap lists), rendered the way a visitor sees them, and your navigation menus.', 'rankxai' ),
				implode( ', ', $types )
			)
		) . '</li>';
		if ( 'could_not_read' === $findings['chrome'] ) {
			$chrome = __( 'Could not read the header and footer of your home page, because this site did not answer a request to itself. A page linked only from there may be listed as having no links. Does not see: widgets in a sidebar, and anything added by JavaScript in the browser.', 'rankxai' );
		} elseif ( 'read' === $findings['chrome'] ) {
			$chrome = __( 'Also reads: the header, footer and menus of your home page as the server sends it, so links your theme or a page builder puts there count. Does not see: widgets in a sidebar, and anything added by JavaScript in the browser.', 'rankxai' );
		} else {
			$chrome = function_exists( 'wp_is_block_theme' ) && wp_is_block_theme()
				? __( 'Also reads: your theme\'s header and footer, and its navigation. Does not see: links a page builder keeps outside the page content, and anything added by JavaScript in the browser.', 'rankxai' )
				: __( 'Does not see: widgets, links your theme writes into its own header and footer templates, links a page builder keeps outside the page content, and anything added by JavaScript in the browser.', 'rankxai' );
		}
		echo '<li>' . esc_html( $chrome ) . '</li>';
		echo '<li>' . esc_html__( 'Links to other websites are not checked here. A RankX AI site audit checks them.', 'rankxai' ) . '</li>';
		echo '<li>' . esc_html__( 'Each address is confirmed by asking this site for it, from your own server, with the user agent RankXAI-SiteCheck. A security plugin\'s or a redirect plugin\'s 404 log may list these requests.', 'rankxai' ) . '</li>';
		echo '</ul>';
		if ( $findings['capped'] ) {
			RankXAI_UI::analysis( __( 'This site has more links than a site check stores, so the check stopped reading early and its lists are incomplete.', 'rankxai' ) );
		}
		if ( 'done' === $findings['status'] && $findings['couldNotCheck'] > 0 ) {
			RankXAI_UI::note(
				sprintf(
					/* translators: %s: number of addresses. */
					_n( '%s address could not be checked, because this site did not answer a request to itself. It is not counted as broken.', '%s addresses could not be checked, because this site did not answer a request to itself. They are not counted as broken.', $findings['couldNotCheck'], 'rankxai' ),
					number_format_i18n( $findings['couldNotCheck'] )
				)
			);
		}
		RankXAI_UI::card_close();
	}
}
