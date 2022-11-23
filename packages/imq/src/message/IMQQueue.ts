import { EventEmitter } from 'events';

import { IMQMessageMount } from './IMQMessageMount';
import { IMQStateMount } from './IMQStateMount';
import { IMQManager } from '../IMQManager';

export class IMQQueue extends EventEmitter {
	public subscribers: Record<string, Set<(data: any) => void>> = {};

	public messageMounts: Map<string, IMQMessageMount> = new Map();
	public stateMounts: Map<string, IMQStateMount> = new Map();

	public constructor(private manager: IMQManager, public readonly name: string) {
		super();
	}

	public initMessageMount(name: string): void {
		this.getOrCreateMessageMount(name);
	}

	public initStateMount(name: string, b: any): void {
		this.getOrCreateStateMount(name).reset(b);
	}

	private getOrCreateMessageMount(name: string): IMQMessageMount {
		if (!this.messageMounts.has(name)) {
			this.messageMounts.set(name, new IMQMessageMount(this, name));
		}

		return this.messageMounts.get(name) as IMQMessageMount;
	}

	private getOrCreateStateMount(name: string): IMQStateMount {
		if (!this.stateMounts.has(name)) {
			this.stateMounts.set(name, new IMQStateMount(this, name));
		}

		return this.stateMounts.get(name) as IMQStateMount;
	}

	public getMessageMount(name: string): IMQMessageMount {
		return this.getOrCreateMessageMount(name);
	}

	public getStateMount(name: string): IMQStateMount {
		return this.getOrCreateStateMount(name);
	}

	public dispatchSubscriberUpdate(a: any): void {
		if (a.action === 'joined') {
			this.subscribers[a.userId] = new Set();
		} else if (a.action === 'left') {
			delete this.subscribers[a.userId];
		}

		this.messageMounts.forEach((mount) => {
			mount.handleSubscriberUpdate(a, this.subscribers);
		});

		this.stateMounts.forEach((mount) => {
			mount.handleSubscriberUpdate(a, this.subscribers);
		});
	}

	public dispatchMessage(name: string, message: any, c?: any): void {
		this.getMessageMount(name).handleMessage(message);
	}

	public dispatchState(name: string, state: any): void {
		this.getStateMount(name).handleStateChange(state);
	}

	public sendMessage(a: any, b: any, c: any): void {
		this.manager.sendMessage(this.name, a, b, c);
	}

	public sendStateChange(a: any, b: any, c: any): void {
		this.manager.sendStateChange(this.name, a, b, c);
	}

	public unsubscribe(name: string): void {
		if (this.messageMounts.has(name)) {
			this.messageMounts.get(name)?.removeAllListeners();

			this.messageMounts.delete(name);
		}

		if (this.stateMounts.has(name)) {
			this.stateMounts.get(name)?.removeAllListeners();

			this.stateMounts.delete(name);
		}

		if (this.messageMounts.size === 0 && this.stateMounts.size === 0) {
			this.manager.unsubscribeQueue(this.name, (err) => {
				if (err) {
					if (err !== 'Cannot send data: Not authenticated!') {
						console.error('Error unsubscribing from queue', this.name, ':', err);
					} else {
						console.error('error unsubbing while disconnected', err, 'for queue', this.name);
					}
				}
			});
		}
	}
}
