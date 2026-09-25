<?php
/**
 * The AI crawlers page: which AI crawlers read this site, and whether
 * robots.txt lets them in.
 *
 * Built from counts already stored and one reading of robots.txt. Every number
 * is "visits that reached WordPress", because a page cache or a firewall can
 * answer a visit before WordPress runs, and the page says so first.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * AI crawlers page content.
 */
class RankXAI_Crawler_Page {

	/**
	 * Purpose groups, in the order shown.
	 *
	 * @return array<string, string>
	 */
	private static function groups() {
		return array(
			'search'        => __( 'Search and answers', 'rankxai' ),
			'user'          => __( 'Fetching a page a person asked about', 'rankxai' ),
			'training'      => __( 'Collecting pages for training', 'rankxai' ),
			'search_engine' => __( 'Search engines', 'rankxai' ),
			'other'         => __( 'Other crawlers', 'rankxai' ),
		);
	}

	/**
	 * Which group a crawler id belongs to.
	 *
	 * @param string $bot Crawler id.
	 * @return string
	 */
	public static function group_of( $bot ) {
		$meta = RankXAI_Crawlers::meta( $bot );
		if ( 'search_engine' === $meta['group'] ) {
			return 'search_engine';
		}
		return in_array( $meta['purpose'], array( 'search', 'user', 'training' ), true ) ? $meta['purpose'] : 'other';
	}

