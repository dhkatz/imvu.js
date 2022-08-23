import { GatewayEvent } from './Events';
import EventEmitter from 'events';
import { Client } from '@imvu/client';

import { IMQQueue } from './message/IMQQueue';
import { IMQStream, Status } from './IMQStream';

const sleep = (ms: number): Promise<any> => new Promise((resolve) => setTimeout(resolve, ms));

export class IMQManager extends EventEmitter {
  public reconnecting = false;
  public gateway = '';

  public queues: Record<string, IMQQueue> = {};
  public callbacks: Array<{ op_id: number; callback: (event: GatewayEvent) => void }> = [];

  public connection: IMQStream | null = null;

  public constructor(public client: Client) {
    super();
  }

  public destroy(): void {
    this.connection?.destroy();
  }

  public close(): void {
    this.connection?.close();

    for (const queue of Object.values(this.queues)) {
      queue.close();
    }

    this.queues = {};
  }

  public handle(event: GatewayEvent): void {
    switch (event.record) {
      case 'msg_g2c_send_message': {
        if (this.queues[event.queue]) {
          this.queues[event.queue].onMessage(event);
        }

        break;
      }
      case 'msg_g2c_joined_queue': {
        if (!this.queues[event.queue]) {
          this.queues[event.queue] = new IMQQueue(this, event.queue);
        }

        this.queues[event.queue].onSubscriberJoined(event);

        break;
      }
      case 'msg_g2c_left_queue': {
        if (this.queues[event.queue]) {
          this.queues[event.queue].onSubscriberLeft(event);
        }

        break;
      }
      case 'msg_g2c_create_mount': {
        switch (event.type) {
          case 'message':
            break;
          case 'state':
            break;
        }

        break;
      }
      case 'msg_g2c_state_change':
        break;
      default:
        break;
    }
  }

  public async send(queue: string, mount: string, message: string): Promise<void> {
    if (this.connection?.authenticated) {
      this.connection.send({ record: 'msg_c2g_send_message', queue, mount, message });
    }
  }

  public async connect(): Promise<void> {
    if (this.connection && this.connection.status === Status.AUTHENTICATED) return;

    this.gateway = 'wss://imq.imvu.com:444/streaming/imvu_pre';
    this.connection = new IMQStream(this, 0);

    await this.spawn();
  }

  public subscribe(queue: string, listener: (data: any) => void): void {
    if (!this.queues[queue]) {
      this.queues[queue] = new IMQQueue(this, queue);
      this.connection?.send({ record: 'msg_c2g_subscribe', queues: [queue] });
    }
  }

  public unsubscribe(queue: string): void {
    if (this.queues[queue]) {
      delete this.queues[queue];
      this.connection?.send({ record: 'msg_c2g_unsubscribe', queues: [queue] });
    }
  }

  public async reconnect(): Promise<boolean> {
    if (this.reconnecting || (this.connection && this.connection.status !== Status.AUTHENTICATED))
      return false;

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
    if (!this.connection) return false;

    const stream = this.connection;
    this.connection = null;

    stream.on('ready', () => {
      this.emit('stream_ready', stream.id);
    });

    stream.on('close', () => {
      this.emit('stream_reconnecting', stream.id);

      this.connection = stream;
      this.reconnect();
    });

    stream.on('message', (message) => {
      this.handle(message);
    });

    try {
      await stream.connect();
    } catch (error) {
      if (!error) {
        this.connection = stream;
      } else {
        throw error;
      }
    }

    if (!this.connection) {
      await sleep(5000);
      return this.spawn();
    }

    return true;
  }
}
