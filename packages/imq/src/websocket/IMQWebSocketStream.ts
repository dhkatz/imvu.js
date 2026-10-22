import { IMQStream, IMQStreamState } from '../IMQStream.js';

const utf8 = new TextDecoder();

/**
 * {@link IMQStream} backed by a standard (WHATWG) `WebSocket` — the browser's, or
 * Node's built-in global (Node >= 22). IMQ authenticates inside the protocol, not
 * via handshake headers, so no Node-specific socket options are needed.
 */
export class IMQWebSocketStream extends IMQStream {
	public constructor(private socket: WebSocket) {
		super();
		// Binary frames arrive as ArrayBuffers (decoded synchronously) instead of Blobs.
		this.socket.binaryType = 'arraybuffer';
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
		this.socket.addEventListener('open', this.onOpen);
		this.socket.addEventListener('message', this.onMessage);
		this.socket.addEventListener('error', this.onError);
		this.socket.addEventListener('close', this.onClose);
	}

	private removeListeners(): void {
		this.socket.removeEventListener('open', this.onOpen);
		this.socket.removeEventListener('message', this.onMessage);
		this.socket.removeEventListener('error', this.onError);
		this.socket.removeEventListener('close', this.onClose);
	}

	private onOpen = (): void => {
		this.state = IMQStreamState.OPEN;
		this.emit('open');
	};

	private onMessage = (event: MessageEvent): void => {
		const data: unknown = event.data;
		this.emit('message', typeof data === 'string' ? data : utf8.decode(data as ArrayBuffer));
	};

	private onError = (event: Event): void => {
		// WebSocket error events carry no detail by design; surface a real Error.
		const message = 'message' in event && typeof event.message === 'string' ? event.message : 'WebSocket error';
		this.emit('error', new Error(message));
	};

	private onClose = (): void => {
		this.state = IMQStreamState.CLOSED;
		this.removeListeners();
		this.emit('close');
	};
}
