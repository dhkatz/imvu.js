import { Client, User } from '../../src/index.js';

const IMVU_USERNAME = process.env.IMVU_USERNAME ?? '';
const IMVU_PASSWORD = process.env.IMVU_PASSWORD ?? '';
const describeLive =
	process.env.IMVU_RUN_LIVE_TESTS === 'true' && IMVU_USERNAME && IMVU_PASSWORD ? describe : describe.skip;

describeLive('FriendManager.test.ts (live)', () => {
	const client = new Client();

	beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
	afterAll(() => client.logout());

	it('returns a non-negative friend count', async () => {
		const count = await client.account.friends.count();

		expect(count).toBeTypeOf('number');
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it('lists exactly `count` friends, each a User', async () => {
		const expected = await client.account.friends.count();

		let count = 0;
		for await (const friend of client.account.friends.list()) {
			expect(friend).toBeInstanceOf(User);
			count++;
		}

		expect(count).toBe(expected);
	});
});
