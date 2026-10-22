/**
 * A tiny event-based XML reader (start/end/text), enough for IMVU product templates.
 * No `DOMParser` (Node has none). Handles the declaration, comments, CDATA, doctype,
 * attributes and the predefined/numeric entities.
 */
import { ChknError } from './errors.js';

export interface XmlHandler {
	start(name: string, attributes: ReadonlyMap<string, string>): void;
	end(name: string): void;
	text(text: string): void;
}

const NAME = /[^\s/>=]+/y;
const ATTRIBUTE = /\s*([^\s/>=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;

export function readXml(text: string, handler: XmlHandler): void {
	const open: string[] = [];
	let i = 0;
	while (i < text.length) {
		const lt = text.indexOf('<', i);
		if (lt === -1) {
			handler.text(decodeEntities(text.slice(i)));
			break;
		}
		if (lt > i) handler.text(decodeEntities(text.slice(i, lt)));

		if (text.startsWith('<!--', lt)) {
			i = skipPast(text, '-->', lt);
		} else if (text.startsWith('<![CDATA[', lt)) {
			const end = text.indexOf(']]>', lt);
			if (end === -1) throw new ChknError('Unterminated CDATA section');
			handler.text(text.slice(lt + 9, end));
			i = end + 3;
		} else if (text.startsWith('<?', lt)) {
			i = skipPast(text, '?>', lt);
		} else if (text.startsWith('<!', lt)) {
			i = skipPast(text, '>', lt);
		} else if (text.startsWith('</', lt)) {
			const end = text.indexOf('>', lt);
			if (end === -1) throw new ChknError('Unterminated closing tag');
			const name = text.slice(lt + 2, end).trim();
			if (open.pop() !== name) throw new ChknError(`Mismatched closing tag </${name}>`);
			handler.end(name);
			i = end + 1;
		} else {
			NAME.lastIndex = lt + 1;
			const name = NAME.exec(text)?.[0];
			if (!name) throw new ChknError(`Malformed tag at offset ${lt}`);
			let cursor = NAME.lastIndex;
			const attributes = new Map<string, string>();
			for (;;) {
				ATTRIBUTE.lastIndex = cursor;
				const match = ATTRIBUTE.exec(text);
				if (!match) break;
				attributes.set(match[1]!, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
				cursor = ATTRIBUTE.lastIndex;
			}
			while (cursor < text.length && /\s/.test(text[cursor]!)) cursor++;
			const selfClosing = text[cursor] === '/';
			if (selfClosing) cursor++;
			if (text[cursor] !== '>') throw new ChknError(`Malformed tag <${name}> at offset ${lt}`);
			handler.start(name, attributes);
			if (selfClosing) handler.end(name);
			else open.push(name);
			i = cursor + 1;
		}
	}
	if (open.length > 0) throw new ChknError(`Unclosed element <${open.at(-1)}>`);
}

function skipPast(text: string, terminator: string, from: number): number {
	const end = text.indexOf(terminator, from);
	if (end === -1) throw new ChknError(`Unterminated markup at offset ${from}`);
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

export function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
