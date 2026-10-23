import { EventEmitter } from 'node:events';

import { IMVUAPIError, type APICollection, type APIResource, type APISuccessResponse, type REST } from '@imvu/rest';

import {
	Chat,
	ChatParticipant,
	Client,
	Room,
	encodeChatPayload,
	parseChatLine,
	parseChatPayload,
	productIdsFromLookUrl,
	type ChatMessage,
	type RealtimeManagerFactory,
	type RealtimeManagerLike,
} from '../src/index.js';

const API = 'https://api.imvu.com';
const CHAT = `${API}/chat/chat-100-1`;
const PARTICIPANTS = `${CHAT}/participants`;
const participantUrl = (cid: string) => `${PARTICIPANTS}/user-${cid}`;
const lookUrl = (...ids: number[]) => `${API}/look/${ids.join('%2C')}`;

const node = <T extends object>(url: string, data: T, relations: Record<string, string> = {}): APIResource<T> => ({
	url,
	id: url.split('-').slice(1).join('-'),
	data,
	relations,
	updates: null,
});

class FakeMount extends EventEmitter {
	public unsubscribed = false;
	public unsubscribe(): void {
		this.unsubscribed = true;
	}
	public deliver(userId: string, message: unknown): void {
		this.emit('message', { userId, queueName: '', mountName: '', message });
	}
}

class FakeManager extends EventEmitter implements RealtimeManagerLike {
	public readonly mounts = new Map<string, FakeMount>();
	public readonly sent: Array<{ queue: string; mount: string; message: unknown }> = [];
	public sendError?: string;

	public async connect(): Promise<void> {
		this.emit('status', 'connected');
	}
	public close(): void {}
	public subscribeMessage(queue: string, mount: string): FakeMount {
		const key = `${queue}/${mount}`;
		if (!this.mounts.has(key)) this.mounts.set(key, new FakeMount());
		return this.mounts.get(key)!;
	}
	public sendMessage(queue: string, mount: string, message: unknown, callback?: (error?: string) => void): void {
		this.sent.push({ queue, mount, message });
		callback?.(this.sendError);
	}
	public mount(queue: string, mount: string): FakeMount {
		const found = this.mounts.get(`${queue}/${mount}`);
		if (!found) throw new Error(`not subscribed to ${queue}/${mount}`);
		return found;
	}
	public reconnect(): void {
		this.emit('status', 'disconnected');
		this.emit('status', 'connected');
	}
}

interface Harness {
	client: Client;
	manager: FakeManager;
	chat: Chat;
	/** Current server-side participant data, by cid. */
	people: Map<string, Record<string, unknown>>;
	rest: {
		request: ReturnType<typeof vi.fn>;
		resource: ReturnType<typeof vi.fn>;
		collection: ReturnType<typeof vi.fn>;
		fetch: ReturnType<typeof vi.fn>;
	};
}

const login: APISuccessResponse = {
	status: 'success',
	id: '/login/me',
	denormalized: { '/login/me': { data: { session_id: 's' }, relations: { imq: 'wss://imq.test' }, updates: null } },
	http: {},
};

