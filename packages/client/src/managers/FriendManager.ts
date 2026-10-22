import { BaseManager } from './BaseManager.js';
import { User } from '../resources/index.js';
import type { Collection } from '../collections/Collection.js';

/**
 * Manage a client's friends list.
 */
export class FriendManager extends BaseManager {
	/**
	 * An asynchronous generator which yields each `User` on the client's friends list.
	 */
	public list(): Collection<User> {
		return this.client.collection(`/user/user-${this.client.account.id}/friends`, User);
	}

	public async count(): Promise<number> {
		return this.list().count();
	}

	public async add(user: User): Promise<boolean>;
	public async add(username: string): Promise<boolean>;
	public async add(id: number): Promise<boolean>;
	public async add(user: User | string | number): Promise<boolean> {
		const id = await this.client.utils.id(user, true);

		try {
			await this.client.request(`/user/user-${this.client.account.id}/outbound_friend_requests`, {
				method: 'POST',
				data: { id: `https://api.imvu.com/user/user-${id}` },
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
			await this.client.request(`/user/user-${this.client.account.id}/friends/user-${id}`, { method: 'DELETE' });
		} catch {
			return false;
		}

		return true;
	}
}
