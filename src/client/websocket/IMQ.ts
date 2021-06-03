import {EventEmitter} from "events";

import WebSocket from 'ws';
import Timer = NodeJS.Timer;
import * as crypto from "crypto";
import Timeout = NodeJS.Timeout;

interface IMQFrame {
  data: Array<{ data: any[]; v: any; record: string; type: number }>;
  record: string;
  ack: number;
  session_id: string;
  seq: number;
}

interface IMQRequest {
  seq: number;
  data: any;
  xhr: XMLHttpRequest | null;
  retry: Timeout;
  url: any;
}

enum State {
  CLOSED,
  CONNECTING,
  AUTHENTICATING,
  AUTHENTICATED,
  WAITING
}

enum Status {
  CONNECTING,
  OPEN,
  CLOSING,
  CLOSED
}

abstract class IMQConnectionStrategy {
  public url: string;

  public abstract connect(): IMQStream;

  public abstract encode(event: string, data: any): string;
  public abstract decode(event: string, data: any): string;
}

abstract class IMQStream extends EventEmitter {
  public state: Status;

  public abstract send(data: any): void;
  public abstract close(): void;
}

class IMQWebSocketStream extends IMQStream {
  public socket: WebSocket;

  public constructor(socket: WebSocket) {
    super();

    this.socket = socket;
    this.state = Status.CONNECTING;
  }

  public send(data: any): Promise<{ data: string; record: string; ack: number; session_id: string; seq: number }> {
    this.socket.send(data);

    return new Promise(undefined);
  }

  public close(): Promise<void> {
    if (this.state === Status.CONNECTING || this.state === Status.OPEN) {
      this.state = Status.CLOSING;
      this.socket.close();
    }

    return new Promise(undefined);
  }
}

class IMQWebSocketConnectionStrategy extends IMQConnectionStrategy {
  public connectionFactory: any;

  public constructor(url: string, socketFactory?: any) {
    super();

    this.connectionFactory = socketFactory || WebSocket;
    this.url = url;
  }

  public connect(): IMQStream {
    const socket = new WebSocket(this.url);

    return new IMQWebSocketStream(socket);
  }

  public decode(event: string, data: any): string {
    return "";
  }

  public encode(event: string, data: any): string {
    return "";
  }
}

class IMQHttpStream extends IMQStream {
  private config: any;
  private timer: Timer;
  private readonly connectionId: string;

  private retryDelay: number;
  private maxRetries: number;

  private debug: boolean;

  private sendSeq = 1;
  private ackSeq = 0;
  private requestSeq = 0;

  private requestQueue: IMQRequest[] = [];
  private receiveBuffer = {};
  private requestCount = 0;

  private openTimerHandle: Timeout = null;

  public url: string;

  public constructor(config: any, connectionId: string) {
    super();

    this.config = config;
    this.timer = this.config.timer;
    this.url = this.config.url;

    this.connectionId = connectionId;
  }

  public send(data: any): void {
    const frame = this.makeFrame([data], ++this.requestSeq);
    const request: IMQRequest = { seq: this.requestSeq, data, xhr: null, retry: null, url: null };
    this.requestQueue.push(request);
    this.sendRequest(frame, request);
  }

  public close(): void {
    console.log('closing stream');

    if (this.openTimerHandle !== null) {
      clearTimeout(this.openTimerHandle);
      this.openTimerHandle = null;
    } else {
      this._close();
    }
  }

  private makeFrame(data: any[], seq: number): IMQFrame {
    return {
      record: 'http_framing',
      session_id: this.connectionId,
      seq,
      ack: this.ackSeq,
      data: data.map(v => ({ record: 'framing', type: 0, data, v }))
    };
  }

  private sendRequest(frame: IMQFrame, request: IMQRequest): void {
    let retries = 0;
    const onload = (): void => {
      this.requestCount--;
      request.xhr.onload = null;
      request.xhr.onerror = null;

      if (request.xhr.status === 200) {
        this.log(`${request.url} <-- ${request.xhr.responseText}`);
        this.handleResponse(request.xhr.responseText, request);
      } else {
        this.log(`error response from server, closing connection: ${request.xhr.status}`);
        this._close();
      }
    };

    const onerror = (err: any): void => {
      this.requestCount--;
      request.xhr.onload = null;
      request.xhr.onerror = null;

      this.log(`network error sending frame ${frame} ${err}`);

      if (retries++ < this.maxRetries) {
        this.log(`retrying in ${this.retryDelay / 1E3} seconds`);
        request.xhr = null;
        request.retry = setTimeout(() => {
          request.retry = null;

          if (this.requestCount === 0 || frame.data.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            send();
          }
        }, this.retryDelay);
      } else {
        this.log(`maximum retries reached (${this.maxRetries}), closing connection`);
      }
    };

    const send = (): void => {
      this.requestCount++;
      const url = this.makeRequestUrl();

      this.log(`${url} --\x3e ${frame}`);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Accept', 'application/octet-stream');
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.onload = onload;
      xhr.onerror = onerror;
      xhr.timeout = 6E4;
      xhr.send(JSON.stringify(frame));

      request.url = url;
      request.xhr = xhr;
    };

    send();
  }

