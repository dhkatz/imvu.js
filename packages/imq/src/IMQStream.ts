import { EventEmitter } from 'events';
import WebSocket from 'ws';

import { IMQManager } from './IMQManager';
import { GatewayEvent, ClientEvent, encode, decode } from './Events';

export enum Status {
  CLOSED,
  CONNECTING,
  AUTHENTICATING,
  AUTHENTICATED,
  WAITING,
}

/* eslint-disable */
export interface IMQStream extends EventEmitter {
  on(event: 'close', listener: (event: CloseEvent) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'status', listener: (status: Status) => void): this;
  on(event: 'message', listener: (message: GatewayEvent) => void): this;
}

/**
 * Represents an IMQ WebSocket connection
 */
export class IMQStream extends EventEmitter {
  public pings: [number, number, number];
  public connection: WebSocket | null = null;
  public status: Status;

  private state: { heartbeat: NodeJS.Timeout; last: number; acknowledged: boolean };

  public constructor(public manager: IMQManager, public id: number = 0) {
    super();

    this.state = {} as any;
    this.pings = [] as any;
    this.status = Status.CLOSED;
  }

  public get authenticated(): boolean {
    return this.status === Status.AUTHENTICATED;
  }

  public destroy(): void {
    this.close();
  }

  public get ping(): number {
    return this.pings.reduce((a, b) => a + b, 0) / this.pings.length;
  }

  /**
   * Connects the IMQStream to the gateway.
   * @internal
   * @returns {Promise<void>} A promise that will resolve when the IMQStream becomes ready,
   * or reject if it fails to connect
   */
  public async connect(): Promise<void> {
    const { gateway } = this.manager;

    if (this.status === Status.AUTHENTICATED && this.connection && this.connection.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    this.status = Status.CONNECTING;

    /* eslint-disable */
    return new Promise((resolve, reject) => {
      const onReady = (): void => {
        this.off('close', onClose);
        this.off('error', onError);

        this.send({ record: 'msg_c2g_open_floodgates' });

        resolve();
      };

      const onClose = (event: CloseEvent): void => {
        this.off('ready', onReady);
        this.off('error', onError);

        reject(event);
      };

      const onError = (): void => {
        this.off('ready', onReady);
        this.off('close', onClose);

        reject();
      };

      this.once('ready', onReady);
      this.once('close', onClose);
      this.once('error', onError);

      const ws = this.connection = new WebSocket(gateway);

      ws.onopen = this.onOpen.bind(this);
      ws.onmessage = this.onMessage.bind(this);
      ws.onerror = this.onError.bind(this);
      ws.onclose = this.onClose.bind(this);
    });
  }

  /**
   * Close the IMQStream and its underlying socket connection.
   * @param {number} [code=1000] The close code to send to the gateway if open
   */
  public close(code: number = 1000): void {
    console.log('Disconnecting from IMQ');

    if (this.connection && this.connection.readyState !== WebSocket.CLOSED) {
      this.connection.close(code);
    } else {
      /**
       * Emitted when an IMQStream is destroyed, but no WebSocket connection was open.
       * @private
       * @event IMQStream#close
       */
      this.emit('close', { code });
    }

    this.connection = null;
    this.status = Status.CLOSED;
  }

  public send(data: ClientEvent): void {
    if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
      return;
    }

    this.connection.send(IMQStream.encode(data), (err: Error | undefined) => {
      if (err) this.emit('error', err, this.id);
    });
  }

  public heartbeat(): void {
    this.state.last = Date.now();
    this.state.acknowledged = false;
    this.send({ record: 'msg_c2g_ping' });
  }

  private static encode(data: ClientEvent): string {
    return JSON.stringify([encode(data.record, data)]);
  }

  private static decode(message: string): string {
    return decodeURIComponent(global.escape(atob(message)));
  }

  /**
   * Called whenever a connection is opened to the gateway.
   * @internal
   */
  private onOpen(): void {
    this.status = Status.AUTHENTICATING;

    const metadata = { app: 'imvu_next', platform_type: 'big' };
    const user_id = String(this.manager.client.account.id);
    const cookie: string | undefined = this.manager.client.cookies
      .toJSON()
      .cookies
      .find((value) => String(value.key).toLowerCase() === 'oscsid')?.value;

    if (!cookie) {
      throw new Error('Could not find oscsid cookie');
    }

    this.send({
      record: 'msg_c2g_connect',
      user_id,
      cookie,
      metadata
    });
  }

  /**
   * Called whenever the client receives a WebSocket message.
   * @internal
   * @param {WebSocket.Data} data The message data received
   */
  private onMessage(data: WebSocket.MessageEvent): void {
    const event = JSON.parse((data as any )['data']) as GatewayEvent
    const message = decode(event.record, event);

    if (this.status === Status.CONNECTING) {
      if (message.record === 'msg_g2c_result') {
        if (!message.error) {
          console.log('IMQ authenticated');

          this.status = Status.AUTHENTICATED;
          this.emit('ready');

          this.heartbeat();
          this.state.heartbeat = this.manager.client.setInterval(() => {
            if (!this.state.acknowledged) {
              return this.destroy();
            }

            this.heartbeat();
          }, 15000);
        } else {
          this.emit('error', new Error(`Failed to authenticate wih IMQ server: ${message.error}`), this.id);
          return this.destroy();
        }
      } else {
        console.warn(`Unexpected message type during authentication: ${message.record}`);
      }
    } else if (message.record !== 'msg_g2c_pong') {
      this.emit('message', message, this.id);
      this.emit(message.record.replace('msg_g2c_', ''), message, this.id);
    } else {
      this.state.acknowledged = true;
      this.pings.unshift(Date.now() - this.state.last);
      if (this.pings.length > 3) this.pings = this.pings.slice(0, 3) as any;
    }
  }

  /**
   * @external CloseEvent
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent}
   */

  /**
   * @external ErrorEvent
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/ErrorEvent}
   */

  /**
   * Called whenever an error occurs with the WebSocket.
   * @param {ErrorEvent|Object} event The error that occured
   * @internal
   */
  private onError(event?: WebSocket.ErrorEvent): void {
    if (!event) return;

    console.error(event.message);

    /**
     * Emitted when an IMQStream's WebSocket errors.
     * @event Client#socketError
     * @param {ErrorEvent} error The encountered error
     * @param {number} id The IMQStream that encountered the error
     */
    this.manager.client.emit('stream_error', event, this.id);
  }

  /**
   * Called whenever the gateway connection to the WebSocket is closed.
   * @internal
   * @param {CloseEvent} event The close event received.
   */
  private onClose(event: WebSocket.CloseEvent): void {
    this.status = Status.CLOSED;
    this.manager.client.clearInterval(this.state.heartbeat);

    /**
     * Emitted when an IMQStream's WebSocket closes.
     * @private
     * @event IMQStream#close
     * @param {CloseEvent} event The received event
     */
    this.emit('close', event);
  }
}
