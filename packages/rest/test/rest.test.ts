import { IMVUAPIError, REST, restoreCookieJar, type APISuccessResponse, type CookieStorage } from '../src/index.js';

const response = (id: string, denormalized: APISuccessResponse['denormalized']): APISuccessResponse => ({
	status: 'success',
	id,
	denormalized,
	http: {},
});

const restWithResponse = (value: APISuccessResponse): REST => {
	const rest = Object.create(REST.prototype) as REST;
	Object.defineProperty(rest, 'request', { value: vi.fn().mockResolvedValue(value) });
	return rest;
};

describe('REST document normalization', () => {
	it('preserves a compound room id as an opaque string', async () => {
		const url = 'https://api.imvu.com/room/room-123456-12345';
		const rest = restWithResponse(
			response(url, {
				[url]: { data: { name: 'Room' }, relations: null, updates: null },
			})
		);

		const room = await rest.resource(url);

		expect(room).toMatchObject({ url, id: '123456-12345', relations: {}, updates: null });
		expect(room.data).toEqual({ name: 'Room' });
		expect(room.data).not.toHaveProperty('_id');
	});

	it('does not assume an opaque URL id is numeric', async () => {
		const url = 'https://api.imvu.com/product/product-catalog-alpha';
		const rest = restWithResponse(
			response(url, {
				[url]: { data: { product_name: 'Opaque' }, relations: null, updates: {} },
			})
		);

		await expect(rest.resource(url)).resolves.toMatchObject({ url, id: 'catalog-alpha', updates: null });
	});

	it('normalizes an edge-group page and follows edge refs', async () => {
		const collectionUrl = 'https://api.imvu.com/user/user-1/wishlist?start_index=0&limit=1';
		const edgeUrl = 'https://api.imvu.com/user/user-1/wishlist/product-2';
		const productUrl = 'https://api.imvu.com/product/product-2';
		const updates = { queue: 'inv:/user/user-1', mount: 'edge:wishlist' } as const;
		const rest = restWithResponse(
			response(collectionUrl, {
				[collectionUrl]: {
					data: { items: [edgeUrl], total_count: 10 },
					relations: { next: `${collectionUrl}&start_index=1` },
					updates,
				},
				[edgeUrl]: { data: {}, relations: { ref: productUrl }, updates: null },
				[productUrl]: { data: { product_name: 'Gift' }, relations: null, updates: null },
			})
		);

		const page = await rest.collection('/user/user-1/wishlist');

		expect(page.totalCount).toBe(10);
		expect(page.updates).toEqual(updates);
		expect(page.items).toEqual([expect.objectContaining({ url: productUrl, id: '2', data: { product_name: 'Gift' } })]);
	});
});

type Call = { url: string; method: string; headers: Headers; body?: string };

/** A scripted `fetch`: records each call and answers with the next queued response. */
const scriptedFetch = (...responses: Response[]) => {
	const calls: Call[] = [];
	// REST always passes a resolved string URL.
	const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
		calls.push({
			url,
			method: init.method ?? 'GET',
			headers: new Headers(init.headers),
			body: init.body as string | undefined,
		});
		const next = responses.shift();
		if (!next) throw new Error(`Unexpected request to ${url}`);
		return next;
	});
	return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
};

const json = (body: unknown, init: ResponseInit & { cookies?: string[] } = {}) => {
	const headers = new Headers(init.headers);
	for (const cookie of init.cookies ?? []) headers.append('set-cookie', cookie);
	return new Response(JSON.stringify(body), { ...init, headers });
};

const ok = (id = 'https://api.imvu.com/x') => json({ status: 'success', id, denormalized: {}, http: {} });

const memoryStorage = (initial: string | null = null) => {
	const storage = {
		saved: initial,
		load: async () => storage.saved,
		save: vi.fn(async (value: string) => void (storage.saved = value)),
	};
	return storage satisfies CookieStorage;
};

