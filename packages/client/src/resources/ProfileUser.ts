import { Resource } from './Resource.js';

export class ProfileUser extends Resource<ProfileUserRelations> {
	public image = '';
	public online = false;
	public username = '';
	public displayName = '';

	/**
	 * This is an approximation of the profile's following count.
	 */
	public followingCount = 0;

	/**
	 * This is an approximation of the profile's follower count.
	 */
	public followerCount = 0;

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('image' in data) this.image = data.image;
		if ('online' in data) this.online = data.online;
		if ('avatar_name' in data) this.username = data.avatar_name;
		if ('title' in data) this.displayName = data.title;
		if ('approx_following_count' in data) this.followingCount = data.approx_following_count;
		if ('approx_follower_count' in data) this.followerCount = data.approx_follower_count;
	}

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
