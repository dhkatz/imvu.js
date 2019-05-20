import { BaseManager } from './BaseManager';
import { URLPaginator, Paginators } from '@/util/Paginator';
import { User } from '@/models';

/**
 * Manage a client's friends list.
 */
export class FriendManager extends BaseManager {
    /**
   * An asynchronous generator which yields each `User` on the client's friends list.
   */
  public async * list(): AsyncIterableIterator<User> {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }

    yield * new URLPaginator(this.client, Paginators.User, `/user/user-${this.client.user.id}/friends`);
  }

  public async add(user: User): Promise<boolean>;
  public async add(username: string): Promise<boolean>;
  public async add(id: number): Promise<boolean>;
  public async add(user: User | string | number): Promise<boolean> {
    return true;
  }

  public async remove(user: User): Promise<boolean>;
  public async remove(username: string): Promise<boolean>;
  public async remove(id: number): Promise<boolean>;
  public async remove(user: User | string | number): Promise<boolean> {
    return true;
  }
}
