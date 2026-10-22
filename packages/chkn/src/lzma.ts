/**
 * LZMA ("LZMA1", `.lzma` without the size field) decoder.
 *
 * A direct port of Igor Pavlov's reference decoder `LzmaSpec.cpp` (public domain),
 * decoding into one output buffer (so the whole output acts as the dictionary).
 * Small and dependency-free, so CFLs can be read in browsers too.
 *
 * Input layout, as CFL entries store it (pylzma's format): one properties byte
 * (`lc`/`lp`/`pb`), the dictionary size as a little-endian u32, then the range-coded
 * stream. The stream may or may not end with an end marker.
 */
import { ChknError } from './errors.js';

const PROB_INIT = 1024;
const NUM_STATES = 12;
const POS_BITS_MAX = 4;
const LEN_TO_POS_STATES = 4;
const ALIGN_BITS = 4;
const END_POS_MODEL_INDEX = 14;
const NUM_FULL_DISTANCES = 1 << (END_POS_MODEL_INDEX >> 1);
const MATCH_MIN_LEN = 2;

const probs = (count: number) => new Uint16Array(count).fill(PROB_INIT);

class RangeDecoder {
	private range = 0xffffffff;
	private code = 0;
	private offset: number;

	public constructor(
		private readonly input: Uint8Array,
		start: number
	) {
		if (input[start] !== 0) throw new ChknError('Corrupt LZMA stream (bad first byte)');
		this.offset = start + 1;
		for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.next()) >>> 0;
		if (this.code === this.range) throw new ChknError('Corrupt LZMA stream');
	}

	public get finishedOk(): boolean {
		return this.code === 0;
	}

	private next(): number {
		if (this.offset >= this.input.length) throw new ChknError('Truncated LZMA stream');
		return this.input[this.offset++]!;
	}

	private normalize(): void {
		if (this.range < 0x1000000) {
			this.range = (this.range << 8) >>> 0;
			this.code = ((this.code << 8) | this.next()) >>> 0;
		}
	}

	public bit(table: Uint16Array, index: number): number {
		const prob = table[index]!;
		const bound = (this.range >>> 11) * prob;
		let bit: number;
		if (this.code < bound) {
			this.range = bound;
			table[index] = prob + ((2048 - prob) >>> 5);
			bit = 0;
		} else {
			this.range = (this.range - bound) >>> 0;
			this.code = (this.code - bound) >>> 0;
			table[index] = prob - (prob >>> 5);
			bit = 1;
		}
		this.normalize();
		return bit;
	}

	public directBits(count: number): number {
		let result = 0;
		for (let i = 0; i < count; i++) {
			this.range >>>= 1;
			let bit = 1;
			if (this.code >= this.range) {
				this.code = (this.code - this.range) >>> 0;
			} else {
				bit = 0;
			}
			this.normalize();
			result = result * 2 + bit;
		}
		return result;
	}

	public tree(table: Uint16Array, offset: number, bits: number): number {
		let m = 1;
		for (let i = 0; i < bits; i++) m = (m << 1) + this.bit(table, offset + m);
		return m - (1 << bits);
	}

	public reverseTree(table: Uint16Array, offset: number, bits: number): number {
		let m = 1;
		let symbol = 0;
		for (let i = 0; i < bits; i++) {
			const bit = this.bit(table, offset + m);
			m = (m << 1) + bit;
			symbol |= bit << i;
		}
		return symbol;
	}
}

class LengthDecoder {
	private readonly choice = probs(2);
	private readonly low = probs(16 << 3);
	private readonly mid = probs(16 << 3);
	private readonly high = probs(1 << 8);

	public decode(rc: RangeDecoder, posState: number): number {
		if (rc.bit(this.choice, 0) === 0) return rc.tree(this.low, posState << 3, 3);
		if (rc.bit(this.choice, 1) === 0) return 8 + rc.tree(this.mid, posState << 3, 3);
		return 16 + rc.tree(this.high, 0, 8);
	}
}

/**
 * Decompress `input` (properties + dictionary size + stream). Pass `outputSize` when
 * known (CFL directories record it); without it the stream must end with a marker.
 */
