<?php
/**
 * Root documents (`/llms.txt`, `/agents.md`, `/ai.txt`) served from options.
 *
 * Nothing is written to disk, and no part of a request becomes a path or an
 * option name. A real file at the same path always wins.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Root document storage and serving.
 */
class RankXAI_Documents {

	/**
	 * The documents we serve, and nothing else.
	 *
	 * @return array<string, array{path: string, type: string, label: string}>
	 */
	public static function catalogue() {
		return array(
			'llms_txt'  => array(
				'path'  => 'llms.txt',
				'type'  => 'text/plain; charset=utf-8',
				'label' => 'llms.txt',
			),
			'agents_md' => array(
				'path'  => 'agents.md',
				'type'  => 'text/markdown; charset=utf-8',
				'label' => 'agents.md',
			),
			'ai_txt'    => array(
				'path'  => 'ai.txt',
				'type'  => 'text/plain; charset=utf-8',
				'label' => 'ai.txt',
			),
		);
	}

	/**
	 * The largest document we will store.
	 */
	const MAX_BYTES = 524288;

	/**
	 * Register the serving route late, so an earlier claimant keeps the URL.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'maybe_serve' ), 99 );
	}

	/**
	 * The option name for a slug, built from the catalogue key, not the caller's string.
	 *
	 * @param string $slug Document slug.
	 * @return string|null
	 */
	public static function option_name( $slug ) {
		$catalogue = self::catalogue();
		if ( ! isset( $catalogue[ $slug ] ) ) {
			return null;
		}
		$keys = array_keys( $catalogue );
		$i    = array_search( $slug, $keys, true );
		return 'rankxai_document_' . $keys[ $i ];
	}

	/**
	 * Read a stored document.
	 *
	 * @param string $slug Document slug.
	 * @return array{content: string, updated: string}|null
	 */
	public static function get( $slug ) {
		$option = self::option_name( $slug );
		if ( null === $option ) {
			return null;
		}
		$stored = get_option( $option, null );
		if ( ! is_array( $stored ) || ! isset( $stored['content'] ) || ! is_string( $stored['content'] ) ) {
			return null;
		}
		return array(
			'content' => $stored['content'],
			'updated' => isset( $stored['updated'] ) && is_string( $stored['updated'] ) ? $stored['updated'] : '',
		);
	}

	/**
	 * Store a document.
	 *
	 * Not autoloaded: only read on a request for their own URL.
	 *
	 * @param string $slug    Document slug.
	 * @param string $content Body.
	 * @return bool
	 */
	public static function set( $slug, $content ) {
		$option = self::option_name( $slug );
		if ( null === $option ) {
			return false;
		}
		update_option(
			$option,
			array(
				'content' => $content,
				'updated' => gmdate( 'c' ),
			),
			false
		);
		return true;
	}

	/**
	 * Remove a document.
	 *
	 * @param string $slug Document slug.
	 * @return bool
	 */
	public static function delete( $slug ) {
		$option = self::option_name( $slug );
		if ( null === $option ) {
			return false;
		}
		delete_option( $option );
		return true;
	}

	/**
	 * What this site would serve at a document's address, and where it came from.
	 *
	 * Order: a real file, then a published document, then a generated one, then
	 * nothing. A published document always beats a generated one.
	 *
	 * @param string $slug Document slug.
	 * @return array{content: string, source: string} Source is '', 'file', 'stored' or 'generated'.
	 */
	public static function effective( $slug ) {
		$none = array(
			'content' => '',
			'source'  => '',
		);
		if ( null === self::option_name( $slug ) ) {
			return $none;
		}
		if ( self::file_exists_on_disk( $slug ) ) {
			return array(
				'content' => '',
				'source'  => 'file',
			);
		}

		$stored = self::get( $slug );
		if ( null !== $stored && '' !== $stored['content'] ) {
			return array(
				'content' => $stored['content'],
				'source'  => 'stored',
			);
		}

		if ( RankXAI_Generate::is_local( $slug ) ) {
			$generated = RankXAI_Generate::generate( $slug );
			if ( '' !== trim( $generated ) ) {
				return array(
					'content' => $generated,
					'source'  => 'generated',
				);
			}
		}

		return $none;
	}

	/**
	 * Is a real file already sitting at this path?
	 *
	 * For servers that pass the request to PHP even when the file exists.
	 *
	 * @param string $slug Document slug.
	 * @return bool
	 */
	public static function file_exists_on_disk( $slug ) {
		$catalogue = self::catalogue();
		if ( ! isset( $catalogue[ $slug ] ) ) {
			return false;
		}
		return file_exists( ABSPATH . $catalogue[ $slug ]['path'] );
	}

	/**
	 * Which slug, if any, this request is for.
	 *
	 * Exact match against the catalogue's paths, so `..` tricks match nothing.
	 *
	 * @param string $request_uri Raw request URI.
	 * @return string|null
	 */
	public static function slug_for_request( $request_uri ) {
		$path = wp_parse_url( $request_uri, PHP_URL_PATH );
		if ( ! is_string( $path ) ) {
			return null;
		}
		$trimmed = ltrim( $path, '/' );

		// A site installed in a subdirectory serves these under that path.
		$home_path = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		$home_path = trim( $home_path, '/' );
		if ( '' !== $home_path && 0 === strpos( $trimmed, $home_path . '/' ) ) {
			$trimmed = substr( $trimmed, strlen( $home_path ) + 1 );
		}

		foreach ( self::catalogue() as $slug => $doc ) {
			if ( $trimmed === $doc['path'] ) {
				return $slug;
			}
		}
		return null;
	}

	/**
	 * Serve a stored document, if this request is for one and nothing else owns it.
	 */
	public static function maybe_serve() {
		if ( is_admin() ) {
			return;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Request path only, no form.
		$uri = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
		if ( '' === $uri ) {
			return;
		}

		$slug = self::slug_for_request( $uri );
		if ( null === $slug ) {
			return;
		}

		$doc = self::effective( $slug );
		if ( '' === $doc['content'] ) {
			// Not a 404: leave the URL to whatever else would serve it.
			return;
		}

		$catalogue = self::catalogue();
		$type      = $catalogue[ $slug ]['type'];

		header( 'Content-Type: ' . $type );
		// Stop a client sniffing the text as HTML.
		header( 'X-Content-Type-Options: nosniff' );
		// Tells this virtual route apart from a real file.
		header( 'X-RankXAI-Source: virtual-route' );
		// Whether the body was published or generated here.
		header( 'X-RankXAI-Document: ' . ( 'generated' === $doc['source'] ? 'generated' : 'published' ) );
		// No caching header of our own: the site's cache setup decides.
		header( 'X-Robots-Tag: noindex' );

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Plain-text body; escaping would corrupt it.
		echo $doc['content'];
		exit;
	}
}
