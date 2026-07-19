import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

import { IMQStream } from './IMQStream.js';
import { IMQWebSocketStream } from './websocket/IMQWebSocketStream.js';
import { decode, encode, type ClientMessage, type DecodedMessage, type EncodeInputMap } from './Events.js';

export enum IMQConnectionState {
	CLOSED,
	CONNECTING,
	AUTHENTICATING,
	AUTHENTICATED,
	WAITING,
}

export interface IMQConnectionOptions {
	/** IMQ WebSocket URL, e.g. `wss://imq.imvu.com:444/streaming/imvu_pre`. */
	url: string;
	/** The user's legacy cid. */
	userId: string;
	/** The session/auth cookie ("sauce"). */
	sessionId: string;
	/** Arbitrary connect metadata (e.g. `{ app: 'imvu_next', platform_type: 'big' }`). */
	metadata?: Record<string, string>;
	/**
	 * Transport factory. Defaults to a `ws`-backed WebSocket stream. Override to
	 * supply a different transport — or a test double.
	 */
	createStream?: (url: string) => IMQStream;
	/** Monotonic op_id generator, shared with the manager. Defaults to an internal counter. */
	newOpId?: () => number;
	/** Ping keepalive interval, ms. Default 15_000. */
	pingInterval?: number;
	/** Disconnect if no server frame arrives within this window, ms. Default 60_000. */
	serverTimeoutInterval?: number;
	/** Reconnect backoff schedule, ms; the last value is reused once exhausted. Default [5s,15s,45s,90s,180s]. */
	reconnect?: readonly number[];
	/**
	 * Invoked before each reconnect attempt with the time since the last server
	 * frame. Return partial options to merge in (e.g. a refreshed `sessionId`).
	 */
	onReconnect?: (msSinceLastMessage: number) => Promise<Partial<IMQConnectionOptions> | void>;
}

/** `state` carries the new state and, for `WAITING`, the epoch ms at which the next attempt fires. */
interface IMQConnectionEvents {
	state: [state: IMQConnectionState, reconnectAt?: number];
	message: [message: DecodedMessage];
}

const DEFAULT_PING_INTERVAL = 15_000;
const DEFAULT_SERVER_TIMEOUT = 60_000;
const DEFAULT_RECONNECT: readonly number[] = [5_000, 15_000, 45_000, 90_000, 180_000];

type Timer = ReturnType<typeof setTimeout>;

const counter = (): (() => number) => {
	let next = 0;
	return () => next++;
};

/**
 * The IMQ connection state machine: opens a transport, performs the
 * connect/authenticate handshake, keeps the link alive with pings and a server
 * timeout, and reconnects with backoff. Unlike IMVU's original it drives a
 * single transport (no strategy rotation) — cleaner for a standalone library;
 * swap transports via {@link IMQConnectionOptions.createStream}.
 */
export class IMQConnection extends EventEmitter<IMQConnectionEvents> {
	private state = IMQConnectionState.CLOSED;
	private stream?: IMQStream;
	private reconnectIndex = 0;
	private lastMessageTime = 0;

	private reconnectTimer?: Timer;
	private pingTimer?: Timer;
	private serverTimeoutTimer?: Timer;

	private readonly createStream: (url: string) => IMQStream;
	private readonly newOpId: () => number;
	private readonly pingInterval: number;
	private readonly serverTimeoutInterval: number;
	private readonly reconnectSchedule: readonly number[];

	public constructor(private options: IMQConnectionOptions) {
		super();

		this.createStream = options.createStream ?? ((url) => new IMQWebSocketStream(new WebSocket(url)));
		this.newOpId = options.newOpId ?? counter();
		this.pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
		this.serverTimeoutInterval = options.serverTimeoutInterval ?? DEFAULT_SERVER_TIMEOUT;
		this.reconnectSchedule = options.reconnect ?? DEFAULT_RECONNECT;
	}

	public get status(): IMQConnectionState {
		return this.state;
	}

	public connect(): void {
		if (this.state !== IMQConnectionState.CLOSED && this.state !== IMQConnectionState.WAITING) {
			return; // already connecting/connected
		}

		this.clearReconnectTimer();
		this.setState(IMQConnectionState.CONNECTING);

		this.stream = this.createStream(this.options.url);
		this.stream.on('open', this.handleOpen);
		this.stream.on('message', this.handleMessage);
		this.stream.on('error', this.handleError);
		this.stream.on('close', this.handleClose);

		this.scheduleServerTimeout();
	}

