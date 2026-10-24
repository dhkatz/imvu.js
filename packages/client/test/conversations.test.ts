import { EventEmitter } from 'node:events';

import type { APICollection, APIResource, APISuccessResponse, REST } from '@imvu/rest';

import {
	Client,
	Conversation,
	ConversationManager,
	ConversationMessage,
	messageIds,
	type RealtimeManagerFactory,
	type RealtimeManagerLike,
} from '../src/index.js';

const API = 'https://api.imvu.com';
const ME = '9';
const conversationUrl = (id: string) => `${API}/conversation/conversation-${id}`;
const messageUrl = (id: string, order: number) => `${API}/message/message-${id}-${order}`;

interface StoredMessage {
	order: number;
	text: string;
	sender: string;
	created: string;
}

class FakeMount extends EventEmitter {
	public unsubscribe(): void {}
	public deliver(message: unknown): void {
		this.emit('message', { userId: 'admin', queueName: '', mountName: '', message });
	}
}

class FakeManager extends EventEmitter implements RealtimeManagerLike {
	public readonly mounts = new Map<string, FakeMount>();
	public async connect(): Promise<void> {
		this.emit('status', 'connected');
	}
	public close(): void {}
	public subscribeMessage(queue: string, mount: string): FakeMount {
		const key = `${queue}/${mount}`;
		if (!this.mounts.has(key)) this.mounts.set(key, new FakeMount());
		return this.mounts.get(key)!;
	}
	public sendMessage(): void {}
	public reconnect(): void {
		this.emit('status', 'disconnected');
		this.emit('status', 'connected');
	}
}

const doc = (url: string, data: Record<string, unknown>, relations: Record<string, string> = {}): APIResource => ({
	url,
	id: url.split('-').slice(1).join('-'),
	data,
	relations,
	updates: null,
});

