import {EventEmitter} from 'events';

import {Client, GatewayEvent, IMQQueue, IMQStream, Status} from '@/client';

const sleep = (ms: number): Promise<any> => new Promise(resolve => setTimeout(resolve, ms));

export class IMQManager extends EventEmitter {
  public reconnecting: boolean;
  public gateway: string;

  public queues: Record<string, IMQQueue> = {}

  public connection: IMQStream | null = null;

  public constructor(public client: Client) {
    super();
  }

  public destroy(): void {
    this.connection.destroy();
  }

  public handle(event: GatewayEvent): void {
    switch (event.record) {
      case 'msg_g2c_send_message':
        break;
      case 'msg_g2c_joined_queue': {
        if (!this.queues[event.queue]) {
          this.queues[event.queue] = new IMQQueue(this);
        }

        this.queues[event.queue].onSubscriberJoined(event);

        break;
      }
      case 'msg_g2c_left_queue':
        break;
      case "msg_g2c_create_mount":
        break;
      case "msg_g2c_state_change":
        break;
      default:
        break;
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
      this.queues[queue] = new IMQQueue(this);
      this.connection.send({ record: 'msg_c2g_subscribe', queues: [queue] });
    }
  }

  public unsubscribe(queue: string): void {
    if (this.queues[queue]) {
      delete this.queues[queue];
      this.connection.send({ record: 'msg_c2g_unsubscribe', queues: [queue] });
    }
  }

  public async reconnect(): Promise<boolean> {
    if (this.reconnecting || this.connection && this.connection.status !== Status.AUTHENTICATED) return false;

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
      this.client.emit('stream_ready', stream.id);

      this.check();
    });

    stream.on('close', () => {
      this.client.emit('stream_reconnecting', stream.id);

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

  private check(): void {
    this.client.ready = true;
    this.client.emit('ready');
  }
}
