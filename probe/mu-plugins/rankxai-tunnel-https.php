<?php
/**
 * Plugin Name: RankX AI tunnel HTTPS (probe only)
 * Description: Behind a temporary HTTPS tunnel, tell WordPress the request was HTTPS. NEVER SHIPPED — this lives under probe/ and is export-ignored.
 *
 * The tunnel terminates TLS and forwards plain HTTP with `X-Forwarded-Proto:
 * https`. Without this, a rig whose home URL is the tunnel's https address sees
 * an http request and `redirect_canonical` answers every page with a 301 to
 * itself — so every address would look "already redirected" to the platform's
 * checks, which is a rig artefact and not a finding.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

if ( isset( $_SERVER['HTTP_X_FORWARDED_PROTO'] ) && 'https' === $_SERVER['HTTP_X_FORWARDED_PROTO'] ) {
	$_SERVER['HTTPS'] = 'on';
}
