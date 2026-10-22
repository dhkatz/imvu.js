import { Client, Product } from '../../src/index.js';

const IMVU_USERNAME = process.env.IMVU_USERNAME ?? '';
const IMVU_PASSWORD = process.env.IMVU_PASSWORD ?? '';
const describeLive =
	process.env.IMVU_RUN_LIVE_TESTS === 'true' && IMVU_USERNAME && IMVU_PASSWORD ? describe : describe.skip;

describeLive('AccountManager (live)', () => {
	const client = new Client();

	beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD));
	afterAll(() => client.logout());

	it('should support fetching the client wishlist', async () => {
		for await (const product of client.account.inventory()) {
			expect(product).toBeInstanceOf(Product);
		}
	}, 30000);
});
