<?php
/**
 * Render helpers for the plugin's own admin pages.
 *
 * Every page is composed from these, so the pages look like the RankX AI app
 * and stay consistent with each other. Each helper escapes what it prints; a
 * caller passes plain text unless a parameter says it takes HTML.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

/**
 * UI kit.
 */
class RankXAI_UI {

	/**
	 * The admin menu icon: the RankX mark in one colour, so WordPress can
	 * recolour it for each admin colour scheme and hover state.
	 */
	const MENU_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MjUgNTI1Ij48cGF0aCBmaWxsPSJibGFjayIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNIDAgMjYyIEwgMCA1MjAgNDguMyA1MjAgTCA5Ni41IDUyMCAxNjQgNDUyLjUgTCAyMzEuNCAzODUuMSAyMTMuNSAzNjYuOSBDIDIwMy42IDM1NywgMTkwLjYgMzQzLjgsIDE4NC41IDMzNy42IEMgMTc4LjUgMzMxLjUsIDE3Mi4yIDMyNS40LCAxNzAuNyAzMjQgTCAxNjcuOSAzMjEuNiAxMzIuNSAzNTcgTCA5NyAzOTIuNSA5NyAyNDQuNyBMIDk3IDk3IDIyMS4zIDk3IEMgMzI5LjcgOTcsIDM0Ni4zIDk3LjIsIDM1MS41IDk4LjUgQyAzNzYgMTA0LjksIDM5My4zIDEyNy44LCAzOTMuMiAxNTMuNyBDIDM5MyAxNzguNSwgMzc4LjUgMTk5LjUsIDM1NS43IDIwNy45IEwgMzQ4LjUgMjEwLjUgMjMwLjQgMjEwLjggTCAxMTIuMiAyMTEuMSAxNDkuNCAyNDguOCBDIDE2OS44IDI2OS41LCAyMDQuOCAzMDUuMiwgMjI3IDMyOCBDIDI0OS4yIDM1MC44LCAyNzcuMiAzNzkuNCwgMjg5LjIgMzkxLjUgTCAzMTEgNDEzLjUgMjU3LjcgNDY2LjggTCAyMDQuNSA1MjAgMjU3LjUgNTIwIEwgMzEwLjUgNTIwIDMzNi42IDQ5NCBDIDM1MSA0NzkuNywgMzYzLjIgNDY4LCAzNjMuNyA0NjggQyAzNjQuMiA0NjgsIDM3Ni4yIDQ3OS43LCAzOTAuNSA0OTQgTCA0MTYuNCA1MjAgNDcxIDUxOS44IEwgNTI1LjUgNTE5LjUgNTI1LjUgMjYxIEwgNTI1LjUgMi41IDUyNS4zIDI2MC45IEwgNTI1IDUxOS40IDQ3My4yIDQ2NyBDIDQ0NC44IDQzOC4zLCA0MjEuNSA0MTQuMywgNDIxLjUgNDEzLjkgQyA0MjEuNSA0MTMuNSwgNDI1LjEgNDEwLjEsIDQyOS41IDQwNi4zIEMgNDMzLjkgNDAyLjYsIDQ0OC4yIDM5MC40LCA0NjEuMyAzNzkuMiBMIDQ4NSAzNTguOSA0ODUgMzExLjQgQyA0ODUgMjg1LjMsIDQ4NC43IDI2NCwgNDg0LjQgMjY0IEMgNDg0LjEgMjY0LCA0ODAuNCAyNjYuOCwgNDc2LjIgMjcwLjIgQyA0NzEuOSAyNzMuNiwgNDYzLjEgMjgwLjgsIDQ1Ni41IDI4Ni4yIEMgNDQ5LjkgMjkxLjUsIDQyNy45IDMwOS43LCA0MDcuNiAzMjYuNyBMIDM3MC42IDM1Ny41IDM0NC4zIDMyOS44IEMgMzI5LjggMzE0LjYsIDMxOCAzMDEuOSwgMzE4IDMwMS42IEMgMzE4IDMwMS4zLCAzMjUuMiAzMDEsIDMzMy45IDMwMSBDIDM4MC4xIDMwMSwgNDEzLjEgMjg4LjMsIDQ0My41IDI1OC45IEMgNTAzLjYgMjAwLjcsIDUwNC4zIDEwNy4yLCA0NDUgNDggQyA0MjIuNyAyNS42LCA0MDEuNSAxMy44LCAzNzAuOCA2LjcgQyAzNjEuNSA0LjYsIDM2MS4zIDQuNiwgMTgwLjggNC4zIEwgMCAzLjkgMCAyNjIgTSAwLjUgMjYyIEMgMC41IDQwNC4yLCAwLjYgNDYyLjMsIDAuOCAzOTEuMyBDIDAuOSAzMjAuMiwgMC45IDIwMy44LCAwLjggMTMyLjggQyAwLjYgNjEuNywgMC41IDExOS44LCAwLjUgMjYyIi8+PC9zdmc+Cg==';

