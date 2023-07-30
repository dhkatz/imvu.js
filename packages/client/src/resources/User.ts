import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { GetMatched, Product, ProfileUser, Room } from './index';

import { Resource } from './Resource';
import { Creator } from './Creator';

@JsonObject()
export class User extends Resource<UserRelations> {
	@JsonProperty()
	public created: Date = new Date();

	@JsonProperty()
	public registered: Date = new Date();

	@JsonProperty()
	public gender?: string; // TODO: Add interface/class

	@JsonProperty()
	public displayName = '';

	@JsonProperty()
	public age?: number;

	@JsonProperty()
	public country = '';

	@JsonProperty()
	public state?: string;

	@JsonProperty()
	public avatarImage = '';

	@JsonProperty()
	public avatarPortraitImage = '';

	@JsonProperty()
	public username = '';

	@JsonProperty()
	public isVip = false;

	@JsonProperty()
	public isAp = false;

	@JsonProperty()
	public isCreator = false;

	@JsonProperty()
	public isAdult = false;

	@JsonProperty('is_ageverified')
	public isAgeVerified = false;

	@JsonProperty()
	public isStaff = false;

	public async *wishlist(): AsyncIterableIterator<Product> {
		yield* this.paginatedRelationship('wishlist', Product);
	}

	public async profile(): Promise<ProfileUser | null> {
		return this.relationship('profile', ProfileUser);
	}

	public async creator(): Promise<Creator | null> {
		return this.relationship('creator_details', Creator);
	}

	public async spouse(): Promise<User | null> {
		return this.relationship('spouse', User);
	}

	public async matched(): Promise<GetMatched | null> {
		return this.relationship('get_matched_profile', GetMatched);
	}

	public async current_room(): Promise<Room | null> {
		return this.relationship('current_room', Room);
	}

	public async gift(product: number | string | Product, message = ''): Promise<boolean> {
		return this.client.account.gifts.gift(this, product, message);
	}

	/**
	 * A convenience method for sending a friend request to this user.
	 * @see {@link FriendManager#add}
	 * @return {Promise<boolean>}
	 */
	public async add(): Promise<boolean> {
		return this.client.account.friends.add(this);
	}

	/**
	 * A convenience method for removing a user from your friends list.
	 * @see {@link FriendManager#remove}
	 * @return {Promise<boolean>}
	 */
	public async remove(): Promise<boolean> {
		return this.client.account.friends.remove(this);
	}
}

export interface UserRelations {
	profile: string;
	wishlist: string;
	creator_details: string;
	spouse: string;
	get_matched_profile: string;
	current_room: string;
}
