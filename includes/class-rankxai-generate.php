<?php
/**
 * Building `llms.txt` and `agents.md` from this site's own public content.
 *
 * Only what the site already publishes is used (title, tagline, public post
 * titles and excerpts). `ai.txt` is never generated: it states a licensing
 * position that belongs to the site owner.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Local generation of root documents.
 */
class RankXAI_Generate {

	/**
	 * Which documents are generated locally, per slug.
	 */
	const OPTION = 'rankxai_documents_local';

	/** Most entries listed for any one post type. */
	const MAX_PER_TYPE = 50;

	/** Most entries listed across every post type. */
	const MAX_TOTAL = 200;

	/** Most post types given a section of their own. */
	const MAX_TYPES = 6;

	/**
	 * How much a generated llms.txt lists: a short guide to the site, not an index of every page.
	 * The same for every site, filterable with `rankxai_llms_txt_limits`.
	 *
	 * @return array{per_type: int, total: int, types: int}
	 */
	public static function limits() {
		$limits = (array) apply_filters(
			'rankxai_llms_txt_limits',
			array(
				'per_type' => self::MAX_PER_TYPE,
				'total'    => self::MAX_TOTAL,
				'types'    => self::MAX_TYPES,
			)
		);
		return array(
			'per_type' => max( 1, (int) ( isset( $limits['per_type'] ) ? $limits['per_type'] : self::MAX_PER_TYPE ) ),
			'total'    => max( 1, (int) ( isset( $limits['total'] ) ? $limits['total'] : self::MAX_TOTAL ) ),
			'types'    => max( 1, (int) ( isset( $limits['types'] ) ? $limits['types'] : self::MAX_TYPES ) ),
		);
	}

	/**
	 * WordPress's default tagline, never used as the site's summary.
	 */
	const DEFAULT_TAGLINE = 'Just another WordPress site';

	/**
	 * The slugs this class can build.
	 *
	 * @return string[]
	 */
	public static function supported() {
		return array( 'llms_txt', 'agents_md' );
	}

	/**
	 * Has the site owner switched this root document on in Settings? Off by default.
	 *
	 * Nothing is served at a document's address until it is, whatever RankX AI publishes.
	 *
	 * @param string $slug Document slug.
	 * @return bool
	 */
	public static function switched_on( $slug ) {
		if ( ! array_key_exists( $slug, RankXAI_Documents::catalogue() ) ) {
			return false;
		}
		$stored = get_option( self::OPTION, array() );
		return is_array( $stored ) && isset( $stored[ $slug ] ) && true === $stored[ $slug ];
	}

	/**
	 * Is the document switched on and generated here, from the site's own content?
	 *
	 * @param string $slug Document slug.
	 * @return bool
	 */
	public static function is_local( $slug ) {
		if ( ! in_array( $slug, self::supported(), true ) ) {
			return false;
		}
		$on = self::switched_on( $slug );

		// Never on a site that discourages indexing, such as a staging clone.
		if ( self::site_discourages_indexing() || 'site' === RankXAI_Woo::coming_soon() ) {
			$on = false;
		}

		/**
		 * Filters whether a root document is generated locally.
		 *
		 * @param bool   $on   Stored state.
		 * @param string $slug Document slug.
		 */
		return (bool) apply_filters( 'rankxai_generate_document', $on, $slug );
	}

	/**
	 * Has the owner set Settings → Reading → "Discourage search engines"?
	 *
	 * @return bool
	 */
	public static function site_discourages_indexing() {
		return '0' === (string) get_option( 'blog_public', '1' );
	}

	/**
	 * The switch for every root document, before the filter.
	 *
	 * @return array<string, bool>
	 */
	public static function stored_state() {
		$stored = get_option( self::OPTION, array() );
		$out    = array();
		foreach ( array_keys( RankXAI_Documents::catalogue() ) as $slug ) {
			$out[ $slug ] = is_array( $stored ) && isset( $stored[ $slug ] ) && true === $stored[ $slug ];
		}
		return $out;
	}

