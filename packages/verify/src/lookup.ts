import type { ProofLookup } from './verify.js';

export interface TaglineLookupOptions {
	/** Custom `fetch` (proxies, tests). Defaults to the global `fetch`. */
	fetch?: typeof globalThis.fetch;
	/**
	 * API base URL. Defaults to `https://api.imvu.com`. Browsers on other origins need
	 * a proxy here: the API only allows cross-origin reads from www.imvu.com.
	 */
	baseURL?: string;
}

/**
 * A {@link ProofLookup} that reads a user's tagline from the public REST API. No login
 * is needed: `/user/user-<id>` serves the tagline to anonymous requests. Every call is
 * a fresh read.
 */
export function taglineLookup(options: TaglineLookupOptions = {}): ProofLookup {
	const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
	const baseURL = (options.baseURL ?? 'https://api.imvu.com').replace(/\/+$/, '');

	return async (userId) => {
		const response = await fetchImpl(`${baseURL}/user/user-${encodeURIComponent(userId)}`, {
			headers: { accept: 'application/json' },
			cache: 'no-store',
		});
		if (response.status === 404) return null;

		const body = (await response.json().catch(() => null)) as {
			status?: string;
			id?: string;
			denormalized?: Record<string, { data?: { tagline?: unknown } }>;
		} | null;
		if (!body) throw new Error(`Expected JSON from the user endpoint but got HTTP ${response.status}`);
		if (body.status === 'failure') {
			if (response.status >= 400 && response.status < 500) return null;
			throw new Error(`The user endpoint failed with HTTP ${response.status}`);
		}

		const node = body.id ? body.denormalized?.[body.id] : undefined;
		if (!node) return null;
		const tagline = node.data?.tagline;
		return typeof tagline === 'string' ? tagline : '';
	};
}