	/** The R of the mark, drawn in the text colour. */
	const MARK_R = 'M 0 262 L 0 520 48.3 520 L 96.5 520 164 452.5 L 231.4 385.1 213.5 366.9 C 203.6 357, 190.6 343.8, 184.5 337.6 C 178.5 331.5, 172.2 325.4, 170.7 324 L 167.9 321.6 132.5 357 L 97 392.5 97 244.7 L 97 97 221.3 97 C 329.7 97, 346.3 97.2, 351.5 98.5 C 376 104.9, 393.3 127.8, 393.2 153.7 C 393 178.5, 378.5 199.5, 355.7 207.9 L 348.5 210.5 230.4 210.8 L 112.2 211.1 149.8 249.3 C 200.9 301.2, 226.7 327.5, 271.9 373.8 C 293 395.3, 310.6 413, 311 413 C 311.9 413, 370 358.2, 370 357.4 C 370 357.1, 358.3 344.5, 344 329.5 C 329.7 314.5, 318 301.9, 318 301.6 C 318 301.3, 325.2 301, 333.9 301 C 380.1 301, 413.1 288.3, 443.5 258.9 C 503.6 200.7, 504.3 107.2, 445 48 C 422.7 25.6, 401.5 13.8, 370.8 6.7 C 361.5 4.6, 361.3 4.6, 180.8 4.3 L 0 3.9 0 262';

	/** The X of the mark, in the brand red. */
	const MARK_X = 'M 478.4 268.3 C 475.6 270.6, 468.8 276.1, 463.4 280.5 C 378.5 349.4, 338.7 385.6, 251.5 472.9 L 204.5 520 257.5 520 L 310.5 520 336.6 494 C 351 479.7, 363.2 468, 363.7 468 C 364.2 468, 376.2 479.7, 390.5 494 L 416.4 520 470.8 519.8 L 525.1 519.5 473.3 467.1 C 444.8 438.3, 421.5 414.3, 421.5 413.9 C 421.5 413.5, 425.1 410.1, 429.5 406.3 C 433.9 402.6, 448.2 390.4, 461.3 379.2 L 485 358.9 485 311.4 C 485 285.3, 484.7 264, 484.3 264.1 C 483.8 264.1, 481.2 266, 478.4 268.3';

	/**
	 * Open a page: the wrapper, the header and the tab strip.
	 *
	 * @param string $title    Page title.
	 * @param string $subtitle One line saying what the page answers.
	 * @param string $current  Slug of the current page, for the tab strip.
	 */
	public static function open_page( $title, $subtitle, $current ) {
		echo '<div class="wrap rankxai-app">';
		echo '<header class="rankxai-header">';
		echo '<div class="rankxai-header__brand">';
		self::mark( 28 );
		echo '<div><h1 class="rankxai-header__title">' . esc_html( $title ) . '</h1>';
		echo '<p class="rankxai-header__subtitle">' . esc_html( $subtitle ) . '</p></div>';
		echo '</div>';
		self::connection_pill();
		echo '</header>';
		// Core moves admin notices to just after this element.
		echo '<hr class="wp-header-end">';
		self::tabs( $current );
		echo '<div class="rankxai-page">';
	}

	/**
	 * Close a page.
	 */
	public static function close_page() {
		echo '</div></div>';
	}