function harness(initial: Record<string, Record<string, unknown>> = {}): Harness {
	const manager = new FakeManager();
	const people = new Map(Object.entries(initial));
	const notFound = () =>
		new IMVUAPIError('NOT-FOUND', 'gone', { status: 'failure', error: 'NOT-FOUND', message: 'gone' } as never);

	// Declared first so the fakes can report responses through it, as the real REST does.
	let transport = {} as REST;
	const rest = {
		request: vi.fn(async (url: string, options?: { method?: string }) => {
			if (url === '/login/me') return login;
			if (url === PARTICIPANTS && options?.method === 'POST') {
				people.set('9', { look_url: lookUrl(1), seat_number: 1, seat_furni_id: 5 });
				return { status: 'success', id: participantUrl('9'), denormalized: {}, http: {} };
			}
			if (url.startsWith(PARTICIPANTS) && options?.method === 'POST') {
				if (!people.has(url.split('user-')[1])) throw notFound();
				return { status: 'success', id: url, denormalized: {}, http: {} };
			}
			throw new Error(`unexpected request ${options?.method ?? 'GET'} ${url}`);
		}),
		resource: vi.fn(async (url: string) => {
			const cid = url.split('user-')[1];
			const data = people.get(cid);
			if (!data) throw notFound();
			return node(url, data, { ref: `${API}/user/user-${cid}` });
		}),
		collection: vi.fn(async () => {
			// Like the real API: `items` follow each edge's ref to the user; `edges` are the participants.
			const edges = [...people].map(([cid, data]) =>
				node(participantUrl(cid), data, { ref: `${API}/user/user-${cid}` })
			);
			const items = [...people.keys()].map((cid) => node(`${API}/user/user-${cid}`, { username: `u${cid}` }));
			// The real REST reports every response's embedded documents through onResponse.
			transport.onResponse?.({
				status: 'success',
				id: PARTICIPANTS,
				denormalized: Object.fromEntries(
					[...edges, ...items].map((doc) => [doc.url, { data: doc.data, relations: doc.relations, updates: null }])
				),
				http: {},
			});
			return {
				url: PARTICIPANTS,
				data: {},
				itemUrls: edges.map((edge) => edge.url),
				items,
				edges,
				totalCount: items.length,
				relations: {},
				updates: { queue: 'inv:/chat/chat-100-1', mount: 'edge:participants' },
			} satisfies APICollection;
		}),
		fetch: vi.fn(async (url: string, options?: { method?: string }) => {
			if (options?.method === 'DELETE') people.delete(url.split('user-')[1]);
			return new Response(null, { status: 204 });
		}),
	};

	transport = { authenticated: true, cid: '9', ...rest } as unknown as REST;
	const factory: RealtimeManagerFactory = () => manager;
	const client = new Client(transport, {
		realtimeManagerFactory: factory,
	});
	const chat = client.utils.deserialize(
		Chat,
		node(CHAT, { imq_queue: '/chat/777', imq_messages_mount: 'messages', capacity: 10 }, { participants: PARTICIPANTS })
	);

	return { client, manager, chat, people, rest };
}

const invalidation = (h: Harness, action: string, cid: string) =>
	h.manager.mount('inv:/chat/chat-100-1', 'edge:participants').deliver('', { action, objects: [participantUrl(cid)] });

describe('chat protocol', () => {
	it('decodes payloads from JSON strings or objects', () => {
		expect(parseChatPayload('{"chatId":"777","message":"hi","to":0,"userId":"5"}')).toEqual({
			chatId: '777',
			message: 'hi',
			to: 0,
			userId: '5',
		});
		expect(parseChatPayload({ chatId: 777, message: 'yo', to: '12' })).toMatchObject({ chatId: '777', to: 12 });
		expect(parseChatPayload('not json')).toBeNull();
		expect(parseChatPayload({ action: 'updated' })).toBeNull();
	});

	it('classifies captured legacy lines', () => {
		expect(parseChatLine('hello there')).toEqual({ kind: 'text', text: 'hello there', action: false });
		expect(parseChatLine('/me waves')).toEqual({ kind: 'text', text: 'waves', action: true });
		expect(parseChatLine('*putOnOutfit 70175429 20063528 30844762')).toEqual({
			kind: 'outfit',
			productIds: ['70175429', '20063528', '30844762'],
		});
		expect(parseChatLine('*msg SeatAssignment 3 247524825 4 0')).toEqual({
			kind: 'seat',
			userId: '247524825',
			seatNumber: 4,
			furniId: '0',
		});
		expect(parseChatLine('*boot 391081641 392378413')).toEqual({
			kind: 'boot',
			booterId: '391081641',
			targetId: '392378413',
		});
		expect(parseChatLine('*imvu:txnBoot 392378413')).toEqual({ kind: 'boot', targetId: '392378413' });
		expect(parseChatLine('*imvu:isPureUser')).toEqual({ kind: 'command', command: 'imvu:isPureUser', args: [] });
		expect(parseChatLine('*use 1 2')).toEqual({ kind: 'command', command: 'use', args: ['1', '2'] });
	});

	it('encodes payloads like the web client', () => {
		expect(encodeChatPayload('777', 'hi', '392378413')).toEqual({
			chatId: '777',
			message: 'hi',
			to: 0,
			userId: 392378413,
		});
		expect(encodeChatPayload('777', 'psst', '5', '12')).toMatchObject({ to: 12 });
	});

	it('reads outfits from look URLs', () => {
		expect(productIdsFromLookUrl(lookUrl(70175429, 20063528))).toEqual(['70175429', '20063528']);
		expect(productIdsFromLookUrl('')).toEqual([]);
	});
});

