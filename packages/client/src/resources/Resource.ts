import { Client } from '../client';
import { JsonObject } from 'typescript-json-serializer';
import { APIResource } from '../types';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ModelOptions {}

@JsonObject()
export abstract class Resource {
  /**
   * @internal
   */
  public client: Client;

  public readonly id: string | number = '';

  /**
   * @internal
   */
  public relations: APIResource['relations'] = {};

  /**
   * @internal
   */
  public updates: APIResource['updates'] = {};

  /* istanbul ignore next */
  public constructor(client: Client, protected options: ModelOptions = {}) {
    this.client = client;

    // Hide client and options from being enumerable (such as in for...in loops and console.log)

    Object.defineProperty(this, 'client', {
      enumerable: false,
    });

    Object.defineProperty(this, 'options', {
      enumerable: false,
    });
  }

  protected authenticated(): void {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }
  }
}
