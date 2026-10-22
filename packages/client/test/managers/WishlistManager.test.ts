import { Client, Product } from '../../src/index.js';

const IMVU_USERNAME = process.env.IMVU_USERNAME ?? '';
const IMVU_PASSWORD = process.env.IMVU_PASSWORD ?? '';
const RUN_LIVE_TESTS = process.env.IMVU_RUN_LIVE_TESTS === 'true' && Boolean(IMVU_USERNAME && IMVU_PASSWORD);
const RUN_MUTATION_TESTS = RUN_LIVE_TESTS && process.env.IMVU_RUN_MUTATION_TESTS === 'true';
const describeLive = RUN_LIVE_TESTS ? describe : describe.skip;

describeLive('WishlistManager.test.ts (live)', () => {
	const client = new Client();

	beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD));
	afterAll(() => client.logout());

	it('should return the current wishlist', async () => {
		for await (const product of client.account.wishlist.list()) {
			expect(product).toBeInstanceOf(Product);
		}
	});

	it('should return the expected wishlist count', async () => {
		await expect(client.account.wishlist.count()).resolves.toEqual(expect.any(Number));
	});

	it.skipIf(!RUN_MUTATION_TESTS)('should add product to wishlist by id', async () => {
		const count = await client.account.wishlist.count();

		await expect(client.account.wishlist.add(51522827)).resolves.toBeTruthy();

		await expect(client.account.wishlist.count()).resolves.toBe(count + 1);
	});

	it.skipIf(!RUN_MUTATION_TESTS)('should remove product to wishlist by id', async () => {
		const count = await client.account.wishlist.count();

		await expect(client.account.wishlist.remove(51522827)).resolves.toBeTruthy();

		await expect(client.account.wishlist.count()).resolves.toBe(count - 1);
	});
});