describe('chat resources', () => {
	it('models chats, participants and rooms', async () => {
		const { client, chat } = harness();
		const participant = client.utils.deserialize(
			ChatParticipant,
			node(participantUrl('42'), { look_url: lookUrl(3, 4), seat_number: '2', seat_furni_id: 17, created: 'c' })
		);
		const room = client.utils.deserialize(
			Room,
			node(`${API}/room/room-1-2`, { occupancy: 6, supports_audience: false, is_friends_only: 1 }, { chat: CHAT })
		);

		expect(chat.realtimeId).toBe('777');
		expect(participant).toMatchObject({ userId: '42', seatNumber: 2, seatFurniId: 17, productIds: ['3', '4'] });
		expect(room).toMatchObject({ occupancy: 6, isFriendsOnly: true, supportsAudience: false });
	});
});

describe('Resource.refresh', () => {
	it('re-reads and hydrates the same instance', async () => {
		const resource = vi
			.fn()
			.mockResolvedValueOnce(node(`${API}/user/user-7`, { tagline: 'before' }))
			.mockResolvedValueOnce(node(`${API}/user/user-7`, { tagline: 'after' }));
		const client = new Client({ authenticated: true, cid: '1', resource } as unknown as REST);

		const user = (await client.users.fetch('7'))!;
		user._invalidate();
		const refreshed = await user.refresh();

		expect(refreshed).toBe(user);
		expect(user.tagline).toBe('after');
		expect(user.stale).toBe(false);
		expect(resource).toHaveBeenLastCalledWith(`${API}/user/user-7`, undefined);
	});
});

describe('ChatObserver', () => {
	it('starts from the current participants and follows joins, leaves and changes', async () => {
		const h = harness({ '1': { look_url: lookUrl(10), seat_number: 1, seat_furni_id: 5 } });
		const observer = await h.chat.observe();
		const events: string[] = [];
		observer.on('join', (p) => events.push(`join ${p.userId}`));
		observer.on('leave', (e) => events.push(`leave ${e.userId} ${e.participant.productIds.join(',')}`));
		observer.on('update', (p, changes) => events.push(`update ${p.userId} ${changes.join('+')}`));

		expect(observer.participants.map((p) => p.userId)).toEqual(['1']);

		h.people.set('2', { look_url: lookUrl(20), seat_number: 2, seat_furni_id: 5 });
		invalidation(h, 'created', '2');
		invalidation(h, 'updated', '1'); // keepalive: nothing changed
		await observer.idle();
		h.people.set('1', { look_url: lookUrl(11), seat_number: 3, seat_furni_id: 5 });
		invalidation(h, 'updated', '1');
		await observer.idle();
		h.people.delete('2');
		invalidation(h, 'deleted', '2');
		invalidation(h, 'deleted', '404'); // never seen: no event
		await observer.idle();

		expect(events).toEqual(['join 2', 'update 1 outfit+seat', 'leave 2 20']);
		expect(observer.has(1)).toBe(true);
		expect(observer.has(2)).toBe(false);
	});

	it('gives participants their full user from the embedded documents, without a request', async () => {
		const h = harness({ '1': { look_url: lookUrl(10) } });
		const observer = await h.chat.observe();

		expect(observer.get(1)?.user).toMatchObject({ username: 'u1' });
		expect(h.client.users.resolve('1')).toBe(observer.get(1)?.user);
		expect(h.rest.resource).not.toHaveBeenCalled();
	});

	it('can skip re-reading on updates', async () => {
		const h = harness({ '1': { look_url: lookUrl(10) } });
		const observer = await h.chat.observe({ trackChanges: false });
		const reads = h.rest.resource.mock.calls.length;

		invalidation(h, 'updated', '1');
		await observer.idle();

		expect(h.rest.resource.mock.calls.length).toBe(reads);
	});

	it('treats a participant that vanished before it could be read as gone', async () => {
		const h = harness({ '1': { look_url: lookUrl(10) } });
		const observer = await h.chat.observe();
		const left = vi.fn();
		observer.on('leave', left);
		const reads = h.rest.resource.mock.calls.length;

		h.people.delete('1');
		invalidation(h, 'updated', '1');
		await observer.idle();

		expect(h.rest.resource.mock.calls.length).toBe(reads + 1);
		expect(left).toHaveBeenCalledWith(expect.objectContaining({ userId: '1' }));
	});

	it('resynchronizes from REST after an IMQ reconnect', async () => {
		const h = harness({ '1': {}, '2': {} });
		const observer = await h.chat.observe();
		const events: string[] = [];
		observer.on('join', (p) => events.push(`join ${p.userId}`));
		observer.on('leave', (e) => events.push(`leave ${e.userId}`));

		h.people.delete('1');
		h.people.set('3', {});
		h.manager.reconnect();
		await observer.idle();

		expect(events.sort()).toEqual(['join 3', 'leave 1']);
	});

	it('releases the IMQ subscription when closed', async () => {
		const h = harness();
		const observer = await h.chat.observe();
		observer.close();
		expect(h.manager.mount('inv:/chat/chat-100-1', 'edge:participants').unsubscribed).toBe(true);
	});
});

