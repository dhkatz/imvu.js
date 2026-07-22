/** A monotonic counter — used for op_ids, shared across the connection and manager. */
export const createCounter = (): (() => number) => {
	let next = 0;
	return () => next++;
};

/** Error reported when a send is attempted before authentication completes. */
export const AUTH_ERROR = 'Cannot send data: Not authenticated!';
