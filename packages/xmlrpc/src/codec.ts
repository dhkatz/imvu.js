/**
 * XML-RPC wire codec: encodes `<methodCall>` documents and decodes
 * `<methodResponse>` documents (values or faults).
 *
 * Self-contained (no `DOMParser`, which Node lacks) and limited to what
 * XML-RPC uses: elements, text, entities and CDATA — attributes are ignored.
 */
import { XmlRpcFault } from './errors.js';

/** A value that can cross the XML-RPC wire. */
export type XmlRpcValue =
	| string
	| number
	| boolean
	| null
	| Date
	| Uint8Array
	| XmlRpcValue[]
	| { [member: string]: XmlRpcValue | undefined };

// ---------------------------------------------------------------- encoding

/** Serialize a method call. Integers that fit in 32 bits are `<int>`; other numbers are `<double>`. */
export function encodeMethodCall(method: string, params: readonly XmlRpcValue[] = []): string {
	const body = params.map((param) => `<param>${encodeValue(param)}</param>`).join('');
	return `<?xml version="1.0"?><methodCall><methodName>${escape(method)}</methodName><params>${body}</params></methodCall>`;
}

function encodeValue(value: XmlRpcValue | undefined): string {
	return `<value>${encodeInner(value)}</value>`;
}

function encodeInner(value: XmlRpcValue | undefined): string {
	if (value === null || value === undefined) return '<nil/>';
	if (typeof value === 'string') return `<string>${escape(value)}</string>`;
	if (typeof value === 'boolean') return `<boolean>${value ? 1 : 0}</boolean>`;
	if (typeof value === 'number') {
		if (Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff) return `<int>${value}</int>`;
		if (!Number.isFinite(value)) throw new RangeError(`XML-RPC cannot encode ${value}`);
		return `<double>${value}</double>`;
	}
	if (value instanceof Date) return `<dateTime.iso8601>${encodeDate(value)}</dateTime.iso8601>`;
	if (value instanceof Uint8Array) return `<base64>${encodeBase64(value)}</base64>`;
	if (Array.isArray(value)) return `<array><data>${value.map(encodeValue).join('')}</data></array>`;

	const members = Object.entries(value)
		.filter(([, member]) => member !== undefined)
		.map(([name, member]) => `<member><name>${escape(name)}</name>${encodeValue(member)}</member>`);
	return `<struct>${members.join('')}</struct>`;
}

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** XML-RPC dates carry no zone; they are written (and read) as UTC. */
const encodeDate = (date: Date): string =>
	date
		.toISOString()
		.replace(/\.\d{3}Z$/, '')
		.replace(/-/g, '');

function encodeBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

// ---------------------------------------------------------------- decoding

/** Decode a method response, returning its value or throwing {@link XmlRpcFault}. */
export function decodeMethodResponse(xml: string): XmlRpcValue {
	const root = parseXml(xml);
	if (root.name !== 'methodResponse') {
		throw new SyntaxError(`Expected <methodResponse>, got <${root.name}>`);
	}

	const fault = child(root, 'fault');
	if (fault) {
		const detail = decodeValue(required(fault, 'value')) as { faultCode?: unknown; faultString?: unknown };
		throw new XmlRpcFault(Number(detail.faultCode), typeof detail.faultString === 'string' ? detail.faultString : '');
	}

	const param = child(required(root, 'params'), 'param');
	return param ? decodeValue(required(param, 'value')) : null;
}

