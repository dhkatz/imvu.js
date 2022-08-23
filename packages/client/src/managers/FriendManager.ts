import { BaseManager } from './BaseManager';
import { URLPaginator } from '../util/Paginator';
import { User } from '../resources';

/**
 * Manage a client's friends list.
 */
export class FriendManager extends BaseManager {
  /**
   * An asynchronous generator which yields each `User` on the client's friends list.
   */
  public async *list(): AsyncIterableIterator<User> {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }

    yield* new URLPaginator(
      this.client,
      this.client.users,
      `/user/user-${this.client.account.id}/friends`
    );
  }

  public async count(): Promise<number> {
    this.authenticated();

    const { data } = await this.client.http.get(
      `/user/user-${this.client.account.id}/friends?limit=0`
    );

    return data.denormalized[data.id].data['total_count'];
  }

  public async add(user: User): Promise<boolean>;
  public async add(username: string): Promise<boolean>;
  public async add(id: number): Promise<boolean>;
  public async add(user: User | string | number): Promise<boolean> {
    this.authenticated();

    const id = await this.client.utils.id(user);

    try {
      await this.client.http.post(`/user/user-${this.client.account.id}/outbound_friend_requests`, {
        id: `https://api.imvu.com/user/user-${id}`,
      });
    } catch {
      return false;
    }

    return true;
  }

  public async remove(user: User): Promise<boolean>;
  public async remove(username: string): Promise<boolean>;
  public async remove(id: number): Promise<boolean>;
  public async remove(user: User | string | number): Promise<boolean> {
    this.authenticated();

    const id = await this.client.utils.id(user);

    try {
      await this.client.http.delete(`/user/user-${this.client.account.id}/friends/user-${id}`);
    } catch {
      return false;
    }

    return true;
  }
}
