import { Client } from '../../src';

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

if (!IMVU_USERNAME || !IMVU_PASSWORD) {
	throw new Error('IMVU_USERNAME and IMVU_PASSWORD are required');
}

describe('RouletteManager.test.ts', () => {
	const client = new Client();

	beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
	afterAll(() => client.logout());

	it('fetches the current roulette status', async () => {
		const roulette = await client.account.roulette.status();

		expect(roulette.status).toMatch(/^(available|redeemed)$/);
	});

	it('spin() resolves with the current status when already redeemed', async () => {
		const roulette = await client.account.roulette.status();

		// When the wheel is available we skip — spinning would consume the daily reward.
		// When it's redeemed, spin() is a no-op that resolves with the current status.
		if (roulette.status === 'redeemed') {
			await expect(client.account.roulette.spin()).resolves.toHaveProperty('status', 'redeemed');
		}
	});
});
