import { Client } from '../../src';

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

if (!IMVU_USERNAME || !IMVU_PASSWORD) {
	throw new Error('IMVU_USERNAME and IMVU_PASSWORD are required');
}

describe('WalletManager.test.ts', () => {
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