	public close(): void {
		this.reconnectIndex = 0;
		this.disconnect();
		this.setState(IMQConnectionState.CLOSED);
	}

	/** Encode and send a client message, (re)scheduling the ping keepalive. */
	public send<T extends ClientMessage>(
		record: T,
		...args: EncodeInputMap[T] extends void ? [] : [EncodeInputMap[T]]
	): void {
		this.schedulePing();
		this.stream?.send(encode(record, ...args));
	}

	private setState(state: IMQConnectionState, reconnectAt?: number): void {
		this.state = state;
		this.emit('state', state, reconnectAt);
	}

	private handleOpen = (): void => {
		this.setState(IMQConnectionState.AUTHENTICATING);
		// Sent directly (no ping schedule) until we're authenticated.
		this.stream?.send(
			encode('msg_c2g_connect', {
				userId: this.options.userId,
				cookie: this.options.sessionId,
				metadata: this.options.metadata,
				opId: this.newOpId(),
			})
		);
	};

	private handleMessage = (raw: string): void => {
		this.scheduleServerTimeout();
		this.lastMessageTime = Date.now();

		let message: DecodedMessage;
		try {
			message = decode(raw);
		} catch (error) {
			console.warn('IMQ: failed to decode frame', error);
			return;
		}

		if (this.state === IMQConnectionState.AUTHENTICATING) {
			this.handleAuthMessage(message);
			return;
		}

		// Pongs only exist to reset the server timeout (already done above).
		if (message.type !== 'msg_g2c_pong') {
			this.emit('message', message);
		}
	};

	private handleAuthMessage(message: DecodedMessage): void {
		if (message.type !== 'msg_g2c_result') {
			console.warn(`IMQ: unexpected message during authentication: ${message.type}`);
			this.onDisconnected();
			return;
		}

		if (message.data.status !== 0) {
			console.warn(`IMQ: authentication failed: ${message.data.errorMessage ?? 'unknown error'}`);
			this.onDisconnected();
			return;
		}

		this.send('msg_c2g_open_floodgates');
		this.reconnectIndex = 0;
		this.setState(IMQConnectionState.AUTHENTICATED);
	}

	private handleError = (error: Error): void => {
		console.warn('IMQ: stream error', error);
	};

	private handleClose = (): void => {
		this.onDisconnected();
	};

	private onDisconnected(): void {
		this.disconnect();
		this.reconnect();
	}

	private disconnect(): void {
		this.clearReconnectTimer();
		this.clearPingTimer();
		this.clearServerTimeout();

		if (this.stream) {
			this.stream.removeAllListeners();
			this.stream.close();
			this.stream = undefined;
		}
	}

	private reconnect(): void {
		const delay =
			this.reconnectSchedule[this.reconnectIndex] ?? this.reconnectSchedule[this.reconnectSchedule.length - 1];
		this.reconnectIndex = Math.min(this.reconnectIndex + 1, this.reconnectSchedule.length - 1);

		this.setState(IMQConnectionState.WAITING, Date.now() + delay);

		this.reconnectTimer = setTimeout(() => {
			void this.attemptReconnect();
		}, delay);
	}

	private async attemptReconnect(): Promise<void> {
		const override = await this.options.onReconnect?.(Date.now() - this.lastMessageTime);
		if (override) {
			this.options = { ...this.options, ...override };
		}
		this.connect();
	}

	private schedulePing(): void {
		this.clearPingTimer();
		this.pingTimer = setTimeout(() => this.send('msg_c2g_ping'), this.pingInterval);
	}

	private clearPingTimer(): void {
		if (this.pingTimer) {
			clearTimeout(this.pingTimer);
			this.pingTimer = undefined;
		}
	}

	private scheduleServerTimeout(): void {
		this.clearServerTimeout();
		this.serverTimeoutTimer = setTimeout(() => this.onServerTimeout(), this.serverTimeoutInterval);
	}

	private clearServerTimeout(): void {
		if (this.serverTimeoutTimer) {
			clearTimeout(this.serverTimeoutTimer);
			this.serverTimeoutTimer = undefined;
		}
	}

	private onServerTimeout(): void {
		console.warn(`IMQ: no server frame for ${this.serverTimeoutInterval / 1000}s, disconnecting`);
		this.onDisconnected();
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = undefined;
		}
	}
}
