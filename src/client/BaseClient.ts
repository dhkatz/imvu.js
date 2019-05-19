import { EventEmitter } from 'events';

export class BaseClient extends EventEmitter {
  private intervals: Set<NodeJS.Timeout> = new Set();

  public constructor() {
    super();
  }

  public destroy(): void {
    for (const i of this.intervals) this.clearInterval(i);

    this.intervals.clear();
  }

  public setInterval(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timeout {
    const interval = setInterval(callback, ms, ...args);
    this.intervals.add(interval);
    return interval;
  }

  public clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.intervals.delete(interval);
  }
}