	/**
	 * Store which root documents the site owner switched on.
	 *
	 * @param array<string, bool> $state Slug to on/off. Unknown slugs ignored.
	 * @return void
	 */
	public static function save_state( $state ) {
		$out = array();
		foreach ( array_keys( RankXAI_Documents::catalogue() ) as $slug ) {
			$out[ $slug ] = isset( $state[ $slug ] ) && (bool) $state[ $slug ];
		}
		update_option( self::OPTION, $out, true );
	}

	/**
	 * Build one document.
	 *
	 * @param string $slug Document slug.
	 * @return string Empty when the slug is not one we compose.
	 */
	public static function generate( $slug ) {
		if ( 'llms_txt' === $slug ) {
			return self::build_llms_txt();
		}
		if ( 'agents_md' === $slug ) {
			return self::build_agents_md();
		}
		return '';
	}

	// -----------------------------------------------------------------------
	// Shared material
	// -----------------------------------------------------------------------

	/**
	 * The site's name, falling back to its host.
	 *
	 * @return string
	 */
	private static function site_title() {
		$title = RankXAI_Markdown::plain( (string) get_bloginfo( 'name' ) );
		if ( '' !== trim( $title ) ) {
			return trim( $title );
		}
		$host = wp_parse_url( home_url( '/' ), PHP_URL_HOST );
		return is_string( $host ) ? $host : 'This site';
	}

	/**
	 * The tagline, when it is the owner's own words.
	 *
	 * @return string
	 */
	private static function tagline() {
		$tagline = trim( RankXAI_Markdown::plain( (string) get_bloginfo( 'description' ) ) );
		if ( '' === $tagline || self::DEFAULT_TAGLINE === $tagline ) {
			return '';
		}
		return $tagline;
	}

	/**
	 * Public post types worth listing: pages, posts, then any other public type.
	 *
	 * @return WP_Post_Type[]
	 */
	private static function listed_post_types() {
		$ordered = array();
		foreach ( array( 'page', 'post' ) as $slug ) {
			if ( post_type_exists( $slug ) && is_post_type_viewable( $slug ) ) {
				$ordered[ $slug ] = get_post_type_object( $slug );
			}
		}
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $slug => $type ) {
			// Attachments are media, not documents.
			if ( isset( $ordered[ $slug ] ) || 'attachment' === $slug || ! is_post_type_viewable( $type ) ) {
				continue;
			}
			$ordered[ $slug ] = $type;
		}

		$types = array_values( array_filter( $ordered ) );

		/**
		 * Filters which post types appear in a generated root document.
		 *
		 * @param WP_Post_Type[] $types Post type objects, in render order.
		 */
		$types = (array) apply_filters( 'rankxai_generated_document_post_types', $types );

