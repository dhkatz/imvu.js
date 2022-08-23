import { Status } from './IMQStream';
import { IMQConnectionStrategy } from './IMQConnectionStrategy';
import { IMQStream } from './IMQStream.new';
import { EventEmitter } from 'events';
import { MessageEvent } from 'ws';
import { IMQWebSocketConnectionStrategy } from './websocket/IMQWebSocketConnectionStrategy';
import { ClientEvent, EventNameToType } from './Events';

export class IMQConnection extends EventEmitter {
  #heartbeat?: ReturnType<typeof setTimeout>;
  #strategy: IMQConnectionStrategy;
  #stream?: IMQStream;

  public constructor(private config: Record<string, any>) {
    super();

    this.#strategy = new IMQWebSocketConnectionStrategy(config);
  }

  #state = Status.CLOSED;

  get status() {
    return this.#state;
  }

  private set status(state: Status) {
    this.#state = state;

    this.emit('state', state);
  }

  public async connect() {
    return this.#connect();
  }

  async #connect(): Promise<void> {
    if (this.status !== Status.WAITING && this.status !== Status.CLOSED) {
      return; // Already connected/connecting
    }

    this.status = Status.CONNECTING;

    console.log(`Connecting to IMQ via '${this.#strategy.url}' as user '${this.config.user}'`);

    return new Promise((resolve, reject) => {
      const onReady = (): void => {
        this.off('close', onClose);
        this.off('error', onError);

        resolve();
      };

      const onClose = (): void => {
        this.off('ready', onReady);
        this.off('error', onError);
      };

      const onError = (error: Error): void => {
        this.off('ready', onReady);
        this.off('close', onClose);

        reject(error);
      };

      if (this.#stream) {
        this.#stream.once('open', onReady);
        this.#stream.once('close', onClose);
        this.#stream.once('error', onError);
      }
    });
  }

  public send(a: any, b: any) {
    this.#send(a, b);
  }

  public close() {
    console.log('Disconnecting from IMQ');

    this.#disconnect();

    this.status = Status.CLOSED;
  }

  async #reconnect() {
    this.status = Status.WAITING;

    return this.#connect();
  }

  #message(message: MessageEvent) {
    const event = this.#strategy.decode(message.data);

    if (this.status === Status.AUTHENTICATING) {
      if (event.type === 'msg_g2c_result') {
        if (!event.data.error) {
          console.log('IMQ authenticated');

          this.#send('msg_c2g_open_floodgates', {});
        } else {
          console.log(`Failed to authenticate with IMQ: ${event.data.error}`);
        }
      } else {
        console.log(`unexpected message type during IMQ authentication: ${event.type}`);

        this.#disconnect();
      }
    } else if (event.type !== 'msg_g2c_pong') {
      this.emit('message', event);
    }
  }

  #disconnect() {
    if (this.#stream) {
      this.#stream.removeAllListeners();
      this.#stream.close();
      this.#stream = undefined;
    }
  }

  #send<T extends ClientEvent['record']>(
    record: T,
    event: Omit<EventNameToType<ClientEvent, 'record', T>, 'record'>
  ) {
    clearTimeout(this.#heartbeat as ReturnType<typeof setTimeout>);

    this.#heartbeat = setTimeout(() => {
      this.#ping();
    }, this.config.pingInterval);

    this.#stream?.send(this.#strategy.encode(record, event));
  }

  #ping() {
    this.#send('msg_c2g_ping', {});
  }
}
