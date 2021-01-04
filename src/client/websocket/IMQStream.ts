import { EventEmitter } from 'events';
import { format } from 'util';

import WebSocket from 'ws';

import { Status, Subscriptions } from '@/util/Constants';
import { WebSocketManager } from '@/client';
import { GatewayEvent, ClientEvent, encode, decode, ResultEvent, JoinedQueueEvent, SentMessageEvent } from './Events';

/* eslint-disable */
export interface IMQStream extends EventEmitter {
  on(event: 'close', listener: (event: CloseEvent) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'message', listener: (message: GatewayEvent) => void): this;
  on(event: 'result', listener: (message: ResultEvent) => void): this;
  on(event: 'joined_queue', listener: (message: JoinedQueueEvent) => void): this;
  on(event: 'send_message', listener: (message: SentMessageEvent) => void): this;
}

/**
 * Represents an IMQ WebSocket connection
 */
export class IMQStream extends EventEmitter {
  public pings: [number, number, number];
  public connection: WebSocket;
  public status: Status;

  private state: { heartbeat: NodeJS.Timeout; last: number; acknowledged: boolean };

  public constructor(public manager: WebSocketManager, public id: number) {
    super();

    this.state = {} as any;
    this.pings = [] as any;
    this.status = Status.CONNECTING;
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

    if (this.status === Status.READY && this.connection && this.connection.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    /* eslint-disable */
    return new Promise((resolve, reject) => {
      const onReady = (): void => {
        this.off('close', onClose);
        this.off('error', onError);

        this.send({ record: 'msg_c2g_open_floodgates' });

        Subscriptions.forEach((queue: string) => {
          this.send({ record: 'msg_c2g_subscribe', queues: [format(queue, this.manager.client.user.id)] });
        });

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
    this.status = Status.DISCONNECTED;
  }

  public send(data: ClientEvent): void {
    if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
      return;
    }

    this.connection.send(IMQStream.encode(data), (err: Error) => {
      if (err) this.manager.client.emit('stream_error', err, this.id);
    });
  }

  public heartbeat(): void {
    this.state.last = Date.now();
    this.state.acknowledged = false;
    this.send({ record: 'msg_c2g_ping' });
  }

  private static encode(data: ClientEvent): string {
    return JSON.stringify([encode(data)]);
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
    const user_id = String(this.manager.client.user.id);
    const cookie: string = this.manager.client.cookies
      .toJSON()
      .cookies
      .find((value) => String(value.key).toLowerCase() === 'oscsid').value;

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
  private onMessage(data: WebSocket.Data): void {
    const message = decode(JSON.parse(data['data']) as GatewayEvent);

    if (message.record !== 'msg_g2c_pong') {
      this.manager.client.emit('raw', message, this.id);
    } else {
      this.state.acknowledged = true;
      this.pings.unshift(Date.now() - this.state.last);
      if (this.pings.length > 3) this.pings = this.pings.slice(0, 3) as any;
    }

    if (this.status === Status.AUTHENTICATING) {
      if (message.record === 'msg_g2c_result') {
        if (message.status === 0) {
          this.status = Status.READY;
          this.emit('ready');

          this.heartbeat();
          this.state.heartbeat = this.manager.client.setInterval(() => {
            if (!this.state.acknowledged) {
              return this.destroy();
            }

            this.heartbeat();
          }, 15000);
        } else {
          this.manager.client.emit('stream_error', new Error(`Failed to authenticate wih IMQ server: ${message.error}`), this.id);
          return this.destroy();
        }
      } else {
        console.warn(`Unexpected message type during authentication: ${message.record}`);
      }
    } else if (message.record !== 'msg_g2c_pong') {
      this.emit('message', message, this.id);
      this.emit(message.record.replace('msg_g2c_', ''), message, this.id);
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
  private onError(event?: ErrorEvent): void {
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
  private onClose(event: CloseEvent): void {
    this.status = Status.DISCONNECTED;
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
