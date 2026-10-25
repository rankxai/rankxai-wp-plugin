/**
 * The RankX AI panel on a WooCommerce product's edit screen.
 *
 * Nothing is requested until the panel is opened. Then: a session from this
 * site (POST rankxai/v1/session, the same one the Store page uses), and one
 * read of this product from RankX AI. Every value is written as text.
 */
( function ( $ ) {
	'use strict';

	var cfg = window.rankxaiProductPanel;
	if ( ! cfg ) {
		return;
	}
	var loaded = false;

	function el( tag, text ) {
		var node = document.createElement( tag );
		if ( text ) {
			node.textContent = text;
		}
		return node;
	}

	function show( out, nodes ) {
		out.textContent = '';
		nodes.forEach( function ( n ) {
			out.appendChild( n );
		} );
	}

	function session() {
		return fetch( cfg.sessionUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': cfg.nonce },
		} ).then( function ( res ) {
			return res.ok ? res.json() : Promise.reject( new Error( 'session' ) );
		} );
	}

	function load( box ) {
		var panel = box.querySelector( '[data-rankxai-product]' );
		var out = box.querySelector( '[data-rankxai-out]' );
		if ( loaded || ! panel || ! out ) {
			return;
		}
		loaded = true;
		show( out, [ el( 'p', cfg.text.loading ) ] );
		var id = panel.getAttribute( 'data-rankxai-product' );
		session()
			.then( function ( s ) {
				return fetch( cfg.apiBase + '/catalogue/products/' + encodeURIComponent( id ), {
					headers: { Authorization: 'Bearer ' + s.token },
				} );
			} )
			.then( function ( res ) {
				return res.ok ? res.json() : Promise.reject( new Error( 'product' ) );
			} )
			.then( function ( data ) {
				var nodes = [];
				var product = data && data.product;
				if ( ! product ) {
					nodes.push( el( 'p', cfg.text.notChecked ) );
				} else if ( 'ready' === product.state ) {
					nodes.push( el( 'p', cfg.text.ready ) );
				} else if ( 'needs_fix' === product.state ) {
					nodes.push( el( 'p', cfg.text.needsFix ) );
					var list = el( 'ul' );
					list.className = 'ul-disc';
					( product.issues || [] ).slice( 0, 5 ).forEach( function ( issue ) {
						list.appendChild( el( 'li', issue.title ) );
					} );
					nodes.push( list );
					if ( ( product.issues || [] ).length > 5 ) {
						nodes.push( el( 'p', cfg.text.more ) );
					}
				} else {
					nodes.push( el( 'p', cfg.text.cantTell ) );
				}
				var answers = data && data.monitored && data.monitored.answers;
				if ( answers && answers.withProducts > 0 ) {
					nodes.push(
						el(
							'p',
							cfg.text.answers
								.replace( '%1$d', String( answers.showedProduct ) )
								.replace( '%2$d', String( answers.withProducts ) )
								.replace( '%3$d', String( answers.windowDays ) )
						)
					);
				} else if ( data && data.monitored ) {
					nodes.push( el( 'p', cfg.text.noAnswers ) );
				}
				show( out, nodes );
			} )
			.catch( function () {
				loaded = false;
				show( out, [ el( 'p', cfg.text.failed ) ] );
			} );
	}

	$( function () {
		var box = document.getElementById( cfg.box );
		if ( ! box ) {
			return;
		}
		// The panel always starts closed; this only matters if another plugin opens it.
		if ( ! box.classList.contains( 'closed' ) ) {
			load( box );
		}
		$( document ).on( 'postbox-toggled', function ( event, toggled ) {
			var node = toggled && toggled.jquery ? toggled[ 0 ] : toggled;
			if ( node === box && ! box.classList.contains( 'closed' ) ) {
				load( box );
			}
		} );
	} );
}( jQuery ) );
