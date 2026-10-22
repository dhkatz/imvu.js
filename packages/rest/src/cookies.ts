import { Cookie, CookieJar, MemoryCookieStore } from 'tough-cookie';

/** Where a {@link REST} client persists its cookie jar (and so its session) between runs. */
export interface CookieStorage {
	/** Return the previously saved jar as JSON, or `null` when nothing is saved. */
	load(): Promise<string | null>;
	/** Persist the jar, serialized as JSON. */
	save(serialized: string): Promise<void>;
}

/**
 * Persist cookies to a JSON file. Node only — `node:fs` is imported lazily, so
 * merely bundling this module for a browser never pulls it in.
 */
export function fileCookieStorage(path: string): CookieStorage {
	return {
		async load() {
			const { readFile } = await import('node:fs/promises');
			try {
				return await readFile(path, 'utf8');
			} catch (error) {
				if ((error as { code?: string }).code === 'ENOENT') return null;
				throw error;
			}
		},
		async save(serialized) {
			const { writeFile } = await import('node:fs/promises');
			await writeFile(path, serialized);
		},
	};
}

/**
 * Rebuild a cookie jar from saved JSON: tough-cookie's own serialization, or the
 * legacy `tough-cookie-file-store` layout (`{ domain: { path: { key: cookie } } }`)
 * so existing `cookies.json` sessions survive the switch. Unreadable data yields an
 * empty jar — the same as having no saved session.
 */
export async function restoreCookieJar(serialized: string | null): Promise<CookieJar> {
	const store = new MemoryCookieStore();
	const empty = () => new CookieJar(store, { rejectPublicSuffixes: false });
	if (!serialized) return empty();

	let data: unknown;
	try {
		data = JSON.parse(serialized);
	} catch {
		return empty();
	}
	if (!data || typeof data !== 'object') return empty();

	if (Array.isArray((data as { cookies?: unknown }).cookies)) {
		return CookieJar.deserialize(data as Parameters<typeof CookieJar.deserialize>[0], store);
	}

	const jar = empty();
	for (const paths of Object.values(data)) {
		for (const cookies of Object.values(paths ?? {})) {
			for (const json of Object.values(cookies ?? {})) {
				const cookie = Cookie.fromJSON(json);
				if (cookie) await store.putCookie(cookie);
			}
		}
	}
	return jar;
}