describe('REST transport (fetch)', () => {
	it('throws a structured IMVUAPIError for API failures', async () => {
		const { fetch } = scriptedFetch(
			json({ status: 'failure', error: 'insufficient_credits', message: 'Not enough credits' }, { status: 400 })
		);
		const request = new REST({ fetch, cookieStorage: null }).request('/gift');

		await expect(request).rejects.toBeInstanceOf(IMVUAPIError);
		await expect(request).rejects.toEqual(
			expect.objectContaining({ name: 'IMVUAPIError', apiCode: 'insufficient_credits', message: 'Not enough credits' })
		);
	});

	it('reports a non-JSON response with its HTTP status', async () => {
		const { fetch } = scriptedFetch(new Response('<html>Bad gateway</html>', { status: 502 }));

		await expect(new REST({ fetch, cookieStorage: null }).request('/user')).rejects.toThrow(/HTTP 502/);
	});

	it('joins relative URLs onto the base path and applies params', async () => {
		const { fetch, calls } = scriptedFetch(ok(), ok(), ok());
		const rest = new REST({ fetch, cookieStorage: null });

		await rest.request('/user', { params: { username: 'Troll', limit: 0, skip: undefined } });
		await rest.fetch('/123/1/_contents.json', { baseURL: 'https://cdn.example/productdata/' });
		await rest.request('https://api.imvu.com/user/user-1/wishlist?start_index=5', { params: { start_index: 0 } });

		expect(calls.map((call) => call.url)).toEqual([
			'https://api.imvu.com/user?username=Troll&limit=0',
			'https://cdn.example/productdata/123/1/_contents.json',
			'https://api.imvu.com/user/user-1/wishlist?start_index=0',
		]);
	});

	it('sends a JSON body, and the sauce headers only on writes', async () => {
		const { fetch, calls } = scriptedFetch(ok(), ok());
		const rest = new REST({ fetch, cookieStorage: null });
		rest.sauce = 'secret-sauce';

		await rest.request('/user/user-1', { method: 'GET' });
		await rest.request('/user/user-1/gifts', { method: 'post', data: { a: 1 } });

		expect(calls[0].headers.has('x-imvu-sauce')).toBe(false);
		expect(calls[1]).toMatchObject({ method: 'POST', body: '{"a":1}' });
		expect(calls[1].headers.get('content-type')).toBe('application/json');
		expect(calls[1].headers.get('x-imvu-sauce')).toBe('secret-sauce');
		expect(calls[1].headers.get('x-imvu-application')).toBe('next_desktop/1');
	});

	it('stores Set-Cookie responses and sends matching cookies back', async () => {
		const { fetch, calls } = scriptedFetch(
			json(
				{ status: 'success', id: 'x', denormalized: {}, http: {} },
				{ cookies: ['osCsid=abc; Domain=imvu.com; Path=/', 'local=1; Path=/'] }
			),
			ok(),
			ok()
		);
		const rest = new REST({ fetch, cookieStorage: null });

		await rest.request('/login', { method: 'POST' });
		await rest.request('/login/me');
		await rest.fetch('https://www.imvu.com/');

		expect(calls[0].headers.has('cookie')).toBe(false);
		expect(calls[1].headers.get('cookie')).toBe('osCsid=abc; local=1');
		expect(calls[2].headers.get('cookie')).toBe('osCsid=abc');
	});

	it('follows redirects manually, keeping cookies set along the way', async () => {
		const { fetch, calls } = scriptedFetch(
			new Response(null, {
				status: 303,
				headers: [
					['location', '/login/me'],
					['set-cookie', 'osCsid=abc; Domain=imvu.com; Path=/'],
				],
			}),
			ok()
		);
		const rest = new REST({ fetch, cookieStorage: null });

		await rest.request('/login', { method: 'POST', data: { username: 'u' } });

		expect(calls[1]).toMatchObject({ url: 'https://api.imvu.com/login/me', method: 'GET', body: undefined });
		expect(calls[1].headers.get('cookie')).toBe('osCsid=abc');
		expect(calls[1].headers.has('content-type')).toBe(false);
	});

	it('persists cookies to storage and restores them in a new client', async () => {
		const storage = memoryStorage();
		const first = scriptedFetch(
			json(
				{ status: 'success', id: 'x', denormalized: {}, http: {} },
				{
					cookies: ['_imvu_avnm=Troll; Domain=imvu.com; Path=/; Max-Age=3600'],
				}
			)
		);
		await new REST({ fetch: first.fetch, cookieStorage: storage }).request('/login', { method: 'POST' });
		await vi.waitFor(() => expect(storage.save).toHaveBeenCalled());

		const second = scriptedFetch(ok());
		await new REST({ fetch: second.fetch, cookieStorage: storage }).request('/login/me');

		expect(second.calls[0].headers.get('cookie')).toBe('_imvu_avnm=Troll');
	});
});

describe('cookie jar restoration', () => {
	it('reads the legacy tough-cookie-file-store layout', async () => {
		const legacy = {
			'imvu.com': {
				'/': {
					_imvu_avnm: {
						key: '_imvu_avnm',
						value: 'Troll',
						domain: 'imvu.com',
						path: '/',
						hostOnly: false,
						expires: new Date(Date.now() + 86_400_000).toISOString(),
						creation: new Date().toISOString(),
					},
				},
			},
		};

		const jar = await restoreCookieJar(JSON.stringify(legacy));

		expect(await jar.getCookieString('https://api.imvu.com/login/me')).toBe('_imvu_avnm=Troll');
	});

	it('treats unreadable data as an empty jar', async () => {
		const jar = await restoreCookieJar('not json');

		expect(await jar.getCookieString('https://api.imvu.com/')).toBe('');
	});
});
