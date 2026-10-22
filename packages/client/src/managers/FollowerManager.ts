import { ProfileUser, User } from '../resources/index.js';
import { BaseManager } from './BaseManager.js';
import { IMVUAPIError, type RequestOptions } from '@imvu/rest';
import type { Collection } from '../collections/Collection.js';

export class FollowerManager extends BaseManager {
	public async *followers(): AsyncIterableIterator<User> {}

	public following(): Collection<ProfileUser> {
		return this.client.collection(`/profile/profile-user-${this.client.account.id}/subscriptions`, ProfileUser);
	}

	public async follow(profile: ProfileUser): Promise<boolean>;
	public async follow(user: User): Promise<boolean>;
	public async follow(username: string): Promise<boolean>;
	public async follow(id: number): Promise<boolean>;
	public async follow(user: User | ProfileUser | string | number): Promise<boolean> {
		const id = await this.client.utils.id(user, true);

		return this.succeeds(`/profile/profile-user-${this.client.account.id}/subscriptions`, {
			method: 'POST',
			data: { id: `/profile/profile-user-${id}` },
		});
	}

	public async unfollow(profile: ProfileUser): Promise<boolean>;
	public async unfollow(user: User): Promise<boolean>;
	public async unfollow(username: string): Promise<boolean>;
	public async unfollow(id: number): Promise<boolean>;
	public async unfollow(user: User | ProfileUser | string | number): Promise<boolean> {
		const id = await this.client.utils.id(user, true);

		return this.succeeds(`/profile/profile-user-${this.client.account.id}/subscriptions/profile-user-${id}`, {
			method: 'DELETE',
		});
	}

	/** True when the API accepts the request, false when it explicitly rejects it. */
	private async succeeds(url: string, options: RequestOptions): Promise<boolean> {
		try {
			await this.client.request(url, options);
			return true;
		} catch (error) {
			if (error instanceof IMVUAPIError) return false;
			throw error;
		}
	}
}
