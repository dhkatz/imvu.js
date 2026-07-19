import { IMQManager, IMQStream, ImqMessageUnknown, decode, encode } from '../src';

const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

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
}

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

	it('throws on an unknown mount type', () => {
		expect(() => decode(JSON.stringify({ record: 'msg_g2c_create_mount', type: 9, queue: 'q', mount: 'm' }))).toThrow(
			ImqMessageUnknown
		);
	});
});

describe('IMQManager handshake (mock stream)', () => {
	const newManager = () => {
		const stream = new FakeStream();
		const manager = new IMQManager({
			url: 'wss://test',
			userId: 'user-1',
			sessionId: 'sauce',
			metadata: { app: 'imvu_next' },
			createStream: () => stream,
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
