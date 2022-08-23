import { EventEmitter } from 'events';
import { IMQQueue } from './IMQQueue';

export class IMQMessageMount extends EventEmitter {
  public constructor(private queue: IMQQueue, private name: string) {
    super();
  }

  public handle() {}

  public send() {}

  public unsubscribe() {}

  public get subscribers() {
    return [];
  }
}
