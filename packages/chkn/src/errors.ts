/** Thrown for malformed CFL/CHKN archives, LZMA streams and product templates. */
export class ChknError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ChknError';
	}
}
