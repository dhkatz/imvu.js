/**
 * IMQ wire message types.
 *
 * The library's internal (camelCase) shapes for the frames exchanged with the
 * IMQ gateway. The `codec` module (`./codec.ts`) maps these to/from the wire format
 * (snake_case JSON, base64 payloads); these types are what the rest of the
 * library speaks.
 */

// --- Client → gateway (encode inputs) --------------------------------------

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

/** Maps each client record to the input `encode` expects. */
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

// --- Gateway → client (decoded outputs) ------------------------------------

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

/** A decoded incoming frame, discriminated on `type`. */
export type DecodedMessage =
	| { type: 'msg_g2c_result'; data: ResultMessage }
	| { type: 'msg_g2c_joined_queue'; data: QueueMembershipMessage }
	| { type: 'msg_g2c_left_queue'; data: QueueMembershipMessage }
	| { type: 'msg_g2c_create_mount'; data: CreateMountMessage }
	| { type: 'msg_g2c_send_message'; data: ReceivedMessage }
	| { type: 'msg_g2c_state_change'; data: StateChangedMessage }
	| { type: 'msg_g2c_pong'; data: Record<string, never> };

export type GatewayMessage = DecodedMessage['type'];
