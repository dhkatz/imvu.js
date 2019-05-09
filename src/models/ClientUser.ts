import { Avatar } from './Avatar';
import { User } from './User';
import { URLPaginator, Paginators } from '../util/Paginator';

export class ClientUser extends Avatar {
  /**
   * An asynchronous generator which yields each `User` on the client's blocklist.
   */
  public async * blocklist(): AsyncIterableIterator<User> {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }

    yield * new URLPaginator(this.client, Paginators.User, `/user/user-${this.id}/blocked`);
  }

  /**
   * An asynchronous generator which yields each `User` on the client's friends list.
   */
  public async * friends(): AsyncIterableIterator<User> {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }

    yield * new URLPaginator(this.client, Paginators.User, `/user/user-${this.id}/friends`);
  }

  public async load(): Promise<void> {
    await super.load();

    
  }
}
