import { EventEmitter } from 'node:events';

import { IMVUAPIError, type APICollection, type APIResource, type APISuccessResponse, type REST } from '@imvu/rest';

import {
	Avatar,
	Client,
	CollectionNotWatchableError,
	Product,
	User,
	type CurrentUser,
	type RealtimeManagerFactory,
	type RealtimeManagerLike,
} from '../src/index.js';

const document = <T extends object>(
	url: string,
	id: string,
	data: T,
	relations: Record<string, string> = {}
): APIResource<T> => ({
	url,
	id,
	data,
	relations,
	updates: null,
});

const fakeRest = (overrides: Partial<REST> = {}): REST =>
	({
		authenticated: true,
		cid: '1',
		login: vi.fn(),
		logout: vi.fn(),
		request: vi.fn(),
		resource: vi.fn(),
		resources: vi.fn(),
		collection: vi.fn(),
		...overrides,
	}) as unknown as REST;

describe('canonical resource identity', () => {
	it('accepts opaque IDs and extracts compound IDs from canonical URLs', async () => {
		const url = '/product/product-catalog-alpha';
		const resource = vi.fn().mockResolvedValue(document(url, 'catalog-alpha', { product_name: 'Opaque' }));
		const client = new Client(fakeRest({ resource } as Partial<REST>));

		const product = await client.products.fetch('catalog-alpha');

		expect(product?.id).toBe('catalog-alpha');
		expect(resource).toHaveBeenCalledWith(url, undefined);
		await expect(client.utils.id('https://api.imvu.com/room/room-123456-12345')).resolves.toBe('123456-12345');
	});

	it('resolves a username using the username value', async () => {
		const resource = vi.fn().mockResolvedValue(document('/user/user-7', '7', { username: 'Bob' }));
		const client = new Client(fakeRest({ resource } as Partial<REST>));

		await expect(client.utils.id('Bob', true)).resolves.toBe('7');
		expect(resource).toHaveBeenCalledWith('/user', { params: { username: 'Bob' } });
	});

	it('answers fetch from the cache, and re-reads with force', async () => {
		const url = 'https://api.imvu.com/product/product-2';
		const resource = vi
			.fn()
			.mockResolvedValueOnce(document(url, '2', { product_name: 'Before' }))
			.mockResolvedValueOnce(document(url, '2', { product_name: 'After' }));
		const client = new Client(fakeRest({ resource } as Partial<REST>));

		const before = await client.products.fetch('2');
		const cached = await client.products.fetch('2');
		expect(cached).toBe(before);
		expect(resource).toHaveBeenCalledTimes(1);
		expect(client.products.resolve('2')).toBe(before);

		const after = await client.products.fetch('2', { force: true });
		expect(after).toBe(before);
		expect(after?.name).toBe('After');
	});

	it('re-reads stale or expired copies and shares concurrent requests', async () => {
		const url = 'https://api.imvu.com/product/product-3';
		const resource = vi
			.fn()
			.mockResolvedValueOnce(document(url, '3', { product_name: 'One' }))
			.mockResolvedValueOnce(document(url, '3', { product_name: 'Two' }));
		const client = new Client(fakeRest({ resource } as Partial<REST>), { cacheMaxAge: 60_000 });

		const [first, second] = await Promise.all([client.products.fetch('3'), client.products.fetch('3')]);
		expect(first).toBe(second);
		expect(resource).toHaveBeenCalledTimes(1);

		first!._invalidate();
		expect(client.products.resolve('3')).toBeUndefined();
		expect((await client.products.fetch('3'))?.name).toBe('Two');
		expect(resource).toHaveBeenCalledTimes(2);

		first!.fetchedAt = Date.now() - 120_000;
		expect(client.products.resolve('3')).toBeUndefined();
		expect(client.cached(url, Product, Infinity)).toBe(first);
	});

	it('caches documents embedded in any response', async () => {
		const userUrl = 'https://api.imvu.com/user/user-8';
		const participantUrl = 'https://api.imvu.com/chat/chat-1-2/participants/user-8';
		const resource = vi.fn();
		const rest = fakeRest({ resource } as Partial<REST>);
		const client = new Client(rest);

		rest.onResponse?.({
			status: 'success',
			id: participantUrl,
			denormalized: {
				[participantUrl]: { data: { seat_number: 1 }, relations: { ref: userUrl }, updates: null },
				[userUrl]: { data: { username: 'eight', tagline: 'hi' }, relations: {}, updates: null },
				'https://api.imvu.com/x/list': { data: { items: [], total_count: 0 }, relations: {}, updates: null },
			},
			http: {},
		});

		expect(client.users.resolve('8')).toMatchObject({ username: 'eight', tagline: 'hi' });
		await expect(client.users.fetch('8')).resolves.toMatchObject({ username: 'eight' });
		expect(resource).not.toHaveBeenCalled();
	});

	it('keeps the normalized opaque id authoritative over legacy payload fields', () => {
		const client = new Client(fakeRest());
		const product = client.utils.deserialize(
			Product,
			document('/product/product-catalog-alpha', 'catalog-alpha', { _id: 42, product_name: 'Opaque' })
		);

		expect(product.id).toBe('catalog-alpha');
	});

	it('retains identity through the weak registry after strong-LRU eviction', () => {
		const client = new Client(fakeRest(), { maximumStrongDocuments: 1 });
		const first = client.utils.deserialize(Product, document('/product/product-1', '1', { product_name: 'One' }));

		client.utils.deserialize(Product, document('/product/product-2', '2', { product_name: 'Two' }));
		const revisited = client.utils.deserialize(
			Product,
			document('/product/product-1', '1', { product_name: 'Updated' })
		);

		expect(client.documents.strongSize).toBe(1);
		expect(revisited).toBe(first);
		expect(first.name).toBe('Updated');
	});
});

