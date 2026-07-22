import { EventEmitter } from 'node:events';

import type { ReceivedMessage } from '../messages.js';
import type { IMQQueue, SubscriberUpdate } from './IMQQueue.js';

export interface IMQMessage {
	userId: string;
	queueName: string;
	mountName: string;
	message: unknown;
	opId?: number;
}

export interface IMQSubscriberEvent {
	userId: string;
	action: 'joined' | 'left';
	queueName: string;
	mountName: string;
	subscribers: string[];
}

interface IMQMessageMountEvents {
	message: [message: IMQMessage];
	subscriber: [event: IMQSubscriberEvent];
}

/** A message mount: emits `message` for each incoming message on the mount. */
export class IMQMessageMount extends EventEmitter<IMQMessageMountEvents> {
	public constructor(
		private readonly queue: IMQQueue,
		public readonly name: string
	) {
		super();
	}

	/** Emit (and return, so the queue can re-emit at queue level) the message event. */
	public handleMessage(data: ReceivedMessage): IMQMessage {
		const event: IMQMessage = {
			userId: data.userId,
			queueName: this.queue.name,
			mountName: this.name,
			message: data.message,
			opId: data.opId,
		};
		this.emit('message', event);
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

	public send(message: unknown, callback?: (errorMessage?: string) => void): void {
		this.queue.sendMessage(this.name, message, callback);
	}

	public unsubscribe(): void {
		this.queue.unsubscribe(this.name);
	}
}