function harness() {
	const conversations = new Map<string, { members: string[]; messages: StoredMessage[] }>();
	const manager = new FakeManager();
	let transport = {} as REST;

	const messageDoc = (id: string, message: StoredMessage) =>
		doc(messageUrl(id, message.order), {
			payloads: [{ type: 'text', content: message.text }],
			created: message.created,
			sent_by: `${API}/user/user-${message.sender}`,
		});
	const conversationDoc = (id: string) => {
		const { members, messages } = conversations.get(id)!;
		const last = messages.at(-1);
		return doc(
			conversationUrl(id),
			{
				participants: members.map((member, index) => ({
					user: `${API}/user/user-${member}`,
					name: `name${member}`,
					trust: index,
				})),
				unread_messages: 1,
				label: 'inbox',
			},
			{
				messages: `${conversationUrl(id)}/messages`,
				...(last && { last_message: messageUrl(id, last.order) }),
			}
		);
	};
	/** Report documents through onResponse, as the real REST does for embedded documents. */
	const embed = (docs: APIResource[]) =>
		transport.onResponse?.({
			status: 'success',
			id: docs[0]?.url ?? '',
			denormalized: Object.fromEntries(
				docs.map((d) => [d.url, { data: d.data, relations: d.relations, updates: null }])
			),
			http: {},
		} as APISuccessResponse);

	const login: APISuccessResponse = {
		status: 'success',
		id: '/login/me',
		denormalized: { '/login/me': { data: { session_id: 's' }, relations: { imq: 'wss://imq.test' }, updates: null } },
		http: {},
	};

	const rest = {
		request: vi.fn(async (url: string, options?: { method?: string; data?: any }) => {
			if (url === '/login/me') return login;
			if (options?.method === 'POST' && url.endsWith('/messages')) {
				const id = /conversation-([^/]+)\/messages$/.exec(url)![1];
				const messages = conversations.get(id)!.messages;
				messages.push({
					order: (messages.at(-1)?.order ?? 0) + 1,
					text: options.data.payloads[0].content,
					sender: ME,
					created: new Date().toISOString(),
				});
				return { status: 'success', id: url, denormalized: {}, http: {} };
			}
			if (options?.method === 'POST' && url.endsWith('/conversations')) {
				return { status: 'success', id: url, denormalized: {}, http: {} };
			}
			throw new Error(`unexpected ${options?.method ?? 'GET'} ${url}`);
		}),
		resource: vi.fn(async (url: string) => {
			const id = /conversation-([^/?#]+)$/.exec(url)![1];
			return conversationDoc(id);
		}),
		collection: vi.fn(async (url: string): Promise<APICollection> => {
			if (url.endsWith('/conversations')) {
				const items = [...conversations.keys()].reverse().map(conversationDoc);
				embed(
					[...conversations]
						.filter(([, c]) => c.messages.length > 0)
						.map(([id, c]) => messageDoc(id, c.messages.at(-1)!))
				);
				return {
					url,
					data: {},
					itemUrls: items.map((i) => i.url),
					items,
					totalCount: items.length,
					relations: {},
					updates: { queue: `inv:/profile/${ME}`, mount: 'edge:conversations' },
				};
			}
			const id = /conversation-([^/]+)\/messages/.exec(url)![1];
			const items = [...conversations.get(id)!.messages].reverse().map((message) => messageDoc(id, message));
			return {
				url,
				data: {},
				itemUrls: items.map((i) => i.url),
				items,
				totalCount: items.length,
				relations: {},
				updates: { queue: `inv:/conversation/${id}`, mount: 'edge:messages' },
			};
		}),
	};
	transport = { authenticated: true, cid: ME, ...rest } as unknown as REST;
	const factory: RealtimeManagerFactory = () => manager;
	const client = new Client(transport, { realtimeManagerFactory: factory });
	// Stand in for login(): the account manager needs the current user.
	Object.defineProperty(client, 'account', {
		value: { id: ME, conversations: undefined },
	});
	(client.account as { conversations: unknown }).conversations = new ConversationManager(client);

	const add = (
		id: string,
		members: string[],
		messages: Array<[number, string, string]> = [],
		created = '2020-01-01T00:00:00Z'
	) => {
		conversations.set(id, {
			members,
			messages: messages.map(([order, sender, text]) => ({ order, sender, text, created })),
		});
	};
	const receive = (id: string, sender: string, text: string) => {
		const messages = conversations.get(id)!.messages;
		messages.push({ order: (messages.at(-1)?.order ?? 0) + 1, sender, text, created: new Date().toISOString() });
		const edge = `${API}/user/user-${ME}/conversations/conversation-${id}`;
		const list = manager.mounts.get(`inv:/profile/${ME}/edge:conversations`)!;
		// Captured live: one IM produces created + updated + created for the same conversation.
		list.deliver({ action: 'created', objects: [edge] });
		list.deliver({ action: 'updated', objects: [edge] });
		list.deliver({ action: 'created', objects: [edge] });
	};

	return { client, manager, rest, add, receive, conversations };
}

describe('conversation resources', () => {
	it('models members, trust and message text', () => {
		const { client } = harness();
		const conversation = client.utils.deserialize(
			Conversation,
			doc(conversationUrl('7'), {
				participants: [
					{ user: `${API}/user/user-9`, name: 'Me', trust: 0 },
					{ user: `${API}/user/user-5`, name: 'Kvah', trust: 2 },
				],
				unread_messages: 3,
			})
		);
		const message = client.utils.deserialize(
			ConversationMessage,
			doc(messageUrl('7', 42), {
				payloads: [
					{ type: 'text', content: 'hi' },
					{ type: 'sticker', content: 'x' },
				],
				sent_by: `${API}/user/user-5`,
				created: 'c',
			})
		);

		expect(conversation.others(9)).toEqual([{ userId: '5', name: 'Kvah', trust: 'high_risk' }]);
		expect(conversation.unreadMessages).toBe(3);
		expect(message).toMatchObject({ text: 'hi', senderId: '5', conversationId: '7', order: 42 });
		expect(messageIds(`${API}/conversation/conversation-7/messages/message-7-42`)).toEqual({
			conversationId: '7',
			order: 42,
		});
	});
});

describe('ConversationObserver', () => {
	it('reports new IMs once, in order, without replaying history or our own lines', async () => {
		const h = harness();
		h.add('1', [ME, '5'], [[1, '5', 'old']]);
		const observer = await h.client.account.conversations.observe();
		const seen: string[] = [];
		observer.on('message', (message, conversation) =>
			seen.push(`${conversation.id}:${message.senderId}:${message.text}`)
		);

		h.receive('1', '5', 'hello');
		h.receive('1', ME, 'my reply');
		h.receive('1', '5', '!ping');
		await observer.idle();

		expect(seen).toEqual(['1:5:hello', '1:5:!ping']);
	});

	it('picks up a brand-new conversation, but only messages sent since it started', async () => {
		const h = harness();
		const observer = await h.client.account.conversations.observe();
		const seen: string[] = [];
		observer.on('message', (message) => seen.push(message.text));

		h.add('2', [ME, '6'], [[1, '6', 'long ago']]);
		h.receive('2', '6', 'first IM');
		await observer.idle();

		expect(seen).toEqual(['first IM']);
	});

	it('also hears about IMs from messageReceived, without reporting them twice', async () => {
		const h = harness();
		const observer = await h.client.account.conversations.observe();
		const seen: string[] = [];
		observer.on('message', (message) => seen.push(message.text));

		// A brand-new conversation announced only on the user queue (no list update).
		h.add('3', [ME, '7']);
		h.conversations.get('3')!.messages.push({ order: 1, sender: '7', text: 'hi', created: new Date().toISOString() });
		h.manager.mounts.get(`/user/${ME}/web_msg`)!.deliver('messageReceived {"from":7,"time":1}');
		await observer.idle();
		// The list update arriving late must not repeat it.
		h.receive('3', '7', 'again');
		await observer.idle();

		expect(seen).toEqual(['hi', 'again']);
	});

	it('can treat every conversation as new', async () => {
		const h = harness();
		h.add('1', [ME, '5'], [[1, '5', 'old']]);
		const observer = await h.client.account.conversations.observe({ initialConversations: 0 });
		const seen: string[] = [];
		observer.on('message', (message) => seen.push(message.text));

		h.receive('1', '5', 'fresh');
		await observer.idle();

		// 'old' predates the observer, so only the new message counts.
		expect(seen).toEqual(['fresh']);
	});

	it('re-checks on an interval as a safety net', async () => {
		const h = harness();
		h.add('1', [ME, '5'], [[1, '5', 'old']]);
		const observer = await h.client.account.conversations.observe({ pollInterval: 10 });
		const seen: string[] = [];
		observer.on('message', (message) => seen.push(message.text));

		h.conversations
			.get('1')!
			.messages.push({ order: 2, sender: '5', text: 'no signal', created: new Date().toISOString() });
		await vi.waitFor(() => expect(seen).toEqual(['no signal']));
		observer.close();
	});

	it('catches up after an IMQ reconnect', async () => {
		const h = harness();
		h.add('1', [ME, '5'], [[1, '5', 'old']]);
		const observer = await h.client.account.conversations.observe();
		const seen: string[] = [];
		observer.on('message', (message) => seen.push(message.text));

		const messages = h.conversations.get('1')!.messages;
		messages.push({ order: 2, sender: '5', text: 'while offline', created: new Date().toISOString() });
		h.manager.reconnect();
		await observer.idle();

		expect(seen).toEqual(['while offline']);
	});
});

describe('sending IMs', () => {
	it('replies in a conversation and starts new ones', async () => {
		const h = harness();
		h.add('1', [ME, '5']);
		const conversation = await h.client.account.conversations.fetch('1');

		await conversation.send('pong');
		await h.client.account.conversations.send([5, 6], 'hi both');

		expect(h.rest.request).toHaveBeenCalledWith(`${conversationUrl('1')}/messages`, {
			method: 'POST',
			data: { payloads: [{ type: 'text', content: 'pong' }] },
		});
		expect(h.rest.request).toHaveBeenCalledWith(`/user/user-${ME}/conversations`, {
			method: 'POST',
			data: {
				participants: [`${API}/user/user-5`, `${API}/user/user-6`],
				payloads: [{ type: 'text', content: 'hi both' }],
			},
		});
	});
});