function decodeValue(value: XmlElement): XmlRpcValue {
	const typed = elements(value)[0];
	if (!typed) return text(value); // an untyped <value> is a string

	switch (typed.name) {
		case 'string':
			return text(typed);
		case 'int':
		case 'i4':
		case 'i8':
			return Number.parseInt(text(typed).trim(), 10);
		case 'double':
			return Number.parseFloat(text(typed).trim());
		case 'boolean':
			return text(typed).trim() === '1';
		case 'nil':
			return null;
		case 'dateTime.iso8601':
			return decodeDate(text(typed).trim());
		case 'base64':
			return Uint8Array.from(atob(text(typed).replace(/\s+/g, '')), (c) => c.charCodeAt(0));
		case 'array':
			return elements(required(typed, 'data'))
				.filter((item) => item.name === 'value')
				.map(decodeValue);
		case 'struct': {
			const struct: Record<string, XmlRpcValue> = {};
			for (const member of elements(typed).filter((item) => item.name === 'member')) {
				struct[text(required(member, 'name'))] = decodeValue(required(member, 'value'));
			}
			return struct;
		}
		default:
			throw new SyntaxError(`Unknown XML-RPC type <${typed.name}>`);
	}
}

function decodeDate(value: string): Date {
	const match = /^(\d{4})-?(\d{2})-?(\d{2})T(\d{2}):?(\d{2}):?(\d{2})/.exec(value);
	if (!match) throw new SyntaxError(`Invalid dateTime.iso8601 '${value}'`);
	const [, y, mo, d, h, mi, s] = match.map(Number);
	return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

// ---------------------------------------------------------------- minimal XML

interface XmlElement {
	name: string;
	children: (XmlElement | string)[];
}

const elements = (element: XmlElement): XmlElement[] =>
	element.children.filter((node): node is XmlElement => typeof node !== 'string');

const child = (element: XmlElement, name: string): XmlElement | undefined =>
	elements(element).find((node) => node.name === name);

function required(element: XmlElement, name: string): XmlElement {
	const found = child(element, name);
	if (!found) throw new SyntaxError(`<${element.name}> is missing <${name}>`);
	return found;
}

const text = (element: XmlElement): string =>
	element.children.map((node) => (typeof node === 'string' ? node : text(node))).join('');

function parseXml(xml: string): XmlElement {
	const document: XmlElement = { name: '#document', children: [] };
	const stack: XmlElement[] = [document];
	let i = 0;

	const skipPast = (terminator: string) => {
		const end = xml.indexOf(terminator, i);
		if (end < 0) throw new SyntaxError(`Unterminated markup, expected '${terminator}'`);
		const content = xml.slice(i, end);
		i = end + terminator.length;
		return content;
	};

	while (i < xml.length) {
		if (xml[i] !== '<') {
			const end = xml.indexOf('<', i);
			const raw = xml.slice(i, end < 0 ? xml.length : end);
			i = end < 0 ? xml.length : end;
			if (stack.length > 1) stack[stack.length - 1].children.push(decodeEntities(raw));
			continue;
		}

		if (xml.startsWith('<?', i) || xml.startsWith('<!--', i)) {
			skipPast(xml.startsWith('<?', i) ? '?>' : '-->');
		} else if (xml.startsWith('<![CDATA[', i)) {
			i += '<![CDATA['.length;
			stack[stack.length - 1].children.push(skipPast(']]>'));
		} else if (xml.startsWith('<!', i)) {
			skipPast('>');
		} else if (xml.startsWith('</', i)) {
			i += 2;
			const name = skipPast('>').trim();
			const open = stack.pop();
			if (!open || open.name !== name) throw new SyntaxError(`Mismatched </${name}>`);
		} else {
			i += 1;
			const tag = skipPast('>');
			const selfClosing = tag.endsWith('/');
			const element: XmlElement = { name: tag.replace(/\/$/, '').trim().split(/\s/)[0], children: [] };
			stack[stack.length - 1].children.push(element);
			if (!selfClosing) stack.push(element);
		}
	}

	if (stack.length !== 1) throw new SyntaxError(`Unclosed <${stack[stack.length - 1].name}>`);
	const root = elements(document)[0];
	if (!root) throw new SyntaxError('Empty XML document');
	return root;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeEntities = (raw: string): string =>
	raw.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
		if (body[0] === '#') {
			const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			return String.fromCodePoint(code);
		}
		return ENTITIES[body] ?? entity;
	});
