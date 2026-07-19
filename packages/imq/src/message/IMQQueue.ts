import type { ReceivedMessage, StateChangedMessage } from '../Events.js';
import type { IMQManager } from '../IMQManager.js';
import { IMQMessageMount } from './IMQMessageMount.js';
import { IMQStateMount } from './IMQStateMount.js';

export interface SubscriberUpdate {
	userId: string;
	action: 'joined' | 'left';
}

const AUTH_ERROR = 'Cannot send data: Not authenticated!';

/**
 * A subscribed queue. Owns its message/state mounts and the current subscriber
 * set, and fans incoming gateway messages out to the relevant mount.
 */
export class IMQQueue {
	public readonly messageMounts = new Map<string, IMQMessageMount>();
	public readonly stateMounts = new Map<string, IMQStateMount>();

	private readonly subscribers = new Set<string>();

	public constructor(
		private readonly manager: IMQManager,
		public readonly name: string
	) {}

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
	}

	public initStateMount(name: string, state: Record<string, string>): void {
		this.getStateMount(name).reset(state);
	}

	public dispatchSubscriberUpdate(update: SubscriberUpdate): void {
		if (update.action === 'joined') {
			this.subscribers.add(update.userId);
		} else {
			this.subscribers.delete(update.userId);
		}

		const subscribers = [...this.subscribers];
		for (const mount of this.messageMounts.values()) {
			mount.handleSubscriberUpdate(update, subscribers);
		}
		for (const mount of this.stateMounts.values()) {
			mount.handleSubscriberUpdate(update, subscribers);
		}
	}

	public dispatchMessage(mountName: string, data: ReceivedMessage): void {
		this.getMessageMount(mountName).handleMessage(data);
	}

	public dispatchState(mountName: string, data: StateChangedMessage): void {
		this.getStateMount(mountName).handleStateChange(data);
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

	/** Tear down all mounts (used on manager close). */
	public dispose(): void {
		for (const mount of this.messageMounts.values()) {
			mount.removeAllListeners();
		}
		for (const mount of this.stateMounts.values()) {
			mount.removeAllListeners();
		}
		this.messageMounts.clear();
		this.stateMounts.clear();
		this.subscribers.clear();
	}
}