	/**
	 * The mark, inline so its R follows the text colour.
	 *
	 * @param int $size Pixel size.
	 */
	public static function mark( $size ) {
		$size = (int) $size;
		echo '<svg class="rankxai-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525 525" width="' . esc_attr( (string) $size ) . '" height="' . esc_attr( (string) $size ) . '" aria-hidden="true" focusable="false">';
		echo '<path fill="currentColor" fill-rule="evenodd" d="' . esc_attr( self::MARK_R ) . '"/>';
		echo '<path fill="#fd1820" fill-rule="evenodd" d="' . esc_attr( self::MARK_X ) . '"/>';
		echo '</svg>';
	}

	/**
	 * Whether a RankX AI account has sent anything to this site.
	 *
	 * The plugin never calls out, so "connected" is inferred from what has
	 * arrived. It is worded as a fact about this site, never as a promise.
	 */
	private static function connection_pill() {
		$received = RankXAI_Admin::last_update_received();
		if ( '' === $received ) {
			echo '<span class="rankxai-pill">' . esc_html__( 'Not connected to RankX AI', 'rankxai' ) . '</span>';
			return;
		}
		echo '<span class="rankxai-pill rankxai-pill--success" title="' . esc_attr(
			sprintf(
				/* translators: %s: a date and time. */
				__( 'Last update received %s', 'rankxai' ),
				$received
			)
		) . '"><span class="rankxai-dot" aria-hidden="true"></span>' . esc_html__( 'Connected to RankX AI', 'rankxai' ) . '</span>';
	}

	/**
	 * The tab strip across the plugin's pages.
	 *
	 * @param string $current Current page slug.
	 */
	private static function tabs( $current ) {
		echo '<nav class="rankxai-tabs" aria-label="' . esc_attr__( 'RankX AI', 'rankxai' ) . '">';
		foreach ( RankXAI_Admin::pages() as $slug => $label ) {
			$is = $slug === $current;
			echo '<a class="rankxai-tab' . ( $is ? ' is-current' : '' ) . '" href="' . esc_url( RankXAI_Admin::page_url( $slug ) ) . '"' . ( $is ? ' aria-current="page"' : '' ) . '>' . esc_html( $label ) . '</a>';
		}
		echo '</nav>';
	}

	/**
	 * Open a card.
	 *
	 * @param array $args {
	 *     Card options.
	 *
	 *     @type string $title    Title.
	 *     @type string $subtitle One line saying what the card is for.
	 *     @type bool   $hero     The page's one hero card.
	 *     @type string $id       Element id.
	 *     @type string $link     Optional "see all" URL.
	 *     @type string $link_label Label for the link.
	 * }
	 */
	public static function card_open( $args ) {
		$args  = wp_parse_args(
			$args,
			array(
				'title'      => '',
				'subtitle'   => '',
				'hero'       => false,
				'id'         => '',
				'link'       => '',
				'link_label' => '',
			)
		);
		$class = 'rankxai-card' . ( $args['hero'] ? ' rankxai-card--hero' : '' );
		echo '<section class="' . esc_attr( $class ) . '"' . ( '' !== $args['id'] ? ' id="' . esc_attr( $args['id'] ) . '"' : '' ) . '>';
		if ( '' !== $args['title'] ) {
			echo '<div class="rankxai-card__head"><div>';
			echo '<h2 class="rankxai-card__title">' . esc_html( $args['title'] ) . '</h2>';
			if ( '' !== $args['subtitle'] ) {
				echo '<p class="rankxai-card__subtitle">' . esc_html( $args['subtitle'] ) . '</p>';
			}
			echo '</div>';
			if ( '' !== $args['link'] ) {
				echo '<a class="rankxai-card__link" href="' . esc_url( $args['link'] ) . '">' . esc_html( $args['link_label'] ) . '</a>';
			}
			echo '</div>';
		}
		echo '<div class="rankxai-card__body">';
	}

	/**
	 * Close a card.
	 */
	public static function card_close() {
		echo '</div></section>';
	}

	/**
	 * Open a responsive grid of cards.
	 *
	 * @param string $layout One of 'two', 'three', 'wide' (70/30).
	 */
	public static function grid_open( $layout = 'two' ) {
		echo '<div class="rankxai-grid rankxai-grid--' . esc_attr( $layout ) . '">';
	}

	/**
	 * Close a grid.
	 */
	public static function grid_close() {
		echo '</div>';
	}

