import { EventEmitter } from 'events';
import { IMQQueue } from './IMQQueue';

export class IMQStateMount extends EventEmitter {
	private state: any = {};

	public constructor(private queue: IMQQueue, public readonly name: string) {
		super();
	}

	private applyDelta(initial: any, next: any) {
		for (const [key, value] of Object.entries(next)) {
			if (value === '') {
				delete initial[key];
			} else {
				initial[key] = value;
			}
		}

		return initial;
	}

	public reset(state: any) {
		this.state = state;

		this.emit('stateChange', {
			queue: this.queue.name,
			name: this.name,
			state: this.state,
		});
	}

	public handleStateChange(m: any) {
		this.state = this.applyDelta(this.state, m.delta);

		this.emit('stateChange', {
			user_id: m.user_id,
			queue: this.queue.name,
			mount: this.name,
			delta: m.delta,
			state: this.state,
		});
	}

	public handleSubscriberUpdate(a: any, b: any) {
		this.emit('subscriberUpdate', {
			user_id: a.userId,
			action: a.action,
			queue: this.queue.name,
			mount: this.name,
			subscribers: b,
		});
	}

	public unsubscribe() {
		this.queue.unsubscribe(this.name);
	}

	public get subscribers() {
		return this.queue.subscribers;
	}
}
