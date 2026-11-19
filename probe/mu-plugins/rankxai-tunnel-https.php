<?php
/**
 * Plugin Name: RankX AI tunnel HTTPS (probe only)
 * Description: Behind a temporary HTTPS tunnel, tell WordPress the request was HTTPS. Probe only, never shipped.
 *
 * Without this, `redirect_canonical` sees plain HTTP behind the tunnel and
 * answers every page with a 301 to itself.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

if ( isset( $_SERVER['HTTP_X_FORWARDED_PROTO'] ) && 'https' === $_SERVER['HTTP_X_FORWARDED_PROTO'] ) {
	$_SERVER['HTTPS'] = 'on';
}