	/**
	 * A headline number, always with one sentence saying what it means.
	 *
	 * @param string $label   What is counted.
	 * @param string $value   The number, already formatted.
	 * @param string $insight One sentence reading it.
	 * @param string $tone    'neutral', 'success', 'warning' or 'danger'.
	 */
	public static function stat( $label, $value, $insight, $tone = 'neutral' ) {
		echo '<div class="rankxai-stat rankxai-stat--' . esc_attr( $tone ) . '">';
		echo '<div class="rankxai-stat__label">' . esc_html( $label ) . '</div>';
		echo '<div class="rankxai-stat__value">' . esc_html( $value ) . '</div>';
		echo '<p class="rankxai-stat__insight">' . esc_html( $insight ) . '</p>';
		echo '</div>';
	}

	/**
	 * A small status chip.
	 *
	 * Red is only for a genuine failure. Something that is merely absent or
	 * unmeasured is neutral.
	 *
	 * @param string $text Text.
	 * @param string $tone 'neutral', 'success', 'warning', 'danger' or 'info'.
	 * @return string HTML.
	 */
	public static function chip( $text, $tone = 'neutral' ) {
		return '<span class="rankxai-chip rankxai-chip--' . esc_attr( $tone ) . '">' . esc_html( $text ) . '</span>';
	}

	/**
	 * The card's "so what": one sentence from a deterministic reading of the data.
	 *
	 * @param string $text Text.
	 */
	public static function analysis( $text ) {
		echo '<div class="rankxai-analysis"><span class="rankxai-analysis__icon" aria-hidden="true">✦</span><p>' . esc_html( $text ) . '</p></div>';
	}

	/**
	 * An honest empty state: what is missing, why, and the next step.
	 *
	 * @param string $title  What is not here.
	 * @param string $body   Why, in one or two sentences.
	 * @param string $action Optional HTML for one action (already escaped).
	 */
	public static function empty_state( $title, $body, $action = '' ) {
		echo '<div class="rankxai-empty">';
		echo '<p class="rankxai-empty__title">' . esc_html( $title ) . '</p>';
		echo '<p class="rankxai-empty__body">' . esc_html( $body ) . '</p>';
		if ( '' !== $action ) {
			echo '<div class="rankxai-empty__action">' . wp_kses_post( $action ) . '</div>';
		}
		echo '</div>';
	}

	/**
	 * A link styled as a button.
	 *
	 * @param string $label   Label.
	 * @param string $url     Target.
	 * @param string $variant 'primary' or 'outline'.
	 * @param bool   $external Opens in a new tab.
	 * @return string HTML.
	 */
	public static function button_link( $label, $url, $variant = 'outline', $external = false ) {
		return '<a class="rankxai-button rankxai-button--' . esc_attr( $variant ) . '" href="' . esc_url( $url ) . '"' . ( $external ? ' target="_blank" rel="noopener"' : '' ) . '>' . esc_html( $label ) . '</a>';
	}

	/**
	 * A form that posts one action to `admin-post.php`, as a single button.
	 *
	 * @param string $action  The `admin_post` action, which is also the nonce action.
	 * @param string $label   Button label.
	 * @param array  $fields  Hidden fields, name => value.
	 * @param string $variant 'primary', 'outline' or 'danger'.
	 */
	public static function action_form( $action, $label, $fields = array(), $variant = 'outline' ) {
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Every value is escaped in action_form_html().
		echo self::action_form_html( $action, $label, $fields, $variant );
	}

	/**
	 * The same form, returned rather than printed.
	 *
	 * @param string $action  The `admin_post` action, which is also the nonce action.
	 * @param string $label   Button label.
	 * @param array  $fields  Hidden fields, name => value.
	 * @param string $variant 'primary', 'outline' or 'danger'.
	 * @return string HTML.
	 */
	public static function action_form_html( $action, $label, $fields = array(), $variant = 'outline' ) {
		$html  = '<form class="rankxai-inline-form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		$html .= '<input type="hidden" name="action" value="' . esc_attr( $action ) . '" />';
		foreach ( $fields as $name => $value ) {
			$html .= '<input type="hidden" name="' . esc_attr( $name ) . '" value="' . esc_attr( (string) $value ) . '" />';
		}
		$html .= wp_nonce_field( $action, '_wpnonce', true, false );
		$html .= '<button type="submit" class="rankxai-button rankxai-button--' . esc_attr( $variant ) . '">' . esc_html( $label ) . '</button>';
		$html .= '</form>';
		return $html;
	}

