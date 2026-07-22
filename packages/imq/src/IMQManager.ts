import { EventEmitter } from 'node:events';

import { IMQConnection, IMQConnectionState, type IMQConnectionOptions, type IMQLogger } from './IMQConnection.js';
import type { CreateMountMessage, DecodedMessage, ResultMessage } from './messages.js';
import { AUTH_ERROR, createCounter } from './util.js';
import { IMQQueue } from './message/IMQQueue.js';
import type { IMQMessageMount } from './message/IMQMessageMount.js';
import type { IMQStateMount } from './message/IMQStateMount.js';

export type IMQManagerOptions = IMQConnectionOptions;

export type IMQStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'unknown';

/** Fired for the result of a message/unsubscribe carrying an op_id. */
export type ResultCallback = (errorMessage?: string, result?: ResultMessage) => void;

/** `status` fires on every connection transition; `error` on stream/decode/auth failures. */
export interface IMQManagerEvents {
	status: [status: IMQStatus, connectAt?: number];
	error: [error: Error];
}

const STATUS: Record<IMQConnectionState, IMQStatus> = {
	[IMQConnectionState.CLOSED]: 'disconnected',
	[IMQConnectionState.CONNECTING]: 'connecting',
	[IMQConnectionState.AUTHENTICATING]: 'authenticating',
	[IMQConnectionState.AUTHENTICATED]: 'connected',
	[IMQConnectionState.WAITING]: 'disconnected',
};

/**
 * Top-level IMQ client: owns the connection, tracks subscribed queues, and
 * routes gateway messages to the right queue/mount. Emits `status`/`error`, so
 * lifecycle is observable without polling.
 *
 * ```ts
 * const manager = new IMQManager({ url, userId, sessionId });
 * manager.on('status', (s) => console.log('IMQ', s));
 * await manager.connect({ timeout: 10_000 });
 *
 * // Per-mount (when you know the mount name):
 * manager.subscribeMessage('queue', 'mount').on('message', (m) => console.log(m));
 *
 * // Or queue-level, to discover mounts as they appear:
 * manager.subscribe('queue').on('mount', (m) => console.log('new mount', m));
 * ```
 */
export class IMQManager extends EventEmitter<IMQManagerEvents> {
	public readonly queues = new Map<string, IMQQueue>();

	private readonly connection: IMQConnection;
	private readonly newOpId: () => number;
	private readonly logger: IMQLogger;
	private readonly opIdCallbacks = new Map<number, ResultCallback>();

	private currentStatus: IMQStatus = 'disconnected';
	private connectAt: number | undefined;

	public constructor(options: IMQManagerOptions) {
		super();

		this.logger = options.logger ?? console;
		// One shared op_id counter across the connect frame and manager sends.
		this.newOpId = options.newOpId ?? createCounter();
		this.connection = new IMQConnection({ ...options, newOpId: this.newOpId, logger: this.logger });

		this.connection.on('state', (state, reconnectAt) => this.onConnectionState(state, reconnectAt));
		this.connection.on('message', (message) => this.onMessage(message));
		this.connection.on('error', (error) => this.reportError(error));
	}

	public get status(): IMQStatus {
		return this.currentStatus;
	}

	public get state(): { status: IMQStatus; connectAt?: number } {
		return { status: this.currentStatus, connectAt: this.connectAt };
	}

