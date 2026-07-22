import { EventEmitter } from 'node:events';

import type { ReceivedMessage, StateChangedMessage } from '../messages.js';
import { AUTH_ERROR } from '../util.js';
import type { IMQManager } from '../IMQManager.js';
import { IMQMessageMount, type IMQMessage } from './IMQMessageMount.js';
import { IMQStateMount, type IMQStateEvent } from './IMQStateMount.js';

export interface SubscriberUpdate {
	userId: string;
	action: 'joined' | 'left';
}

/** A mount appearing on the queue (from a `create_mount` frame). */
export interface IMQMountEvent {
	queueName: string;
	mountName: string;
	mountType: 'message' | 'state';
	/** Initial state, for state mounts. */
	state?: Record<string, string>;
}

/** Queue-wide subscriber change (not tied to a single mount). */
export interface IMQQueueSubscriberEvent {
	queueName: string;
	userId: string;
	action: 'joined' | 'left';
	subscribers: string[];
}

/** Queue-level events — subscribe here to discover mounts as they're created. */
interface IMQQueueEvents {
	mount: [event: IMQMountEvent];
	message: [message: IMQMessage];
	state: [event: IMQStateEvent];
	subscriber: [event: IMQQueueSubscriberEvent];
}

/**
 * A subscribed queue. Owns its message/state mounts and the current subscriber
 * set, fans incoming gateway messages out to the relevant mount, and re-emits
 * everything at the queue level (so a consumer can discover mounts without
 * naming them up front).
 */
export class IMQQueue extends EventEmitter<IMQQueueEvents> {
	public readonly messageMounts = new Map<string, IMQMessageMount>();
	public readonly stateMounts = new Map<string, IMQStateMount>();

	private readonly currentSubscribers = new Set<string>();

	public constructor(
		private readonly manager: IMQManager,
		public readonly name: string
	) {
		super();
	}

	/** Current subscriber user ids. */
	public get subscribers(): string[] {
		return [...this.currentSubscribers];
	}

	public getMessageMount(name: string): IMQMessageMount {
		let mount = this.messageMounts.get(name);
		if (!mount) {
			mount = new IMQMessageMount(this, name);
			this.messageMounts.set(name, mount);
		}
		return mount;
	}

	public getStateMount(name: string): IMQStateMount {
		let mount = this.stateMounts.get(name);
		if (!mount) {
			mount = new IMQStateMount(this, name);
			this.stateMounts.set(name, mount);
		}
		return mount;
	}

	public initMessageMount(name: string): void {
		this.getMessageMount(name);
		this.emit('mount', { queueName: this.name, mountName: name, mountType: 'message' });
	}

	public initStateMount(name: string, state: Record<string, string>): void {
		const event = this.getStateMount(name).reset(state);
		this.emit('mount', { queueName: this.name, mountName: name, mountType: 'state', state: event.state });
	}

	public dispatchSubscriberUpdate(update: SubscriberUpdate): void {
		if (update.action === 'joined') {
			this.currentSubscribers.add(update.userId);
		} else {
			this.currentSubscribers.delete(update.userId);
		}

		const subscribers = [...this.currentSubscribers];
		this.emit('subscriber', { queueName: this.name, userId: update.userId, action: update.action, subscribers });

		for (const mount of this.messageMounts.values()) {
			mount.handleSubscriberUpdate(update, subscribers);
		}
		for (const mount of this.stateMounts.values()) {
			mount.handleSubscriberUpdate(update, subscribers);
		}
	}

	public dispatchMessage(mountName: string, data: ReceivedMessage): void {
		this.emit('message', this.getMessageMount(mountName).handleMessage(data));
	}

	public dispatchState(mountName: string, data: StateChangedMessage): void {
		this.emit('state', this.getStateMount(mountName).handleStateChange(data));
	}

	public sendMessage(mountName: string, message: unknown, callback?: (errorMessage?: string) => void): void {
		this.manager.sendMessage(this.name, mountName, message, callback);
	}

	public sendStateChange(
		mountName: string,
		delta: Record<string, string>,
		callback?: (errorMessage?: string) => void
	): void {
		this.manager.sendStateChange(this.name, mountName, delta, callback);
	}

	/** Drop a mount; when the last mount goes, unsubscribe the whole queue. */
	public unsubscribe(mountName: string): void {
		this.messageMounts.get(mountName)?.removeAllListeners();
		this.messageMounts.delete(mountName);

		this.stateMounts.get(mountName)?.removeAllListeners();
		this.stateMounts.delete(mountName);

		if (this.messageMounts.size === 0 && this.stateMounts.size === 0) {
			this.manager.unsubscribeQueue(this.name, (errorMessage) => {
				if (errorMessage && errorMessage !== AUTH_ERROR) {
					console.error(`IMQ: error unsubscribing from queue "${this.name}":`, errorMessage);
				}
			});
		}
	}

	/** Tear down all mounts + listeners (used on manager close). */
	public dispose(): void {
		for (const mount of this.messageMounts.values()) {
			mount.removeAllListeners();
		}
		for (const mount of this.stateMounts.values()) {
			mount.removeAllListeners();
		}
		this.messageMounts.clear();
		this.stateMounts.clear();
		this.currentSubscribers.clear();
		this.removeAllListeners();
	}
}
