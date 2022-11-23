import { EventEmitter } from 'events';
import { IMQQueue } from './IMQQueue';

export class IMQMessageMount extends EventEmitter {
	public constructor(private queue: IMQQueue, private name: string) {
		super();
	}

	public handleMessage(m: any) {
		this.emit('message', {
			user_id: m.user_id,
			queue: this.queue.name,
			mount: this.name,
			op_id: m.op_id,
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

	public sendMessage(a: any, b: any) {
		this.queue.sendMessage(this.name, a, b);
	}

	public unsubscribe() {
		this.queue.unsubscribe(this.name);
	}

	public get subscribers() {
		return this.queue.subscribers;
	}
}
