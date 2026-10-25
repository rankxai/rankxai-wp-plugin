<?php
/**
 * The one way this plugin calls RankX AI.
 *
 * Nothing else in the plugin makes a request to RankX AI, and this does
 * nothing until an administrator has connected an account (the site token is
 * the record of that consent). It calls one fixed address, and only the two
 * paths a connected plugin needs: a store app session for the administrator
 * who has the Store page open, and telling RankX AI the site was
 * disconnected.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Server-to-server calls to RankX AI.
 */
class RankXAI_App_Client {

	/** The only host this plugin contacts. */
	const APP_ORIGIN = 'https://app.rankxai.com';

	/** The paths it may call. */
	const PATHS = array( '/api/store-app/wp/session', '/api/store-app/wp/connection' );

	/**
	 * Call RankX AI with the site token.
	 *
	 * @param string $method  'POST' or 'DELETE'.
	 * @param string $path    One of self::PATHS.
	 * @param array  $body    JSON body.
	 * @param int    $timeout Seconds.
	 * @return array{status: int, body: array}|WP_Error
	 */
	public static function request( $method, $path, $body, $timeout = 10 ) {
		$link = RankXAI_Connection::link();
		if ( null === $link ) {
			return new WP_Error( 'rankxai_not_connected', __( 'This site is not connected to RankX AI.', 'rankxai' ) );
		}
		if ( ! in_array( $path, self::PATHS, true ) || ! in_array( $method, array( 'POST', 'DELETE' ), true ) ) {
			return new WP_Error( 'rankxai_bad_path', __( 'That is not a RankX AI call this plugin makes.', 'rankxai' ) );
		}
		$response = wp_safe_remote_request(
			self::APP_ORIGIN . $path,
			array(
				'method'      => $method,
				'timeout'     => $timeout,
				'redirection' => 0,
				'headers'     => array(
					'Authorization' => 'Bearer ' . $link['token'],
					'Content-Type'  => 'application/json',
				),
				'body'        => wp_json_encode( $body ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$decoded = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		return array(
			'status' => (int) wp_remote_retrieve_response_code( $response ),
			'body'   => is_array( $decoded ) ? $decoded : array(),
		);
	}
}
