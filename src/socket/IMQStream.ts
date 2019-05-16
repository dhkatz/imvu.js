import { EventEmitter } from 'events';
import { format } from 'util';

import WebSocket from 'ws';

import { Client } from '../IMVU';
import { ClientEvent, GatewayEvent, encode, decode } from '../socket';
import { ResultEvent, JoinedQueueEvent, SentMessageEvent } from './Gateway';

export enum IMQState {
  CLOSED,
  CONNECTING,
  AUTHENTICATING,
  AUTHENTICATED,
  WAITING
}

export interface IMQStream extends EventEmitter {
  on(event: 'authenticated', listener: () => void): this;
  on(event: 'message', listener: (message: GatewayEvent) => void): this;
  on(event: 'result', listener: (message: ResultEvent) => void): this;
  on(event: 'joined_queue', listener: (message: JoinedQueueEvent) => void): this;
  on(event: 'send_message', listener: (message: SentMessageEvent) => void): this;
}

export class IMQStream extends EventEmitter {
  public socket: WebSocket;
  public client: Client;
  public heartbeat: NodeJS.Timeout;

  public _state: IMQState;

  public constructor(client: Client) {
    super();

    this.state = IMQState.CONNECTING;

    this.client = client;
    this.socket = new WebSocket('wss://imq.imvu.com:444/streaming/imvu_pre');

    this.initialize();
  }

  public initialize(): void {
    this.socket.on('open', () => {
      const metadata = { app: 'imvu_next', platform_type: 'big' };
      const user_id = String(this.client.user.id);
      const cookie: string = this.client.cookies.toJSON().cookies.find((value) => String(value.key).toLowerCase() === 'oscsid').value;
  
      this.state = IMQState.AUTHENTICATING;
      this.send({
        record: 'msg_c2g_connect',
        user_id,
        cookie,
        metadata
      });
    });

    this.socket.on('message', (data: WebSocket.Data) => {
      const message = decode(JSON.parse(data.toString()) as GatewayEvent);
  
      if (this.state === IMQState.AUTHENTICATING) {
        if (message.record === 'msg_g2c_result') {
          if (message.status === 0) {
            this.state = IMQState.AUTHENTICATED;
            this.emit('authenticated');
          } else {
            console.error(`Failed to authenticate wih IMQ server: ${message.error}`);
          }
        } else {
          console.warn(`Unexpected message type during authentication: ${message.record}`);
        }
      } else if (message.record !== 'msg_g2c_pong') {
        this.emit('message', message);
        this.emit(message.record.replace('msg_g2c_', ''), message);
      }
    });

    this.socket.on('close', (code: number, reason: string) => {
      clearInterval(this.heartbeat);

      if (this.socket !== null) {
        this.socket.removeAllListeners();
        this.socket.close();
        this.socket = null;
      }
  
      this.emit('close', code, reason);
    });

    this.on('authenticated', () => {
      this.heartbeat = setInterval(() => { 
        this.send({ record: 'msg_c2g_ping' });
      }, 15000)

      this.send({ record: 'msg_c2g_open_floodgates' });

      [
        'inv:/user/user-%d',
        'private:/user/user-%d',
        '/user/%d',
        'inv:/profile/%d',
      ].forEach((queue: string) => this.send({ record: 'msg_c2g_subscribe', queues: [format(queue, this.client.user.id)] }));
    });

  }

  public get state(): IMQState {
    return this._state;
  }

  public set state(state: IMQState) {
    this._state = state;
    this.emit('state', this._state);
  }

  public encode(data: ClientEvent): string {;
    return JSON.stringify([encode(data)]);
  }

  public decode(message: string) {
    return decodeURIComponent(global.escape(atob(message)));
  }

  public send(data: ClientEvent): void {
    this.socket.send(this.encode(data));
  }

  public close() {
    console.log('Disconnecting from IMQ');
    this.state = IMQState.CLOSED;
    this.emit('close');
    this.removeAllListeners();
  }
}