  private handleResponse(data: string, request: IMQRequest): void {
    let frame: any;

    try {
      frame = JSON.parse(data);
    } catch (e) {
      this.log(`error decoding response json, closing connection: ${e}`);
      this._close();

      return;
    }

    if (IMQHttpStream.validateFrame(frame)) {
      while (this.requestQueue.length > 0) {
        const e = this.requestQueue[0];

        if (e.seq > frame.ack) {
          break;
        }

        this.log(`removing sequence ${e.seq} from send queue`);
        this.requestQueue.shift();
      }

      const messages = [];

      if (frame.seq > 0) {
        let index = frame.seq - frame.data.length + 1;
        for (let i = 0; i < frame.data.length; ++i) {
          const entry = frame.data[i];
          this.log(`received message sequence ${index}: ${entry.data}`);

          if (entry.data.record === 'msg_g2c_connection_closed') {
            this.log('aborting connection due to msg_g2c_connection_closed message');
            this._close();
            return;
          }

          if (typeof this.receiveBuffer[index] === 'undefined' && index > this.ackSeq) {
            this.receiveBuffer[index] = entry.data;
            index++;
          }
        }

        const range = Array.from({ length: frame.seq - this.ackSeq }, (v, k) => k + this.ackSeq + 1);

        for (let i = 0; i < range.length; ++i) {
          const index = range[i];
          if (typeof this.receiveBuffer[index] === 'undefined') {
            this.log(`sequence ${index} is missing, not delivering or acking messages beyond sequence ${this.ackSeq}`);
            break;
          }
          this.ackSeq = index;
          messages.push(this.receiveBuffer[index]);
          delete this.receiveBuffer[index];
        }
      }
      let currentSeq = 0;
      const g = [];
      for (let i = 0; i < this.requestQueue.length; ++i) {
        const entry = this.requestQueue[i];
        if (entry.seq > request.seq) {
          break;
        }

        this.log(`sequence ${entry.seq} was not acknowledged, resending`);
        g.push(entry.data);
        currentSeq = entry.seq;
      }

      if (g.length > 0) {
        this.sendRequest(this.makeFrame(g, currentSeq), request);
      }

      messages.forEach((m) => this.emit('message', { data: m }));

      if (this.requestCount === 0) {
        this.log('no outstanding requests, initiating poll request');
        this.sendRequest(this.makeFrame([], 0), request);
      }
    } else {
      this.log(`invalid frame received, closing connection: ${frame}`);
      this._close();
    }
  }

  private makeRequestUrl(): string {
    return `${this.url}?seq=${this.sendSeq++}`;
  }

  private _close(): void {
    this.requestQueue.forEach(r => {
      if (r.xhr !== null) {
        r.xhr.abort();
      }

      if (r.retry !== null) {
        clearTimeout(r.retry);
      }
    });

    this.emit('close');
  }

  private static validateFrame(frame: any): frame is IMQFrame {
    return typeof frame === 'object' && frame.record === 'http_framing' && typeof frame.seq === 'number' &&
      typeof frame.ack === 'number' && typeof frame.data === 'object' && Array.isArray(frame.data) &&
      frame.data.reduce((valid: boolean, o: any) => valid && typeof o === 'object' && o.record === 'framing' && typeof o.data === 'object', true);
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`${new Date().toLocaleDateString()} ${message}`);
    }
  }
}

class IMQHttpConnectionStrategy extends IMQConnectionStrategy {
  public config: any;

  public constructor(config: any) {
    super();

    this.config = config;
    this.url = config.url;
  }

  public connect(): IMQStream {
    const id = crypto.randomBytes(32)
      .map(b => b & 15)
      .reduce((b, c) => b + String.fromCharCode(c > 9 ? 97 + (c - 10) : 48 + c), '');

    return new IMQHttpStream(this.config, id);
  }

  public encode(event: string, data: any): string {
    return "";
  }

  public decode(event: string, data: any): string {
    return "";
  }
}

class IMQConnection extends EventEmitter {
  public state: State;
  public config: any;

  private currentStrategy: IMQConnectionStrategy = null;
  private stream: IMQStream = null;

  private connectRetryIntervalIndex = 0;
  private currentStrategyIndex = 0;

