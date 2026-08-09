import { BaseManager } from './BaseManager.js';
import { URLPaginator } from '../util/Paginator.js';
import { User } from '../resources/index.js';

/**
 * Manage a client's friends list.
 */
export class FriendManager extends BaseManager {
	/**
	 * An asynchronous generator which yields each `User` on the client's friends list.
	 */
	public async *list(): AsyncIterableIterator<User> {
		yield* new URLPaginator(this.client, User, `/user/user-${this.client.account.id}/friends`);
	}

	public async count(): Promise<number> {
		// A collection endpoint (items + total_count), not a single resource — read the raw envelope.
		const response = await this.client.request(`/user/user-${this.client.account.id}/friends?limit=0`);
		const data = response.denormalized[response.id].data as { total_count?: number };

		return data.total_count ?? 0;
	}

	public async add(user: User): Promise<boolean>;
	public async add(username: string): Promise<boolean>;
	public async add(id: number): Promise<boolean>;
	public async add(user: User | string | number): Promise<boolean> {
		const id = await this.client.utils.id(user, true);

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
		const id = await this.client.utils.id(user, true);

		try {
			await this.client.http.delete(`/user/user-${this.client.account.id}/friends/user-${id}`);
		} catch {
			return false;
		}

		return true;
	}
}