		return array_slice(
			array_values( array_filter( $types, array( __CLASS__, 'is_post_type_object' ) ) ),
			0,
			self::limits()['types']
		);
	}

	/**
	 * Is this a post type object? Used to clean the filter's output.
	 *
	 * @param mixed $type Candidate.
	 * @return bool
	 */
	public static function is_post_type_object( $type ) {
		return $type instanceof WP_Post_Type;
	}

	/**
	 * Published posts of one type: hierarchical types in menu order, others newest first.
	 *
	 * @param string $post_type Post type slug.
	 * @param int    $limit     Maximum rows.
	 * @return WP_Post[]
	 */
	private static function posts_of_type( $post_type, $limit ) {
		$hierarchical = is_post_type_hierarchical( $post_type );

		$query = new WP_Query(
			array(
				'post_type'              => $post_type,
				'post_status'            => 'publish',
				'posts_per_page'         => max( 1, (int) $limit ),
				'has_password'           => false,
				'orderby'                => $hierarchical ? array(
					'menu_order' => 'ASC',
					'title'      => 'ASC',
				) : 'date',
				'order'                  => $hierarchical ? 'ASC' : 'DESC',
				'ignore_sticky_posts'    => true,
				'no_found_rows'          => true,
				'update_post_term_cache' => false,
			)
		);

		$out = array();
		foreach ( $query->posts as $post ) {
			if ( self::is_listable( $post ) ) {
				$out[] = $post;
			}
		}
		return $out;
	}

	/**
	 * May this post be named in a public document? Never if it is noindex.
	 *
	 * @param mixed $post Candidate post.
	 * @return bool
	 */
	private static function is_listable( $post ) {
		if ( ! $post instanceof WP_Post ) {
			return false;
		}
		if ( '' !== (string) $post->post_password ) {
			return false;
		}
		if ( RankXAI_Twins::is_noindexed( $post->ID ) || RankXAI_Woo::hides( $post ) ) {
			return false;
		}
		return '' !== self::permalink( $post );
	}

	/**
	 * A post's public address, or '' when it has none.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	private static function permalink( $post ) {
		$url = get_permalink( $post );
		return is_string( $url ) ? $url : '';
	}

	/**
	 * Where a reader should be sent: the markdown copy if there is one, else the page.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	private static function read_url( $post ) {
		if ( RankXAI_Twins::is_eligible( $post ) ) {
			$twin = RankXAI_Twins::twin_url( $post );
			if ( '' !== $twin ) {
				return $twin;
			}
		}
		return self::permalink( $post );
	}

	/**
	 * The note beside a link: the author's own excerpt, or nothing.
	 *
	 * Not `get_the_excerpt()`, which falls back to the opening words of the post.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	private static function note( $post ) {
		$excerpt = trim( RankXAI_Markdown::plain( (string) $post->post_excerpt ) );
		if ( '' === $excerpt ) {
			return '';
		}
		// One line, so it cannot break the list item.
		$excerpt = trim( (string) preg_replace( '/\s+/u', ' ', $excerpt ) );
		if ( mb_strlen( $excerpt ) > 200 ) {
			$excerpt = trim( mb_substr( $excerpt, 0, 199 ) ) . "\u{2026}";
		}
		return $excerpt;
	}

	/**
	 * A URL as a markdown link destination.
	 *
	 * Wrapped in angle brackets only when it holds brackets or spaces, which a
	 * custom permalink filter could produce.
	 *
	 * @param string $url URL.
	 * @return string
	 */
	private static function link_destination( $url ) {
		return preg_match( '/[()\s]/', $url ) ? '<' . $url . '>' : $url;
	}

	/**
	 * A post's title, never empty.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	private static function title_of( $post ) {
		$title = trim( RankXAI_Markdown::plain( get_the_title( $post ) ) );
		if ( '' !== $title ) {
			// A `]` would close the markdown link early.
			return str_replace( array( '[', ']' ), array( '(', ')' ), $title );
		}
		/* translators: %d: numeric post ID. */
		return sprintf( __( 'Untitled (%d)', 'rankxai' ), (int) $post->ID );
	}

	/**
	 * The H2 sections listing this site's public documents, with counts.
	 *
	 * The counts let the caller say when a list was cut short.
	 *
	 * @return array{lines: string[], listed: int, omitted: int}
	 */
	private static function document_sections() {
		$lines     = array();
		$listed    = 0;
		$truncated = 0;

		foreach ( self::listed_post_types() as $type ) {
			$remaining = self::limits()['total'] - $listed;
			if ( $remaining <= 0 ) {
				break;
			}

			// Ask for one extra to learn whether the list was cut short.
			$cap   = min( self::limits()['per_type'], $remaining );
			$posts = self::posts_of_type( $type->name, $cap + 1 );
			if ( ! $posts ) {
				continue;
			}

			$overflow = count( $posts ) > $cap;
			$posts    = array_slice( $posts, 0, $cap );

			$label   = isset( $type->labels->name ) ? RankXAI_Markdown::plain( (string) $type->labels->name ) : $type->name;
			$lines[] = '## ' . trim( $label );
			$lines[] = '';
			foreach ( $posts as $post ) {
				$note    = self::note( $post );
				$entry   = '- [' . self::title_of( $post ) . '](' . self::link_destination( self::read_url( $post ) ) . ')';
				$lines[] = '' === $note ? $entry : $entry . ': ' . $note;
				++$listed;
			}
			$lines[] = '';

			if ( $overflow ) {
				++$truncated;
			}
		}

		return array(
			'lines'     => $lines,
			'listed'    => $listed,
			// Sections cut short, not posts left out.
			'truncated' => $truncated,
		);
	}

	/**
	 * Join lines into a document, collapsing blank runs.
	 *
	 * @param string[] $lines Lines.
	 * @return string
	 */
	private static function finish( $lines ) {
		$body = (string) preg_replace( "/\n{3,}/", "\n\n", implode( "\n", $lines ) );
		return trim( $body ) . "\n";
	}

	// -----------------------------------------------------------------------
	// The documents
	// -----------------------------------------------------------------------

	/**
	 * `llms.txt` in the llmstxt.org shape: H1, optional summary, detail, H2 link lists.
	 *
	 * @return string
	 */
	private static function build_llms_txt() {
		$lines = array( '# ' . self::site_title(), '' );

		$tagline = self::tagline();
		if ( '' !== $tagline ) {
			$lines[] = '> ' . $tagline;
			$lines[] = '';
		}

		$sections = self::document_sections();

		if ( ! $sections['listed'] ) {
			// An H1 alone is a valid llms.txt. The detail below describes the
			// links, so it is left out when there are none.
			return self::finish( $lines );
		}

		$detail = array();
		if ( RankXAI_Twins::is_enabled() ) {
			$detail[] = __( 'Every link below points at a markdown copy of the page, which carries the same words without the site template.', 'rankxai' );
			$detail[] = sprintf(
				/* translators: %s: URL of the markdown sitemap. */
				__( 'A complete list of those copies is at %s.', 'rankxai' ),
				RankXAI_Twins::sitemap_url()
			);
		}
		if ( $sections['truncated'] > 0 ) {
			$detail[] = __( 'This is a selection rather than a complete index; some sections list only their most recent entries.', 'rankxai' );
		}
		if ( $detail ) {
			$lines[] = implode( ' ', $detail );
			$lines[] = '';
		}

		$lines = array_merge( $lines, $sections['lines'] );

		return self::finish( $lines );
	}

	/**
	 * `agents.md`: the addresses an automated reader needs, then the document list.
	 *
	 * @return string
	 */
	private static function build_agents_md() {
		$lines = array( '# ' . self::site_title(), '' );

		$tagline = self::tagline();
		if ( '' !== $tagline ) {
			$lines[] = '> ' . $tagline;
			$lines[] = '';
		}

		$lines[] = __( 'Notes for automated readers of this site.', 'rankxai' );
		$lines[] = '';

		$how = array();
		if ( RankXAI_Twins::is_enabled() ) {
			$how[] = '- ' . __( 'Markdown copies: add `.md` to any page address, or request `text/markdown`. The page carries a `Link` header pointing at its copy.', 'rankxai' );
			$how[] = '- ' . sprintf(
				/* translators: %s: URL of the markdown sitemap. */
				__( 'Every markdown copy is listed at %s.', 'rankxai' ),
				RankXAI_Twins::sitemap_url()
			);
		}

		// `wp_sitemaps_enabled` is a filter, not a function, so ask the server.
		// When an SEO plugin replaces core sitemaps, name none rather than guess.
		$server = function_exists( 'wp_sitemaps_get_server' ) ? wp_sitemaps_get_server() : null;
		if ( $server instanceof WP_Sitemaps && $server->sitemaps_enabled() && isset( $server->index ) ) {
			$how[] = '- ' . sprintf(
				/* translators: %s: URL of the XML sitemap index. */
				__( 'XML sitemap: %s', 'rankxai' ),
				$server->index->get_index_url()
			);
		}
		$how[] = '- ' . sprintf(
			/* translators: %s: URL of the site's REST API root. */
			__( 'Read-only REST API: %s', 'rankxai' ),
			rest_url()
		);

		$lines[] = '## How to read this site';
		$lines[] = '';
		$lines   = array_merge( $lines, $how );
		$lines[] = '';

		$sections = self::document_sections();
		if ( $sections['listed'] ) {
			$lines = array_merge( $lines, $sections['lines'] );
			if ( $sections['truncated'] > 0 ) {
				$lines[] = __( 'Some sections above list only their most recent entries. The sitemaps are complete.', 'rankxai' );
				$lines[] = '';
			}
		}

		return self::finish( $lines );
	}
}
