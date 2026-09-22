<?php
/**
 * Building `llms.txt` and `agents.md` from this site's own content.
 *
 * Every other document path in this plugin STORES what RankX AI sent. This one
 * composes a document here, from posts and options that are already public, so
 * the capability works on a site with no RankX AI account at all.
 *
 * Two rules bound what it will say. Nothing is fetched from outside and nothing
 * is written to disk, as everywhere else. And nothing is asserted that the site
 * has not already published: the title, the tagline, the titles of public posts
 * and the excerpts their authors wrote. No summary is composed, no claim about
 * the business is made, and `ai.txt` is not generated at all — it declares a
 * position on machine-learning licensing, which belongs to the site owner.
 *
 * A stored document always wins over a generated one. See
 * `RankXAI_Documents::maybe_serve()`.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Local generation of root documents.
 */
class RankXAI_Generate {

	/**
	 * Which documents are generated locally, per slug. Autoloaded: read on the
	 * front end whenever one of these URLs is requested.
	 */
	const OPTION = 'rankxai_documents_local';

	/** Most entries listed for any one post type. */
	const MAX_PER_TYPE = 50;

	/** Most entries listed across every post type. */
	const MAX_TOTAL = 200;

	/** Most post types given a section of their own. */
	const MAX_TYPES = 6;

	/**
	 * WordPress's own default tagline, which is not a description of anything.
	 *
	 * It ships on every new install and is left in place on a great many of
	 * them. Quoting it as the site's summary would put a sentence about
	 * WordPress where a sentence about the business belongs.
	 */
	const DEFAULT_TAGLINE = 'Just another WordPress site';

	/**
	 * The slugs this class can build, and nothing else.
	 *
	 * A subset of `RankXAI_Documents::catalogue()` — the platform can publish
	 * documents we will not compose.
	 *
	 * @return string[]
	 */
	public static function supported() {
		return array( 'llms_txt', 'agents_md' );
	}

	/**
	 * Is local generation switched on for this slug?
	 *
	 * Validated rather than cast, and default OFF. Installing or updating a
	 * plugin must never publish a new URL on its own, which is the same rule
	 * markdown twins follow.
	 *
	 * @param string $slug Document slug.
	 * @return bool
	 */
	public static function is_local( $slug ) {
		if ( ! in_array( $slug, self::supported(), true ) ) {
			return false;
		}
		$stored = get_option( self::OPTION, array() );
		if ( ! is_array( $stored ) ) {
			return false;
		}
		$on = isset( $stored[ $slug ] ) && true === $stored[ $slug ];

		/**
		 * Filters whether a root document is generated locally.
		 *
		 * @param bool   $on   Stored state.
		 * @param string $slug Document slug.
		 */
		return (bool) apply_filters( 'rankxai_generate_document', $on, $slug );
	}

	/**
	 * The stored state for every supported slug, without the filter.
	 *
	 * The settings screen shows what is STORED, so a site whose filter forces a
	 * document on still renders the switch the owner set rather than the one
	 * the filter produced.
	 *
	 * @return array<string, bool>
	 */
	public static function stored_state() {
		$stored = get_option( self::OPTION, array() );
		$out    = array();
		foreach ( self::supported() as $slug ) {
			$out[ $slug ] = is_array( $stored ) && isset( $stored[ $slug ] ) && true === $stored[ $slug ];
		}
		return $out;
	}

	/**
	 * Store which documents are generated locally.
	 *
	 * @param array<string, bool> $state Slug to on/off. Unknown slugs ignored.
	 * @return void
	 */
	public static function save_state( $state ) {
		$out = array();
		foreach ( self::supported() as $slug ) {
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
	 * Public post types worth listing, in a stable order.
	 *
	 * Pages first, then posts, then whatever else the site registers — a
	 * product catalogue or a knowledge base is exactly what an assistant is
	 * looking for, and excluding it because we did not anticipate it would make
	 * the document wrong on the sites where it matters most.
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
			// Attachments are media, not documents: listing them points an
			// assistant at an image and calls it a page.
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
			self::MAX_TYPES
		);
	}

	/**
	 * Is this a post type object? A named callback, because the filter above
	 * hands us whatever a site returns.
	 *
	 * @param mixed $type Candidate.
	 * @return bool
	 */
	public static function is_post_type_object( $type ) {
		return $type instanceof WP_Post_Type;
	}

