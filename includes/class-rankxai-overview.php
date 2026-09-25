<?php
/**
 * What the Overview page says: one hero sentence and one card per feature.
 *
 * The hero is the strongest TRUE statement this site supports, picked in a
 * fixed order: a real problem first, then what the site checks found, then a
 * good state. Site checks lead (plan 82 DG82-6): they work on every site from
 * the first scan, while crawler counting is off by default and a page cache
 * hides most visits. Everything here is deterministic and never calls out.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Overview content.
 */
class RankXAI_Overview {

	/**
	 * The public AI Visibility Checker on rankxai.com (plan 82 4a).
	 *
	 * Empty until that page is live: a link must never point at a page that is
	 * not there. While empty, the card says what an account adds instead.
	 */
	const CHECKER_URL = '';

	/**
	 * The hero sentence and its one action.
	 *
	 * @return array{text: string, action: string}
	 */
	public static function hero() {
		if ( RankXAI_Generate::site_discourages_indexing() ) {
			return array(
				'text'   => __( 'This site asks search engines not to index it (Settings → Reading). AI search assistants are asked the same, so they are unlikely to show your pages.', 'rankxai' ),
				'action' => RankXAI_UI::button_link( __( 'Open Reading settings', 'rankxai' ), admin_url( 'options-reading.php' ), 'primary' ),
			);
		}
		$robots = RankXAI_Robots::reading();
		$parsed = 'ok' === $robots['state'] ? RankXAI_Robots::parse( $robots['body'] ) : null;
		if ( $parsed && self::blocks_search( $parsed ) ) {
			return array(
				'text'   => RankXAI_Crawler_Page::robots_sentence( $robots ),
				'action' => RankXAI_UI::button_link( __( 'See the rules and how to change them', 'rankxai' ), RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CRAWLERS ) . '#rankxai-robots', 'primary' ),
			);
		}
		$findings = RankXAI_Scan::findings();
		if ( 'done' === $findings['status'] ) {
			return array(
				'text'   => RankXAI_Checks_Page::headline( $findings ),
				'action' => RankXAI_UI::button_link( __( 'Open site checks', 'rankxai' ), RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CHECKS ), 'primary' ),
			);
		}
		if ( 'never' === $findings['status'] ) {
			return array(
				'text'   => ( $parsed || 'absent' === $robots['state'] ? __( 'robots.txt lets AI assistants read this site. ', 'rankxai' ) : '' ) . __( 'The next thing to know is whether your links and pages hold up: run the first site check to find broken links, links through redirects and pages nothing links to.', 'rankxai' ),
				'action' => RankXAI_UI::action_form_html( RankXAI_Admin::ACTION_SCAN, __( 'Run the first site check', 'rankxai' ), array(), 'primary' ),
			);
		}
		return array(
			'text'   => __( 'A site check is running in the background. Its findings will appear here.', 'rankxai' ),
			'action' => RankXAI_UI::button_link( __( 'See its progress', 'rankxai' ), RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CHECKS ), 'outline' ),
		);
	}

	/**
	 * Does robots.txt stop an assistant's search or fetch crawler?
	 *
	 * @param array $parsed Parsed robots.txt.
	 * @return bool
	 */
	private static function blocks_search( $parsed ) {
		foreach ( RankXAI_Robots::assess( $parsed ) as $verdict ) {
			if ( 'blocked' === $verdict['access'] && 'training' !== $verdict['crawler']['purpose'] ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * One card per feature, each with its state and its next step. Site checks
	 * first (DG82-6), crawler visits second.
	 *
	 * Card actions are built by RankXAI_UI helpers, which escape everything.
	 *
	 * @return array<int, array{title: string, subtitle: string, state: string, text: string, action: string, link: string, link_label: string}>
	 */
	public static function cards() {
		return array(
			self::checks_card(),
			self::crawler_card(),
			self::robots_card(),
			self::documents_card(),
			self::visibility_card(),
		);
	}

	/**
	 * Site checks.
	 *
	 * @return array<string, string>
	 */
	private static function checks_card() {
		$f    = RankXAI_Scan::findings();
		$card = array(
			'title'      => __( 'Site checks', 'rankxai' ),
			'subtitle'   => __( 'Broken and redirected links, pages nothing links to, and images with no text description.', 'rankxai' ),
			'link'       => RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CHECKS ),
			'link_label' => __( 'See all', 'rankxai' ),
			'action'     => '',
		);
		if ( 'never' === $f['status'] ) {
			$card['state']  = RankXAI_UI::chip( __( 'Not run yet', 'rankxai' ) );
			$card['text']   = __( 'A site check reads your published pages in the background and lists what AI crawlers would trip over. It changes nothing.', 'rankxai' );
			$card['action'] = RankXAI_UI::action_form_html( RankXAI_Admin::ACTION_SCAN, __( 'Run a site check', 'rankxai' ), array(), 'outline' );
			return $card;
		}
		if ( 'done' !== $f['status'] ) {
			$card['state'] = RankXAI_UI::chip( 'paused' === $f['status'] ? __( 'Paused', 'rankxai' ) : __( 'Running', 'rankxai' ), 'paused' === $f['status'] ? 'warning' : 'info' );
			$card['text']  = sprintf(
				/* translators: 1: pages scanned, 2: total. */
				__( 'Scanned %1$s of %2$s pages.', 'rankxai' ),
				number_format_i18n( $f['scanned'] ),
				number_format_i18n( $f['total'] )
			);
			return $card;
		}
		$broken        = count( $f['broken'] );
		$card['state'] = $broken > 0
			? RankXAI_UI::chip(
				sprintf(
					/* translators: %s: number of links. */
					_n( '%s broken link', '%s broken links', $broken, 'rankxai' ),
					number_format_i18n( $broken )
				),
				'danger'
			)
			: RankXAI_UI::chip( __( 'No broken links', 'rankxai' ), 'success' );
		$card['text'] = RankXAI_Checks_Page::headline( $f );
		return $card;
	}

	/**
	 * Crawler visits.
	 *
	 * @return array<string, string>
	 */
	private static function crawler_card() {
		$card   = array(
			'title'      => __( 'AI crawler visits', 'rankxai' ),
			'subtitle'   => __( 'Which AI crawlers fetch which pages, counted on this site.', 'rankxai' ),
			'link'       => RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CRAWLERS ),
			'link_label' => __( 'See all', 'rankxai' ),
		);
		$caches = RankXAI_Crawlers::page_caches();
		if ( ! RankXAI_Crawlers::enabled() ) {
			$card['state']  = RankXAI_UI::chip( __( 'Counting is off', 'rankxai' ) );
			$card['text']   = __( 'Switch counting on to see which AI crawlers visit, which pages they read and which errors they hit. Only a crawler\'s name, the page, the status and a daily count are kept.', 'rankxai' )
				. ( $caches ? ' ' . __( 'This site runs a page cache, so only some visits reach WordPress to be counted.', 'rankxai' ) : '' );
			$card['action'] = RankXAI_UI::button_link( __( 'Set up counting', 'rankxai' ), RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CRAWLERS ), 'outline' );
			return $card;
		}
		$report = RankXAI_Crawlers::report( 7 );
		// AI crawlers only, as on the AI crawlers page: search engines are counted there separately.
		$visits = 0;
		foreach ( $report['bots'] as $bot => $row ) {
			if ( 'search_engine' !== RankXAI_Crawler_Page::group_of( $bot ) ) {
				$visits += $row['hits'];
			}
		}
		$card['state'] = RankXAI_UI::chip( __( 'Counting', 'rankxai' ), 'success' );
		$card['text']  = 0 === $visits
			? __( 'No AI crawler visit has reached WordPress in the last 7 days. A page cache or firewall can answer visits before WordPress runs.', 'rankxai' )
			: sprintf(
				/* translators: %s: number of visits. */
				_n( '%s visit from an AI crawler reached WordPress in the last 7 days.', '%s visits from AI crawlers reached WordPress in the last 7 days.', $visits, 'rankxai' ),
				number_format_i18n( $visits )
			);
		$card['action'] = '';
		return $card;
	}

	/**
	 * The robots.txt card.
	 *
	 * @return array<string, string>
	 */
	private static function robots_card() {
		$robots = RankXAI_Robots::reading();
		$parsed = 'ok' === $robots['state'] ? RankXAI_Robots::parse( $robots['body'] ) : null;
		$tone   = 'neutral';
		$label  = __( 'Could not read', 'rankxai' );
		if ( 'absent' === $robots['state'] || ( $parsed && ! self::blocks_search( $parsed ) ) ) {
			$tone  = 'success';
			$label = __( 'Lets AI assistants in', 'rankxai' );
		} elseif ( $parsed ) {
			$tone  = 'warning';
			$label = __( 'Blocks an AI assistant', 'rankxai' );
		}
		return array(
			'title'      => __( 'robots.txt', 'rankxai' ),
			'subtitle'   => __( 'Whether your robots.txt lets each AI assistant read the site.', 'rankxai' ),
			'state'      => RankXAI_UI::chip( $label, $tone ),
			'text'       => RankXAI_Crawler_Page::robots_sentence( $robots ),
			'action'     => '',
			'link'       => RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CRAWLERS ) . '#rankxai-robots',
			'link_label' => __( 'See each crawler', 'rankxai' ),
		);
	}

	/**
	 * Root documents and markdown copies.
	 *
	 * @return array<string, string>
	 */
	private static function documents_card() {
		$served = array();
		foreach ( RankXAI_Documents::catalogue() as $slug => $doc ) {
			$state = RankXAI_Documents::effective( $slug );
			if ( '' !== $state['source'] ) {
				$served[] = $doc['label'];
			}
		}
		$twins = RankXAI_Twins::settings();

		$parts   = array();
		$parts[] = $served
			? sprintf(
				/* translators: %s: list of document names. */
				__( 'Serving %s.', 'rankxai' ),
				implode( ', ', $served )
			)
			: __( 'No llms.txt, agents.md or ai.txt is served.', 'rankxai' );
		$parts[] = $twins['enabled']
			? __( 'Markdown copies are on.', 'rankxai' )
			: __( 'Markdown copies are off.', 'rankxai' );

		return array(
			'title'      => __( 'Files for AI assistants', 'rankxai' ),
			'subtitle'   => __( 'llms.txt, agents.md and plain-text copies of your pages.', 'rankxai' ),
			'state'      => $served || $twins['enabled'] ? RankXAI_UI::chip( __( 'Published', 'rankxai' ), 'success' ) : RankXAI_UI::chip( __( 'Not published', 'rankxai' ) ),
			'text'       => implode( ' ', $parts ),
			'action'     => RankXAI_UI::button_link( __( 'Open settings', 'rankxai' ), RankXAI_Admin::page_url( RankXAI_Admin::PAGE_SETTINGS ), 'outline' ),
			'link'       => '',
			'link_label' => '',
		);
	}

	/**
	 * Whether AI assistants name the business: the summary a connected account
	 * pushes (4c), or, with no account, the free check (4a) or what an account
	 * adds. Never a made-up result and never a locked panel.
	 *
	 * @return array<string, string>
	 */
	private static function visibility_card() {
		$summary = RankXAI_Summary::latest();
		$card    = array(
			'title'      => __( 'Do AI assistants mention you?', 'rankxai' ),
			'subtitle'   => __( 'Only RankX AI can answer this: it asks the assistants the questions your customers ask.', 'rankxai' ),
			'link'       => '',
			'link_label' => '',
			'action'     => '',
		);
		if ( ! $summary ) {
			$card['state'] = RankXAI_UI::chip( __( 'Needs RankX AI', 'rankxai' ), 'info' );
			if ( '' !== self::CHECKER_URL ) {
				$domain         = (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST );
				$card['text']   = __( 'Run the free AI visibility check on rankxai.com: it asks ChatGPT and Gemini a few questions a customer would ask and tells you whether this site is named, and who is named instead.', 'rankxai' );
				$card['action'] = RankXAI_UI::button_link( __( 'Run the free check', 'rankxai' ), add_query_arg( 'domain', rawurlencode( $domain ), self::CHECKER_URL ), 'outline', true );
			} else {
				$card['text']   = __( 'With a RankX AI account, the questions your customers ask are put to AI assistants such as ChatGPT, Claude, Gemini and Perplexity on a schedule, and this card shows how often each one names you, and which of your pages AI crawlers read but never cite.', 'rankxai' );
				$card['action'] = RankXAI_UI::button_link( __( 'About RankX AI', 'rankxai' ), 'https://rankxai.com', 'outline', true );
			}
			return $card;
		}

		$rows = array();
		foreach ( $summary['mentionRates'] as $rate ) {
			$rows[] = array(
				'label' => $rate['label'],
				'meta'  => sprintf(
					/* translators: 1: answers naming you, 2: answers checked. */
					__( 'Named you in %1$s of %2$s answers', 'rankxai' ),
					number_format_i18n( $rate['mentioned'] ),
					number_format_i18n( $rate['checks'] )
				),
				'chip'  => RankXAI_UI::chip( round( 100 * $rate['mentioned'] / max( 1, $rate['checks'] ) ) . '%' ),
			);
		}
		$facts = array();
		if ( ! $summary['mentionRates'] ) {
			$facts[] = __( 'No AI answers have been checked for this site in the last 30 days yet.', 'rankxai' );
		} else {
			$facts[] = sprintf(
				/* translators: %d: number of days. */
				__( 'How often each assistant named the business in the last %d days.', 'rankxai' ),
				(int) $summary['windowDays']
			);
		}
		$rows[] = array(
			'label' => __( 'Pages AI crawlers read but never cite', 'rankxai' ),
			'meta'  => $summary['readNotCited']['paths'] ? implode( ', ', array_slice( $summary['readNotCited']['paths'], 0, 3 ) ) : '',
			'chip'  => RankXAI_UI::chip( number_format_i18n( $summary['readNotCited']['count'] ) ),
		);
		$rows[] = array(
			'label' => __( 'Open tasks in RankX AI', 'rankxai' ),
			'chip'  => RankXAI_UI::chip( number_format_i18n( $summary['openTasks'] ) ),
		);

		$stale         = RankXAI_Summary::is_stale( $summary );
		$card['state'] = 'paused' === $summary['accountState']
			? RankXAI_UI::chip( __( 'Account paused', 'rankxai' ), 'warning' )
			: ( $stale ? RankXAI_UI::chip( __( 'Out of date', 'rankxai' ), 'warning' ) : RankXAI_UI::chip( __( 'From RankX AI', 'rankxai' ), 'success' ) );
		$from          = '' !== $summary['projectName']
			? sprintf(
				/* translators: 1: project name, 2: a date. */
				__( 'From the RankX AI project "%1$s", last %2$s.', 'rankxai' ),
				$summary['projectName'],
				wp_date( (string) get_option( 'date_format' ), (int) strtotime( $summary['generatedAt'] ) )
			)
			: '';
		$others = count( RankXAI_Summary::all() ) - 1;
		if ( $others > 0 ) {
			$from .= ' ' . sprintf(
				/* translators: %d: number of other projects. */
				_n( '%d other RankX AI project is also connected to this site.', '%d other RankX AI projects are also connected to this site.', $others, 'rankxai' ),
				$others
			);
		}
		if ( 'paused' === $summary['accountState'] ) {
			$from .= ' ' . __( 'The RankX AI account is paused, so these figures are not being refreshed by new checks.', 'rankxai' );
		} elseif ( $stale ) {
			$from .= ' ' . __( 'Nothing newer has arrived for over a week.', 'rankxai' );
		}
		$card['text']   = implode( ' ', $facts );
		$card['rows']   = $rows;
		$card['note']   = trim( $from );
		$card['action'] = RankXAI_UI::button_link( __( 'Open RankX AI', 'rankxai' ), $summary['appUrl'], 'outline', true );
		return $card;
	}
}
