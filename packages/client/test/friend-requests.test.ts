import { REST } from '@imvu/rest';

import { Client, FriendManager, User } from '../src/index.js';

const API = 'https://api.imvu.com';
const ME = '9';
const INBOUND = `${API}/user/user-${ME}/inbound_friend_requests`;
const OUTBOUND = `${API}/user/user-${ME}/outbound_friend_requests`;

/** An edge collection of users, as IMVU sends friend requests (items are edges whose `ref` is the user). */
function users(url: string, ids: string[]) {
	const denormalized: Record<string, unknown> = {
		[url]: {
			data: { items: ids.map((id) => `${url}/user-${id}`), total_count: ids.length },
			relations: [],
			updates: null,
		},
	};
	for (const id of ids) {
		denormalized[`${url}/user-${id}`] = { data: {}, relations: { ref: `${API}/user/user-${id}` }, updates: null };
		denormalized[`${API}/user/user-${id}`] = { data: { username: `user${id}` }, relations: {}, updates: null };
	}
	return { status: 'success', id: url, denormalized, http: {} };
}

function harness() {
	const inbound = ['1', '2'];
	const sent: { method: string; url: string; body: unknown }[] = [];
	const fetch = (async (input: string | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const method = init?.method ?? 'GET';
		const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
		sent.push({ method, url: url.origin + url.pathname, body });
		const path = url.origin + url.pathname;
		if (method === 'GET' && path === INBOUND) return Response.json(users(INBOUND, inbound));
		if (method === 'GET' && path === OUTBOUND) return Response.json(users(OUTBOUND, ['3']));
		const answered = path.match(/\/inbound_friend_requests\/user-(\d+)$/);
		if (method === 'POST' && answered) {
			const index = inbound.indexOf(answered[1]!);
			if (index < 0)
				return Response.json({ status: 'failure', error: 'NOT-FOUND', message: 'no request' }, { status: 404 });
			inbound.splice(index, 1);
			return Response.json({ status: 'success', id: path, denormalized: {}, http: {} });
		}
		return Response.json({ status: 'failure', error: 'NOT-FOUND', message: path }, { status: 404 });
	}) as typeof globalThis.fetch;

	const client = new Client(new REST({ fetch, cookieStorage: null }));
	// Stand in for login(): the account manager needs the current user's id.
	Object.defineProperty(client, 'account', { value: { id: ME, friends: undefined } });
	(client.account as { friends: FriendManager }).friends = new FriendManager(client);
	return { client, sent, inbound };
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = [];
	for await (const item of items) out.push(item);
	return out;
}

describe('friend requests', () => {
	it('lists the people who sent one, and the ones still waiting on ours', async () => {
		const { client } = harness();
		const requests = await collect(client.account.friends.requests());
		expect(requests.map((user) => user.username)).toEqual(['user1', 'user2']);
		expect(requests[0]).toBeInstanceOf(User);
		const sent = await collect(client.account.friends.sent());
		expect(sent.map((user) => user.id)).toEqual(['3']);
	});

	it('accepts and declines as IMVU’s client does, false when there was no request', async () => {
		const { client, sent, inbound } = harness();
		await expect(client.account.friends.accept(1)).resolves.toBe(true);
		await expect(client.account.friends.decline(2)).resolves.toBe(true);
		await expect(client.account.friends.accept(1)).resolves.toBe(false);
		expect(inbound).toEqual([]);
		expect(sent.filter((request) => request.method === 'POST').map(({ url, body }) => [url, body])).toEqual([
			[`${INBOUND}/user-1`, { status: 'accept' }],
			[`${INBOUND}/user-2`, { status: 'reject' }],
			[`${INBOUND}/user-1`, { status: 'accept' }],
		]);
	});
});
