import type { Client } from '@imvu/client';

export type NameStatus = 'available' | 'taken' | 'error';

export interface NameResult {
	name: string;
	status: NameStatus;
	error?: string;
}

/**
 * A username is available when the `/user` lookup returns no entry whose
 * username matches case-insensitively. (The lookup also surfaces `Guest_<name>`
 * accounts and prefix-ish hits, so we can't just trust a non-empty result —
 * hence the exact match.) Note "available" means "unregistered": reserved or
 * otherwise blocked names can still report available here.
 */
export async function isAvailable(client: Client, name: string): Promise<boolean> {
	const response = await client.request('/user', { params: { username: name } });
	const root = response.denormalized[response.id] as { data?: { items?: string[] } } | undefined;
	const items = root?.data?.items ?? [];
	const target = name.toLowerCase();

	const taken = items.some((url) => {
		const username = (response.denormalized[url] as { data?: { username?: string } } | undefined)?.data?.username;
		return typeof username === 'string' && username.toLowerCase() === target;
	});

	return !taken;
}

export interface CheckAllOptions {
	/** Requests per second (default 2). Set 0 to disable throttling. */
	rate?: number;
	/** Invoked as each result lands — handy for streaming output on long runs. */
	onResult?: (result: NameResult, index: number, total: number) => void;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Check every name sequentially, throttled to `rate` per second. Never rejects — failures land as `error` results. */
export async function checkAll(client: Client, names: string[], options: CheckAllOptions = {}): Promise<NameResult[]> {
	const rate = options.rate ?? 2;
	const interval = rate > 0 ? 1000 / rate : 0;
	const results: NameResult[] = [];

	for (let i = 0; i < names.length; i++) {
		const name = names[i]!;

		let result: NameResult;
		try {
			result = { name, status: (await isAvailable(client, name)) ? 'available' : 'taken' };
		} catch (error) {
			result = { name, status: 'error', error: error instanceof Error ? error.message : String(error) };
		}

		results.push(result);
		options.onResult?.(result, i, names.length);

		if (interval > 0 && i < names.length - 1) {
			await delay(interval);
		}
	}

	return results;
}