describe('first-class sparse wishlist', () => {
	it('is canonical, freshly paginated, and revision-invalidated', async () => {
		const wishlistUrl = 'https://api.imvu.com/user/user-7/wishlist';
		const collection = vi.fn(async (_url: string, config?: { params?: { start_index?: number; limit?: number } }) => {
			const offset = config?.params?.start_index ?? 0;
			const limit = config?.params?.limit ?? 25;
			const count = 1_000;
			const size = Math.min(limit, Math.max(0, count - offset));
			const items = Array.from({ length: size }, (_, index) => {
				const id = String(offset + index + 1);
				return document(`https://api.imvu.com/product/product-${id}`, id, { product_name: `Product ${id}` });
			});

			return {
				url: wishlistUrl,
				data: {},
				itemUrls: items.map((item) => item.url),
				items,
				totalCount: count,
				relations: {},
				updates: { queue: 'inv:/user/user-7', mount: 'edge:wishlist' },
			} satisfies APICollection;
		});
		const client = new Client(fakeRest({ collection } as Partial<REST>));
		const user = client.utils.deserialize(
			User,
			document('https://api.imvu.com/user/user-7', '7', { username: 'Bob' }, { wishlist: wishlistUrl })
		);

		const first = user.wishlist();
		const second = user.wishlist();
		expect(second).toBe(first);

		const firstPage = await first.page({ offset: 0, limit: 25 });
		const directlyFetched = client.utils.deserialize(
			Product,
			document('https://api.imvu.com/product/product-1', '1', { product_name: 'Updated product 1' })
		);
		expect(firstPage[0]).toBe(directlyFetched);
		expect(firstPage[0].name).toBe('Updated product 1');

		const requestsBeforeRepeat = collection.mock.calls.length;
		const repeatedPage = await first.page({ offset: 0, limit: 25 });
		expect(collection).toHaveBeenCalledTimes(requestsBeforeRepeat + 1);
		expect(repeatedPage).not.toBe(firstPage);
		expect(repeatedPage[0]).toBe(firstPage[0]);

		first._invalidate();
		expect(first.stale).toBe(true);
		expect(first.revision).toBe(1);

		let iterated = 0;
		for await (const product of first) {
			expect(product).toBeInstanceOf(Product);
			iterated++;
		}
		expect(iterated).toBe(1_000);
	});

	it('discovers and reports an unwatchable collection at runtime', async () => {
		const ancestorsUrl = 'https://api.imvu.com/product/product-2/ancestor_products';
		const collection = vi.fn().mockResolvedValue({
			url: ancestorsUrl,
			data: {},
			itemUrls: [],
			items: [],
			totalCount: 0,
			relations: {},
			updates: null,
		} satisfies APICollection);
		const client = new Client(fakeRest({ collection } as Partial<REST>));
		const product = client.utils.deserialize(
			Product,
			document('/product/product-2', '2', {}, { ancestor_products: ancestorsUrl })
		);
		const ancestors = product.ancestors();

		expect(ancestors.watchability).toBe('unknown');
		await expect(ancestors.watch()).rejects.toBeInstanceOf(CollectionNotWatchableError);
		expect(ancestors.watchability).toBe('unsupported');
	});
});

class FakeMount extends EventEmitter {
	public unsubscribes = 0;
	public unsubscribe(): void {
		this.unsubscribes++;
	}
}

