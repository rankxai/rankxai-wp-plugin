/**
 * Settings › Redirects: import a CSV file.
 *
 * Read in the browser and sent one row at a time to this site's own redirect
 * route, signed in as the administrator. Each row is checked and added by the
 * site, exactly as the "Add redirect" form does. Nothing leaves this site.
 */
( function () {
	'use strict';

	var cfg = window.rankxaiRedirectImport;
	var input = document.getElementById( 'rankxai-redirect-csv' );
	var button = document.getElementById( 'rankxai-redirect-import' );
	var log = document.getElementById( 'rankxai-redirect-import-log' );
	if ( ! cfg || ! input || ! button || ! log ) {
		return;
	}

	function format( text, a, b ) {
		return text.replace( '%1$d', String( a ) ).replace( '%2$d', String( b ) );
	}

	function line( text ) {
		var li = document.createElement( 'li' );
		li.textContent = text;
		log.appendChild( li );
		return li;
	}

	// Rows of cells; quoted cells may hold commas, quotes ("") and line breaks.
	function parse( text ) {
		var rows = [];
		var row = [];
		var cell = '';
		var quoted = false;
		for ( var i = 0; i < text.length; i++ ) {
			var c = text[ i ];
			if ( quoted ) {
				if ( '"' === c && '"' === text[ i + 1 ] ) {
					cell += '"';
					i++;
				} else if ( '"' === c ) {
					quoted = false;
				} else {
					cell += c;
				}
			} else if ( '"' === c ) {
				quoted = true;
			} else if ( ',' === c || ';' === c || '\t' === c ) {
				row.push( cell );
				cell = '';
			} else if ( '\n' === c || '\r' === c ) {
				if ( '\r' === c && '\n' === text[ i + 1 ] ) {
					i++;
				}
				row.push( cell );
				rows.push( row );
				row = [];
				cell = '';
			} else {
				cell += c;
			}
		}
		if ( '' !== cell || row.length ) {
			row.push( cell );
			rows.push( row );
		}
		return rows
			.map( function ( r ) {
				return { from: ( r[ 0 ] || '' ).trim(), to: ( r[ 1 ] || '' ).trim() };
			} )
			.filter( function ( r ) {
				// Blank lines and a header line ("from,to") are skipped.
				return '' !== r.from && '' !== r.to && /^(\/|https?:\/\/)/i.test( r.from );
			} );
	}

	// An address on this site, written in full, becomes its path; any other site is left for the site to refuse.
	function path( value ) {
		if ( ! /^https?:\/\//i.test( value ) ) {
			return value;
		}
		try {
			var u = new URL( value );
			return u.host === window.location.host ? u.pathname + u.search : value;
		} catch ( e ) {
			return value;
		}
	}

	function add( row ) {
		return fetch( cfg.url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
			body: JSON.stringify( { from: path( row.from ), to: path( row.to ) } ),
		} ).then( function ( res ) {
			return res
				.json()
				.catch( function () {
					return {};
				} )
				.then( function ( body ) {
					return { ok: res.ok, message: body && body.message ? String( body.message ) : '' };
				} );
		} );
	}

	button.addEventListener( 'click', function () {
		var file = input.files && input.files[ 0 ];
		log.textContent = '';
		if ( ! file ) {
			line( cfg.text.none );
			return;
		}
		button.disabled = true;
		file.text().then( function ( text ) {
			var rows = parse( text );
			if ( ! rows.length ) {
				line( cfg.text.empty );
				button.disabled = false;
				return;
			}
			var status = line( format( cfg.text.progress, 0, rows.length ) );
			var added = 0;
			var notAdded = 0;
			var next = function ( i ) {
				if ( i >= rows.length ) {
					status.textContent = format( cfg.text.done, added, notAdded );
					button.disabled = false;
					return;
				}
				status.textContent = format( cfg.text.progress, i + 1, rows.length );
				add( rows[ i ] )
					.then(
						function ( r ) {
							if ( r.ok ) {
								added++;
								line( cfg.text.added + ': ' + rows[ i ].from + ' → ' + rows[ i ].to );
							} else {
								notAdded++;
								line( cfg.text.notAdded + ': ' + rows[ i ].from + ' (' + ( r.message || cfg.text.failed ) + ')' );
							}
						},
						function () {
							notAdded++;
							line( cfg.text.notAdded + ': ' + rows[ i ].from + ' (' + cfg.text.failed + ')' );
						}
					)
					.then( function () {
						next( i + 1 );
					} );
			};
			next( 0 );
		} );
	} );
}() );
