import { Client } from '@/client';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ModelOptions {}

export type Relations<T> = { [K in Extract<keyof T, string>]: () => Promise<T[K]> }

export abstract class BaseModel<T extends Record<string, any> = Record<string, any>> {
  public client: Client;
  public options: ModelOptions;

  public abstract relations: Relations<T>;

  /* istanbul ignore next */
  public constructor(client?: Client, options: ModelOptions = {}) {
    this.options = options;
    this.client = client;
  }

  public authenticated(): void {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }
  }
}
