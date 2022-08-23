import { EventEmitter } from 'events';

export enum IMQStreamState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export class IMQStream extends EventEmitter {
  public url = '';

  #requestCount = 0;

  public constructor(public config: Record<string, unknown>) {
    super();
    this.url = config.httpUrl as string;
  }

  public send(data: any) {
    this.#requestCount++;
  }

  public close() {}
}
