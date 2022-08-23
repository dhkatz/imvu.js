import { IMQStream, IMQStreamState } from '../IMQStream.new';
import WebSocket from 'ws';

export class IMQWebSocketStream extends IMQStream {
  private state: IMQStreamState = IMQStreamState.CONNECTING;
  private socket: WebSocket | null = null;

  public constructor(socket: WebSocket) {
    super({});

    this.socket = socket;

    socket.on('open', () => {
      this.state = IMQStreamState.OPEN;
      this.emit('open');
    });

    socket.on('close', () => {
      this.state = IMQStreamState.CLOSED;
      this.socket?.removeAllListeners();
      this.socket = null;
      this.emit('close');
    });

    socket.on('message', (data: any) => {
      this.emit('message', data);
    });

    socket.on('error', (error: any) => {
      this.emit('error', error);
    });
  }

  public send() {
    this.socket?.send(null);
  }

  public close() {
    if (this.state === IMQStreamState.CONNECTING || this.state === IMQStreamState.OPEN) {
      this.state = IMQStreamState.CLOSING;
      this.socket?.close();
    }
  }
}
