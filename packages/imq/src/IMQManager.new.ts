import { IMQConnection } from './IMQConnection';
import { Status } from './IMQStream';

export class IMQManager {
  #connection: IMQConnection;

  public constructor(private config: any) {
    this.#connection = new IMQConnection(config);
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.#connection.status === Status.AUTHENTICATED) {
        return resolve();
      }

      const onState = (state: any) => {
        if (state === Status.AUTHENTICATED) {
          this.#connection.off('state', onState);
          resolve();
        }
      };

      this.#connection.on('state', onState);

      this.#connection.connect();
    });
  }

  public close() {
    this.#connection.close();
  }

  #message(message: any) {
    switch (message.type) {
      case 'msg_g2c_result':
      default:
        break;
    }
  }

  public subscribeState() {}

  public subscribeMessage() {}

  public sendMessage() {}

  public sendStateChange() {}

  public unsubscribeQueue(name: string, callback: () => void) {
    callback();
  }
}
