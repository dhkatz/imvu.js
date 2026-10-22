import {
	IMQManager,
	IMQStream,
	IMQWebSocketStream,
	ImqMessageUnknown,
	decode,
	encode,
	type IMQManagerOptions,
} from '../src/index.js';

const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

/** Silences the connection's warn-level diagnostics in tests that expect disconnects. */
const silentLogger = { warn: () => {} };

/** A test double for the transport: records what the connection sends, and lets the test push frames in. */
class FakeStream extends IMQStream {
	public readonly sent: string[] = [];

	public send(data: string): void {
		this.sent.push(data);
	}

	public close(): void {}

	/** Simulate the socket opening. */
	public open(): void {
		this.emit('open');
	}

	/** Simulate an incoming gateway frame (serialized to the wire like the real socket delivers it). */
	public receive(frame: Record<string, unknown>): void {
		this.emit('message', JSON.stringify(frame));
	}

	public records(): any[] {
		return this.sent.map((frame) => JSON.parse(frame));
	}

	public find(record: string): any {
		return this.records().find((frame) => frame.record === record);
	}

	public count(record: string): number {
		return this.records().filter((frame) => frame.record === record).length;
	}
}

const newManager = (overrides: Partial<IMQManagerOptions> = {}) => {
	const stream = new FakeStream();
	const manager = new IMQManager({
		url: 'wss://test',
		userId: 'user-1',
		sessionId: 'sauce',
		metadata: { app: 'imvu_next' },
		...overrides,
		createStream: () => stream, // one reused stream, so reconnect tests can drive it again
	});
	return { manager, stream };
};

/** Drive the connect → authenticate handshake to completion. */
const authenticate = async (manager: IMQManager, stream: FakeStream) => {
	const connected = manager.connect();
	stream.open();
	stream.receive({ record: 'msg_g2c_result', op_id: 0, status: 0 });
	await connected;
};

describe('IMQ codec', () => {
	it('encodes a connect frame (base64 cookie + metadata records)', () => {
		const frame = JSON.parse(
			encode('msg_c2g_connect', { userId: 'u1', cookie: 'sauce', metadata: { app: 'x' }, opId: 1 })
		);

		expect(frame).toEqual({
			record: 'msg_c2g_connect',
			user_id: 'u1',
			cookie: b64('sauce'),
			metadata: [{ record: 'metadata', key: 'app', value: b64('x') }],
			op_id: 1,
		});
	});

	it('encodes a send_message with base64 JSON payload and wire field names', () => {
		const frame = JSON.parse(
			encode('msg_c2g_send_message', { queueName: 'q', mountName: 'm', message: { a: 1 }, opId: 2 })
		);

		expect(frame).toEqual({
			record: 'msg_c2g_send_message',
			queue: 'q',
			mount: 'm',
			message: b64(JSON.stringify({ a: 1 })),
			op_id: 2,
		});
	});

	it('wraps subscribe queues in queues_with_results', () => {
		const frame = JSON.parse(encode('msg_c2g_subscribe', { subscriptions: [{ name: 'q', opId: 3 }] }));

		expect(frame).toEqual({
			record: 'msg_c2g_subscribe',
			queues_with_results: [{ record: 'subscription', name: 'q', op_id: 3 }],
		});
	});

	it('decodes send_message back into internal shape (camelCase + base64 decode)', () => {
		const decoded = decode(
			JSON.stringify({
				record: 'msg_g2c_send_message',
				queue: 'q',
				mount: 'm',
				user_id: b64('u2'),
				message: b64(JSON.stringify({ a: 1 })),
				op_id: 4,
			})
		);

		expect(decoded).toEqual({
			type: 'msg_g2c_send_message',
			data: { queueName: 'q', mountName: 'm', userId: 'u2', message: { a: 1 }, opId: 4 },
		});
	});

	it('decodes a state create_mount into a key/value map', () => {
		const decoded = decode(
			JSON.stringify({
				record: 'msg_g2c_create_mount',
				type: 2,
				queue: 'q',
				mount: 's',
				properties: [{ record: 'state_property', key: 'k', value: b64('v') }],
			})
		);

		expect(decoded).toEqual({
			type: 'msg_g2c_create_mount',
			data: { type: 'state', queueName: 'q', mountName: 's', state: { k: 'v' } },
		});
	});

	it('base64-encodes non-ASCII payloads as UTF-8 (Buffer-compatible)', () => {
		const text = 'héllo ✨ 世界 🎉';
		const frame = JSON.parse(
			encode('msg_c2g_send_message', { queueName: 'q', mountName: 'm', message: text, opId: 5 })
		);

		expect(frame.message).toBe(b64(text));
	});

	it('decodes non-ASCII payloads and UTF-8 byte frames', () => {
		const text = 'héllo ✨ 世界 🎉';
		const raw = JSON.stringify({
			record: 'msg_g2c_send_message',
			queue: 'q',
			mount: 'm',
			user_id: b64('u'),
			message: b64(text),
			op_id: 6,
		});

		expect(decode(new TextEncoder().encode(raw))).toEqual(decode(raw));
		expect(decode(raw)).toMatchObject({ data: { message: text } });
	});

	it('throws on an unknown mount type', () => {
		expect(() => decode(JSON.stringify({ record: 'msg_g2c_create_mount', type: 9, queue: 'q', mount: 'm' }))).toThrow(
			ImqMessageUnknown
		);
	});
});

