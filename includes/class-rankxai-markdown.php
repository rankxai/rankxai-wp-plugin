<?php
/**
 * HTML to Markdown, for the twin of a page.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * Convert rendered post HTML into Markdown.
 */
class RankXAI_Markdown {

	/**
	 * Tags whose entire subtree is dropped, since their text is page chrome.
	 *
	 * @var string[]
	 */
	private static $dropped = array( 'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'form', 'input', 'button', 'select', 'textarea', 'object', 'embed' );

	/**
	 * Elements that start a block. Anything else is treated as inline.
	 *
	 * @var string[]
	 */
	private static $blocks = array( 'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul' );

	/**
	 * How deep the walker descends. Far above real page-builder nesting; it only bounds the stack.
	 */
	const MAX_DEPTH = 120;

	/**
	 * Convert an HTML fragment to Markdown.
	 *
	 * @param string $html HTML fragment (a rendered post body).
	 * @return string Markdown.
	 */
	public static function convert( $html ) {
		$html = (string) $html;
		if ( '' === trim( $html ) ) {
			return '';
		}

		if ( ! class_exists( 'DOMDocument' ) ) {
			return self::tidy( self::escape_text( wp_strip_all_tags( $html ) ) );
		}

		$dom      = new DOMDocument( '1.0', 'UTF-8' );
		$previous = libxml_use_internal_errors( true );

		// The XML prolog makes libxml read UTF-8. The usual
		// `mb_convert_encoding( ..., 'HTML-ENTITIES' )` is deprecated in PHP 8.2.
		$loaded = $dom->loadHTML(
			'<?xml encoding="utf-8" ?><html><body>' . $html . '</body></html>',
			LIBXML_NOERROR | LIBXML_NOWARNING
		);

		libxml_clear_errors();
		libxml_use_internal_errors( $previous );

		if ( ! $loaded ) {
			return self::tidy( self::escape_text( wp_strip_all_tags( $html ) ) );
		}

		$bodies = $dom->getElementsByTagName( 'body' );
		if ( 0 === $bodies->length ) {
			return self::tidy( self::escape_text( wp_strip_all_tags( $html ) ) );
		}

		return self::tidy( implode( "\n\n", self::blocks( $bodies->item( 0 ), 0 ) ) );
	}

	/**
	 * Build the whole twin document: front matter, title, body, site context.
	 *
	 * @param WP_Post $post        Post being rendered.
	 * @param string  $description Meta description, or ''.
	 * @param string  $context     Site context block, or ''.
	 * @return string Markdown document.
	 */
	public static function document( $post, $description, $context ) {
		$permalink = (string) get_permalink( $post );
		$title     = self::plain( get_the_title( $post ) );

		// `source:` instead of a canonical, which Google advises against with `noindex`.
		$front = array(
			'title'  => $title,
			'source' => $permalink,
		);
		if ( '' !== $description ) {
			$front['description'] = self::plain( $description );
		}
		$published = get_post_time( 'c', true, $post );
		$updated   = get_post_modified_time( 'c', true, $post );
		if ( is_string( $published ) && '' !== $published ) {
			$front['published'] = $published;
		}
		if ( is_string( $updated ) && '' !== $updated ) {
			$front['updated'] = $updated;
		}
		$site = self::plain( get_bloginfo( 'name' ) );
		if ( '' !== $site ) {
			$front['site'] = $site;
		}

		$lines = array( '---' );
		foreach ( $front as $key => $value ) {
			$lines[] = $key . ': ' . self::yaml_scalar( $value );
		}
		$lines[] = '---';

		$document = implode( "\n", $lines ) . "\n\n";
		$body     = self::convert( self::rendered_content( $post ) );
		$facts    = self::product_details( $post );
		if ( '' !== $title ) {
			// A page that opens with its own title as a heading would say it twice.
			$heading = '# ' . self::escape_text( $title );
			$first   = trim( (string) strstr( ltrim( $body ) . "\n", "\n", true ) );
			if ( 0 !== strcasecmp( $first, $heading ) ) {
				$document .= $heading . "\n\n";
			} elseif ( '' !== $facts ) {
				// The product details go right under the title either way.
				$body      = ltrim( $body );
				$document .= $first . "\n\n";
				$body      = ltrim( substr( $body, strlen( $first ) ) );
			}
		}
		$document .= $facts . $body;

		$context = trim( (string) $context );
		if ( '' !== $context ) {
			// A fixed heading keeps the page's words apart from the business context.
			$document .= "\n\n---\n\n## About this business\n\n" . $context;
		}

		return self::tidy( $document ) . "\n";
	}

	/**
	 * A product's key facts as a short list under its title.
	 *
	 * @param WP_Post $post Post.
	 * @return string Markdown, or '' for anything that is not a product.
	 */
	private static function product_details( $post ) {
		$facts = RankXAI_Woo::product_facts( $post );
		if ( ! $facts ) {
			return '';
		}
		$lines = array( '## ' . self::escape_text( __( 'Product details', 'rankxai' ) ), '' );
		foreach ( $facts as $label => $value ) {
			$lines[] = '- **' . self::escape_text( $label ) . ':** ' . self::escape_text( $value );
		}
		return implode( "\n", $lines ) . "\n\n";
	}

	/**
	 * Run the stored content through the normal filters, with the global post set.
	 *
	 * @param WP_Post $post              Post object.
	 * @param bool    $pre_render_blocks Render blocks before the filter chain. Default true.
	 * @return string Rendered HTML.
	 */
	public static function rendered_content( $post, $pre_render_blocks = true ) {
		$content = (string) $post->post_content;

		if ( $pre_render_blocks && function_exists( 'do_blocks' ) ) {
			$content = do_blocks( $content );
		}

		$previous = isset( $GLOBALS['post'] ) ? $GLOBALS['post'] : null;

		// Core's own `the_content` filters (blocks, shortcodes, embeds) read the current post from this global,
		// as in the loop. It is set for this one call and the previous value is restored straight after.
		// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- See above.
		$GLOBALS['post'] = $post;
		setup_postdata( $post );

		/** This filter is documented in wp-includes/post-template.php */
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Core filter.
		$content = apply_filters( 'the_content', $content );

		if ( $previous instanceof WP_Post ) {
			// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Restoring the value saved above.
			$GLOBALS['post'] = $previous;
			setup_postdata( $previous );
		} else {
			wp_reset_postdata();
			unset( $GLOBALS['post'] );
		}

		return str_replace( ']]>', ']]&gt;', $content );
	}

	// -----------------------------------------------------------------------
	// Block rendering
	// -----------------------------------------------------------------------

	/**
	 * Render a node's children as a list of block strings.
	 *
	 * Inline runs between blocks become paragraphs, so loose text is not lost.
	 *
	 * @param DOMNode $node  Parent node.
	 * @param int     $depth Current depth.
	 * @return string[] Block strings, none empty.
	 */
	private static function blocks( $node, $depth ) {
		if ( $depth > self::MAX_DEPTH ) {
			$text = self::escape_text( self::plain( $node->textContent ) );
			return '' === $text ? array() : array( $text );
		}

		$out    = array();
		$buffer = '';

		foreach ( $node->childNodes as $child ) {
			if ( XML_ELEMENT_NODE === $child->nodeType && self::is_block( $child ) ) {
				$paragraph = self::paragraph( $buffer );
				if ( '' !== $paragraph ) {
					$out[] = $paragraph;
				}
				$buffer = '';
				foreach ( self::block( $child, $depth + 1 ) as $block ) {
					if ( '' !== $block ) {
						$out[] = $block;
					}
				}
				continue;
			}
			$buffer .= self::inline( $child, $depth + 1 );
		}

		$paragraph = self::paragraph( $buffer );
		if ( '' !== $paragraph ) {
			$out[] = $paragraph;
		}

		return $out;
	}

	/**
	 * Is this element a block-level one we handle as such?
	 *
	 * @param DOMNode $node Element node.
	 * @return bool
	 */
	private static function is_block( $node ) {
		$tag = strtolower( $node->nodeName );
		if ( in_array( $tag, self::$dropped, true ) ) {
			// As a block, it drops as a unit instead of leaking text.
			return true;
		}
		return in_array( $tag, self::$blocks, true );
	}

	/**
	 * Render one block element.
	 *
	 * @param DOMNode $node  Element node.
	 * @param int     $depth Current depth.
	 * @return string[] Zero or more block strings.
	 */
	private static function block( $node, $depth ) {
		$tag = strtolower( $node->nodeName );

		if ( in_array( $tag, self::$dropped, true ) ) {
			return array();
		}

		switch ( $tag ) {
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6':
				$text = self::paragraph( self::inline_children( $node, $depth ) );
				return '' === $text ? array() : array( str_repeat( '#', (int) substr( $tag, 1 ) ) . ' ' . self::single_line( $text ) );

			case 'hr':
				return array( '---' );

			case 'p':
				$text = self::paragraph( self::inline_children( $node, $depth ) );
				return '' === $text ? array() : array( $text );

			case 'pre':
				return array( self::code_block( $node ) );

			case 'ul':
			case 'ol':
				$list = self::list_block( $node, 'ol' === $tag, $depth );
				return '' === $list ? array() : array( $list );

			case 'blockquote':
				$inner = self::blocks( $node, $depth );
				if ( ! $inner ) {
					return array();
				}
				$quoted = array();
				foreach ( explode( "\n", implode( "\n\n", $inner ) ) as $line ) {
					$quoted[] = '' === $line ? '>' : '> ' . $line;
				}
				return array( implode( "\n", $quoted ) );

			case 'table':
				$table = self::table_block( $node, $depth );
				return '' === $table ? array() : array( $table );

			case 'dl':
				return self::definition_list( $node, $depth );

			case 'figure':
				return self::figure( $node, $depth );

			default:
				// A transparent container such as `div` or `section`.
				return self::blocks( $node, $depth );
		}
	}

	/**
	 * A fenced code block, verbatim, with the language from a `language-*` class.
	 *
	 * @param DOMNode $node `pre` element.
	 * @return string
	 */
	private static function code_block( $node ) {
		$language = '';
		$classes  = '';
		if ( $node instanceof DOMElement ) {
			$classes = $node->getAttribute( 'class' );
		}
		$code = null;
		foreach ( $node->childNodes as $child ) {
			if ( XML_ELEMENT_NODE === $child->nodeType && 'code' === strtolower( $child->nodeName ) ) {
				$code = $child;
				break;
			}
		}
		if ( $code instanceof DOMElement ) {
			$classes .= ' ' . $code->getAttribute( 'class' );
		}
		if ( preg_match( '/(?:language|lang|brush)[-:]([a-z0-9#+_-]+)/i', $classes, $match ) ) {
			$language = strtolower( $match[1] );
		}

		$body = null === $code ? $node->textContent : $code->textContent;
		$body = str_replace( "\r\n", "\n", (string) $body );
		$body = rtrim( $body, "\n" );

		// Make the fence longer than any backtick run inside the body.
		$fence = '```';
		if ( preg_match_all( '/`{3,}/', $body, $runs ) && ! empty( $runs[0] ) ) {
			$longest = 3;
			foreach ( $runs[0] as $run ) {
				$longest = max( $longest, strlen( $run ) );
			}
			$fence = str_repeat( '`', $longest + 1 );
		}

		return $fence . $language . "\n" . $body . "\n" . $fence;
	}

	/**
	 * A bullet or numbered list, nested lists included.
	 *
	 * @param DOMNode $node   `ul` or `ol` element.
	 * @param bool    $ordered Whether it is ordered.
	 * @param int     $depth   Current depth.
	 * @return string
	 */
	private static function list_block( $node, $ordered, $depth ) {
		$lines = array();
		$index = 1;

		foreach ( $node->childNodes as $child ) {
			if ( XML_ELEMENT_NODE !== $child->nodeType || 'li' !== strtolower( $child->nodeName ) ) {
				continue;
			}

			$marker = $ordered ? $index . '. ' : '- ';
			$blocks = self::blocks( $child, $depth + 1 );
			if ( ! $blocks ) {
				++$index;
				continue;
			}

			$body   = implode( "\n\n", $blocks );
			$indent = str_repeat( ' ', strlen( $marker ) );
			$first  = true;
			foreach ( explode( "\n", $body ) as $line ) {
				if ( $first ) {
					$lines[] = $marker . $line;
					$first   = false;
					continue;
				}
				$lines[] = '' === $line ? '' : $indent . $line;
			}
			++$index;
		}

		return implode( "\n", $lines );
	}

	/**
	 * A GitHub-flavoured pipe table, or '' when it has no rows.
	 *
	 * @param DOMNode $node  `table` element.
	 * @param int     $depth Current depth.
	 * @return string
	 */
	private static function table_block( $node, $depth ) {
		$rows = array();
		if ( ! $node instanceof DOMElement ) {
			return '';
		}

		foreach ( $node->getElementsByTagName( 'tr' ) as $tr ) {
			$cells = array();
			foreach ( $tr->childNodes as $cell ) {
				if ( XML_ELEMENT_NODE !== $cell->nodeType ) {
					continue;
				}
				$tag = strtolower( $cell->nodeName );
				if ( 'td' !== $tag && 'th' !== $tag ) {
					continue;
				}
				// Pipes are escaped only inside cells.
				$cells[] = str_replace( '|', '\\|', self::single_line( self::paragraph( self::inline_children( $cell, $depth + 1 ) ) ) );
			}
			if ( $cells ) {
				$rows[] = $cells;
			}
		}

		if ( ! $rows ) {
			return '';
		}

		$width = 0;
		foreach ( $rows as $row ) {
			$width = max( $width, count( $row ) );
		}

		$lines  = array();
		$header = array_shift( $rows );
		$header = array_pad( $header, $width, '' );

		$lines[] = '| ' . implode( ' | ', $header ) . ' |';
		$lines[] = '| ' . implode( ' | ', array_fill( 0, $width, '---' ) ) . ' |';
		foreach ( $rows as $row ) {
			$lines[] = '| ' . implode( ' | ', array_pad( $row, $width, '' ) ) . ' |';
		}

		return implode( "\n", $lines );
	}

	/**
	 * A definition list, as bold terms with their definitions beneath.
	 *
	 * @param DOMNode $node  `dl` element.
	 * @param int     $depth Current depth.
	 * @return string[]
	 */
	private static function definition_list( $node, $depth ) {
		$out = array();
		foreach ( $node->childNodes as $child ) {
			if ( XML_ELEMENT_NODE !== $child->nodeType ) {
				continue;
			}
			$tag  = strtolower( $child->nodeName );
			$text = self::paragraph( self::inline_children( $child, $depth + 1 ) );
			if ( '' === $text ) {
				continue;
			}
			if ( 'dt' === $tag ) {
				$out[] = '**' . self::single_line( $text ) . '**';
			} elseif ( 'dd' === $tag ) {
				$out[] = $text;
			}
		}
		return $out;
	}

	/**
	 * A figure: its content, then its caption as an italic line.
	 *
	 * @param DOMNode $node  `figure` element.
	 * @param int     $depth Current depth.
	 * @return string[]
	 */
	private static function figure( $node, $depth ) {
		$out     = array();
		$caption = '';
		foreach ( $node->childNodes as $child ) {
			if ( XML_ELEMENT_NODE === $child->nodeType && 'figcaption' === strtolower( $child->nodeName ) ) {
				$caption = self::single_line( self::paragraph( self::inline_children( $child, $depth + 1 ) ) );
				continue;
			}
			if ( XML_ELEMENT_NODE === $child->nodeType && self::is_block( $child ) ) {
				foreach ( self::block( $child, $depth + 1 ) as $block ) {
					if ( '' !== $block ) {
						$out[] = $block;
					}
				}
				continue;
			}
			$inline = self::paragraph( self::inline( $child, $depth + 1 ) );
			if ( '' !== $inline ) {
				$out[] = $inline;
			}
		}
		if ( '' !== $caption ) {
			$out[] = '*' . $caption . '*';
		}
		return $out;
	}

	// -----------------------------------------------------------------------
	// Inline rendering
	// -----------------------------------------------------------------------

	/**
	 * Render every child of a node as inline markdown.
	 *
	 * @param DOMNode $node  Parent node.
	 * @param int     $depth Current depth.
	 * @return string
	 */
	private static function inline_children( $node, $depth ) {
		$out = '';
		foreach ( $node->childNodes as $child ) {
			$out .= self::inline( $child, $depth + 1 );
		}
		return $out;
	}

	/**
	 * Render one node as inline markdown.
	 *
	 * @param DOMNode $node  Node.
	 * @param int     $depth Current depth.
	 * @return string
	 */
	private static function inline( $node, $depth ) {
		if ( XML_TEXT_NODE === $node->nodeType || XML_CDATA_SECTION_NODE === $node->nodeType ) {
			return self::escape_text( self::collapse( $node->nodeValue ) );
		}
		if ( XML_ELEMENT_NODE !== $node->nodeType ) {
			return '';
		}
		if ( $depth > self::MAX_DEPTH ) {
			return self::escape_text( self::collapse( $node->textContent ) );
		}

		$tag = strtolower( $node->nodeName );
		if ( in_array( $tag, self::$dropped, true ) ) {
			return '';
		}

		switch ( $tag ) {
			case 'br':
				return "\n";

			case 'strong':
			case 'b':
				return self::wrap( self::inline_children( $node, $depth ), '**' );

			case 'em':
			case 'i':
				return self::wrap( self::inline_children( $node, $depth ), '*' );

			case 'del':
			case 's':
			case 'strike':
				return self::wrap( self::inline_children( $node, $depth ), '~~' );

			case 'code':
			case 'kbd':
			case 'samp':
				$code = self::collapse( $node->textContent );
				return '' === $code ? '' : '`' . str_replace( '`', '', $code ) . '`';

			case 'a':
				return self::anchor( $node, $depth );

			case 'img':
				return self::image( $node );

			case 'iframe':
			case 'video':
			case 'audio':
				return self::embed( $node );

			default:
				return self::inline_children( $node, $depth );
		}
	}

	/**
	 * Wrap inline content in a marker, unless it is only whitespace.
	 *
	 * Edge spaces move outside the marker, since `** bold **` is not emphasis.
	 *
	 * @param string $inner  Inner markdown.
	 * @param string $marker Marker.
	 * @return string
	 */
	private static function wrap( $inner, $marker ) {
		if ( '' === trim( $inner ) ) {
			return $inner;
		}
		$lead  = ( ' ' === substr( $inner, 0, 1 ) ) ? ' ' : '';
		$trail = ( ' ' === substr( $inner, -1 ) ) ? ' ' : '';
		return $lead . $marker . trim( $inner ) . $marker . $trail;
	}

	/**
	 * A link. A link with no text becomes its own URL, so it is still followable.
	 *
	 * @param DOMNode $node  `a` element.
	 * @param int     $depth Current depth.
	 * @return string
	 */
	private static function anchor( $node, $depth ) {
		$href = $node instanceof DOMElement ? trim( $node->getAttribute( 'href' ) ) : '';
		$text = self::inline_children( $node, $depth );

		if ( '' === $href || 0 === strpos( $href, 'javascript:' ) || '#' === substr( $href, 0, 1 ) ) {
			return $text;
		}
		if ( '' === trim( $text ) ) {
			return '<' . $href . '>';
		}
		return '[' . self::single_line( trim( $text ) ) . '](' . self::url( $href ) . ')';
	}

	/**
	 * An image, with its alt text.
	 *
	 * @param DOMNode $node `img` element.
	 * @return string
	 */
	private static function image( $node ) {
		if ( ! $node instanceof DOMElement ) {
			return '';
		}
		$src = trim( $node->getAttribute( 'src' ) );
		if ( '' === $src ) {
			// Lazy-loading themes keep the real URL in `data-src`.
			$src = trim( $node->getAttribute( 'data-src' ) );
		}
		if ( '' === $src ) {
			return '';
		}
		$alt = self::collapse( $node->getAttribute( 'alt' ) );
		return '![' . self::escape_text( $alt ) . '](' . self::url( $src ) . ')';
	}

	/**
	 * An embed, rendered as a link.
	 *
	 * @param DOMNode $node Element.
	 * @return string
	 */
	private static function embed( $node ) {
		if ( ! $node instanceof DOMElement ) {
			return '';
		}
		$src = trim( $node->getAttribute( 'src' ) );
		if ( '' === $src ) {
			foreach ( $node->getElementsByTagName( 'source' ) as $source ) {
				$src = trim( $source->getAttribute( 'src' ) );
				if ( '' !== $src ) {
					break;
				}
			}
		}
		if ( '' === $src ) {
			return '';
		}
		$title = self::collapse( $node->getAttribute( 'title' ) );
		if ( '' === $title ) {
			$title = 'Embedded media';
		}
		return '[' . self::escape_text( $title ) . '](' . self::url( $src ) . ')';
	}

	// -----------------------------------------------------------------------
	// Text handling
	// -----------------------------------------------------------------------

	/**
	 * A URL safe to put inside markdown link parentheses.
	 *
	 * Only spaces and parentheses are encoded, so an encoded URL is not encoded twice.
	 *
	 * @param string $url Raw URL.
	 * @return string
	 */
	private static function url( $url ) {
		$url = str_replace( array( ' ', '(', ')' ), array( '%20', '%28', '%29' ), trim( $url ) );
		return str_replace( array( "\n", "\r", '<', '>' ), '', $url );
	}

	/**
	 * Collapse whitespace runs to single spaces, keeping one at each edge.
	 *
	 * @param string $text Raw text.
	 * @return string
	 */
	private static function collapse( $text ) {
		$text = (string) $text;
		if ( '' === $text ) {
			return '';
		}
		$collapsed = preg_replace( '/\s+/u', ' ', $text );
		return null === $collapsed ? $text : $collapsed;
	}

	/**
	 * Plain single-line text with entities decoded, for titles and descriptions.
	 *
	 * @param string $text Raw text.
	 * @return string
	 */
	public static function plain( $text ) {
		return trim( self::collapse( wp_strip_all_tags( html_entity_decode( (string) $text, ENT_QUOTES, 'UTF-8' ) ) ) );
	}

	/**
	 * Escape the characters that would otherwise be read as markdown syntax.
	 *
	 * Only the common ones, to avoid text full of backslashes.
	 *
	 * @param string $text Plain text.
	 * @return string
	 */
	private static function escape_text( $text ) {
		return str_replace(
			array( '\\', '`', '*', '_', '[', ']', '<' ),
			array( '\\\\', '\\`', '\\*', '\\_', '\\[', '\\]', '&lt;' ),
			(string) $text
		);
	}

	/**
	 * Finish a run of inline content as a paragraph.
	 *
	 * A leading `#`, `-` and similar is escaped so it does not become a heading or list.
	 *
	 * @param string $text Inline markdown.
	 * @return string
	 */
	private static function paragraph( $text ) {
		$text = trim( (string) $text );
		if ( '' === $text ) {
			return '';
		}

		$lines = array();
		foreach ( explode( "\n", $text ) as $line ) {
			$line = rtrim( $line );
			if ( preg_match( '/^(\s*)([#>+-]|\d+[.)])(\s|$)/', $line, $match ) ) {
				$line = $match[1] . '\\' . substr( ltrim( $line ), 0, strlen( $match[2] ) ) . substr( ltrim( $line ), strlen( $match[2] ) );
			}
			$lines[] = $line;
		}

		return trim( implode( "\n", $lines ) );
	}

	/**
	 * Flatten to one line, for a heading or a table cell.
	 *
	 * @param string $text Markdown.
	 * @return string
	 */
	private static function single_line( $text ) {
		$flat = preg_replace( '/\s*\n\s*/', ' ', (string) $text );
		return trim( null === $flat ? (string) $text : $flat );
	}

	/**
	 * A YAML double-quoted scalar, with control characters removed.
	 *
	 * @param string $value Value.
	 * @return string
	 */
	public static function yaml_scalar( $value ) {
		$value = (string) $value;
		$value = preg_replace( '/[\x00-\x1F\x7F]/u', '', $value );
		if ( null === $value ) {
			$value = '';
		}
		return '"' . str_replace( array( '\\', '"' ), array( '\\\\', '\\"' ), $value ) . '"';
	}

	/**
	 * Normalise blank lines and trailing whitespace across the whole document.
	 *
	 * @param string $markdown Markdown.
	 * @return string
	 */
	private static function tidy( $markdown ) {
		$markdown = str_replace( array( "\r\n", "\r" ), "\n", (string) $markdown );
		$markdown = preg_replace( '/[ \t]+\n/', "\n", $markdown );
		$markdown = preg_replace( '/\n{3,}/', "\n\n", (string) $markdown );
		return trim( (string) $markdown );
	}
}