	/**
	 * A progress bar with its figures in text.
	 *
	 * @param int    $done  Done.
	 * @param int    $total Total.
	 * @param string $label Text beside the bar.
	 */
	public static function progress( $done, $total, $label ) {
		$pct = $total > 0 ? (int) round( 100 * min( $done, $total ) / $total ) : 0;
		echo '<div class="rankxai-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' . esc_attr( (string) $pct ) . '">';
		echo '<div class="rankxai-progress__track"><div class="rankxai-progress__fill" style="width:' . esc_attr( (string) $pct ) . '%"></div></div>';
		echo '<p class="rankxai-progress__label">' . esc_html( $label ) . '</p>';
		echo '</div>';
	}

	/**
	 * A sparkline. Fewer than two points draws nothing: one point is not a trend.
	 *
	 * @param int[] $points Values, oldest first.
	 * @return string SVG, or ''.
	 */
	public static function sparkline( $points ) {
		$points = array_values( array_map( 'intval', (array) $points ) );
		$n      = count( $points );
		if ( $n < 2 ) {
			return '';
		}
		$max    = max( 1, max( $points ) );
		$width  = 120;
		$height = 28;
		$coords = array();
		foreach ( $points as $i => $value ) {
			$x        = round( $i * ( $width / ( $n - 1 ) ), 2 );
			$y        = round( $height - 2 - ( $value / $max ) * ( $height - 4 ), 2 );
			$coords[] = $x . ',' . $y;
		}
		return '<svg class="rankxai-sparkline" viewBox="0 0 ' . $width . ' ' . $height . '" width="' . $width . '" height="' . $height . '" aria-hidden="true" focusable="false"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="' . esc_attr( implode( ' ', $coords ) ) . '"/></svg>';
	}

	/**
	 * A table. Cells are escaped unless the column is listed as HTML.
	 *
	 * @param string[] $headers   Column headers.
	 * @param array    $rows      Rows, each a list of cells.
	 * @param int[]    $html_cols Column indexes whose cells are HTML (already escaped).
	 * @param string[] $num_cols   Column indexes to right-align.
	 */
	public static function table( $headers, $rows, $html_cols = array(), $num_cols = array() ) {
		echo '<div class="rankxai-table-wrap"><table class="rankxai-table"><thead><tr>';
		foreach ( $headers as $i => $header ) {
			echo '<th scope="col"' . ( in_array( $i, $num_cols, true ) ? ' class="is-num"' : '' ) . '>' . esc_html( $header ) . '</th>';
		}
		echo '</tr></thead><tbody>';
		foreach ( $rows as $row ) {
			echo '<tr>';
			foreach ( array_values( $row ) as $i => $cell ) {
				$class = in_array( $i, $num_cols, true ) ? ' class="is-num"' : '';
				if ( in_array( $i, $html_cols, true ) ) {
					echo '<td' . $class . '>' . wp_kses_post( (string) $cell ) . '</td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $class is one of two fixed literals.
				} else {
					echo '<td' . $class . '>' . esc_html( (string) $cell ) . '</td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- As above.
				}
			}
			echo '</tr>';
		}
		echo '</tbody></table></div>';
	}

	/**
	 * A short list of lines, each a label and an optional chip.
	 *
	 * @param array $items Each {label: string, meta?: string, chip?: string HTML}.
	 */
	public static function rows( $items ) {
		echo '<ul class="rankxai-rows">';
		foreach ( $items as $item ) {
			echo '<li><div class="rankxai-rows__main"><span class="rankxai-rows__label">' . esc_html( $item['label'] ) . '</span>';
			if ( ! empty( $item['meta'] ) ) {
				echo '<span class="rankxai-rows__meta">' . esc_html( $item['meta'] ) . '</span>';
			}
			echo '</div>';
			if ( ! empty( $item['chip'] ) ) {
				echo wp_kses_post( $item['chip'] );
			}
			echo '</li>';
		}
		echo '</ul>';
	}

	/**
	 * A caption beneath a band: small, muted, one or two sentences.
	 *
	 * @param string $text Text.
	 */
	public static function note( $text ) {
		echo '<p class="rankxai-note">' . esc_html( $text ) . '</p>';
	}
}
