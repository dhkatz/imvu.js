import { IMVUAPIError, REST, type APISuccessResponse } from '../src/index.js';

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

	it('throws a structured IMVUAPIError for API failures', async () => {
		const rest = Object.create(REST.prototype) as REST;
		Object.defineProperty(rest, 'http', {
			value: {
				request: vi.fn().mockResolvedValue({
					data: { status: 'failure', error: 'insufficient_credits', message: 'Not enough credits' },
				}),
			},
		});

		const request = rest.request('/gift');
		await expect(request).rejects.toBeInstanceOf(IMVUAPIError);
		await expect(request).rejects.toEqual(
			expect.objectContaining({
				name: 'IMVUAPIError',
				apiCode: 'insufficient_credits',
				message: 'Not enough credits',
			})
		);
	});
});