	/**
	 * Published posts of one type, ordered for a reader rather than for a feed.
	 *
	 * Pages come in the order the site arranges them; everything else comes
	 * newest first, because for a blog recency is the useful order.
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
	 * May this post be named in a public document?
	 *
	 * The `noindex` test is the one that matters. A page the owner asked search
	 * engines to ignore must not be advertised in a file written for machines —
	 * the same decision markdown twins already make, through the same registry.
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
		if ( RankXAI_Twins::is_noindexed( $post->ID ) ) {
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
	 * Where a reader should be sent for this post.
	 *
	 * The markdown copy when there is one, because that is what llms.txt is
	 * for — a list of documents an assistant can read without a theme in the
	 * way. The HTML page otherwise. Never a `.md` address that would 404.
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
	 * DELIBERATELY NOT `get_the_excerpt()`, which falls back to a truncated
	 * first paragraph. That is not a description of the page, it is the first
	 * 55 words of it — and a generated document whose every entry carries half
	 * a sentence reads as filler rather than as a summary. An absent note is
	 * more useful than a manufactured one.
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	private static function note( $post ) {
		$excerpt = trim( RankXAI_Markdown::plain( (string) $post->post_excerpt ) );
		if ( '' === $excerpt ) {
			return '';
		}
		// One line. A multi-paragraph excerpt would break the list item it sits in.
		$excerpt = trim( (string) preg_replace( '/\s+/u', ' ', $excerpt ) );
		if ( mb_strlen( $excerpt ) > 200 ) {
			$excerpt = trim( mb_substr( $excerpt, 0, 199 ) ) . "\u{2026}";
		}
		return $excerpt;
	}

	/**
	 * A URL as a markdown link destination.
	 *
	 * DEFENSIVE, and said plainly rather than dressed as a measured fix: on a
	 * stock WordPress `sanitize_title()` strips brackets and spaces out of a
	 * slug, so a permalink normally cannot carry one. What it cannot rule out is
	 * a site with its own rewrite rules or permalink filter, and there the plain
	 * form would close the link early and leave the rest of the page's own
	 * address as loose text — a broken entry in the one file written to be read
	 * by a machine.
	 *
	 * CommonMark's angle-bracket destination takes any character but `<`, `>`
	 * and a newline, none of which survive WordPress's own URL escaping. It is
	 * used only when the plain form would be ambiguous, so the common output is
	 * unchanged.
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
			// A `]` in a title would close the markdown link early and leave the
			// rest of the title as loose text followed by a bare URL.
			return str_replace( array( '[', ']' ), array( '(', ')' ), $title );
		}
		/* translators: %d: numeric post ID. */
		return sprintf( __( 'Untitled (%d)', 'rankxai' ), (int) $post->ID );
	}

	/**
	 * The H2 sections listing this site's public documents.
	 *
	 * Returns the rendered lines and the counts, because a capped list that
	 * claims completeness is worse than no list and the caller has to be able
	 * to say so.
	 *
	 * @return array{lines: string[], listed: int, omitted: int}
	 */
	private static function document_sections() {
		$lines     = array();
		$listed    = 0;
		$truncated = 0;

		foreach ( self::listed_post_types() as $type ) {
			$remaining = self::MAX_TOTAL - $listed;
			if ( $remaining <= 0 ) {
				break;
			}

			// One more than we will show, so "is there more than this" is
			// answered by the query rather than guessed at.
			$cap   = min( self::MAX_PER_TYPE, $remaining );
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
			// The number of SECTIONS that were cut short, not of posts left out.
			// Named for what it counts: the sentence it drives says "some
			// sections list only their most recent entries", and a key called
			// `omitted` invites a later edit to render it as a post count.
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
	 * `llms.txt` — what this site is, and where to read it.
	 *
	 * The shape is llmstxt.org's: an H1 with the name, an optional blockquote
	 * summary, free-form detail, then H2 file lists of `[name](url): note`.
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
			// An H1 alone is a valid llms.txt and an honest one. Manufacturing
			// a section for a site with nothing published would be the only
			// dishonest thing this file could do — and so would the detail
			// below, every sentence of which is ABOUT the links. "Every link
			// below points at a markdown copy" above an empty document is a
			// claim with nothing behind it, so the detail is composed here,
			// after the sections are known, rather than before them.
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
	 * `agents.md` — how to read this site, rather than what it is.
	 *
	 * There is no published specification for this file at a site root, so it
	 * claims no format. It states the addresses an automated reader would
	 * otherwise have to discover, and then the same list of documents.
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

		/*
		 * `wp_sitemaps_enabled` is a FILTER, not a function — calling it as one
		 * is a FATAL on this URL, measured on a real WordPress before this line
		 * was corrected. The switch is the SERVER's own method, and an SEO
		 * plugin that replaces core sitemaps filters it off, which is exactly
		 * when we must say nothing: guessing another plugin's sitemap path
		 * would publish an address that may not exist.
		 */
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
