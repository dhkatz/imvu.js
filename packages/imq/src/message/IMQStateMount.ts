import { EventEmitter } from 'events';
import { IMQQueue } from './IMQQueue';

export class IMQStateMount extends EventEmitter {
  private state: any = {};

  public constructor(private queue: IMQQueue, public readonly name: string) {
    super();
  }

  public reset(state: any) {
    this.state = state;

    this.emit('stateChange', {
      queue: this.queue.name,
      name: this.name,
      state: this.state,
    });
  }

  public unsubscribe() {}

  public get subscribers() {
    return [];
  }

  #applyDelta(initial: any, next: any) {
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        delete initial[key];
      } else {
        initial[key] = value;
      }
    }

    return initial;
  }
}
