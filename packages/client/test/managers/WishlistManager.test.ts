import { Client, Product } from '../../src';

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

if (!IMVU_USERNAME || !IMVU_PASSWORD) {
	throw new Error('IMVU_USERNAME and IMVU_PASSWORD are required');
}

describe('WishlistManager.test.ts', () => {
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

	it('should add product to wishlist by id', async () => {
		const count = await client.account.wishlist.count();

		await expect(client.account.wishlist.add(51522827)).resolves.toBeTruthy();

		await expect(client.account.wishlist.count()).resolves.toBe(count + 1);
	});

	it('should remove product to wishlist by id', async () => {
		const count = await client.account.wishlist.count();

		await expect(client.account.wishlist.remove(51522827)).resolves.toBeTruthy();

		await expect(client.account.wishlist.count()).resolves.toBe(count - 1);
	});
});