describe('IMQManager handshake (mock stream)', () => {
	it('connects, authenticates, and opens the floodgates', async () => {
		const { manager, stream } = newManager();
		await authenticate(manager, stream);

		expect(manager.state.status).toBe('connected');

		const connect = stream.find('msg_c2g_connect');
		expect(connect.user_id).toBe('user-1');
		expect(connect.cookie).toBe(b64('sauce'));
		expect(stream.find('msg_c2g_open_floodgates')).toBeTruthy();

		manager.close();
	});

	it('subscribes and delivers a message to the mount', async () => {
		const { manager, stream } = newManager();
		await authenticate(manager, stream);

		const mount = manager.subscribeMessage('room-1', 'chat');
		expect(stream.find('msg_c2g_subscribe').queues_with_results[0].name).toBe('room-1');

		const received: unknown[] = [];
		mount.on('message', (message) => received.push(message));

		stream.receive({ record: 'msg_g2c_create_mount', type: 1, queue: 'room-1', mount: 'chat' });
		stream.receive({
			record: 'msg_g2c_send_message',
			queue: 'room-1',
			mount: 'chat',
			user_id: b64('user-2'),
			message: b64(JSON.stringify({ text: 'hi' })),
			op_id: 7,
		});

		expect(received).toEqual([
			{ userId: 'user-2', queueName: 'room-1', mountName: 'chat', message: { text: 'hi' }, opId: 7 },
		]);

		manager.close();
	});

	it('discovers mounts via queue-level events', async () => {
		const { manager, stream } = newManager();
		await authenticate(manager, stream);

		const queue = manager.subscribe('room-1');
		const mounts: unknown[] = [];
		const messages: unknown[] = [];
		queue.on('mount', (m) => mounts.push(m));
		queue.on('message', (m) => messages.push(m));

		stream.receive({ record: 'msg_g2c_create_mount', type: 1, queue: 'room-1', mount: 'chat' });
		stream.receive({
			record: 'msg_g2c_send_message',
			queue: 'room-1',
			mount: 'chat',
			user_id: b64('user-2'),
			message: b64(JSON.stringify({ text: 'hi' })),
			op_id: 8,
		});

		expect(mounts).toEqual([{ queueName: 'room-1', mountName: 'chat', mountType: 'message' }]);
		expect(messages).toEqual([
			{ userId: 'user-2', queueName: 'room-1', mountName: 'chat', message: { text: 'hi' }, opId: 8 },
		]);

		manager.close();
	});

	it('fires the op_id callback when a result arrives', async () => {
		const { manager, stream } = newManager();
		await authenticate(manager, stream);
		manager.subscribeMessage('room-1', 'chat');

		const callback = vi.fn();
		manager.sendMessage('room-1', 'chat', { text: 'yo' }, callback);

		const sent = stream.find('msg_c2g_send_message');
		stream.receive({ record: 'msg_g2c_result', op_id: sent.op_id, status: 0 });

		expect(callback).toHaveBeenCalledWith(undefined, expect.objectContaining({ opId: sent.op_id, status: 0 }));

		manager.close();
	});

	it("reports the not-authenticated error instead of sending when it isn't connected", () => {
		const { manager } = newManager();
		const callback = vi.fn();

		manager.sendMessage('room-1', 'chat', { text: 'nope' }, callback);

		expect(callback).toHaveBeenCalledWith('Cannot send data: Not authenticated!');
	});
});

