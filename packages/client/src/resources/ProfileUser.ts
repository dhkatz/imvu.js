import { Resource } from './Resource';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';
import { URLPaginator } from '../util/Paginator';
import { APIResponse } from '../types';

@JsonObject()
export class ProfileUser extends Resource {
	@JsonProperty()
	public image = '';

	@JsonProperty()
	public online = false;

	@JsonProperty('avatar_name')
	public username = '';

	@JsonProperty('title')
	public displayName = '';

	/**
	 * This is an approximation of the profile's following count.
	 */
	@JsonProperty('approx_following_count')
	public followingCount = 0;

	/**
	 * This is an approximation of the profile's follower count.
	 */
	@JsonProperty('approx_follower_count')
	public followerCount = 0;

	public async *following(): AsyncIterableIterator<ProfileUser> {
		yield* new URLPaginator(
			this.client,
			ProfileUser,
			`/profile/profile-user-${this.id}/subscriptions`
		);
	}

	public async *followers(): AsyncIterableIterator<ProfileUser> {
		yield* new URLPaginator(
			this.client,
			ProfileUser,
			`/profile/profile-user-${this.id}/subscribers`
		);
	}

	public async follow(): Promise<boolean> {
		this.authenticated();

		return this.client.account.followers.follow(this);
	}

	public async unfollow(): Promise<boolean> {
		this.authenticated();

		return this.client.account.followers.unfollow(this);
	}
}
