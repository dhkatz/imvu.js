import { Cal3DError } from '../errors.js';
import {
	CURRENT_FILE_VERSION,
	EARLIEST_COMPATIBLE_FILE_VERSION,
	FILE_KINDS,
	toBytes,
	type Cal3DInput,
	type FileFormat,
	type FileKind,
} from '../format.js';
import { BinaryReader } from './BinaryReader.js';
import { BinaryWriter } from './BinaryWriter.js';
import { decodeText } from './text.js';
import { parseXml, type XmlElement, type XmlNode } from './xml.js';

export type OpenedFile =
	| { readonly format: 'binary'; readonly version: number; readonly reader: BinaryReader }
	| { readonly format: 'xml'; readonly version: number; readonly body: XmlElement | undefined };

/** Common options for parsing any Cal3D file. */
export interface ParseOptions {
	/** Force a flavor instead of sniffing the binary magic first (IMVU's loader does the same sniffing). */
	readonly format?: FileFormat;
}

/**
 * Validate the header of a `kind` file and position a reader after it (binary)
 * or hand back the body element that follows `<HEADER/>` (XML).
 */
export function openFile(input: Cal3DInput, kind: FileKind, options: ParseOptions = {}): OpenedFile {
	const { binaryMagic, xmlMagic } = FILE_KINDS[kind];

	if (typeof input !== 'string' && options.format !== 'xml') {
		const bytes = toBytes(input);
		const looksBinary =
			bytes.length >= 4 && bytes[3] === 0 && String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!) === binaryMagic;
		if (looksBinary || options.format === 'binary') {
			const reader = new BinaryReader(bytes);
			const magic = reader.bytesOf(4);
			if (!looksBinary) {
				throw new Cal3DError(`Not a ${binaryMagic} file (magic ${JSON.stringify(decodeText(magic))})`);
			}
			const version = reader.int32();
			checkVersion(version, binaryMagic);
			return { format: 'binary', version, reader };
		}
	}

	if (options.format === 'binary') throw new Cal3DError(`Not a ${binaryMagic} file`);

	const text = typeof input === 'string' ? input : decodeText(toBytes(input));
	const roots = parseXml(text);
	const header = roots[0];
	if (!header || !header.is('HEADER')) {
		throw new Cal3DError(`Not a ${binaryMagic}/${xmlMagic} file (no binary magic and no XML <HEADER>)`);
	}
	const magic = header.attr('MAGIC');
	if (magic === undefined || !header.has('VERSION')) throw new Cal3DError('XML <HEADER> lacks MAGIC or VERSION');
	if (magic.toUpperCase() !== xmlMagic) throw new Cal3DError(`Expected an ${xmlMagic} file, got MAGIC="${magic}"`);
	const version = header.int('VERSION');
	if (version < EARLIEST_COMPATIBLE_FILE_VERSION) {
		throw new Cal3DError(`${xmlMagic} version ${version} is older than ${EARLIEST_COMPATIBLE_FILE_VERSION}`);
	}
	return { format: 'xml', version, body: roots[1] };
}

function checkVersion(version: number, magic: string): void {
	if (version < EARLIEST_COMPATIBLE_FILE_VERSION || version > CURRENT_FILE_VERSION) {
		throw new Cal3DError(
			`${magic} version ${version} is outside the supported ${EARLIEST_COMPATIBLE_FILE_VERSION}–${CURRENT_FILE_VERSION}`
		);
	}
}

/** Require the XML body element to have the given name. */
export function expectBody(body: XmlElement | undefined, name: string): XmlElement {
	if (!body || !body.is(name)) throw new Cal3DError(`Expected <${name}> after <HEADER>`);
	return body;
}

/** A binary writer with the magic and current version already written. */
export function binaryHeader(kind: FileKind): BinaryWriter {
	return new BinaryWriter().magic(FILE_KINDS[kind].binaryMagic).int32(CURRENT_FILE_VERSION);
}

/** `<HEADER MAGIC="…" VERSION="919" />` followed by the body. */
export function xmlDocument(kind: FileKind, body: XmlNode): XmlNode[] {
	return [{ name: 'HEADER', attributes: { MAGIC: FILE_KINDS[kind].xmlMagic, VERSION: CURRENT_FILE_VERSION } }, body];
}
