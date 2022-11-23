import { EventEmitter } from 'events';

export enum IMQStreamState {
	CONNECTING = 0,
	OPEN = 1,
	CLOSING = 2,
	CLOSED = 3,
}

export class IMQStream extends EventEmitter {
	protected state = IMQStreamState.CONNECTING;

	public constructor(public config: Record<string, unknown>) {
		super();
	}

	public send(data: any) {
		throw new Error('IMQStream send method must be overridden');
	}

	public close() {
		throw new Error('IMQStream close method must be overridden');
	}
}