class FakeRealtimeManager extends EventEmitter implements RealtimeManagerLike {
	public readonly mount = new FakeMount();
	public subscriptions = 0;

	public async connect(): Promise<void> {
		this.emit('status', 'connected');
	}
	public close(): void {}
	public subscribeMessage(): FakeMount {
		this.subscriptions++;
		return this.mount;
	}
	public sendMessage(): void {}
}

describe('wishlist realtime invalidation', () => {
	it('reference-counts one IMQ mount and only marks the collection stale', async () => {
		const wishlistUrl = 'https://api.imvu.com/user/user-7/wishlist';
		const manager = new FakeRealtimeManager();
		const factory: RealtimeManagerFactory = () => manager;
		const login: APISuccessResponse = {
			status: 'success',
			id: '/login/me',
			denormalized: {
				'/login/me': {
					data: { session_id: 'session' },
					relations: { imq: 'wss://example.test' },
					updates: null,
				},
			},
			http: {},
		};
		const collection = vi.fn().mockResolvedValue({
			url: wishlistUrl,
			data: {},
			itemUrls: [],
			items: [],
			totalCount: 0,
			relations: {},
			updates: { queue: 'inv:/user/user-7', mount: 'edge:wishlist' },
		} satisfies APICollection);
		const rest = fakeRest({ request: vi.fn().mockResolvedValue(login), collection } as Partial<REST>);
		const client = new Client(rest, { realtimeManagerFactory: factory });
		const user = client.utils.deserialize(
			User,
			document('https://api.imvu.com/user/user-7', '7', {}, { wishlist: wishlistUrl })
		);
		const wishlist = user.wishlist();
		expect(wishlist.watchability).toBe('unknown');
		expect(manager.subscriptions).toBe(0);
		const first = await wishlist.watch();
		const second = await wishlist.watch();
		const invalidated = vi.fn();
		first.on('invalidate', invalidated);

		expect(manager.subscriptions).toBe(1);
		expect(wishlist.watchability).toBe('supported');
		manager.mount.emit('message', {});
		expect(wishlist.stale).toBe(true);
		expect(wishlist.revision).toBe(1);
		expect(invalidated).toHaveBeenCalledOnce();

		manager.emit('status', 'disconnected');
		manager.emit('status', 'connected');
		expect(wishlist.revision).toBe(2);
		expect(invalidated).toHaveBeenCalledTimes(2);

		first.close();
		expect(manager.mount.unsubscribes).toBe(0);
		second.close();
		expect(manager.mount.unsubscribes).toBe(1);

		const third = await wishlist.watch();
		client.realtime.close();
		expect(third.closed).toBe(true);
		expect(manager.mount.unsubscribes).toBe(2);
	});
});

describe('authenticated current user', () => {
	it('specializes the canonical User and fetches account-only relations lazily', async () => {
		const userUrl = 'https://api.imvu.com/user/user-1';
		const avatarUrl = 'https://api.imvu.com/avatar/avatar-current';
		const blockedUrl = 'https://api.imvu.com/custom/blocked-current';
		const inventoryUrl = 'https://api.imvu.com/custom/inventory-current';
		const account = document(
			userUrl,
			'1',
			{ username: 'Me' },
			{ avatar: avatarUrl, blocked: blockedUrl, inventory: inventoryUrl }
		);
		const avatar = document(avatarUrl, 'current', { look_url: '/look/current' });
		const resource = vi.fn(async (url: string) => (url === avatarUrl ? avatar : account));
		const rest = fakeRest({
			login: vi.fn(async function (this: REST) {
				this.authenticated = true;
				this.cid = '1';
			}),
			resource,
		} as Partial<REST>);
		const client = new Client(rest);

		const fetchedBeforeLogin = await client.users.fetch('1');
		await client.login('Me', 'secret');

		expect(client.account.user).toBe(fetchedBeforeLogin);
		expectTypeOf(client.account.user).toEqualTypeOf<CurrentUser>();
		expect(resource.mock.calls.map(([url]) => url)).toEqual(['/user/user-1', '/user/user-1']);
		expect(client.account.blocklist().url).toBe(blockedUrl);
		expect(client.account.inventory().url).toBe(inventoryUrl);

		const currentAvatar = await client.account.avatar();
		expect(currentAvatar).toBeInstanceOf(Avatar);
		expect(currentAvatar.lookUrl).toBe('/look/current');
		expect(resource).toHaveBeenLastCalledWith(avatarUrl, undefined);
	});
});

