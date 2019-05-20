import { EventEmitter } from 'events';

import { Status } from '@/util/Constants';
import { Client, IMQStream, GatewayEvent } from '@/client';

const sleep = (ms: number): Promise<any> => new Promise(resolve => setTimeout(resolve, ms));

export class WebSocketManager extends EventEmitter {
  public reconnecting: boolean;

  public gateway: string;

  public streams: Map<number, IMQStream>;
  public status: Status;

  public queue: Set<IMQStream>;

  public constructor(public client: Client) {
    super();

    this.streams = new Map();
    this.queue = new Set();
    this.status = Status.IDLE;
  }

  public destroy(): void {
    this.queue.clear();

    this.streams.forEach((stream) => stream.destroy());
  }

  public handle(message: GatewayEvent): void {
    switch (message.record) {
      case 'msg_g2c_send_message':
        
        break;
    
      default:
        break;
    }
  }

  public async connect(): Promise<void> {
    this.gateway = 'wss://imq.imvu.com:444/streaming/imvu_pre';
    this.queue = new Set(Array.from({ length: 1}, (v, k) => new IMQStream(this, k)));

    this.spawn();
  }

  public async reconnect(): Promise<boolean> {
    if (this.reconnecting || this.status !== Status.READY) return false;

    this.reconnecting = true;

    try {
      await this.spawn();
    } catch (error) {
      if (!error) {
        await sleep(5000);
        this.reconnecting = false;

        return this.reconnect();
      }

      if (this.client.listenerCount('invalidated')) {
        this.client.emit('invalidated');
        this.destroy();
      } else {
        this.client.destroy();
      }
    } finally {
      this.reconnecting = false;
    }

    return true;
  }

  private async spawn(): Promise<boolean> {
    if (!this.queue.size) return false;

    const [stream] = this.queue;

    this.queue.delete(stream);

    stream.on('ready', () => {
      this.client.emit('stream_ready', stream.id);

      this.check();
    });

    stream.on('close', () => {
      this.client.emit('stream_reconnecting', stream.id);

      this.queue.add(stream);
      this.reconnect();
    });

    try {
      await stream.connect();
    } catch (error) {
      if (!error) {
        this.queue.add(stream);
      } else {
        throw error;
      }
    }

    if (this.queue.size) {
      await sleep(5000);
      return this.spawn();
    }

    return true;
  }

  private check(): void {
    for (const stream of this.streams.values()) {
      if (stream.status !== Status.READY) {
        return;
      }
    }

    this.client.ready = true;
    this.client.emit('ready');
  }
}
