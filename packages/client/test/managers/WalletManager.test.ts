import { Client } from '../../src';

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

if (!IMVU_USERNAME || !IMVU_PASSWORD) {
	throw new Error('IMVU_USERNAME and IMVU_PASSWORD are required');
}

describe('WalletManager.test.ts', () => {
	const client = new Client();

	beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD));
	afterAll(() => client.logout());

	it('should return the proper amount of credits', async () => {
		const wallet = await client.account.wallet.status();

		expect(wallet.credits).toBe(0);
	});

	it('should return the correct amount of promo credits', async () => {
		const wallet = await client.account.wallet.status();

		expect(wallet.promo_credits).toBe(2808);
	});
});
