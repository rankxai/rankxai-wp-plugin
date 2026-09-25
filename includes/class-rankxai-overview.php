<?php
/**
 * What the Overview page says: one hero sentence and one card per feature.
 *
 * The hero is the strongest TRUE statement this site supports, picked in a
 * fixed order: a real problem first, then what the site checks found, then a
 * good state. It is deterministic and never calls out.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Overview content.
 */
class RankXAI_Overview {

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

		foreach ( self::statements() as $statement ) {
			if ( null !== $statement ) {
				return $statement;
			}
		}

		return array(
			'text'   => __( 'Nothing on this site tells AI assistants to stay away, and nothing has been checked yet. Run a site check to see which of your links and pages crawlers cannot follow.', 'rankxai' ),
			'action' => '',
		);
	}

	/**
	 * Candidate hero statements, strongest first. Each is null when it does not apply.
	 *
	 * @return array<int, array{text: string, action: string}|null>
	 */
	private static function statements() {
		return array();
	}

	/**
	 * One card per feature, each with its state and its next step.
	 *
	 * Card actions are built by RankXAI_UI helpers, which escape everything.
	 *
	 * @return array<int, array{title: string, subtitle: string, state: string, text: string, action: string, link: string, link_label: string}>
	 */
	public static function cards() {
		return array(
			self::crawler_card(),
			self::documents_card(),
		);
	}

	/**
	 * Crawler visits.
	 *
	 * @return array<string, string>
	 */
	private static function crawler_card() {
		$card = array(
			'title'      => __( 'AI crawler visits', 'rankxai' ),
			'subtitle'   => __( 'Which AI crawlers fetch which pages, counted on this site.', 'rankxai' ),
			'link'       => RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CRAWLERS ),
			'link_label' => __( 'See all', 'rankxai' ),
		);
		if ( ! RankXAI_Crawlers::enabled() ) {
			$card['state']  = RankXAI_UI::chip( __( 'Counting is off', 'rankxai' ) );
			$card['text']   = __( 'Switch counting on to see which AI crawlers visit, which pages they read and which errors they hit. Only a crawler\'s name, the page, the status and a daily count are kept.', 'rankxai' );
			$card['action'] = RankXAI_UI::button_link( __( 'Set up counting', 'rankxai' ), RankXAI_Admin::page_url( RankXAI_Admin::PAGE_CRAWLERS ), 'outline' );
			return $card;
		}
		$summary = RankXAI_Crawlers::summary( 7 );
		$visits  = 0;
		foreach ( $summary as $row ) {
			$visits += $row['in_range'] + $row['other'];
		}
		$card['state'] = RankXAI_UI::chip( __( 'Counting', 'rankxai' ), 'success' );
		$card['text']  = 0 === $visits
			? __( 'No AI crawler visits have reached WordPress in the last 7 days. A page cache or firewall can answer visits before WordPress runs.', 'rankxai' )
			: sprintf(
				/* translators: 1: number of visits, 2: number of crawlers. */
				_n( '%1$s visit from %2$s crawler reached WordPress in the last 7 days.', '%1$s visits from %2$s crawlers reached WordPress in the last 7 days.', count( $summary ), 'rankxai' ),
				number_format_i18n( $visits ),
				number_format_i18n( count( $summary ) )
			);
		$card['action'] = '';
		return $card;
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
}
