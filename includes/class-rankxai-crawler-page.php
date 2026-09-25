<?php
/**
 * The AI crawlers page.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * AI crawlers page content.
 */
class RankXAI_Crawler_Page {

	/**
	 * Render the page body.
	 */
	public static function render() {
		self::counting_card();
	}

	/**
	 * The switch, what is stored, and what cannot be seen.
	 */
	private static function counting_card() {
		$on     = RankXAI_Crawlers::enabled();
		$caches = RankXAI_Crawlers::page_caches();
		$config = RankXAI_Crawlers::config_summary();

		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Crawler counting', 'rankxai' ),
				'subtitle' => __( 'Off by default. Only visits that reach WordPress are counted.', 'rankxai' ),
			)
		);
		echo '<p>' . esc_html__( 'Counts which AI crawlers, such as GPTBot, ClaudeBot and PerplexityBot, fetch which addresses on this site, per day. Only the crawler\'s name, the address, the response status and a count are kept, for 35 days. No IP address, browser details or anything about human visitors is stored, and nothing is sent anywhere: a connected RankX AI account reads the counts from this site.', 'rankxai' ) . '</p>';

		if ( $caches ) {
			RankXAI_UI::analysis(
				sprintf(
					/* translators: %s: names of page-cache plugins. */
					__( 'This site runs %s, which answers repeat visits without WordPress running. Those visits are not counted, so the real numbers are higher, often much higher.', 'rankxai' ),
					implode( ', ', $caches )
				)
			);
		}
		RankXAI_UI::note(
			$config['prefixes'] > 0
				? __( 'Each visit is also checked against the address ranges the crawler\'s operator publishes, sent here by RankX AI. A visit your host or a firewall refuses before WordPress runs is not seen.', 'rankxai' )
				: __( 'Crawlers are named from what they say they are. With a RankX AI account connected, each visit is also checked against the address ranges the crawler\'s operator publishes. A visit your host or a firewall refuses before WordPress runs is not seen.', 'rankxai' )
		);

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
		if ( $on ) {
			$since = RankXAI_Crawlers::enabled_at();
			if ( '' !== $since ) {
				RankXAI_UI::note(
					sprintf(
						/* translators: %s: a date. */
						__( 'Counting since %s.', 'rankxai' ),
						wp_date( (string) get_option( 'date_format' ), (int) strtotime( $since ) )
					)
				);
			}
		}
		RankXAI_UI::card_close();
	}
}
