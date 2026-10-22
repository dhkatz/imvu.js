/**
 * A small, tolerant XML reader/writer for Cal3D's XML flavor.
 *
 * Cal3D XML is not quite a well-formed document: a file is a `<HEADER/>` element
 * followed by a sibling body element (two roots), and IMVU's loader matches tag and
 * attribute names case-insensitively. So instead of a DOM, {@link parseXml} returns
 * the list of top-level elements, and {@link XmlElement} lookups ignore case.
 * No `DOMParser` (Node has none), so this runs anywhere.
 */
import { Cal3DError } from '../errors.js';

export class XmlElement {
	public readonly children: XmlElement[] = [];
	/** Concatenated text directly inside this element (entities decoded, not trimmed). */
	public text = '';

	public constructor(
		public readonly name: string,
		public readonly attributes: ReadonlyMap<string, string> = new Map()
	) {}

	/** Case-insensitive tag-name test. */
	public is(name: string): boolean {
		return this.name.toUpperCase() === name.toUpperCase();
	}

	/** Case-insensitive attribute lookup. */
	public attr(name: string): string | undefined {
		const wanted = name.toUpperCase();
		for (const [key, value] of this.attributes) {
			if (key.toUpperCase() === wanted) return value;
		}
		return undefined;
	}

	public has(name: string): boolean {
		return this.attr(name) !== undefined;
	}

	/** Integer attribute, `fallback` when absent (C `atoi` semantics: leading integer, else 0). */
	public int(name: string, fallback = 0): number {
		const value = this.attr(name);
		return value === undefined ? fallback : parseIntLoose(value);
	}

	/** Float attribute, `fallback` when absent or not finite. */
	public float(name: string, fallback = 0): number {
		const value = this.attr(name);
		if (value === undefined) return fallback;
		const parsed = parseFloats(value, 1)[0]!;
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	public firstChild(name: string): XmlElement | undefined {
		return this.children.find((child) => child.is(name));
	}
}

/** Parse leading integer like C `atoi`. */
export function parseIntLoose(text: string): number {
	const match = /^\s*([+-]?\d+)/.exec(text);
	return match ? Number.parseInt(match[1]!, 10) : 0;
}

/**
 * Read up to `count` whitespace-separated floats, rounded to 32-bit precision like
 * the C++ loader's `float`s; missing or unparseable values are `0` (`sscanf` semantics).
 */
export function parseFloats(text: string, count: number): number[] {
	const tokens = text.trim().split(/\s+/);
	const values: number[] = [];
	for (let i = 0; i < count; i++) {
		const parsed = Number.parseFloat(tokens[i] ?? '');
		values.push(Number.isNaN(parsed) ? 0 : Math.fround(parsed));
	}
	return values;
}

export function parseInts(text: string, count: number): number[] {
	const tokens = text.trim().split(/\s+/);
	const values: number[] = [];
	for (let i = 0; i < count; i++) values.push(parseIntLoose(tokens[i] ?? ''));
	return values;
}

// ---------------------------------------------------------------- reading

const NAME = /[^\s/>=]+/y;
const ATTRIBUTE = /\s*([^\s/>=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;

/** Parse XML text into its top-level elements. */
export function parseXml(text: string): XmlElement[] {
	const roots: XmlElement[] = [];
	const stack: XmlElement[] = [];
	let i = 0;

	const appendText = (raw: string) => {
		const top = stack.at(-1);
		if (top) top.text += raw;
	};

	while (i < text.length) {
		const lt = text.indexOf('<', i);
		if (lt === -1) {
			appendText(decodeEntities(text.slice(i)));
			break;
		}
		if (lt > i) appendText(decodeEntities(text.slice(i, lt)));

		if (text.startsWith('<!--', lt)) {
			i = skipPast(text, '-->', lt);
		} else if (text.startsWith('<![CDATA[', lt)) {
			const end = text.indexOf(']]>', lt);
			if (end === -1) throw new Cal3DError('Unterminated CDATA section');
			appendText(text.slice(lt + 9, end));
			i = end + 3;
		} else if (text.startsWith('<?', lt)) {
			i = skipPast(text, '?>', lt);
		} else if (text.startsWith('<!', lt)) {
			i = skipPast(text, '>', lt);
		} else if (text.startsWith('</', lt)) {
			const end = text.indexOf('>', lt);
			if (end === -1) throw new Cal3DError('Unterminated closing tag');
			const name = text.slice(lt + 2, end).trim();
			const open = stack.pop();
			if (!open || open.name.toUpperCase() !== name.toUpperCase()) {
				throw new Cal3DError(`Mismatched closing tag </${name}>${open ? ` (expected </${open.name}>)` : ''}`);
			}
			i = end + 1;
		} else {
			NAME.lastIndex = lt + 1;
			const nameMatch = NAME.exec(text);
			if (!nameMatch) throw new Cal3DError(`Malformed tag at offset ${lt}`);
			let cursor = NAME.lastIndex;

			const attributes = new Map<string, string>();
			for (;;) {
				ATTRIBUTE.lastIndex = cursor;
				const attribute = ATTRIBUTE.exec(text);
				if (!attribute) break;
				attributes.set(attribute[1]!, decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? ''));
				cursor = ATTRIBUTE.lastIndex;
			}

			while (cursor < text.length && /\s/.test(text[cursor]!)) cursor++;
			const selfClosing = text[cursor] === '/';
			if (selfClosing) cursor++;
			if (text[cursor] !== '>') throw new Cal3DError(`Malformed tag <${nameMatch[0]}> at offset ${lt}`);

			const element = new XmlElement(nameMatch[0], attributes);
			const parent = stack.at(-1);
			if (parent) parent.children.push(element);
			else roots.push(element);
			if (!selfClosing) stack.push(element);
			i = cursor + 1;
		}
	}

	if (stack.length > 0) throw new Cal3DError(`Unclosed element <${stack.at(-1)!.name}>`);
	return roots;
}

function skipPast(text: string, terminator: string, from: number): number {
	const end = text.indexOf(terminator, from);
	if (end === -1) throw new Cal3DError(`Unterminated markup at offset ${from}`);
	return end + terminator.length;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
	if (!text.includes('&')) return text;
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
		if (entity[0] === '#') {
			const code =
				entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
		}
		return ENTITIES[entity.toLowerCase()] ?? whole;
	});
}

// ---------------------------------------------------------------- writing

/** A node to serialize: attributes in insertion order, then either text or children. */
export interface XmlNode {
	readonly name: string;
	readonly attributes?: Readonly<Record<string, string | number>>;
	readonly text?: string;
	readonly children?: readonly XmlNode[];
}

/** Serialize top-level nodes, one per line, children indented by two spaces. */
export function writeXml(nodes: readonly XmlNode[]): string {
	const lines: string[] = [];
	for (const node of nodes) writeNode(node, 0, lines);
	return lines.join('\n') + '\n';
}

function writeNode(node: XmlNode, depth: number, lines: string[]): void {
	const indent = '  '.repeat(depth);
	const attributes = Object.entries(node.attributes ?? {})
		.map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
		.join('');
	const open = `${indent}<${node.name}${attributes}`;

	if (node.children && node.children.length > 0) {
		lines.push(`${open}>`);
		for (const child of node.children) writeNode(child, depth + 1, lines);
		lines.push(`${indent}</${node.name}>`);
	} else if (node.text !== undefined && node.text !== '') {
		lines.push(`${open}>${escapeXml(node.text)}</${node.name}>`);
	} else {
		lines.push(`${open} />`);
	}
}

function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
