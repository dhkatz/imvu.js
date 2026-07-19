/**
 * IMQ wire codec.
 *
 * Translates between the library's internal (camelCase) message shapes and the
 * IMQ gateway's wire format (snake_case JSON, base64-encoded string payloads).
 * `encode` produces the JSON string to put on the socket; `decode` parses a raw
 * frame back into a typed, discriminated {@link DecodedMessage}.
 *
 * Ported from IMVU's `imq.js` (`g`/`h`/`T`/`v`), but with the field remaps and
 * base64 transforms made explicit and the encode/decode contract tightened.
 */

/** Thrown when a frame references a record type we don't know how to (de)code. */
export class ImqMessageUnknown extends Error {}

const b64encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64');
const b64decode = (value: string): string => Buffer.from(value, 'base64').toString('utf8');

/** Messages are strings on the wire; structured payloads are JSON round-tripped for convenience. */
const encodeMessage = (message: unknown): string =>
	b64encode(typeof message === 'string' ? message : JSON.stringify(message));

const decodeMessage = (message: string): unknown => {
	const text = b64decode(message);
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

// --- Client → gateway (encode) ---------------------------------------------

export interface ConnectInput {
	userId: string;
	cookie: string;
	metadata?: Record<string, string>;
	opId: number;
}

export interface SendMessageInput {
	queueName: string;
	mountName: string;
	message: unknown;
	opId: number;
}

export interface StateChangeInput {
	queueName: string;
	mountName: string;
	/** `key -> value`; an empty-string value clears the key. */
	delta: Record<string, string>;
}

export interface QueueSubscription {
	name: string;
	opId: number;
}

export interface SubscribeInput {
	subscriptions: QueueSubscription[];
}

export interface EncodeInputMap {
	msg_c2g_connect: ConnectInput;
	msg_c2g_send_message: SendMessageInput;
	msg_c2g_state_change: StateChangeInput;
	msg_c2g_subscribe: SubscribeInput;
	msg_c2g_unsubscribe: SubscribeInput;
	msg_c2g_open_floodgates: void;
	msg_c2g_ping: void;
}

export type ClientMessage = keyof EncodeInputMap;

const stateProperties = (delta: Record<string, string>) =>
	Object.entries(delta).map(([key, value]) => ({ record: 'state_property', key, value: b64encode(value) }));

const queuesWithResults = (subscriptions: QueueSubscription[]) =>
	subscriptions.map(({ name, opId }) => ({ record: 'subscription', name, op_id: opId }));

const encoders: { [K in ClientMessage]: (input: EncodeInputMap[K]) => Record<string, unknown> } = {
	msg_c2g_connect: (input) => ({
		record: 'msg_c2g_connect',
		user_id: input.userId,
		cookie: b64encode(input.cookie),
		metadata: Object.entries(input.metadata ?? {}).map(([key, value]) => ({
			record: 'metadata',
			key,
			value: b64encode(value),
		})),
		op_id: input.opId,
	}),
	msg_c2g_send_message: (input) => ({
		record: 'msg_c2g_send_message',
		queue: input.queueName,
		mount: input.mountName,
		message: encodeMessage(input.message),
		op_id: input.opId,
	}),
	msg_c2g_state_change: (input) => ({
		record: 'msg_c2g_state_change',
		queue: input.queueName,
		mount: input.mountName,
		properties: stateProperties(input.delta),
	}),
	msg_c2g_subscribe: (input) => ({
		record: 'msg_c2g_subscribe',
		queues_with_results: queuesWithResults(input.subscriptions),
	}),
	msg_c2g_unsubscribe: (input) => ({
		record: 'msg_c2g_unsubscribe',
		queues_with_results: queuesWithResults(input.subscriptions),
	}),
	msg_c2g_open_floodgates: () => ({ record: 'msg_c2g_open_floodgates' }),
	msg_c2g_ping: () => ({ record: 'msg_c2g_ping' }),
};

/** Encode an outgoing message to the JSON string to send over the stream. */
export function encode<T extends ClientMessage>(
	record: T,
	...[input]: EncodeInputMap[T] extends void ? [] : [EncodeInputMap[T]]
): string {
	return JSON.stringify(encoders[record](input as EncodeInputMap[T]));
}

// --- Gateway → client (decode) ---------------------------------------------

export interface ResultMessage {
	opId: number;
	status: number;
	errorMessage?: string;
}

export interface QueueMembershipMessage {
	queueName: string;
	userId: string;
}

export interface CreateMountMessage {
	type: 'message' | 'state';
	queueName: string;
	mountName: string;
	state?: Record<string, string>;
}

export interface ReceivedMessage {
	queueName: string;
	mountName: string;
	userId: string;
	message: unknown;
	opId?: number;
}

export interface StateChangedMessage {
	queueName: string;
	mountName: string;
	userId: string;
	delta: Record<string, string>;
}

export type DecodedMessage =
	| { type: 'msg_g2c_result'; data: ResultMessage }
	| { type: 'msg_g2c_joined_queue'; data: QueueMembershipMessage }
	| { type: 'msg_g2c_left_queue'; data: QueueMembershipMessage }
	| { type: 'msg_g2c_create_mount'; data: CreateMountMessage }
	| { type: 'msg_g2c_send_message'; data: ReceivedMessage }
	| { type: 'msg_g2c_state_change'; data: StateChangedMessage }
	| { type: 'msg_g2c_pong'; data: Record<string, never> };

export type GatewayMessage = DecodedMessage['type'];

const MOUNT_TYPES: Record<number, 'message' | 'state'> = { 1: 'message', 2: 'state' };

/** Reduce an array of wire `state_property` records into a plain `key -> value` object. */
const propertyList = (properties: Array<{ key: string; value: string }>): Record<string, string> =>
	properties.reduce<Record<string, string>>((state, { key, value }) => {
		state[key] = b64decode(value);
		return state;
	}, {});

const decoders: { [M in DecodedMessage as M['type']]: (raw: any) => M['data'] } = {
	msg_g2c_result: (raw) => ({ opId: raw.op_id, status: raw.status, errorMessage: raw.error_message }),
	msg_g2c_joined_queue: (raw) => ({ queueName: raw.queue, userId: raw.user_id }),
	msg_g2c_left_queue: (raw) => ({ queueName: raw.queue, userId: raw.user_id }),
	msg_g2c_create_mount: (raw) => {
		const type = MOUNT_TYPES[raw.type];
		if (!type) {
			throw new ImqMessageUnknown(`Mount created of unknown type: ${raw.type}`);
		}
		return {
			type,
			queueName: raw.queue,
			mountName: raw.mount,
			...(type === 'state' ? { state: propertyList(raw.properties ?? []) } : {}),
		};
	},
	msg_g2c_send_message: (raw) => ({
		queueName: raw.queue,
		mountName: raw.mount,
		userId: b64decode(raw.user_id),
		message: decodeMessage(raw.message),
		opId: raw.op_id,
	}),
	msg_g2c_state_change: (raw) => ({
		queueName: raw.queue,
		mountName: raw.mount,
		userId: raw.user_id,
		delta: propertyList(raw.properties ?? []),
	}),
	msg_g2c_pong: () => ({}),
};

/** Decode a raw incoming frame (JSON string or Buffer) into a typed message. */
export function decode(raw: string | Buffer): DecodedMessage {
	const frame = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
	const record = frame?.record as GatewayMessage;
	const decoder = decoders[record];

	if (!decoder) {
		throw new ImqMessageUnknown(`Unable to parse "${record}" incoming message`);
	}

	return { type: record, data: decoder(frame) } as DecodedMessage;
}