describe('ChatSession', () => {
	it('joins, decodes chat by envelope sender and ignores its own echo', async () => {
		const h = harness({ '5': {} });
		const session = await h.chat.join();
		const messages: ChatMessage[] = [];
		const outfits: unknown[] = [];
		session.on('message', (m) => messages.push(m));
		session.on('outfit', (o) => outfits.push(o));

		const chat = h.manager.mount('/chat/777', 'messages');
		// The payload's userId is untrusted; the envelope's wins.
		chat.deliver('5', JSON.stringify({ chatId: '777', message: 'hello', to: 0, userId: '1' }));
		chat.deliver('5', { chatId: '777', message: '/me waves', to: 9, userId: 5 });
		chat.deliver('5', { chatId: '777', message: '*putOnOutfit 1 2 3', to: 0, userId: 5 });
		chat.deliver('9', { chatId: '777', message: 'my own echo', to: 0, userId: 9 });

		expect(h.rest.request).toHaveBeenCalledWith(PARTICIPANTS, { method: 'POST', data: {} });
		expect(session.participantUrl).toBe(participantUrl('9'));
		expect(messages.map((m) => [m.userId, m.text, m.action, m.whisper, m.toMe])).toEqual([
			['5', 'hello', false, false, false],
			['5', 'waves', true, true, true],
		]);
		expect(outfits).toEqual([{ userId: '5', productIds: ['1', '2', '3'] }]);
		expect(session.participants.map((p) => p.userId).sort()).toEqual(['5', '9']);

		await session.leave();
	});

	it('updates participants from outfit and seat broadcasts without re-reading them', async () => {
		const h = harness({ '5': { look_url: lookUrl(1, 2), seat_number: 1, seat_furni_id: 7 } });
		const session = await h.chat.join();
		const updates: string[] = [];
		session.on('update', (p, changes) => updates.push(`${p.userId} ${changes.join('+')}`));
		const reads = h.rest.resource.mock.calls.length;
		const chat = h.manager.mount('/chat/777', 'messages');

		chat.deliver('5', { chatId: '777', message: '*putOnOutfit 1 2', to: 0 }); // unchanged
		chat.deliver('5', { chatId: '777', message: '*putOnOutfit 1 3', to: 0 });
		chat.deliver('5', { chatId: '777', message: '*msg SeatAssignment 3 5 2 7', to: 0 });
		invalidation(h, 'updated', '5'); // a keepalive: not re-read inside a session
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(updates).toEqual(['5 outfit', '5 seat']);
		expect(session.participant(5)?.productIds).toEqual(['1', '3']);
		expect(h.rest.resource.mock.calls.length).toBe(reads);
		await session.leave();
	});

	it('sends public chat and whispers in the web wire format', async () => {
		const h = harness();
		const session = await h.chat.join();

		await session.send('hi');
		await session.whisper(5, 'psst');

		expect(h.manager.sent).toEqual([
			{ queue: '/chat/777', mount: 'messages', message: { chatId: '777', message: 'hi', to: 0, userId: 9 } },
			{ queue: '/chat/777', mount: 'messages', message: { chatId: '777', message: 'psst', to: 5, userId: 9 } },
		]);

		h.manager.sendError = 'FLOOD';
		await expect(session.send('again')).rejects.toThrow(/FLOOD/);
		await session.leave();
	});

	it('leaves by deleting its participant and closes once', async () => {
		const h = harness();
		const session = await h.chat.join();
		const closed = vi.fn();
		session.on('close', closed);

		await Promise.all([session.leave(), session.leave()]);

		expect(h.rest.fetch).toHaveBeenCalledTimes(1);
		expect(h.rest.fetch).toHaveBeenCalledWith(participantUrl('9'), { method: 'DELETE' });
		expect(closed).toHaveBeenCalledWith({ reason: 'left' });
		expect(h.manager.mount('/chat/777', 'messages').unsubscribed).toBe(true);
		await expect(session.send('late')).rejects.toThrow(/closed/);
	});

	it('leaves when booted', async () => {
		const h = harness({ '5': {} });
		const session = await h.chat.join();
		const booted = vi.fn();
		const closed = new Promise((resolve) => session.on('close', resolve));
		session.on('booted', booted);

		h.manager.mount('/chat/777', 'messages').deliver('5', { chatId: '777', message: '*imvu:txnBoot 9', to: 0 });
		h.manager.mount('/chat/777', 'messages').deliver('5', { chatId: '777', message: '*boot 5 9', to: 0 });

		await expect(closed).resolves.toEqual({ reason: 'booted' });
		expect(booted).toHaveBeenCalledTimes(1);
		expect(booted).toHaveBeenCalledWith({ by: '5' });
	});

	it('boots others by announcing and deleting their participant', async () => {
		const h = harness({ '5': {} });
		const session = await h.chat.join();

		await session.boot(5);

		expect(h.manager.sent.map((s) => (s.message as { message: string }).message)).toEqual([
			'*imvu:txnBoot 5',
			'*boot 9 5',
		]);
		expect(h.rest.fetch).toHaveBeenCalledWith(participantUrl('5'), { method: 'DELETE' });
		await session.leave();
	});

	it('keeps its presence alive and notices when the server dropped it', async () => {
		vi.useFakeTimers();
		try {
			const h = harness();
			const session = await h.chat.join({ keepAliveInterval: 1000, observeParticipants: false });
			const closed = vi.fn();
			session.on('close', closed);

			await vi.advanceTimersByTimeAsync(1000);
			expect(h.rest.request).toHaveBeenCalledWith(participantUrl('9'), { method: 'POST', data: {} });

			h.people.delete('9');
			await vi.advanceTimersByTimeAsync(1000);

			expect(closed).toHaveBeenCalledWith({ reason: 'removed' });
			expect(h.rest.fetch).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('closes as removed when its own participant record is deleted', async () => {
		const h = harness();
		const session = await h.chat.join();
		const closed = new Promise((resolve) => session.on('close', resolve));

		h.people.delete('9');
		invalidation(h, 'deleted', '9');

		await expect(closed).resolves.toEqual({ reason: 'removed' });
	});

	it('joins through a room', async () => {
		const h = harness();
		const room = h.client.utils.deserialize(Room, node(`${API}/room/room-1-2`, {}, { chat: CHAT }));
		h.rest.resource.mockImplementationOnce(async () =>
			node(CHAT, { imq_queue: '/chat/777', imq_messages_mount: 'messages' }, { participants: PARTICIPANTS })
		);

		const session = await room.join();

		expect(session.chat).toBe(h.chat);
		await session.leave();
	});
});
