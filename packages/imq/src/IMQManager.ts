import { IMQConnection, IMQConnectionState, type IMQConnectionOptions } from './IMQConnection.js';
import type { CreateMountMessage, DecodedMessage, ResultMessage } from './Events.js';
import { IMQQueue } from './message/IMQQueue.js';
import type { IMQMessageMount } from './message/IMQMessageMount.js';
import type { IMQStateMount } from './message/IMQStateMount.js';

export type IMQManagerOptions = IMQConnectionOptions;

export type IMQStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'unknown';

/** Fired for the result of a message/unsubscribe carrying an op_id. */
export type ResultCallback = (errorMessage?: string, result?: ResultMessage) => void;

const STATUS: Record<IMQConnectionState, IMQStatus> = {
	[IMQConnectionState.CLOSED]: 'disconnected',
	[IMQConnectionState.CONNECTING]: 'connecting',
	[IMQConnectionState.AUTHENTICATING]: 'authenticating',
	[IMQConnectionState.AUTHENTICATED]: 'connected',
	[IMQConnectionState.WAITING]: 'disconnected',
};

const AUTH_ERROR = 'Cannot send data: Not authenticated!';

/**
 * Top-level IMQ client: owns the connection, tracks subscribed queues, and
 * routes gateway messages to the right queue/mount. Subscribe to a mount and
 * listen for its events:
 *
 * ```ts
 * const manager = new IMQManager({ url, userId, sessionId });
 * await manager.connect();
 * manager.subscribeMessage('queue', 'mount').on('message', (m) => console.log(m));
 * ```
 */
export class IMQManager {
	public readonly queues = new Map<string, IMQQueue>();

	private readonly connection: IMQConnection;
	private readonly newOpId: () => number;
	private readonly opIdCallbacks = new Map<number, ResultCallback>();

	private status: IMQStatus = 'disconnected';
	private connectAt: number | undefined;

	public constructor(options: IMQManagerOptions) {
		// One shared op_id counter across the connect frame and manager sends.
		this.newOpId = options.newOpId ?? counter();
		this.connection = new IMQConnection({ ...options, newOpId: this.newOpId });

		this.connection.on('state', (state, reconnectAt) => this.onConnectionState(state, reconnectAt));
		this.connection.on('message', (message) => this.onMessage(message));
	}

	public get state(): { status: IMQStatus; connectAt?: number } {
		return { status: this.status, connectAt: this.connectAt };
	}

	/** Open the connection (if needed) and resolve once authenticated. */
	public connect(): Promise<void> {
		if (this.connection.status === IMQConnectionState.AUTHENTICATED) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			const onState = (state: IMQConnectionState): void => {
				if (state === IMQConnectionState.AUTHENTICATED) {
					this.connection.off('state', onState);
					resolve();
				}
			};

			this.connection.on('state', onState);

			if (
				this.connection.status === IMQConnectionState.CLOSED ||
				this.connection.status === IMQConnectionState.WAITING
			) {
				this.connection.connect();
			}
		});
	}

	public close(): void {
		this.connection.close();
		for (const queue of this.queues.values()) {
			queue.dispose();
		}
		this.queues.clear();
		this.opIdCallbacks.clear();
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

	private onConnectionState(state: IMQConnectionState, reconnectAt?: number): void {
		this.status = STATUS[state] ?? 'unknown';
		if (reconnectAt !== undefined) {
			this.connectAt = reconnectAt;
		}

		if (state === IMQConnectionState.AUTHENTICATED) {
			// (Re)subscribe every queue we care about — covers first connect and reconnects.
			for (const queueName of this.queues.keys()) {
				this.sendSubscribe(queueName);
			}
		}
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

const counter = (): (() => number) => {
	let next = 0;
	return () => next++;
};
