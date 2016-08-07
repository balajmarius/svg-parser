import { locate } from 'locate-character';

const validNameCharacters = /[a-zA-Z:-]/;
const whitespace = /[\s\t\r\n]/;
const quotemark = /['"]/;

export function parse ( source ) {
	const match = /^<\?.+?\?>/.exec( source );
	const metadata = match ? match[0] : '';

	let stack = [];

	let state = neutral;
	let currentElement = null;
	let root = null;

	function error ( message ) {
		const { line, column } = locate( source, i );
		const before = source.slice( 0, i );
		const beforeLine = /(^|\n).*$/.exec( before )[0];
		const after = source.slice( i );
		const afterLine = /.*(\n|$)/.exec( after )[0];

		const snippet = `${beforeLine}${afterLine}\n${ Array( beforeLine.length + 1 ).join( ' ' )}^`;

		throw new Error( `${message} (${line}:${column}). If this is valid SVG, it's probably a bug in pathologist. Please raise an issue at https://gitlab.com/Rich-Harris/pathologist/issues – thanks!\n\n${snippet}` );
	}

	function neutral () {
		let text = '';
		while ( i < source.length && source[i] !== '<' ) text += source[ i++ ];

		if ( /\S/.test( text ) ) {
			currentElement.children.push( text );
		}

		if ( source[i] === '<' ) {
			return tag;
		}
	}

	function tag () {
		if ( source[i] === '!' ) {
			return comment;
		}

		if ( source[i] === '/' ) {
			return closingTag;
		}

		const name = getName();

		const element = {
			name,
			attributes: {},
			children: []
		};

		if ( currentElement ) {
			currentElement.children.push( element );
		} else {
			root = element;
		}

		let attribute;
		while ( attribute = getAttribute() ) {
			element.attributes[ attribute.name ] = attribute.value;
		}

		let selfClosing = false;

		if ( source[i] === '/' ) {
			i += 1;
			selfClosing = true;
		}

		if ( source[i] !== '>' ) {
			error( 'Expected >' );
		}

		if ( !selfClosing ) {
			currentElement = element;
			stack.push( element );
		}

		return neutral;
	}

	function comment () {
		const index = source.indexOf( '-->', i );
		if ( !~index ) error( 'expected -->' );

		i = index + 3;
		return neutral;
	}

	function closingTag () {
		const name = getName();

		if ( name !== currentElement.name ) {
			error( `Expected closing tag </${name}> to match opening tag <${currentElement.name}>` );
		}

		if ( source[i] !== '>' ) {
			error( 'Expected >' );
		}

		stack.pop();
		currentElement = stack[ stack.length - 1 ];

		return neutral;
	}

	function getName () {
		let name = '';
		while ( validNameCharacters.test( source[i] ) ) name += source[ i++ ];

		return name;
	}

	function getAttribute () {
		if ( !whitespace.test( source[i] ) ) return null;
		allowSpaces();

		const name = getName();
		let value = true;

		allowSpaces();
		if ( source[i] === '=' ) {
			i += 1;
			allowSpaces();

			value = getAttributeValue();
			if ( !isNaN( value ) ) value = +value; // TODO whitelist numeric attributes?
		}

		return { name, value };
	}

	function getAttributeValue () {
		return quotemark.test( source[i] ) ?
			getQuotedAttributeValue() :
			getUnquotedAttributeValue();
	}

	function getUnquotedAttributeValue () {
		let value = '';
		do {
			const char = source[i];
			if ( char === ' ' || char === '>' || char === '/' ) {
				return value;
			}

			value += char;
			i += 1;
		} while ( i < source.length );

		return value;
	}

	function getQuotedAttributeValue () {
		const quotemark = source[ i++ ];

		let value = '';
		let escaped = false;

		while ( i < source.length ) {
			const char = source[ i++ ];
			if ( char === quotemark && !escaped ) {
				return value;
			}

			if ( char === '\\' && !escaped ) {
				escaped = true;
			}

			value += escaped ? `\\${char}` : char;
			escaped = false;
		}
	}

	function allowSpaces () {
		while ( whitespace.test( source[i] ) ) i += 1;
	}

	let i = metadata.length;
	while ( i < source.length ) {
		if ( !state ) error( 'Unexpected character' );
		state = state();
		i += 1;
	}

	if ( root.name === 'svg' ) root.metadata = metadata;
	return root;
}