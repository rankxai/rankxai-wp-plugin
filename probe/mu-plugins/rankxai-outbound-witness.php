<?php
/**
 * Probe only (never shipped): a witness for every request this WordPress makes
 * to another server, and a stand-in for RankX AI's answers.
 *
 * Off unless the option `rankxai_outbound_witness_on` is set, so it changes
 * nothing for the other probes. When on, every outbound request is appended to
 * `rankxai_outbound_witness` (method, host, path, and whether it carried an
 * Authorization header), and a request to app.rankxai.com is answered from the
 * option `rankxai_app_stub` (a list of { path, status, body } answers, used in
 * order) without leaving the container.
 *
 * @package RankXAI
 */

add_filter(
	'pre_http_request',
	function ( $preempt, $args, $url ) {
		if ( ! get_option( 'rankxai_outbound_witness_on' ) ) {
			return $preempt;
		}
		$parts = wp_parse_url( $url );
		$host  = isset( $parts['host'] ) ? $parts['host'] : '';
		$path  = isset( $parts['path'] ) ? $parts['path'] : '';
		$log   = get_option( 'rankxai_outbound_witness', array() );
		$log[] = array(
			'method' => isset( $args['method'] ) ? $args['method'] : 'GET',
			'host'   => $host,
			'path'   => $path,
			'auth'   => isset( $args['headers']['Authorization'] ) ? substr( (string) $args['headers']['Authorization'], 0, 12 ) : '',
			'body'   => isset( $args['body'] ) && is_string( $args['body'] ) ? substr( $args['body'], 0, 400 ) : '',
		);
		update_option( 'rankxai_outbound_witness', $log, false );

		if ( 'app.rankxai.com' !== $host ) {
			return $preempt;
		}
		$stubs = get_option( 'rankxai_app_stub', array() );
		foreach ( $stubs as $i => $stub ) {
			if ( isset( $stub['path'] ) && $stub['path'] === $path ) {
				unset( $stubs[ $i ] );
				update_option( 'rankxai_app_stub', array_values( $stubs ), false );
				return array(
					'headers'  => array(),
					'body'     => wp_json_encode( $stub['body'] ),
					'response' => array(
						'code'    => (int) $stub['status'],
						'message' => '',
					),
					'cookies'  => array(),
					'filename' => null,
				);
			}
		}
		return new WP_Error( 'rankxai_witness_no_stub', 'No stubbed answer for ' . $path );
	},
	1,
	3
);
