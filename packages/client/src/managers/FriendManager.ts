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

	/** People who sent this account a friend request it hasn't answered yet. */
	public requests(): Collection<User> {
		return this.client.collection(`/user/user-${this.client.account.id}/inbound_friend_requests`, User);
	}

	/** People this account sent a friend request that they haven't answered yet. */
	public sent(): Collection<User> {
		return this.client.collection(`/user/user-${this.client.account.id}/outbound_friend_requests`, User);
	}

	/** Accept someone's friend request (see {@link requests}). `false` if there's none from them, or IMVU refuses. */
	public async accept(user: User | string | number): Promise<boolean> {
		return this.answer(user, 'accept');
	}

	/** Decline someone's friend request. `false` if there's none from them, or IMVU refuses. */
	public async decline(user: User | string | number): Promise<boolean> {
		return this.answer(user, 'reject');
	}

	private async answer(user: User | string | number, status: 'accept' | 'reject'): Promise<boolean> {
		const id = await this.client.utils.id(user, true);

		try {
			await this.client.request(`/user/user-${this.client.account.id}/inbound_friend_requests/user-${id}`, {
				method: 'POST',
				data: { status },
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
