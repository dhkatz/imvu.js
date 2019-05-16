import { EventEmitter } from 'events';

import { Client } from '../IMVU';

export class WebSocketManager extends EventEmitter {
  public gateway: string;

  public constructor(client: Client) {
    super();
  }
}