	/**
	 * The window the page covers, from `?days=`.
	 *
	 * @return int 7 or 30.
	 */
	private static function days() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Choosing what to display, not acting on input.
		$days = isset( $_GET['days'] ) ? absint( wp_unslash( $_GET['days'] ) ) : 7;
		return 30 === $days ? 30 : 7;
	}

	/**
	 * Render the page body.
	 */
	public static function render() {
		$days    = self::days();
		$on      = RankXAI_Crawlers::enabled();
		$report  = RankXAI_Crawlers::report( $days );
		$robots  = RankXAI_Robots::reading();
		$checked = RankXAI_Crawlers::config_summary()['prefixes'] > 0;

		self::hero( $days, $on, $report );
		self::robots_card( $robots, $report );
		if ( $report['bots'] ) {
			self::visits_card( $report, $checked );
		}
		if ( $report['errors'] ) {
			self::errors_card( $report, $checked );
		}
		if ( $on ) {
			self::unseen_card( $report );
		}
		self::requests_card();
		if ( $on || RankXAI_Crawlers::table_exists() ) {
			self::counting_card( $on );
		}
	}

	// -----------------------------------------------------------------------
	// Hero
	// -----------------------------------------------------------------------

	/**
	 * The page's one hero: what reached WordPress, with the caveat first.
	 *
	 * @param int   $days   Window.
	 * @param bool  $on     Counting is on.
	 * @param array $report Report.
	 */
	private static function hero( $days, $on, $report ) {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'What AI crawlers did on this site', 'rankxai' ),
				'subtitle' => $on
					? sprintf(
						/* translators: %s: a date. */
						__( 'Visits that reached WordPress since %s.', 'rankxai' ),
						wp_date( (string) get_option( 'date_format' ), (int) strtotime( $report['since'] . ' 12:00:00' ) )
					)
					: __( 'Counting is off, so no visits are counted.', 'rankxai' ),
				'hero'     => true,
			)
		);

		// Off, with nothing stored: say what counting keeps, and offer the one switch.
		if ( ! $on && ! $report['bots'] ) {
			echo '<p>' . esc_html( self::disclosure() ) . '</p>';
			$caches = RankXAI_Crawlers::page_caches();
			if ( $caches ) {
				RankXAI_UI::note(
					sprintf(
						/* translators: %s: names of page-cache plugins. */
						__( 'This site runs %s, which answers repeat visits without WordPress running, so only some crawler visits will be counted.', 'rankxai' ),
						implode( ', ', $caches )
					)
				);
			}
			echo '<div class="rankxai-actions">';
			RankXAI_UI::action_form( RankXAI_Admin::ACTION_CRAWLERS, __( 'Switch counting on', 'rankxai' ), array( 'rankxai_crawlers_enabled' => '1' ), 'primary' );
			echo '</div>';
			RankXAI_UI::card_close();
			return;
		}

		echo '<div class="rankxai-actions" role="group" aria-label="' . esc_attr__( 'Period', 'rankxai' ) . '">';
		foreach ( array( 7, 30 ) as $option ) {
			$url   = add_query_arg( 'days', $option, RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CRAWLERS ) );
			$label = sprintf(
				/* translators: %d: number of days. */
				_n( 'Last %d day', 'Last %d days', $option, 'rankxai' ),
				$option
			);
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Built by RankXAI_UI::button_link, which escapes.
			echo RankXAI_UI::button_link( $label, $url, $option === $days ? 'primary' : 'outline' );
		}
		echo '</div>';

		$ai     = 0;
		$errors = 0;
		$seen   = 0;
		foreach ( $report['bots'] as $bot => $row ) {
			if ( 'search_engine' !== self::group_of( $bot ) ) {
				$ai += $row['hits'];
				++$seen;
			}
			$errors += $row['errors'];
		}

		if ( $on || $report['bots'] ) {
			RankXAI_UI::grid_open( 'three' );
			RankXAI_UI::stat(
				__( 'AI crawler visits', 'rankxai' ),
				number_format_i18n( $ai ),
				__( 'Visits that reached WordPress. Search engines are counted separately below.', 'rankxai' )
			);
			RankXAI_UI::stat(
				__( 'AI crawlers seen', 'rankxai' ),
				number_format_i18n( $seen ),
				__( 'Distinct AI crawlers with at least one visit.', 'rankxai' )
			);
			RankXAI_UI::stat(
				__( 'Error answers', 'rankxai' ),
				number_format_i18n( $errors ),
				__( 'Visits that got a 4xx or 5xx answer, from any crawler.', 'rankxai' ),
				'neutral'
			);
			RankXAI_UI::grid_close();
			$spark = RankXAI_UI::sparkline( array_values( $report['daily'] ) );
			if ( '' !== $spark ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- An SVG built by RankXAI_UI::sparkline from integers.
				echo '<div class="rankxai-muted">' . $spark . '</div>';
			}
		}

		$caches = RankXAI_Crawlers::page_caches();
		if ( $caches ) {
			RankXAI_UI::analysis(
				sprintf(
					/* translators: %s: names of page-cache plugins. */
					__( 'This site runs %s, which answers repeat visits without WordPress running. Those visits are not counted, so the real numbers are higher, often much higher.', 'rankxai' ),
					implode( ', ', $caches )
				)
			);
		} else {
			RankXAI_UI::analysis( __( 'Only visits that reach WordPress are counted. A visit your host, a CDN or a firewall answers or refuses before WordPress runs is not seen.', 'rankxai' ) );
		}

		RankXAI_UI::card_close();
	}

	/**
	 * What counting stores, in one paragraph.
	 *
	 * @return string
	 */
	private static function disclosure() {
		return __( 'Counts which AI crawlers, such as GPTBot, ClaudeBot and PerplexityBot, fetch which addresses on this site, per day. Only the crawler\'s name, the address, the response status and a count are kept, for 35 days. No IP address, browser details or anything about human visitors is stored, and nothing is sent anywhere: a connected RankX AI account reads the counts from this site.', 'rankxai' );
	}

	// -----------------------------------------------------------------------
	// robots.txt
	// -----------------------------------------------------------------------

	/**
	 * One sentence summing up what robots.txt allows.
	 *
	 * @param array $robots robots.txt reading.
	 * @return string
	 */
	public static function robots_sentence( $robots ) {
		if ( 'absent' === $robots['state'] ) {
			return __( 'This site serves no robots.txt, so every AI crawler may read every page.', 'rankxai' );
		}
		if ( 'ok' !== $robots['state'] ) {
			return __( 'We could not read this site\'s robots.txt, so we cannot say which AI crawlers it lets in.', 'rankxai' );
		}
		$parsed = RankXAI_Robots::parse( $robots['body'] );
		if ( RankXAI_Robots::has_blanket_disallow( $parsed ) ) {
			return __( 'robots.txt tells every crawler to stay away from the whole site, AI assistants and search engines alike.', 'rankxai' );
		}
		$blocked = array();
		foreach ( RankXAI_Robots::assess( $parsed ) as $verdict ) {
			if ( 'blocked' === $verdict['access'] && 'training' !== $verdict['crawler']['purpose'] ) {
				$blocked[] = $verdict['crawler']['assistant'];
			}
		}
		$blocked = array_values( array_unique( $blocked ) );
		if ( $blocked ) {
			return sprintf(
				/* translators: %s: list of AI assistants. */
				__( 'robots.txt stops %s from reading this site, so it cannot show or cite your pages.', 'rankxai' ),
				implode( ', ', $blocked )
			);
		}
		return __( 'Every AI assistant we know of may read this site, according to robots.txt.', 'rankxai' );
	}

	/**
	 * The robots.txt card.
	 *
	 * @param array $robots robots.txt reading.
	 * @param array $report Crawler report.
	 */
	private static function robots_card( $robots, $report ) {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'robots.txt', 'rankxai' ),
				'subtitle' => __( 'What your robots.txt tells each AI crawler, read from the file this site serves.', 'rankxai' ),
				'id'       => 'rankxai-robots',
			)
		);
		echo '<p>' . esc_html( self::robots_sentence( $robots ) ) . '</p>';

		if ( 'ok' === $robots['state'] ) {
			$parsed   = RankXAI_Robots::parse( $robots['body'] );
			$verdicts = RankXAI_Robots::assess( $parsed );
			$blocked  = array_values(
				array_filter(
					$verdicts,
					function ( $v ) {
						return 'blocked' === $v['access'];
					}
				)
			);
			if ( $blocked ) {
				$rows = array();
				foreach ( $blocked as $v ) {
					$tone   = 'training' === $v['crawler']['purpose'] ? 'neutral' : 'warning';
					$rule   = $v['matchedRule'];
					$rows[] = array(
						'<strong>' . esc_html( $v['crawler']['assistant'] ) . '</strong><br><code>' . esc_html( $v['crawler']['token'] ) . '</code>',
						RankXAI_UI::chip( self::purpose_label( $v['crawler']['purpose'] ), $tone ),
						esc_html( $v['crawler']['consequence'] ),
						'<code>User-agent: ' . esc_html( (string) $v['decidedBy'] ) . '</code><br><code>Disallow: ' . esc_html( $rule ? $rule['pattern'] : '' ) . '</code>',
					);
				}
				RankXAI_UI::table( array( __( 'Crawler', 'rankxai' ), __( 'Purpose', 'rankxai' ), __( 'What it costs', 'rankxai' ), __( 'The rule that decides it', 'rankxai' ) ), $rows, array( 0, 1, 2, 3 ) );
				self::fix_yourself( $blocked, $robots['source'] );
			} else {
				echo '<details><summary>' . esc_html__( 'See each crawler', 'rankxai' ) . '</summary>';
				$rows = array();
				foreach ( $verdicts as $v ) {
					$rows[] = array( $v['crawler']['assistant'], $v['crawler']['token'], 'allowed' === $v['access'] ? __( 'Allowed', 'rankxai' ) : __( 'Not mentioned, so allowed', 'rankxai' ) );
				}
				RankXAI_UI::table( array( __( 'Assistant', 'rankxai' ), __( 'Crawler', 'rankxai' ), __( 'robots.txt', 'rankxai' ) ), $rows );
				echo '</details>';
			}
			self::mismatches( $verdicts, $report );
		}

		if ( $robots['cloudflare'] ) {
			RankXAI_UI::note( __( 'This is the file as this server serves it. Cloudflare can add its own AI-crawler rules in front of it; check Security → Bots in your Cloudflare dashboard.', 'rankxai' ) );
		}
		if ( $robots['outsideWordPress'] ) {
			RankXAI_UI::note( __( 'WordPress is installed in a folder, so robots.txt lives at the root of the domain, outside WordPress\'s control. Edit it wherever that root is managed.', 'rankxai' ) );
		}
		RankXAI_UI::note(
			sprintf(
				/* translators: %s: a date and time. */
				__( 'Read %s. Nothing here ever changes your robots.txt.', 'rankxai' ),
				wp_date( (string) get_option( 'date_format' ) . ' ' . (string) get_option( 'time_format' ), (int) strtotime( $robots['readAt'] ) )
			)
		);
		echo '<div class="rankxai-actions">';
		RankXAI_UI::action_form( RankXAI_Admin::ACTION_ROBOTS, __( 'Read robots.txt again', 'rankxai' ), array(), 'outline' );
		echo '</div>';
		RankXAI_UI::card_close();
	}

	/**
	 * The exact lines to add, and where they live.
	 *
	 * @param array  $blocked Blocked verdicts.
	 * @param string $source  Where robots.txt is edited.
	 */
	private static function fix_yourself( $blocked, $source ) {
		$lines = array();
		foreach ( $blocked as $v ) {
			if ( 'training' === $v['crawler']['purpose'] ) {
				continue;
			}
			$lines[] = 'User-agent: ' . $v['crawler']['token'];
			$lines[] = 'Allow: /';
			$lines[] = '';
		}
		if ( ! $lines ) {
			RankXAI_UI::note( __( 'Only training crawlers are blocked. That keeps your pages out of model training and does not stop AI assistants from finding or citing you, so there is nothing to fix unless you want to be trained on.', 'rankxai' ) );
			return;
		}
		echo '<details open><summary>' . esc_html__( 'Fix it yourself', 'rankxai' ) . '</summary>';
		echo '<p>' . esc_html__( 'To let the assistants above read your pages, add these lines to robots.txt. A group for a named crawler overrides a rule for every crawler (*), so nothing else in the file needs to change. If the block is deliberate, leave it.', 'rankxai' ) . '</p>';
		echo '<pre class="rankxai-pre">' . esc_html( trim( implode( "\n", $lines ) ) ) . '</pre>';
		echo '<p class="rankxai-field__hint">' . esc_html( RankXAI_Robots::where_to_edit( $source ) ) . '</p>';
		echo '</details>';
	}

	/**
	 * What only this plugin can see: robots.txt says one thing, visits another.
	 *
	 * @param array $verdicts robots.txt verdicts.
	 * @param array $report   Crawler report.
	 */
	private static function mismatches( $verdicts, $report ) {
		$refused = array();
		foreach ( $report['errors'] as $row ) {
			if ( 403 === $row['status'] || 429 === $row['status'] ) {
				foreach ( $row['bots'] as $bot ) {
					$refused[ $bot ] = ( isset( $refused[ $bot ] ) ? $refused[ $bot ] : 0 ) + $row['hits'];
				}
			}
		}
		foreach ( $verdicts as $v ) {
			$id = $v['crawler']['registryId'];
			if ( null === $id ) {
				continue;
			}
			$visits = isset( $report['bots'][ $id ] ) ? $report['bots'][ $id ]['hits'] : 0;
			if ( 'blocked' === $v['access'] && $visits > 0 ) {
				RankXAI_UI::analysis(
					sprintf(
						/* translators: 1: crawler token, 2: number of visits. */
						_n( 'robots.txt blocks %1$s, yet a crawler calling itself %1$s visited %2$s time. Either it ignores robots.txt, or something else is using its name.', 'robots.txt blocks %1$s, yet a crawler calling itself %1$s visited %2$s times. Either it ignores robots.txt, or something else is using its name.', $visits, 'rankxai' ),
						$v['crawler']['token'],
						number_format_i18n( $visits )
					)
				);
			}
			if ( 'blocked' !== $v['access'] && ! empty( $refused[ $id ] ) ) {
				RankXAI_UI::analysis(
					sprintf(
						/* translators: 1: crawler token, 2: number of visits. */
						_n( 'robots.txt allows %1$s, but this site refused it %2$s time. The block is not in robots.txt: it is usually a security plugin or firewall rule.', 'robots.txt allows %1$s, but this site refused it %2$s times. The block is not in robots.txt: it is usually a security plugin or firewall rule.', $refused[ $id ], 'rankxai' ),
						$v['crawler']['token'],
						number_format_i18n( $refused[ $id ] )
					)
				);
			}
		}
	}

	/**
	 * A purpose in words.
	 *
	 * @param string $purpose search, user_fetch or training.
	 * @return string
	 */
	private static function purpose_label( $purpose ) {
		if ( 'search' === $purpose ) {
			return __( 'Search and answers', 'rankxai' );
		}
		if ( 'user_fetch' === $purpose ) {
			return __( 'Fetches for a person', 'rankxai' );
		}
		return __( 'Training', 'rankxai' );
	}

	// -----------------------------------------------------------------------
	// Visits
	// -----------------------------------------------------------------------

	/**
	 * Visits per crawler, grouped by what the visit is for.
	 *
	 * @param array $report   Report.
	 * @param bool  $checked Address ranges are held, so visits can be checked.
	 */
	private static function visits_card( $report, $checked ) {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Visits by crawler', 'rankxai' ),
				'subtitle' => __( 'Grouped by what the visit is for, and the pages each one read most.', 'rankxai' ),
			)
		);
		$by_group = array();
		foreach ( $report['bots'] as $bot => $row ) {
			$by_group[ self::group_of( $bot ) ][ $bot ] = $row;
		}
		foreach ( self::groups() as $group => $label ) {
			if ( empty( $by_group[ $group ] ) ) {
				continue;
			}
			echo '<h3 class="rankxai-card__title">' . esc_html( $label ) . '</h3>';
			$rows = array();
			foreach ( $by_group[ $group ] as $bot => $row ) {
				$meta  = RankXAI_Crawlers::meta( $bot );
				$top   = $row['top'] ? $row['top'][0]['path'] : '';
				$name  = '<strong>' . esc_html( $meta['label'] ) . '</strong><br><code>' . esc_html( $bot ) . '</code>';
				$count = number_format_i18n( $row['hits'] );
				if ( $checked ) {
					$count .= ' <span class="rankxai-muted">(' . esc_html(
						sprintf(
							/* translators: %s: number of visits. */
							__( '%s from its published addresses', 'rankxai' ),
							number_format_i18n( $row['inRange'] )
						)
					) . ')</span>';
				}
				$rows[] = array( $name, $count, number_format_i18n( $row['paths'] ), '' === $top ? '—' : '<code>' . esc_html( $top ) . '</code>' );
			}
			RankXAI_UI::table( array( __( 'Crawler', 'rankxai' ), __( 'Visits', 'rankxai' ), __( 'Pages', 'rankxai' ), __( 'Most-read page', 'rankxai' ) ), $rows, array( 0, 1, 3 ), array( 2 ) );
		}
		RankXAI_UI::note(
			$checked
				? __( 'A visit from an address the crawler\'s operator publishes is counted as that crawler. The rest only say they are.', 'rankxai' )
				: __( 'Crawlers are named from what they say they are. With a RankX AI account connected, each visit is also checked against the address ranges the operator publishes.', 'rankxai' )
		);
		RankXAI_UI::card_close();
	}

	/**
	 * Error answers AI crawlers got, by page, with the fix for each.
	 *
	 * @param array $report   Report.
	 * @param bool  $checked Visits can be checked against published ranges.
	 */
	private static function errors_card( $report, $checked ) {
		$backend = RankXAI_Redirect_Requests::backend();
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Errors AI crawlers hit', 'rankxai' ),
				'subtitle' => __( 'Pages that answered with an error, and what to do about each.', 'rankxai' ),
			)
		);
		$has_form = false;
		echo '<div class="rankxai-table-wrap"><table class="rankxai-table"><thead><tr>';
		foreach ( array( __( 'Address', 'rankxai' ), __( 'Answer', 'rankxai' ), __( 'Crawlers', 'rankxai' ), __( 'Visits', 'rankxai' ), __( 'What to do', 'rankxai' ) ) as $header ) {
			echo '<th scope="col">' . esc_html( $header ) . '</th>';
		}
		echo '</tr></thead><tbody>';
		foreach ( array_slice( $report['errors'], 0, 50 ) as $row ) {
			$names = array();
			foreach ( array_unique( $row['bots'] ) as $bot ) {
				$label   = RankXAI_Crawlers::meta( $bot )['label'];
				$names[] = ( $checked && $row['inRange'] ) ? $label : sprintf(
					/* translators: %s: a crawler name. */
					__( 'says it is %s', 'rankxai' ),
					$label
				);
			}
			echo '<tr><td><code>' . esc_html( $row['path'] ) . '</code></td>';
			echo '<td>' . wp_kses_post( RankXAI_UI::chip( (string) $row['status'], $row['status'] >= 500 ? 'danger' : 'neutral' ) ) . '</td>';
			echo '<td>' . esc_html( implode( ', ', $names ) ) . '</td>';
			echo '<td class="is-num">' . esc_html( number_format_i18n( $row['hits'] ) ) . '</td><td>';
			if ( 404 === $row['status'] || 410 === $row['status'] ) {
				if ( RankXAI_Crawlers::is_probe_path( $row['path'] ) ) {
					echo esc_html__( 'Looks like a probe for software this site may not run. Nothing to fix.', 'rankxai' );
				} elseif ( ! RankXAI_Redirect_Requests::offerable( $row['path'] ) ) {
					echo esc_html__( 'This address was too long to store in full, so it cannot be redirected from here.', 'rankxai' );
				} elseif ( '' === $backend['backend'] ) {
					echo esc_html( $backend['reason'] );
				} else {
					self::redirect_form( $row['path'], 'crawlers' );
					$has_form = true;
				}
			} elseif ( 403 === $row['status'] || 429 === $row['status'] ) {
				echo esc_html__( 'AI crawlers were refused here. That is usually a security plugin or firewall rule, not robots.txt.', 'rankxai' );
			} elseif ( $row['status'] >= 500 ) {
				echo esc_html__( 'Your site answered with a server error. Your host\'s error log says why.', 'rankxai' );
			} else {
				echo esc_html__( 'Check the page opens for a visitor.', 'rankxai' );
			}
			echo '</td></tr>';
		}
		echo '</tbody></table></div>';
		if ( $has_form ) {
			self::destinations_list();
			RankXAI_UI::note(
				sprintf(
					/* translators: %s: where the redirect is stored. */
					__( 'A redirect is added to %s, and only after a check confirms the address is still missing. WordPress already redirects posts whose address you changed, so most of these need a destination you choose.', 'rankxai' ),
					$backend['label']
				)
			);
		}
		RankXAI_UI::card_close();
	}

	/**
	 * The small "Add redirect" form for one missing address.
	 *
	 * @param string $from   Missing address.
	 * @param string $source Page the request came from.
	 */
	public static function redirect_form( $from, $source ) {
		echo '<form class="rankxai-inline-form rankxai-redirect-form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="' . esc_attr( RankXAI_Admin::ACTION_ADD_REDIRECT ) . '" />';
		echo '<input type="hidden" name="rankxai_from" value="' . esc_attr( $from ) . '" />';
		echo '<input type="hidden" name="rankxai_source" value="' . esc_attr( $source ) . '" />';
		wp_nonce_field( RankXAI_Admin::ACTION_ADD_REDIRECT );
		echo '<label class="screen-reader-text" for="rankxai-to-' . esc_attr( md5( $from ) ) . '">' . esc_html__( 'Redirect to', 'rankxai' ) . '</label>';
		echo '<input class="rankxai-input" id="rankxai-to-' . esc_attr( md5( $from ) ) . '" name="rankxai_to" list="rankxai-destinations" placeholder="' . esc_attr__( 'Choose a page', 'rankxai' ) . '" required />';
		echo '<button type="submit" class="rankxai-button rankxai-button--outline">' . esc_html__( 'Add redirect', 'rankxai' ) . '</button>';
		echo '</form>';
	}

	/**
	 * The shared list of destinations the redirect forms offer.
	 */
	public static function destinations_list() {
		echo '<datalist id="rankxai-destinations">';
		foreach ( RankXAI_Redirect_Requests::destinations() as $dest ) {
			echo '<option value="' . esc_attr( $dest['path'] ) . '" label="' . esc_attr( $dest['title'] ) . '"></option>';
		}
		echo '</datalist>';
	}

	/**
	 * Search assistants that did not visit.
	 *
	 * @param array $report Report.
	 */
	private static function unseen_card( $report ) {
		$unseen = array();
		foreach ( array_keys( RankXAI_Crawlers::bots() ) as $bot ) {
			$meta = RankXAI_Crawlers::meta( $bot );
			if ( 'ai' === $meta['group'] && 'search' === $meta['purpose'] && empty( $report['bots'][ $bot ] ) ) {
				$unseen[] = $meta['label'];
			}
		}
		if ( ! $unseen ) {
			return;
		}
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'No visits seen', 'rankxai' ),
				'subtitle' => sprintf(
					/* translators: %s: a date. */
					__( 'AI search crawlers with no visit reaching WordPress since %s.', 'rankxai' ),
					wp_date( (string) get_option( 'date_format' ), (int) strtotime( $report['since'] . ' 12:00:00' ) )
				),
			)
		);
		echo '<p>' . esc_html( implode( ', ', $unseen ) ) . '</p>';
		RankXAI_UI::note( __( '"No visits seen" is not the same as blocked. A page cache or a CDN may have answered these crawlers without WordPress running, or they have not come by yet.', 'rankxai' ) );
		RankXAI_UI::card_close();
	}

	/**
	 * Redirect requests made from this page, and how each ended.
	 */
	private static function requests_card() {
		self::requests( 'crawlers' );
	}

	/**
	 * Recent redirect requests from one page.
	 *
	 * @param string $source 'crawlers' or 'checks'.
	 */
	public static function requests( $source ) {
		$recent = RankXAI_Redirect_Requests::recent( $source );
		if ( ! $recent ) {
			return;
		}
		$tones = array(
			'checking'        => array( __( 'Checking', 'rankxai' ), 'info' ),
			'added'           => array( __( 'Added', 'rankxai' ), 'success' ),
			'refused'         => array( __( 'Not added', 'rankxai' ), 'neutral' ),
			'could_not_check' => array( __( 'Could not check', 'rankxai' ), 'warning' ),
			'failed'          => array( __( 'Failed', 'rankxai' ), 'danger' ),
		);
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Redirects you asked for', 'rankxai' ),
				'subtitle' => __( 'Each is added only after a check confirms the address is still missing.', 'rankxai' ),
			)
		);
		$rows = array();
		foreach ( $recent as $request ) {
			$tone    = isset( $tones[ $request['state'] ] ) ? $tones[ $request['state'] ] : $tones['refused'];
			$message = $request['message'];
			// The check runs in WP-Cron, which runs only when something triggers it.
			if ( 'checking' === $request['state'] && time() - (int) strtotime( $request['requested'] ) > 10 * MINUTE_IN_SECONDS ) {
				$message = __( 'Still waiting: WordPress\'s scheduled tasks have not run the check yet. If this does not change, scheduled tasks are not running on this site, and nothing will be added.', 'rankxai' );
			}
			$rows[] = array(
				'<code>' . esc_html( $request['from'] ) . '</code> → <code>' . esc_html( $request['to'] ) . '</code>',
				RankXAI_UI::chip( $tone[0], $tone[1] ),
				esc_html( $message ),
			);
		}
		RankXAI_UI::table( array( __( 'Redirect', 'rankxai' ), __( 'State', 'rankxai' ), __( 'What happened', 'rankxai' ) ), $rows, array( 0, 1, 2 ) );
		RankXAI_UI::card_close();
	}

	// -----------------------------------------------------------------------
	// Counting
	// -----------------------------------------------------------------------

	/**
	 * The switch, what is stored, and clearing.
	 *
	 * @param bool $on Counting is on.
	 */
	private static function counting_card( $on ) {
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Crawler counting', 'rankxai' ),
				'subtitle' => __( 'Off by default. Only visits that reach WordPress are counted.', 'rankxai' ),
			)
		);
		echo '<p>' . esc_html( self::disclosure() ) . '</p>';
		RankXAI_UI::note( __( 'Each crawler visit adds one small database write. A cache plugin\'s "do not cache these user agents" setting would let more visits through to be counted, at the cost of more load on your server; that is your choice to make, and it is never changed from here.', 'rankxai' ) );

		echo '<div class="rankxai-actions">';
		if ( $on ) {
			echo wp_kses_post( RankXAI_UI::chip( __( 'Counting is on', 'rankxai' ), 'success' ) );
			RankXAI_UI::action_form( RankXAI_Admin::ACTION_CRAWLERS, __( 'Switch counting off', 'rankxai' ), array( 'rankxai_crawlers_enabled' => '0' ), 'outline' );
		} else {
			RankXAI_UI::action_form( RankXAI_Admin::ACTION_CRAWLERS, __( 'Switch counting on', 'rankxai' ), array( 'rankxai_crawlers_enabled' => '1' ), 'primary' );
		}
		if ( RankXAI_Crawlers::table_exists() ) {
			RankXAI_UI::action_form( RankXAI_Admin::ACTION_CLEAR_COUNTS, __( 'Clear counts', 'rankxai' ), array(), 'danger' );
		}
		echo '</div>';
		if ( $on && '' !== RankXAI_Crawlers::enabled_at() ) {
			RankXAI_UI::note(
				sprintf(
					/* translators: %s: a date. */
					__( 'Counting since %s. Clearing the counts starts that date again.', 'rankxai' ),
					wp_date( (string) get_option( 'date_format' ), (int) strtotime( RankXAI_Crawlers::enabled_at() ) )
				)
			);
		}
		RankXAI_UI::card_close();
	}
}