describe('wishlist mutations', () => {
	it('invalidates an already-cached wishlist after a confirmed local write', async () => {
		const wishlistUrl = 'https://api.imvu.com/user/user-1/wishlist';
		const account = document('https://api.imvu.com/user/user-1', '1', { username: 'Me' }, { wishlist: wishlistUrl });
		const request = vi.fn().mockResolvedValue({ status: 'success', id: wishlistUrl, denormalized: {}, http: {} });
		const resource = vi.fn().mockResolvedValue(account);
		const rest = fakeRest({
			login: vi.fn(async function (this: REST) {
				this.authenticated = true;
				this.cid = '1';
			}),
			resource,
			request,
		} as Partial<REST>);
		const client = new Client(rest);
		await client.login('Me', 'secret');
		const wishlist = client.account.user.wishlist();
		expect(client.account.wishlist.list()).toBe(wishlist);

		await expect(client.account.wishlist.add('catalog-alpha')).resolves.toBe(true);

		expect(wishlist.stale).toBe(true);
		expect(wishlist.revision).toBe(1);
		expect(request).toHaveBeenCalledWith('/user/user-1/wishlist?limit=0', expect.objectContaining({ method: 'POST' }));
	});
});

describe('structured gift results', () => {
	const account = document('https://api.imvu.com/user/user-1', '1', { username: 'Me' });

	const loggedInClient = async (request: ReturnType<typeof vi.fn>) => {
		const resource = vi.fn().mockResolvedValue(account);
		const rest = fakeRest({
			login: vi.fn(async function (this: REST) {
				this.authenticated = true;
				this.cid = '1';
			}),
			resource,
			request,
		} as Partial<REST>);
		const client = new Client(rest);
		await client.login('Me', 'secret', { socket: false });
		return client;
	};

	it('returns a receipt and preserves a caller-supplied transaction id', async () => {
		const request = vi.fn().mockResolvedValue({ status: 'success', id: '/gift', denormalized: {}, http: {} });
		const client = await loggedInClient(request);
		const recipient = client.utils.deserialize(User, document('/user/user-2', '2', { username: 'Bob' }));
		const product = client.utils.deserialize(Product, document('/product/product-3', '3', { product_name: 'Gift' }));

		const result = await client.account.gifts.send({ recipient, product, transactionId: 'test-transaction' });

		expect(result).toEqual({
			ok: true,
			value: { transactionId: 'test-transaction', recipient, product },
		});
		expect(request).toHaveBeenCalledWith(
			'/user/user-1/gifts',
			expect.objectContaining({ method: 'POST', data: expect.objectContaining({ txn_id: 'test-transaction' }) })
		);
	});

	it('returns a typed rejection for a definite API failure', async () => {
		const failure = { status: 'failure', error: 'insufficient_credits', message: 'Not enough credits' } as const;
		const client = await loggedInClient(
			vi.fn().mockRejectedValue(new IMVUAPIError(failure.error, failure.message, failure))
		);
		const recipient = client.utils.deserialize(User, document('/user/user-2', '2', {}));
		const product = client.utils.deserialize(Product, document('/product/product-3', '3', {}));

		const result = await client.account.gifts.send({ recipient, product, transactionId: 'test-transaction' });

		expect(result).toEqual({
			ok: false,
			error: expect.objectContaining({
				kind: 'rejected',
				reason: 'insufficient_credits',
				apiCode: 'insufficient_credits',
				transactionId: 'test-transaction',
			}),
		});
	});

	it('preserves the transaction id when the outcome is indeterminate', async () => {
		const networkError = new Error('Connection closed before the response');
		const client = await loggedInClient(vi.fn().mockRejectedValue(networkError));
		const recipient = client.utils.deserialize(User, document('/user/user-2', '2', {}));
		const product = client.utils.deserialize(Product, document('/product/product-3', '3', {}));

		const result = await client.account.gifts.send({ recipient, product, transactionId: 'retry-safe-id' });

		expect(result).toEqual({
			ok: false,
			error: {
				kind: 'indeterminate',
				message: networkError.message,
				transactionId: 'retry-safe-id',
				cause: networkError,
			},
		});
	});
});

describe('proof of work', () => {
	it('gives REST an RSW solver unless one was supplied', async () => {
		const rest = fakeRest();
		new Client(rest);
		// 2^(2^1) mod 3233 = 4, so cipher 104 unlocks to 100.
		await expect(rest.proofOfWork?.('rsw,1,3233,2,104')).resolves.toBe('100');

		const own = vi.fn();
		const custom = fakeRest({ proofOfWork: own } as Partial<REST>);
		new Client(custom);
		expect(custom.proofOfWork).toBe(own);
	});
});
