import { BaseManager } from './BaseManager';
import { URLPaginator } from '@/util/Paginator';
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

    yield * new URLPaginator(this.client, this.client.users, `/user/user-${this.client.user.id}/friends`);
  }

  public async count(): Promise<number> {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }

    const { data } = await this.client.http.get(`/user/user-${this.client.user.id}/friends?limit=0`);

    return data.denormalized[data.id].data['total_count'];
  }

  public async add(user: User): Promise<boolean>;
  public async add(username: string): Promise<boolean>;
  public async add(id: number): Promise<boolean>;
  public async add(user: User | string | number): Promise<boolean> {
    try {
      const id = typeof user === 'string' ? (await this.client.users.search({ username: user }))[0].id : typeof user === 'number' ? user : user.id;

      await this.client.http.post(`/user/user-${this.client.user.id}/outbound_friend_requests`, {
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
    const id = typeof user === 'string' ? (await this.client.users.search({ username: user }))[0].id : typeof user === 'number' ? user : user.id;

    try {
      await this.client.http.delete(`/user/user-${this.client.user.id}/friends/user-${id}`);
    } catch {
      return false;
    }

    return true;
  }
}
