import { EventEmitter } from 'events';

import { IMQMessageMount } from './IMQMessageMount';
import { IMQStateMount } from './IMQStateMount';
import { IMQManager } from '../IMQManager.new';

export class IMQQueue extends EventEmitter {
  public subscribers: Record<string, Set<(data: any) => void>> = {};

  public messageMounts: Map<string, IMQMessageMount> = new Map();
  public stateMounts: Map<string, IMQStateMount> = new Map();

  public constructor(private manager: IMQManager, public readonly name: string) {
    super();
  }

  public initMessageMount(name: string): void {
    this.#getOrCreateMessageMount(name);
  }

  public getMessageMount(name: string): IMQMessageMount {
    return this.#getOrCreateMessageMount(name);
  }

  public unsubscribe(name: string): void {
    if (this.messageMounts.has(name)) {
      this.messageMounts.get(name)?.removeAllListeners();

      this.messageMounts.delete(name);
    }

    if (this.stateMounts.has(name)) {
      this.stateMounts.get(name)?.removeAllListeners();

      this.stateMounts.delete(name);
    }

    if (this.messageMounts.size === 0 && this.stateMounts.size === 0) {
      this.manager.unsubscribeQueue(this.name, () => {});
    }
  }

  #getOrCreateMessageMount(name: string): IMQMessageMount {
    if (!this.messageMounts.has(name)) {
      this.messageMounts.set(name, new IMQMessageMount(this, name));
    }

    return this.messageMounts.get(name) as IMQMessageMount;
  }
}
