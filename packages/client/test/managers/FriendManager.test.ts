import { Client, User } from '../../src';

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

if (!IMVU_USERNAME || !IMVU_PASSWORD) {
	throw new Error('IMVU_USERNAME or IMVU_PASSWORD is not set');
}

describe('FriendManager.test.ts', () => {
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