	/**
	 * Open the connection (if needed) and resolve once authenticated. Pass
	 * `timeout` (ms) to reject instead of waiting forever when auth never lands.
	 */
	public connect({ timeout }: { timeout?: number } = {}): Promise<void> {
		if (this.connection.status === IMQConnectionState.AUTHENTICATED) {
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			let timer: ReturnType<typeof setTimeout> | undefined;

			const cleanup = (): void => {
				this.connection.off('state', onState);
				if (timer) {
					clearTimeout(timer);
				}
			};

			const onState = (state: IMQConnectionState): void => {
				if (state === IMQConnectionState.AUTHENTICATED) {
					cleanup();
					resolve();
				}
			};

			this.connection.on('state', onState);

			if (timeout !== undefined) {
				timer = setTimeout(() => {
					cleanup();
					reject(new Error(`IMQ connect timed out after ${timeout}ms`));
				}, timeout);
			}

			if (
				this.connection.status === IMQConnectionState.CLOSED ||
				this.connection.status === IMQConnectionState.WAITING
			) {
				this.connection.connect();
			}
		});
	}

	public close(): void {
		this.connection.close(); // emits the final CLOSED state before we stop listening
		this.connection.removeAllListeners();
		for (const queue of this.queues.values()) {
			queue.dispose();
		}
		this.queues.clear();
		this.opIdCallbacks.clear();
	}

	/** Subscribe to a queue and return it, so you can observe `mount`/`message`/`state`/`subscriber` events. */
	public subscribe(queueName: string): IMQQueue {
		return this.getOrSubscribeQueue(queueName);
	}

	/** Subscribe to a message mount; returns the mount to listen on. */
	public subscribeMessage(queueName: string, mountName: string): IMQMessageMount {
		return this.getOrSubscribeQueue(queueName).getMessageMount(mountName);
	}

	/** Subscribe to a state mount; returns the mount to listen on. */
	public subscribeState(queueName: string, mountName: string): IMQStateMount {
		return this.getOrSubscribeQueue(queueName).getStateMount(mountName);
	}

	public sendMessage(queueName: string, mountName: string, message: unknown, callback?: ResultCallback): void {
		if (this.connection.status !== IMQConnectionState.AUTHENTICATED) {
			callback?.(AUTH_ERROR);
			return;
		}

		const opId = this.newOpId();
		this.connection.send('msg_c2g_send_message', { queueName, mountName, message, opId });
		if (callback) {
			this.opIdCallbacks.set(opId, callback);
		}
	}

	/** State changes are fire-and-forget (no op_id result); `callback` only reports the not-authenticated case. */
	public sendStateChange(
		queueName: string,
		mountName: string,
		delta: Record<string, string>,
		callback?: ResultCallback
	): void {
		if (this.connection.status !== IMQConnectionState.AUTHENTICATED) {
			callback?.(AUTH_ERROR);
			return;
		}

		this.connection.send('msg_c2g_state_change', { queueName, mountName, delta });
	}

	public unsubscribeQueue(queueName: string, callback?: ResultCallback): void {
		this.queues.delete(queueName);

		if (this.connection.status !== IMQConnectionState.AUTHENTICATED) {
			callback?.(AUTH_ERROR);
			return;
		}

		const opId = this.newOpId();
		this.connection.send('msg_c2g_unsubscribe', { subscriptions: [{ name: queueName, opId }] });
		if (callback) {
			this.opIdCallbacks.set(opId, callback);
		}
	}

	private getOrSubscribeQueue(queueName: string): IMQQueue {
		const existing = this.queues.get(queueName);
		if (existing) {
			return existing;
		}

		const queue = new IMQQueue(this, queueName);
		this.queues.set(queueName, queue);

		if (this.connection.status === IMQConnectionState.AUTHENTICATED) {
			this.sendSubscribe(queueName);
		}
		// Otherwise it's (re)subscribed on the next AUTHENTICATED transition.

		return queue;
	}

	private sendSubscribe(queueName: string): void {
		this.connection.send('msg_c2g_subscribe', { subscriptions: [{ name: queueName, opId: this.newOpId() }] });
	}

	private reportError(error: Error): void {
		if (this.listenerCount('error') > 0) {
			this.emit('error', error);
		} else {
			this.logger.warn(error.message);
		}
	}

	private onConnectionState(state: IMQConnectionState, reconnectAt?: number): void {
		this.currentStatus = STATUS[state] ?? 'unknown';
		if (reconnectAt !== undefined) {
			this.connectAt = reconnectAt;
		}

		if (state === IMQConnectionState.AUTHENTICATED) {
			// (Re)subscribe every queue we care about — covers first connect and reconnects.
			for (const queueName of this.queues.keys()) {
				this.sendSubscribe(queueName);
			}
		}

		this.emit('status', this.currentStatus, this.connectAt);
	}

	private onMessage(message: DecodedMessage): void {
		switch (message.type) {
			case 'msg_g2c_result':
				this.onResult(message.data);
				break;
			case 'msg_g2c_joined_queue':
				this.getOrCreateQueue(message.data.queueName).dispatchSubscriberUpdate({
					userId: message.data.userId,
					action: 'joined',
				});
				break;
			case 'msg_g2c_left_queue':
				this.queues.get(message.data.queueName)?.dispatchSubscriberUpdate({
					userId: message.data.userId,
					action: 'left',
				});
				break;
			case 'msg_g2c_create_mount':
				this.onCreateMount(message.data);
				break;
			case 'msg_g2c_send_message':
				this.queues.get(message.data.queueName)?.dispatchMessage(message.data.mountName, message.data);
				break;
			case 'msg_g2c_state_change':
				this.queues.get(message.data.queueName)?.dispatchState(message.data.mountName, message.data);
				break;
		}
	}

	private onResult(data: ResultMessage): void {
		const callback = this.opIdCallbacks.get(data.opId);
		if (callback) {
			this.opIdCallbacks.delete(data.opId);
			callback(data.errorMessage, data);
		}
	}

	private onCreateMount(data: CreateMountMessage): void {
		const queue = this.getOrCreateQueue(data.queueName);
		if (data.type === 'message') {
			queue.initMessageMount(data.mountName);
		} else {
			queue.initStateMount(data.mountName, data.state ?? {});
		}
	}

	private getOrCreateQueue(queueName: string): IMQQueue {
		let queue = this.queues.get(queueName);
		if (!queue) {
			queue = new IMQQueue(this, queueName);
			this.queues.set(queueName, queue);
		}
		return queue;
	}
}