export function decompressLzma(input: Uint8Array, outputSize?: number): Uint8Array {
	if (input.length < 5) throw new ChknError('Truncated LZMA header');
	let props = input[0]!;
	if (props >= 9 * 5 * 5) throw new ChknError(`Invalid LZMA properties byte ${props}`);
	const lc = props % 9;
	props = (props / 9) | 0;
	const lp = props % 5;
	const pb = (props / 5) | 0;
	const dictSize = Math.max(4096, new DataView(input.buffer, input.byteOffset + 1, 4).getUint32(0, true));

	const rc = new RangeDecoder(input, 5);
	const literals = probs(0x300 << (lc + lp));
	const isMatch = probs(NUM_STATES << POS_BITS_MAX);
	const isRep = probs(NUM_STATES);
	const isRepG0 = probs(NUM_STATES);
	const isRepG1 = probs(NUM_STATES);
	const isRepG2 = probs(NUM_STATES);
	const isRep0Long = probs(NUM_STATES << POS_BITS_MAX);
	const posSlot = probs(LEN_TO_POS_STATES << 6);
	const posDecoders = probs(1 + NUM_FULL_DISTANCES - END_POS_MODEL_INDEX);
	const align = probs(1 << ALIGN_BITS);
	const lengths = new LengthDecoder();
	const repLengths = new LengthDecoder();

	const sized = outputSize !== undefined;
	let out = new Uint8Array(sized ? outputSize : Math.max(1024, input.length * 4));
	let pos = 0;
	let remaining = sized ? outputSize : Infinity;

	const put = (byte: number) => {
		if (pos === out.length) {
			const grown = new Uint8Array(out.length * 2);
			grown.set(out);
			out = grown;
		}
		out[pos++] = byte;
	};

	let state = 0;
	let rep0 = 0;
	let rep1 = 0;
	let rep2 = 0;
	let rep3 = 0;
	const posMask = (1 << pb) - 1;
	const lpMask = (1 << lp) - 1;

	const decodeDistance = (len: number): number => {
		const lenState = Math.min(len, LEN_TO_POS_STATES - 1);
		const slot = rc.tree(posSlot, lenState << 6, 6);
		if (slot < 4) return slot;
		const directBits = (slot >>> 1) - 1;
		let dist = (2 | (slot & 1)) * 2 ** directBits;
		if (slot < END_POS_MODEL_INDEX) {
			dist += rc.reverseTree(posDecoders, dist - slot, directBits);
		} else {
			dist += rc.directBits(directBits - ALIGN_BITS) * 2 ** ALIGN_BITS;
			dist += rc.reverseTree(align, 0, ALIGN_BITS);
		}
		return dist;
	};

	for (;;) {
		if (remaining === 0 && rc.finishedOk) break;
		const posState = pos & posMask;

		if (rc.bit(isMatch, (state << POS_BITS_MAX) + posState) === 0) {
			if (remaining === 0) throw new ChknError('LZMA stream longer than its declared size');
			const prev = pos > 0 ? out[pos - 1]! : 0;
			const base = 0x300 * (((pos & lpMask) << lc) + (prev >>> (8 - lc)));
			let symbol = 1;
			if (state >= 7) {
				let matchByte = out[pos - rep0 - 1]!;
				do {
					const matchBit = (matchByte >>> 7) & 1;
					matchByte <<= 1;
					const bit = rc.bit(literals, base + ((1 + matchBit) << 8) + symbol);
					symbol = (symbol << 1) | bit;
					if (matchBit !== bit) break;
				} while (symbol < 0x100);
			}
			while (symbol < 0x100) symbol = (symbol << 1) | rc.bit(literals, base + symbol);
			put(symbol - 0x100);
			state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
			remaining--;
			continue;
		}

		let len: number;
		if (rc.bit(isRep, state) !== 0) {
			if (remaining === 0) throw new ChknError('LZMA stream longer than its declared size');
			if (pos === 0) throw new ChknError('Corrupt LZMA stream (repeat before any data)');
			if (rc.bit(isRepG0, state) === 0) {
				if (rc.bit(isRep0Long, (state << POS_BITS_MAX) + posState) === 0) {
					state = state < 7 ? 9 : 11;
					put(out[pos - rep0 - 1]!);
					remaining--;
					continue;
				}
			} else {
				let dist: number;
				if (rc.bit(isRepG1, state) === 0) {
					dist = rep1;
				} else {
					if (rc.bit(isRepG2, state) === 0) {
						dist = rep2;
					} else {
						dist = rep3;
						rep3 = rep2;
					}
					rep2 = rep1;
				}
				rep1 = rep0;
				rep0 = dist;
			}
			len = repLengths.decode(rc, posState);
			state = state < 7 ? 8 : 11;
		} else {
			rep3 = rep2;
			rep2 = rep1;
			rep1 = rep0;
			len = lengths.decode(rc, posState);
			state = state < 7 ? 7 : 10;
			rep0 = decodeDistance(len);
			if (rep0 === 0xffffffff) {
				if (!rc.finishedOk) throw new ChknError('Corrupt LZMA stream (bad end marker)');
				break;
			}
			if (remaining === 0) throw new ChknError('LZMA stream longer than its declared size');
			if (rep0 >= dictSize || rep0 >= pos) throw new ChknError('Corrupt LZMA stream (distance out of range)');
		}

		len += MATCH_MIN_LEN;
		if (len > remaining) throw new ChknError('LZMA stream longer than its declared size');
		for (let i = 0; i < len; i++) put(out[pos - rep0 - 1]!);
		remaining -= len;
	}

	if (sized && pos !== outputSize) throw new ChknError(`LZMA stream ended after ${pos} of ${outputSize} bytes`);
	return pos === out.length ? out : out.slice(0, pos);
}
