import { Cal3DError } from '../errors.js';
import { decodeText } from './text.js';

/** Little-endian cursor over a Cal3D binary file. Every read is bounds-checked. */
export class BinaryReader {
	private readonly view: DataView;
	public offset = 0;

	public constructor(public readonly bytes: Uint8Array) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}

	public get remaining(): number {
		return this.bytes.length - this.offset;
	}

	public int32(): number {
		this.need(4);
		const value = this.view.getInt32(this.offset, true);
		this.offset += 4;
		return value;
	}

	public float32(): number {
		this.need(4);
		const value = this.view.getFloat32(this.offset, true);
		this.offset += 4;
		return value;
	}

	public bytesOf(length: number): Uint8Array {
		this.need(length);
		const slice = this.bytes.subarray(this.offset, this.offset + length);
		this.offset += length;
		return slice;
	}

	/**
	 * A length-prefixed, NUL-terminated string. Like IMVU's `CalBufferSource::readString`,
	 * the text ends at the first NUL and the cursor advances past that NUL — not by the
	 * declared length — so files whose length field disagrees still load the same way.
	 */
	public string(): string {
		const length = this.int32();
		if (length < 0 || length > this.remaining) {
			throw new Cal3DError(`Invalid string length ${length} at offset ${this.offset - 4}`);
		}
		const region = this.bytes.subarray(this.offset, this.offset + length);
		const nul = region.indexOf(0);
		const text = nul === -1 ? region : region.subarray(0, nul);
		this.offset += nul === -1 ? length : nul + 1;
		return decodeText(text);
	}

	private need(length: number): void {
		if (this.offset + length > this.bytes.length) {
			throw new Cal3DError(`Unexpected end of file at offset ${this.offset} (needed ${length} more bytes)`);
		}
	}
}
