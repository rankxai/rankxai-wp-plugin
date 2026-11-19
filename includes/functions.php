<?php
/**
 * Functions.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Sanitise an address or path from a request; see RankXAI_Redirects::sanitize_path().
 *
 * @param mixed $raw Raw value, already unslashed.
 * @return string
 */
function rankxai_sanitize_path( $raw ) {
	return RankXAI_Redirects::sanitize_path( $raw );
}
