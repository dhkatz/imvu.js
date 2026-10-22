import type { APIErrorResponse } from './types.js';

/** A failure explicitly returned by the IMVU API. */
export class IMVUAPIError extends Error {
	public constructor(
		public readonly apiCode: string,
		message: string,
		public readonly response: APIErrorResponse,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'IMVUAPIError';
	}
}
