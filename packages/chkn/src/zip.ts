/**
 * Minimal ZIP support for CHKN files (a `.chkn` is a plain ZIP of a product's files,
 * which IMVU's create mode opens).
 *
 * Writing stores entries uncompressed with a fixed timestamp, so output is
 * deterministic. Reading handles stored and deflated entries; deflate uses the
 * standard `DecompressionStream` (Node ≥ 22, current browsers), hence async.
 * ZIP64 and encryption are not supported.
 */
import { ChknError } from './errors.js';

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_FLAG = 1 << 11;
/** 1980-01-01 00:00, the DOS epoch. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

export function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/** Write a ZIP archive with every entry stored. */
export function writeZip(files: Iterable<[string, Uint8Array]>): Uint8Array {
	const encoder = new TextEncoder();
	const entries = [...files].map(([name, data]) => ({ name: encoder.encode(name), data, crc: crc32(data), offset: 0 }));

	const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0);
	const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
	const out = new Uint8Array(localSize + centralSize + 22);
	const view = new DataView(out.buffer);

	let p = 0;
	for (const entry of entries) {
		entry.offset = p;
		view.setUint32(p, LOCAL_HEADER, true);
		view.setUint16(p + 4, 20, true); // version needed
		view.setUint16(p + 6, UTF8_FLAG, true);
		view.setUint16(p + 8, 0, true); // stored
		view.setUint16(p + 10, 0, true); // time
		view.setUint16(p + 12, DOS_DATE, true);
		view.setUint32(p + 14, entry.crc, true);
		view.setUint32(p + 18, entry.data.length, true);
		view.setUint32(p + 22, entry.data.length, true);
		view.setUint16(p + 26, entry.name.length, true);
		view.setUint16(p + 28, 0, true);
		out.set(entry.name, p + 30);
		out.set(entry.data, p + 30 + entry.name.length);
		p += 30 + entry.name.length + entry.data.length;
	}

	const centralOffset = p;
	for (const entry of entries) {
		view.setUint32(p, CENTRAL_HEADER, true);
		view.setUint16(p + 4, 20, true); // version made by
		view.setUint16(p + 6, 20, true); // version needed
		view.setUint16(p + 8, UTF8_FLAG, true);
		view.setUint16(p + 10, 0, true);
		view.setUint16(p + 12, 0, true);
		view.setUint16(p + 14, DOS_DATE, true);
		view.setUint32(p + 16, entry.crc, true);
		view.setUint32(p + 20, entry.data.length, true);
		view.setUint32(p + 24, entry.data.length, true);
		view.setUint16(p + 28, entry.name.length, true);
		// extra, comment, disk, internal/external attributes: zero
		view.setUint32(p + 42, entry.offset, true);
		out.set(entry.name, p + 46);
		p += 46 + entry.name.length;
	}

	view.setUint32(p, END_OF_CENTRAL_DIRECTORY, true);
	view.setUint16(p + 8, entries.length, true);
	view.setUint16(p + 10, entries.length, true);
	view.setUint32(p + 12, centralSize, true);
	view.setUint32(p + 16, centralOffset, true);
	return out;
}

/** Read every file of a ZIP archive (directories are skipped). */
export async function readZip(input: Uint8Array): Promise<Map<string, Uint8Array>> {
	const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
	let eocd = -1;
	for (let p = input.length - 22; p >= Math.max(0, input.length - 22 - 0xffff); p--) {
		if (view.getUint32(p, true) === END_OF_CENTRAL_DIRECTORY) {
			eocd = p;
			break;
		}
	}
	if (eocd === -1) throw new ChknError('Not a ZIP/CHKN archive (no end of central directory)');

	const count = view.getUint16(eocd + 10, true);
	let p = view.getUint32(eocd + 16, true);
	if (count === 0xffff || p === 0xffffffff) throw new ChknError('ZIP64 archives are not supported');

	const files = new Map<string, Uint8Array>();
	for (let i = 0; i < count; i++) {
		if (view.getUint32(p, true) !== CENTRAL_HEADER) throw new ChknError('Corrupt ZIP central directory');
		const flags = view.getUint16(p + 8, true);
		const method = view.getUint16(p + 10, true);
		const crc = view.getUint32(p + 16, true);
		const compressedSize = view.getUint32(p + 20, true);
		const size = view.getUint32(p + 24, true);
		const nameLength = view.getUint16(p + 28, true);
		const extraLength = view.getUint16(p + 30, true);
		const commentLength = view.getUint16(p + 32, true);
		const localOffset = view.getUint32(p + 42, true);
		const nameBytes = input.subarray(p + 46, p + 46 + nameLength);
		const name = new TextDecoder(flags & UTF8_FLAG ? 'utf-8' : 'latin1').decode(nameBytes);
		p += 46 + nameLength + extraLength + commentLength;

		if (flags & 1) throw new ChknError(`Encrypted ZIP entry ${name} is not supported`);
		if (name.endsWith('/')) continue;

		if (view.getUint32(localOffset, true) !== LOCAL_HEADER) throw new ChknError(`Corrupt ZIP local header for ${name}`);
		const dataStart =
			localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
		const stored = input.subarray(dataStart, dataStart + compressedSize);

		let data: Uint8Array;
		if (method === 0) data = stored.slice();
		else if (method === 8) data = await inflateRaw(stored);
		else throw new ChknError(`Unsupported ZIP compression method ${method} for ${name}`);

		if (data.length !== size || crc32(data) !== crc) throw new ChknError(`ZIP entry ${name} failed its CRC check`);
		files.set(name, data);
	}
	return files;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data as Uint8Array<ArrayBuffer>])
		.stream()
		.pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
