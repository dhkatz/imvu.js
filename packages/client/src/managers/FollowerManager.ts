import { ProfileUser, User } from '../resources';
import { BaseManager } from './BaseManager';
import { APIResponse } from '../types';
import { URLPaginator } from '../util/Paginator';

export class FollowerManager extends BaseManager {
	public async *followers(): AsyncIterableIterator<User> {}

	public async *following(): AsyncIterableIterator<ProfileUser> {
		yield* new URLPaginator(
			this.client,
			ProfileUser,
			`/profile/profile-user-${this.client.account.id}/subscriptions`
		);
	}

	public async follow(profile: ProfileUser): Promise<boolean>;
	public async follow(user: User): Promise<boolean>;
	public async follow(username: string): Promise<boolean>;
	public async follow(id: number): Promise<boolean>;
	public async follow(user: User | ProfileUser | string | number): Promise<boolean> {
		const id = await this.client.utils.id(user, true);

		const { data } = await this.client.http.post<APIResponse>(
			`/profile/profile-user-${this.client.account.id}/subscriptions`,
			{
				id: `/profile/profile-user-${id}`,
			}
		);

		return data.status !== 'failure';
	}

	public async unfollow(profile: ProfileUser): Promise<boolean>;
	public async unfollow(user: User): Promise<boolean>;
	public async unfollow(username: string): Promise<boolean>;
	public async unfollow(id: number): Promise<boolean>;
	public async unfollow(user: User | ProfileUser | string | number): Promise<boolean> {
		const id = await this.client.utils.id(user, true);

		const { data } = await this.client.http.delete<APIResponse>(
			`/profile/profile-user-${this.client.account.id}/subscriptions/profile-user-${id}`
		);

		return data.status !== 'failure';
	}
}
