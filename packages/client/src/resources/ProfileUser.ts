import { Resource } from './Resource';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';

@JsonObject()
export class ProfileUser extends Resource<ProfileUserRelations> {
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
		yield* this.paginatedRelationship('subscriptions', ProfileUser);
	}

	public async *subscriptions() {
		return this.following();
	}

	public async *followers(): AsyncIterableIterator<ProfileUser> {
		yield* this.paginatedRelationship('subscribers', ProfileUser);
	}

	public async *subscribers() {
		return this.followers();
	}

	public async follow(): Promise<boolean> {
		this.authenticated();

		return this.client.account.followers.follow(this);
	}

	public async subscribe(): Promise<boolean> {
		return this.follow();
	}

	public async unfollow(): Promise<boolean> {
		this.authenticated();

		return this.client.account.followers.unfollow(this);
	}

	public async unsubscribe(): Promise<boolean> {
		return this.unfollow();
	}
}

export interface ProfileUserRelations {
	subscriptions: string;
	subscribers: string;
}