describe('IMQManager lifecycle', () => {
	it('emits status transitions', async () => {
		const { manager, stream } = newManager();
		const statuses: string[] = [];
		manager.on('status', (s) => statuses.push(s));

		await authenticate(manager, stream);

		expect(statuses).toEqual(['connecting', 'authenticating', 'connected']);
		manager.close();
		expect(statuses.at(-1)).toBe('disconnected');
	});

	it('emits error on authentication failure', () => {
		const { manager, stream } = newManager({ logger: silentLogger });
		const errors: Error[] = [];
		manager.on('error', (e) => errors.push(e));

		void manager.connect();
		stream.open();
		stream.receive({ record: 'msg_g2c_result', op_id: 0, status: 1, error_message: 'bad session' });

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toMatch(/authentication failed: bad session/);

		manager.close();
	});

	it('rejects connect() after the timeout when auth never lands', async () => {
		vi.useFakeTimers();
		try {
			const { manager, stream } = newManager({ logger: silentLogger });
			const promise = manager.connect({ timeout: 1000 });
			stream.open(); // connects + sends the connect frame, but no auth result ever arrives

			// Attach the rejection handler before advancing so the rejection is never briefly unhandled.
			const assertion = expect(promise).rejects.toThrow(/timed out after 1000ms/);
			await vi.advanceTimersByTimeAsync(1000);
			await assertion;

			manager.close();
		} finally {
			vi.useRealTimers();
		}
	});

	it('reconnects after a server timeout and re-subscribes', async () => {
		vi.useFakeTimers();
		try {
			const { manager, stream } = newManager({
				logger: silentLogger,
				serverTimeoutInterval: 1000,
				reconnect: [500],
			});

			const connected = manager.connect();
			stream.open();
			stream.receive({ record: 'msg_g2c_result', op_id: 0, status: 0 });
			await connected;

			manager.subscribeMessage('room-1', 'chat');
			const subscribesBefore = stream.count('msg_c2g_subscribe');
			expect(manager.status).toBe('connected');

			// No server frames arrive -> server timeout fires -> disconnect + backoff.
			await vi.advanceTimersByTimeAsync(1000);
			expect(manager.status).toBe('disconnected');

			// Backoff elapses -> reconnect attempt; drive the fresh handshake.
			await vi.advanceTimersByTimeAsync(500);
			stream.open();
			stream.receive({ record: 'msg_g2c_result', op_id: 1, status: 0 });
			await Promise.resolve();

			expect(manager.status).toBe('connected');
			// The queue was re-subscribed on the new session.
			expect(stream.count('msg_c2g_subscribe')).toBeGreaterThan(subscribesBefore);

			manager.close();
		} finally {
			vi.useRealTimers();
		}
	});
});

/** A minimal standard-`WebSocket` double: an EventTarget that records sends/closes. */
class FakeWebSocket extends EventTarget {
	public binaryType = 'blob';
	public readonly sent: string[] = [];
	public closeCalls = 0;

	public send(data: string): void {
		this.sent.push(data);
	}

	public close(): void {
		this.closeCalls++;
	}

	public dispatch(type: string, init: Record<string, unknown> = {}): void {
		this.dispatchEvent(Object.assign(new Event(type), init));
	}
}

describe('IMQWebSocketStream (standard WebSocket)', () => {
	const setup = () => {
		const socket = new FakeWebSocket();
		const stream = new IMQWebSocketStream(socket as unknown as WebSocket);
		const events: unknown[][] = [];
		for (const name of ['open', 'message', 'error', 'close'] as const) {
			stream.on(name, (...args: unknown[]) => events.push([name, ...args]));
		}
		return { socket, stream, events };
	};

	it('requests ArrayBuffer binary frames and forwards sends', () => {
		const { socket, stream } = setup();
		expect(socket.binaryType).toBe('arraybuffer');

		stream.send('frame');
		expect(socket.sent).toEqual(['frame']);
	});

	it('emits text and UTF-8-decoded binary messages as strings', () => {
		const { socket, events } = setup();
		socket.dispatch('open');
		socket.dispatch('message', { data: 'text' });
		socket.dispatch('message', { data: new TextEncoder().encode('bytes ✨').buffer });

		expect(events).toEqual([['open'], ['message', 'text'], ['message', 'bytes ✨']]);
	});

	it('surfaces error events as Error instances', () => {
		const { socket, events } = setup();
		socket.dispatch('error');

		expect(events[0][0]).toBe('error');
		expect(events[0][1]).toBeInstanceOf(Error);
	});

	it('closes once, then detaches from the socket', () => {
		const { socket, stream, events } = setup();
		socket.dispatch('open');
		stream.close();
		stream.close(); // already closing — must not close the socket twice
		expect(socket.closeCalls).toBe(1);

		socket.dispatch('close');
		socket.dispatch('message', { data: 'late' });
		stream.close(); // already closed

		expect(socket.closeCalls).toBe(1);
		expect(events).toEqual([['open'], ['close']]);
	});
});
