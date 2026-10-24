import { GetMatched, Product, ProfileUser, Room } from './index.js';

import { Resource } from './Resource.js';
import { Creator } from './Creator.js';
import type { Collection } from '../collections/Collection.js';
import type { GiftResult } from '../managers/GiftsManager.js';

export class User<TRelations extends UserRelations = UserRelations> extends Resource<TRelations> {
	public created = ''; // ISO 8601 string on the wire
	public registered = 0; // unix seconds on the wire
	public gender?: string;
	public displayName = '';
	public age?: number;
	public country = '';
	public state: string | null = null;
	public avatarImage = '';
	public avatarPortraitImage = '';
	public username = '';
	public isVip = false;
	public isAp = false;
	public isCreator = false;
	public isAdult = false;
	public isAgeVerified = false;
	public isStaff = false;
	/** Short public profile text (labelled "BIO" on the web; 100 characters there). */
	public tagline = '';
	public interests = '';
	public online = false;
	/** `'Available'`, or `'DoNotDisturb'` when the user hides their online status. */
	public availability = '';

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('created' in data) this.created = data.created;
		if ('registered' in data) this.registered = data.registered;
		if ('gender' in data) this.gender = data.gender;
		if ('display_name' in data) this.displayName = data.display_name;
		if ('age' in data) this.age = data.age;
		if ('country' in data) this.country = data.country;
		if ('state' in data) this.state = data.state;
		if ('avatar_image' in data) this.avatarImage = data.avatar_image;
		if ('avatar_portrait_image' in data) this.avatarPortraitImage = data.avatar_portrait_image;
		if ('username' in data) this.username = data.username;
		if ('is_vip' in data) this.isVip = data.is_vip;
		if ('is_ap' in data) this.isAp = data.is_ap;
		if ('is_creator' in data) this.isCreator = data.is_creator;
		if ('is_adult' in data) this.isAdult = data.is_adult;
		if ('is_ageverified' in data) this.isAgeVerified = data.is_ageverified;
		if ('is_staff' in data) this.isStaff = data.is_staff;
		if ('tagline' in data) this.tagline = data.tagline ?? '';
		if ('interests' in data) this.interests = data.interests ?? '';
		if ('online' in data) this.online = data.online;
		if ('availability' in data) this.availability = data.availability ?? '';
	}

	public wishlist(): Collection<Product> {
		return this.collectionRelationship('wishlist', Product);
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

	public gift(product: number | string | Product, message = ''): Promise<GiftResult> {
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

/** Relations advertised only when this user represents the authenticated account. */
export interface CurrentUserRelations extends UserRelations {
	avatar: string;
	blocked: string;
	inventory: string;
}

/**
 * The authenticated account's canonical User with its additional relation shape.
 * This is deliberately a type specialization, not a separate runtime subclass.
 */
export type CurrentUser = User<CurrentUserRelations>;
