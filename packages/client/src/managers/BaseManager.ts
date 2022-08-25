import { Client } from '../client';

export class BaseManager {
  public constructor(protected client: Client) {}

  protected authenticated(): boolean {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }

    return true;
  }
}
