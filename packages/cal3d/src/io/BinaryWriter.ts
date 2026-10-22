import { encodeText } from './text.js';

/** Growable little-endian buffer for writing Cal3D binary files. */
export class BinaryWriter {
	private buffer = new Uint8Array(1024);
	private view = new DataView(this.buffer.buffer);
	private length = 0;

	public int32(value: number): this {
		this.reserve(4);
		this.view.setInt32(this.length, value, true);
		this.length += 4;
		return this;
	}

	public float32(value: number): this {
		this.reserve(4);
		this.view.setFloat32(this.length, value, true);
		this.length += 4;
		return this;
	}

	public bytes(data: ArrayLike<number>): this {
		this.reserve(data.length);
		this.buffer.set(data, this.length);
		this.length += data.length;
		return this;
	}

	/** Four magic bytes: three letters and a NUL. */
	public magic(magic: string): this {
		return this.bytes([magic.charCodeAt(0), magic.charCodeAt(1), magic.charCodeAt(2), 0]);
	}

	/** Length-prefixed, NUL-terminated UTF-8; the length counts the NUL. */
	public string(text: string): this {
		const encoded = encodeText(text);
		this.int32(encoded.length + 1);
		this.bytes(encoded);
		return this.bytes([0]);
	}

	public finish(): Uint8Array {
		return this.buffer.slice(0, this.length);
	}

	private reserve(extra: number): void {
		if (this.length + extra <= this.buffer.length) return;
		let size = this.buffer.length * 2;
		while (size < this.length + extra) size *= 2;
		const grown = new Uint8Array(size);
		grown.set(this.buffer.subarray(0, this.length));
		this.buffer = grown;
		this.view = new DataView(grown.buffer);
	}
}
