/**
 * MD5 (RFC 1321), as a lowercase hex digest.
 *
 * The gateway signs every request with MD5 and reports CFL checksums as MD5, but
 * Web Crypto deliberately omits it — so this small implementation keeps the
 * package free of `node:crypto` and usable in browsers.
 */
export function md5(input: string | Uint8Array): string {
	const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;

	// Pad: 0x80, zeros to 56 mod 64, then the bit length as a 64-bit little-endian integer.
	const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(padded.length - 8, (bytes.length << 3) >>> 0, true);
	view.setUint32(padded.length - 4, Math.floor(bytes.length / 0x20000000), true);

	let a0 = 0x67452301;
	let b0 = 0xefcdab89;
	let c0 = 0x98badcfe;
	let d0 = 0x10325476;
	const m = new Uint32Array(16);

	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i++) m[i] = view.getUint32(offset + i * 4, true);

		let a = a0;
		let b = b0;
		let c = c0;
		let d = d0;

		for (let i = 0; i < 64; i++) {
			let f: number;
			let g: number;
			if (i < 16) {
				f = (b & c) | (~b & d);
				g = i;
			} else if (i < 32) {
				f = (d & b) | (~d & c);
				g = (5 * i + 1) & 15;
			} else if (i < 48) {
				f = b ^ c ^ d;
				g = (3 * i + 5) & 15;
			} else {
				f = c ^ (b | ~d);
				g = (7 * i) & 15;
			}

			const sum = (a + f + K[i] + m[g]) | 0;
			a = d;
			d = c;
			c = b;
			b = (b + ((sum << S[i]) | (sum >>> (32 - S[i])))) | 0;
		}

		a0 = (a0 + a) | 0;
		b0 = (b0 + b) | 0;
		c0 = (c0 + c) | 0;
		d0 = (d0 + d) | 0;
	}

	const digest = new DataView(new ArrayBuffer(16));
	[a0, b0, c0, d0].forEach((word, i) => digest.setUint32(i * 4, word, true));
	return Array.from(new Uint8Array(digest.buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const S = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
	11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