  private lastMessageTime: any = null;
  private receivedMessageTimerHandle: Timeout = null;
  private pingTimerHandle: Timeout = null;
  private connectRetryTimerHandle: Timeout = null;

  public constructor(config: any) {
    super();
    this.setState(State.CLOSED);
    this.config = config;
    this.config.onPreReconnect = this.config.onPreReconnect || ((callback: any) => { callback(null, null); });
    this.config.pingInterval = this.config.pingInterval || 15E3;
    this.config.reconnect = this.config.reconnect || [5E3, 15E3, 45E3, 9E4, 18E3];
    this.config.serverTimeoutInterval =  this.config.serverTimeoutInterval || 6E4;
  }

  public connect(): void {
    if (this.state === State.WAITING || this.state === State.CLOSED) {
      this.setState(State.CONNECTING);

      if (this.currentStrategyIndex >= this.config.strategies.length) {
        this.currentStrategyIndex = 0;
      }

      this.currentStrategy = this.config.strategies[this.currentStrategyIndex++];
      console.log(`Connecting to IMQ via '${this.currentStrategy.url}' as user '${this.config.userId}'`);
      this.stream = this.currentStrategy.connect();
      this.stream.on('open', () => {});
      this.stream.on('message', () => {});
      this.stream.on('error', () => {});
      this.stream.on('close', () => {});
    }
  }

  public send(): void {

  }

  private setState(state: State): void {
    this.state = state;

    if (state === State.WAITING) {
      this.emit('state', state, );
    }
  }
}

class IMQMessageMount extends EventEmitter {
  public queue: IMQQueue;
  public name: string;

  public constructor(queue: IMQQueue, name: string) {
    super();

    this.queue = queue;
    this.name = name;
  }

  public handleMessage(message: any): void {
    this.emit('message', {
      user_id: message.user_id, queue: this.queue.name, mount: this.name, message: message.message
    });
  }

  public handleSubscriberUpdate(message: any, subscribers: any): void {
    this.emit('subscriberUpdate', {
      user_id: message.user_id,
      action: message.action,
      queue: this.queue.name,
      mount: this.name,
      subscribers
    });
  }

  public sendMessage(event: string, data: any): void {
    this.queue.sendMessage(this.name, event, data);
  }

  public unsubscribe() {
    this.queue.unsubscribe(this.name);
  }

  public getSubscribers(): any {
    return this.queue.subscribers;
  }
}

class IMQStateMount extends EventEmitter {
  public queue: IMQQueue;
  public name: string;
  public state: any = {};

  public constructor(queue: IMQQueue, name: string) {
    super();

    this.queue = queue;
    this.name = name;
  }


}

class IMQQueue {
  public name: string;
  public manager: IMQManager;

  public queue: any[] = [];
  public messageMounts: Record<string, IMQMessageMount> = {};
  public stateMounts: Record<string, IMQStateMount> = {};
  public subscribers: any = {};

  public constructor(a: any, name: string) {
    this.name = name;
  }

  public initMessageMount(name: string): void {
    this.getOrCreateMessageMount(name);
  }

  public initStateMount(name: string): void {
    this.getOrCreateStateMount(name);
  }

  public getMessageMount(name: string): IMQMessageMount {
    return this.getOrCreateMessageMount(name);
  }

  public getStateMount(name: string): IMQStateMount {
    return this.getOrCreateStateMount(name);
  }

  public dispatchSubscriberUpdate(): void {

  }

  public dispatchMessage(name: string, message: any): void {
    this.getMessageMount(name).handleMessage(message);
  }

  public dispatchState(name: string, state: any): void {
    this.getStateMount(name).handleStateChange(state);
  }

  public sendMessage(queue: string, mount: string, message: any): void {
    this.manager.sendMessage(this.name, queue, mount, message)
  }

  private getOrCreateMessageMount(name: string): IMQMessageMount {
    if (typeof this.messageMounts[name] === 'undefined') {
      this.messageMounts[name] = new IMQMessageMount(this, name);
    }

    return this.messageMounts[name];
  }

  private getOrCreateStateMount(name: string): IMQStateMount {
    if (typeof this.stateMounts[name] === 'undefined') {
      this.stateMounts[name] = new IMQStateMount(this, name);
    }

    return this.stateMounts[name];
  }
}

class IMQManager {
  public config: any;
  public connection: IMQConnection;

  public queues = {};

  private queuedSubscriptions = [];

  public constructor(config: any) {
    this.config = config;
  }

  public connect(callback?: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const connected = (): void => {
        resolve(callback && callback(null, this));
      };

      if (this.connection.state === State.AUTHENTICATED) {
        connected();
      } else {
        this.connection.on('state', ())
      }
    });
  }
}
