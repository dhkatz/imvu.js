import { IMQConnectionStrategy } from '../IMQConnectionStrategy';
import { IMQWebSocketStream } from './IMQWebSocketStream';

export class IMQWebSocketConnectionStrategy extends IMQConnectionStrategy {
  private readonly socketFactory: any;

  public constructor(config: Record<string, unknown>) {
    super(config);

    this.socketFactory = config.socketFactory || window.WebSocket;
  }

  connect() {
    return new IMQWebSocketStream(new this.socketFactory(this.config.url));
  }
}
