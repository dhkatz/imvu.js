import { AccountManager, Client } from '../../src/index.js';

const IMVU_USERNAME = process.env.IMVU_USERNAME ?? '';
const IMVU_PASSWORD = process.env.IMVU_PASSWORD ?? '';
const describeLive =
	process.env.IMVU_RUN_LIVE_TESTS === 'true' && IMVU_USERNAME && IMVU_PASSWORD ? describe : describe.skip;

describeLive('Client.test.ts (live)', () => {
	test('Client Authenticates', async () => {
		const client = new Client();

		await client.login(IMVU_USERNAME, IMVU_PASSWORD);

		expect(client.authenticated).toBeTruthy();

		await client.logout();
	});

	test('Invalid Login Information Throws', async () => {
		const client = new Client();

		await expect(client.login('123', '456')).rejects.toThrow();
	});

	test('Client retrieves Account', async () => {
		const client = new Client();

		await client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false });

		expect(client.account).toBeInstanceOf(AccountManager);
		expect(client.account.username.toLowerCase()).toEqual(IMVU_USERNAME.toLowerCase());

		await client.logout();
	});

	test('Accessing Account without authentication throws', () => {
		const client = new Client();

		expect(() => client.account).toThrow(/account information/i);
	});
});
