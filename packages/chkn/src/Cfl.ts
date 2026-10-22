/**
 * CFL: the archive format IMVU serves products in (`productdata/{pid}/{revision}`).
 *
 * Layout (little-endian), from the classic client's `imvu/cfl/CFL.py` and `CFLMaker.py`:
 *
 * ```text
 * "CFL3" | "DFL3"                magic; DFL3 adds a content hash per directory entry
 * u32 directoryOffset
 * u32 directorySize              uncompressed size of the directory
 * …entries…                      each: u32 storedLength, then the stored bytes
 * at directoryOffset:
 *   u32 compression, u32 storedLength, stored directory bytes
 * directory (after decompression), repeated:
 *   i32 size, i32 offset, i32 compression, i16 nameLength, name (Latin-1)
 *   [DFL3 only: i32 hashLength, hash]
 * ```
 *
 * Compression is `0` (stored) or `4` (LZMA, see {@link decompressLzma}).
 */
import { ChknError } from './errors.js';
import { decompressLzma } from './lzma.js';

export const CflCompression = {
	None: 0,
	Lzma: 4,
} as const;

export interface CflEntry {
	readonly name: string;
	/** Uncompressed size in bytes. */
	readonly size: number;
	/** Offset of the entry's stored-length field in the archive. */
	readonly offset: number;
	/** A {@link CflCompression} value. */
	readonly compression: number;
	/** Content hash (DFL3 archives only). */
	readonly hash: string | null;
}

const latin1 = new TextDecoder('latin1');

/** A parsed CFL archive. Entries are decompressed on first access and cached. */
export class CflArchive {
	readonly #bytes: Uint8Array;
	readonly #view: DataView;
	readonly #entries = new Map<string, CflEntry>();
	readonly #cache = new Map<string, Uint8Array>();
	/** Whether the archive is DFL3 (with content hashes). */
	public readonly hashed: boolean;

	private constructor(bytes: Uint8Array) {
		this.#bytes = bytes;
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

		const magic = latin1.decode(bytes.subarray(0, 4));
		if (magic !== 'CFL3' && magic !== 'DFL3') throw new ChknError(`Not a CFL archive (magic ${JSON.stringify(magic)})`);
		this.hashed = magic === 'DFL3';

		const directoryOffset = this.#u32(4);
		const directorySize = this.#u32(8);
		const directory = decompress(this.#u32(directoryOffset), this.#stored(directoryOffset + 4), directorySize);
		const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);

		let p = 0;
		while (p < directory.length) {
			if (p + 14 > directory.length) throw new ChknError('Truncated CFL directory');
			const size = view.getInt32(p, true);
			const offset = view.getInt32(p + 4, true);
			const compression = view.getInt32(p + 8, true);
			const nameLength = view.getInt16(p + 12, true);
			p += 14;
			const name = latin1.decode(directory.subarray(p, p + nameLength));
			p += nameLength;
			let hash: string | null = null;
			if (this.hashed) {
				const hashLength = view.getInt32(p, true);
				hash = latin1.decode(directory.subarray(p + 4, p + 4 + hashLength));
				p += 4 + hashLength;
			}
			this.#entries.set(name, { name, size, offset, compression, hash });
		}
	}

	/** Parse a CFL archive. The bytes are kept (not copied); entries decompress lazily. */
	public static parse(input: Uint8Array | ArrayBuffer): CflArchive {
		return new CflArchive(input instanceof Uint8Array ? input : new Uint8Array(input));
	}

	/**
	 * Build a CFL archive. Entries are stored uncompressed — the classic client reads
	 * that (compression `0`) as readily as LZMA.
	 */
	public static create(files: Iterable<[string, Uint8Array]> | Record<string, Uint8Array>): Uint8Array {
		const list: [string, Uint8Array][] = Symbol.iterator in files ? [...files] : Object.entries(files);
		const nameBytes = list.map(([name]) => encodeLatin1(name));
		const total =
			12 +
			list.reduce((sum, [, data]) => sum + 4 + data.length, 0) +
			8 +
			nameBytes.reduce((sum, name) => sum + 14 + name.length, 0);
		const out = new Uint8Array(total);
		const view = new DataView(out.buffer);
		out.set([0x43, 0x46, 0x4c, 0x33]); // "CFL3"

		let p = 12;
		const offsets: number[] = [];
		for (const [, data] of list) {
			offsets.push(p);
			view.setUint32(p, data.length, true);
			out.set(data, p + 4);
			p += 4 + data.length;
		}

		const directoryOffset = p;
		const directorySize = nameBytes.reduce((sum, name) => sum + 14 + name.length, 0);
		view.setUint32(p, CflCompression.None, true);
		view.setUint32(p + 4, directorySize, true);
		p += 8;
		list.forEach(([, data], i) => {
			view.setInt32(p, data.length, true);
			view.setInt32(p + 4, offsets[i]!, true);
			view.setInt32(p + 8, CflCompression.None, true);
			view.setInt16(p + 12, nameBytes[i]!.length, true);
			out.set(nameBytes[i]!, p + 14);
			p += 14 + nameBytes[i]!.length;
		});

		view.setUint32(4, directoryOffset, true);
		view.setUint32(8, directorySize, true);
		return out;
	}

	public get entries(): CflEntry[] {
		return [...this.#entries.values()];
	}

	public get names(): string[] {
		return [...this.#entries.keys()];
	}

	public has(name: string): boolean {
		return this.#entries.has(name);
	}

	public entry(name: string): CflEntry | undefined {
		return this.#entries.get(name);
	}

	/** An entry's contents, or `undefined` if the archive has no such entry. */
	public get(name: string): Uint8Array | undefined {
		const cached = this.#cache.get(name);
		if (cached) return cached;
		const entry = this.#entries.get(name);
		if (!entry) return undefined;
		const data = decompress(entry.compression, this.#stored(entry.offset), entry.size);
		this.#cache.set(name, data);
		return data;
	}

	/** An entry's contents as UTF-8 text. */
	public text(name: string): string | undefined {
		const data = this.get(name);
		return data && new TextDecoder().decode(data);
	}

	/** Every entry, decompressed. */
	public *files(): Generator<[string, Uint8Array]> {
		for (const name of this.#entries.keys()) yield [name, this.get(name)!];
	}

	#u32(offset: number): number {
		if (offset + 4 > this.#bytes.length) throw new ChknError(`Truncated CFL (offset ${offset})`);
		return this.#view.getUint32(offset, true);
	}

	/** The `u32 length` + bytes record at `offset`. */
	#stored(offset: number): Uint8Array {
		const length = this.#u32(offset);
		if (offset + 4 + length > this.#bytes.length) throw new ChknError(`Truncated CFL entry at offset ${offset}`);
		return this.#bytes.subarray(offset + 4, offset + 4 + length);
	}
}

function decompress(compression: number, stored: Uint8Array, size: number): Uint8Array {
	if (compression === CflCompression.None) return stored;
	if (compression === CflCompression.Lzma) return decompressLzma(stored, size);
	throw new ChknError(`Unsupported CFL compression ${compression}`);
}

function encodeLatin1(text: string): Uint8Array {
	const bytes = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code > 0xff) throw new ChknError(`CFL entry names are Latin-1; cannot encode ${JSON.stringify(text)}`);
		bytes[i] = code;
	}
	return bytes;
}
