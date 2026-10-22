import { Client } from '../../src/index.js';

const IMVU_USERNAME = process.env.IMVU_USERNAME ?? '';
const IMVU_PASSWORD = process.env.IMVU_PASSWORD ?? '';
const describeLive =
	process.env.IMVU_RUN_LIVE_TESTS === 'true' && IMVU_USERNAME && IMVU_PASSWORD ? describe : describe.skip;

describeLive('WalletManager.test.ts (live)', () => {
	const client = new Client();

	beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD));
	afterAll(() => client.logout());

	it('reports a numeric credit balance', async () => {
		const wallet = await client.account.wallet.status();

		expect(wallet.credits).toBeTypeOf('number');
		expect(wallet.credits).toBeGreaterThanOrEqual(0);
	});

	it('reports a numeric promo-credit balance', async () => {
		const wallet = await client.account.wallet.status();

		expect(wallet.promo_credits).toBeTypeOf('number');
		expect(wallet.promo_credits).toBeGreaterThanOrEqual(0);
	});
});
