/** Thrown when a buffer is not a well-formed Cal3D file of the expected kind. */
export class Cal3DError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'Cal3DError';
	}
}
