import { EventEmitter } from 'node:events';

import type { StateChangedMessage } from '../messages.js';
import type { IMQQueue, SubscriberUpdate } from './IMQQueue.js';
import type { IMQSubscriberEvent } from './IMQMessageMount.js';

export interface IMQStateEvent {
	userId?: string;
	queueName: string;
	mountName: string;
	delta?: Record<string, string>;
	state: Record<string, string>;
}

interface IMQStateMountEvents {
	state: [event: IMQStateEvent];
	subscriber: [event: IMQSubscriberEvent];
}

/** A state mount: tracks a `key -> value` map and emits `state` on every change. */
export class IMQStateMount extends EventEmitter<IMQStateMountEvents> {
	private state: Record<string, string> = {};

	public constructor(
		private readonly queue: IMQQueue,
		public readonly name: string
	) {
		super();
	}

	/** Replace the whole state (initial mount snapshot); returns the emitted event. */
	public reset(state: Record<string, string>): IMQStateEvent {
		this.state = { ...state };
		const event: IMQStateEvent = {
			queueName: this.queue.name,
			mountName: this.name,
			state: { ...this.state },
		};
		this.emit('state', event);
		return event;
	}

	/** Apply a delta and emit (and return) the resulting state event. */
	public handleStateChange(data: StateChangedMessage): IMQStateEvent {
		this.state = this.applyDelta(this.state, data.delta);
		const event: IMQStateEvent = {
			userId: data.userId,
			queueName: this.queue.name,
			mountName: this.name,
			delta: data.delta,
			state: { ...this.state },
		};
		this.emit('state', event);
		return event;
	}

	public handleSubscriberUpdate(update: SubscriberUpdate, subscribers: string[]): void {
		this.emit('subscriber', {
			userId: update.userId,
			action: update.action,
			queueName: this.queue.name,
			mountName: this.name,
			subscribers,
		});
	}

	public send(delta: Record<string, string>, callback?: (errorMessage?: string) => void): void {
		this.queue.sendStateChange(this.name, delta, callback);
	}

	public unsubscribe(): void {
		this.queue.unsubscribe(this.name);
	}

	/** An empty-string value clears the key; everything else is set. */
	private applyDelta(state: Record<string, string>, delta: Record<string, string>): Record<string, string> {
		const next = { ...state };
		for (const [key, value] of Object.entries(delta)) {
			if (value === '') {
				delete next[key];
			} else {
				next[key] = value;
			}
		}
		return next;
	}
}
