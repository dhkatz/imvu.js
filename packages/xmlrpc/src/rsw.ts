/** Parsed components of an RSW time-lock puzzle nonce (`rsw,T,N,A,Cipher`). */
export interface RswNonce {
	/** Number of sequential squarings the client must perform. */
	t: number;
	/** RSA modulus (P × Q). */
	n: bigint;
	/** Random base value. */
	a: bigint;
	/** Encrypted solution: `Solution + A^(2^T) mod N`. */
	cipher: bigint;
}

export interface SolveRswOptions {
	/** Abort the solve; the promise rejects with the signal's reason. */
	signal?: AbortSignal;
	/** Squarings between yields to the event loop. Defaults to `10_000`. */
	yieldEvery?: number;
}

const DIGITS = /^\d+$/;

/** Parse the wire-format nonce string into its numeric components. */
export function parseRswNonce(nonce: string): RswNonce {
	const parts = nonce.split(',');
	if (parts.length !== 5 || parts[0] !== 'rsw') {
		throw new SyntaxError(`Invalid RSW nonce: expected "rsw,T,N,A,Cipher"`);
	}
	const [, rawT, rawN, rawA, rawCipher] = parts as [string, string, string, string, string];
	for (const [name, value] of [
		['T', rawT],
		['N', rawN],
		['A', rawA],
		['Cipher', rawCipher],
	] as const) {
		if (!DIGITS.test(value)) {
			throw new SyntaxError(`Invalid RSW nonce: ${name} must be a non-negative decimal integer, got "${value}"`);
		}
	}
	const t = Number(rawT);
	if (!Number.isSafeInteger(t)) {
		throw new SyntaxError(`Invalid RSW nonce: T is too large, got "${rawT}"`);
	}
	const n = BigInt(rawN);
	if (n <= 1n) {
		throw new SyntaxError(`Invalid RSW nonce: N must be greater than 1, got "${rawN}"`);
	}
	return { t, n, a: BigInt(rawA), cipher: BigInt(rawCipher) };
}

/**
 * Recover the solution from `Cipher` and `b = A^(2^T) mod N`. Works whether the
 * server sends `Solution + b` as-is or reduced mod N: an unreduced cipher never
 * goes negative, and a reduced one only does when it wrapped past N.
 */
function unlock(cipher: bigint, b: bigint, n: bigint): string {
	const solution = cipher - b;
	return (solution < 0n ? solution + n : solution).toString();
}

/**
 * Solve an RSW time-lock puzzle and return the solution as a decimal string.
 *
 * The algorithm computes `b = A^(2^T) mod N` by performing T **sequential**
 * squarings (`b = b × b mod N` repeated T times), then returns `Cipher − b`.
 * The sequential squarings cannot be parallelised — that is the point of the
 * time-lock.
 *
 * This blocks for the whole solve; prefer {@link solveRswAsync} for large T.
 *
 * @param nonce - The wire-format nonce: `rsw,T,N,A,Cipher`.
 */
export function solveRsw(nonce: string): string {
	const { t, n, a, cipher } = parseRswNonce(nonce);
	let b = a % n;
	for (let i = 0; i < t; i++) {
		b = (b * b) % n;
	}
	return unlock(cipher, b, n);
}

/**
 * Like {@link solveRsw}, but yields to the event loop every `yieldEvery`
 * squarings so a long solve doesn't freeze a page or server, and can be
 * cancelled through `signal`.
 */
export async function solveRswAsync(nonce: string, options: SolveRswOptions = {}): Promise<string> {
	const { t, n, a, cipher } = parseRswNonce(nonce);
	const { signal, yieldEvery = 10_000 } = options;
	if (!Number.isInteger(yieldEvery) || yieldEvery < 1) {
		throw new RangeError(`yieldEvery must be a positive integer, got ${yieldEvery}`);
	}
	signal?.throwIfAborted();
	let b = a % n;
	for (let i = 0; i < t; i++) {
		b = (b * b) % n;
		if ((i + 1) % yieldEvery === 0) {
			await new Promise((resolve) => setTimeout(resolve, 0));
			signal?.throwIfAborted();
		}
	}
	return unlock(cipher, b, n);
}
