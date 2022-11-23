import { IMQStream, IMQStreamState } from '../IMQStream';
import WebSocket from 'ws';

export class IMQWebSocketStream extends IMQStream {
	private socket: WebSocket | null = null;

	public constructor(socket: WebSocket) {
		super({});

		this.socket = socket;

		this.addListeners();
	}

	public send(event: any) {
		this.socket?.send(event);
	}

	public close() {
		if (this.state === IMQStreamState.CONNECTING || this.state === IMQStreamState.OPEN) {
			this.state = IMQStreamState.CLOSING;
			this.socket?.close();
		}
	}

	private addListeners() {
		this.socket?.on('open', this.onOpen);
		this.socket?.on('close', this.onClose);
		this.socket?.on('error', this.onError);
		this.socket?.on('message', this.onMessage);
	}

	private removeListeners() {
		this.socket?.removeListener('open', this.onOpen);
		this.socket?.removeListener('close', this.onClose);
		this.socket?.removeListener('error', this.onError);
		this.socket?.removeListener('message', this.onMessage);
		this.socket = null;
	}

	private onOpen = () => {
		this.state = IMQStreamState.OPEN;
		this.emit('open', this.socket);
	};

	private onMessage = () => {
		this.emit('message', this.socket);
	};

	private onError = () => {
		this.emit('error', this.socket);
	};

	private onClose = () => {
		this.state = IMQStreamState.CLOSED;
		this.removeListeners();
		this.emit('close', this.socket);
	};
}
