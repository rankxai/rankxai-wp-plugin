<?php
/**
 * The Site checks page.
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
		RankXAI_UI::card_open(
			array(
				'title'    => __( 'Site checks', 'rankxai' ),
				'subtitle' => __( 'Links, pages and images, checked on this site.', 'rankxai' ),
			)
		);
		RankXAI_UI::empty_state(
			__( 'No site check has run yet', 'rankxai' ),
			__( 'A site check reads your published pages a few at a time in the background and lists the problems AI crawlers would hit.', 'rankxai' )
		);
		RankXAI_UI::card_close();
	}
}
