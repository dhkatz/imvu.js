import { ChknError } from './errors.js';

export interface FetchedCfl {
	/** The CFL archive bytes. */
	readonly bytes: Uint8Array;
	/** The CFL's URL; the product's external assets (full-size textures) resolve against it. */
	readonly url: string;
}

/** Where products come from. */
export interface ProductSource {
	/** Fetch a product's current CFL. */
	fetchCfl(productId: number): Promise<FetchedCfl>;
	/** Fetch any URL (external assets listed in a product's `_contents.json`). */
	fetchUrl(url: string): Promise<Uint8Array>;
}

export type RevisionResolver = (productId: number) => number | Promise<number>;

export interface CdnProductSourceOptions {
	/**
	 * A product's current revision, as a map or a lookup. Products it doesn't cover
	 * fall back to {@link probeLatestRevision}. The reliable source is the XML-RPC
	 * gateway, which also returns every ancestor:
	 *
	 * ```ts
	 * const auths = await gateway.authorizeProducts([productId]);
	 * const revisions = new Map(auths.map((a) => [a.productId, Number(a.cflUrl.split('/').pop())]));
	 * ```
	 */
	readonly revisions?: ReadonlyMap<number, number> | Readonly<Record<number, number>> | RevisionResolver;
	/** Defaults to `https://userimages-akm.imvu.com/productdata`. */
	readonly baseUrl?: string;
	readonly fetch?: typeof fetch;
}

export const PRODUCTDATA_URL = 'https://userimages-akm.imvu.com/productdata';

/** Products from IMVU's public productdata CDN (`{baseUrl}/{productId}/{revision}`). */
export class CdnProductSource implements ProductSource {
	readonly #baseUrl: string;
	readonly #fetch: typeof fetch;
	readonly #revisions: RevisionResolver;
	readonly #probed = new Map<number, Promise<number>>();

	public constructor(options: CdnProductSourceOptions = {}) {
		this.#baseUrl = (options.baseUrl ?? PRODUCTDATA_URL).replace(/\/+$/, '');
		this.#fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
		const { revisions } = options;
		const probe = (productId: number) => {
			let pending = this.#probed.get(productId);
			if (!pending) {
				pending = probeLatestRevision(productId, { baseUrl: this.#baseUrl, fetch: this.#fetch });
				this.#probed.set(productId, pending);
			}
			return pending;
		};
		if (typeof revisions === 'function') {
			this.#revisions = revisions;
		} else if (revisions instanceof Map) {
			this.#revisions = (productId) => revisions.get(productId) ?? probe(productId);
		} else {
			const record = (revisions ?? {}) as Readonly<Record<number, number>>;
			this.#revisions = (productId) => record[productId] ?? probe(productId);
		}
	}

	public cflUrl(productId: number, revision: number): string {
		return `${this.#baseUrl}/${productId}/${revision}`;
	}

	public async fetchCfl(productId: number): Promise<FetchedCfl> {
		const url = this.cflUrl(productId, await this.#revisions(productId));
		return { bytes: await this.fetchUrl(url), url };
	}

	public async fetchUrl(url: string): Promise<Uint8Array> {
		const response = await this.#fetch(url);
		if (!response.ok) throw new ChknError(`GET ${url}: HTTP ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	}
}

export interface ProbeOptions {
	readonly baseUrl?: string;
	readonly fetch?: typeof fetch;
	/** Stop after this many missing revisions in a row past the last one found (default 8). */
	readonly maxGap?: number;
	/** Give up beyond this revision (default 1 000 000). */
	readonly limit?: number;
}

/**
 * Guess a product's latest revision by probing the CDN — a heuristic. Revisions are
 * mostly contiguous, but not always (product 512 has 5 and 8–11, not 6–7), so this
 * finds any existing revision by doubling, then walks upward until `maxGap` misses in
 * a row. Prefer real revisions from the XML-RPC gateway when you can.
 */
export async function probeLatestRevision(productId: number, options: ProbeOptions = {}): Promise<number> {
	const baseUrl = (options.baseUrl ?? PRODUCTDATA_URL).replace(/\/+$/, '');
	const doFetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
	const maxGap = options.maxGap ?? 8;
	const limit = options.limit ?? 1_000_000;
	const exists = async (revision: number) =>
		(await doFetch(`${baseUrl}/${productId}/${revision}`, { method: 'HEAD' })).ok;

	// Find some revision that exists: 1, 2, 4, …, also checking the small gaps before each.
	let found = 0;
	for (let revision = 1; revision <= limit && found === 0; revision *= 2) {
		if (await exists(revision)) found = revision;
	}
	if (found === 0) {
		for (let revision = 3; revision <= Math.min(limit, 64) && found === 0; revision++) {
			if (await exists(revision)) found = revision;
		}
	}
	if (found === 0) throw new ChknError(`No CFL found for product ${productId}`);

	// Gallop upward while revisions keep existing, then binary-search the last one.
	let low = found;
	let step = 1;
	while (low + step <= limit && (await exists(low + step))) {
		low += step;
		step *= 2;
	}
	let high = Math.min(limit, low + step);
	while (high - low > 1) {
		const middle = Math.floor((low + high) / 2);
		if (await exists(middle)) low = middle;
		else high = middle;
	}

	// Revisions can have gaps: look a little past the end before settling.
	for (let gap = 1, revision = low + 1; gap <= maxGap && revision <= limit; gap++, revision++) {
		if (await exists(revision)) {
			low = revision;
			gap = 0;
		}
	}
	return low;
}
