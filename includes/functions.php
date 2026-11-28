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

/**
 * Sanitise a plain-text document (llms.txt, agents.md, ai.txt, the business summary on markdown copies).
 *
 * Valid UTF-8 with no control characters other than tabs and line breaks. These are served as plain
 * text or markdown, never as HTML, so nothing else is changed.
 *
 * @param mixed $raw Raw value, already unslashed.
 * @return string
 */
function rankxai_sanitize_plain_text( $raw ) {
	if ( ! is_string( $raw ) ) {
		return '';
	}
	return (string) preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', wp_check_invalid_utf8( $raw ) );
}
