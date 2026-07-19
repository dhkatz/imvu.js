import { EventEmitter } from 'node:events';

export enum IMQStreamState {
	CONNECTING = 0,
	OPEN = 1,
	CLOSING = 2,
	CLOSED = 3,
}

/** Events an {@link IMQStream} emits to its {@link IMQConnection}. */
export interface IMQStreamEvents {
	open: [];
	message: [data: string];
	error: [error: Error];
	close: [];
}

/**
 * A bidirectional transport for IMQ frames. Concrete streams (e.g. WebSocket)
 * extend this and translate their native events into {@link IMQStreamEvents}.
 * Kept abstract so the connection can be driven by any transport — real or a
 * test double.
 */
export abstract class IMQStream extends EventEmitter<IMQStreamEvents> {
	protected state = IMQStreamState.CONNECTING;

	public abstract send(data: string): void;
	public abstract close(): void;
}
