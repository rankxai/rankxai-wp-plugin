<?php
/**
 * Root documents — `/llms.txt`, `/agents.md`, `/ai.txt` — served by WordPress.
 *
 * Nothing is written to disk. A document is a row in `wp_options` and a route
 * registered at `init`; the body is echoed with a `text/plain` header and
 * `exit`. A caller's slug is matched against a fixed list and the option key is
 * built from the matched catalogue key, so no part of a request becomes part of
 * a path or an option name.
 *
 * The route stands down for a real file at the same path, and is registered
 * late so a plugin that claims these URLs earlier keeps them.
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
	 * The largest document we will store. Well above the largest real llms.txt
	 * and far below anything that would trouble a `longtext` column.
	 */
	const MAX_BYTES = 524288;

	/**
	 * Register the serving route at a late priority, so an earlier claimant
	 * keeps the URL.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'maybe_serve' ), 99 );
	}

	/**
	 * The option name for a slug, built from the catalogue key rather than the
	 * caller's string.
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
	 * Not autoloaded: these are only read on a request for their own URL, so
	 * autoloading would put up to 512 KB into every page load.
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
	 * ONE precedence, in one place, so the settings screen and the serving path
	 * cannot disagree about which body is live:
	 *
	 *   1. a real file on disk — not ours to answer;
	 *   2. a document RankX AI published — the account holder's own words;
	 *   3. a document generated here from the site's content;
	 *   4. nothing, and the URL stays available to whatever else would serve it.
	 *
	 * Stored beats generated because a document somebody wrote and approved is
	 * a better answer than one assembled from post titles, and because a
	 * generated document silently replacing a published one would overwrite a
	 * decision with a default.
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
	 * On Apache the web server answers before PHP runs; this covers the setups
	 * where PHP does see the request, so both behave the same.
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
	 * Equality against the catalogue's literal paths, not a path operation — so
	 * `/llms.txt/../../etc/passwd` matches nothing.
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

		// A site in a subdirectory serves these from its own root, so
		// `/blog/llms.txt` matches on a site installed at `/blog` and does not
		// on one installed at the domain root.
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
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Reading the request path of a public GET, not processing a form.
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
			// Nothing to serve: return rather than 404, so WordPress answers as
			// it would without us and the URL stays available to whatever else
			// would have served it.
			return;
		}

		$catalogue = self::catalogue();
		$type      = $catalogue[ $slug ]['type'];

		header( 'Content-Type: ' . $type );
		// Plain text; a sniffing client that guessed HTML would render the
		// document as markup.
		header( 'X-Content-Type-Options: nosniff' );
		// So a reader can tell this virtual route from a real file.
		header( 'X-RankXAI-Source: virtual-route' );

		/*
		 * WHICH body this is, as a SECOND header rather than a second meaning
		 * for the one above. `virtual-route` says where the bytes came from and
		 * is true of both; overloading it would make one header answer two
		 * questions, and a reader checking it for the first would silently get
		 * the second.
		 *
		 * It matters because the platform reads `/llms.txt` unauthenticated,
		 * with no manifest and no credential, and would otherwise report a
		 * document this plugin generated as somebody else's.
		 */
		header( 'X-RankXAI-Document: ' . ( 'generated' === $doc['source'] ? 'generated' : 'published' ) );
		// No caching directive of our own — the site's cache plugin and host
		// know better than we do.
		header( 'X-Robots-Tag: noindex' );

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Plain-text document body; escaping would corrupt the artefact this route exists to serve.
		echo $doc['content'];
		exit;
	}
}
