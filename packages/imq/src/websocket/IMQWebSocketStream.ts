import WebSocket, { type RawData } from 'ws';

import { IMQStream, IMQStreamState } from '../IMQStream.js';

/** {@link IMQStream} backed by a `ws` WebSocket. */
export class IMQWebSocketStream extends IMQStream {
	public constructor(private socket: WebSocket) {
		super();
		this.addListeners();
	}

	public send(data: string): void {
		this.socket.send(data);
	}

	public close(): void {
		if (this.state === IMQStreamState.CONNECTING || this.state === IMQStreamState.OPEN) {
			this.state = IMQStreamState.CLOSING;
			this.socket.close();
		}
	}

	private addListeners(): void {
		this.socket.on('open', this.onOpen);
		this.socket.on('message', this.onMessage);
		this.socket.on('error', this.onError);
		this.socket.on('close', this.onClose);
	}

	private removeListeners(): void {
		this.socket.off('open', this.onOpen);
		this.socket.off('message', this.onMessage);
		this.socket.off('error', this.onError);
		this.socket.off('close', this.onClose);
	}

	private onOpen = (): void => {
		this.state = IMQStreamState.OPEN;
		this.emit('open');
	};

	private onMessage = (data: RawData): void => {
		// `ws` may hand us a Buffer, an ArrayBuffer, or a Buffer[] — normalize to a UTF-8 string.
		let buffer: Buffer;
		if (Array.isArray(data)) {
			buffer = Buffer.concat(data);
		} else if (Buffer.isBuffer(data)) {
			buffer = data;
		} else {
			buffer = Buffer.from(data);
		}
		this.emit('message', buffer.toString('utf8'));
	};

	private onError = (error: Error): void => {
		this.emit('error', error);
	};

	private onClose = (): void => {
		this.state = IMQStreamState.CLOSED;
		this.removeListeners();
		this.emit('close');
	};
}
