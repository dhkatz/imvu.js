import { Client } from '../client/index.js';
import { Avatar, Product, User, type CurrentUser } from '../resources/index.js';
import type { Collection } from '../collections/Collection.js';

import {
	BaseManager,
	FollowerManager,
	FriendManager,
	RoomManager,
	RouletteManager,
	WalletManager,
	WishlistManager,
} from './index.js';
import { GiftsManager } from './GiftsManager.js';

export class AccountManager extends BaseManager {
	public readonly friends: FriendManager;
	public readonly roulette: RouletteManager;
	public readonly wallet: WalletManager;
	public readonly wishlist: WishlistManager;
	public readonly followers: FollowerManager;
	public readonly gifts: GiftsManager;
	/** Rooms the account owns, manages (moderates), favorited or visited recently. */
	public readonly rooms: RoomManager;

	public constructor(
		client: Client,
		public readonly user: CurrentUser
	) {
		super(client);

		this.friends = new FriendManager(client);
		this.roulette = new RouletteManager(client);
		this.wallet = new WalletManager(client);
		this.wishlist = new WishlistManager(client);
		this.followers = new FollowerManager(client);
		this.gifts = new GiftsManager(client);
		this.rooms = new RoomManager(client);
	}

	/**
	 * Convenience getter for the user's id.
	 * @example
	 * const id = client.account.id;
	 * // or
	 * const id = client.account.user.id;
	 */
	public get id(): string {
		return this.user.id;
	}

	/**
	 * Convenience getter for the user's username.
	 * @example
	 * const username = client.account.username;
	 * // or
	 * const username = client.account.user.username;
	 */
	public get username(): string {
		return this.user.username;
	}

	/** Fetch the authenticated user's current avatar only when it is needed. */
	public async avatar(): Promise<Avatar> {
		this.authenticated();
		const url = this.user.relations.avatar;
		if (!url) throw new Error("The authenticated user does not expose an 'avatar' relation");

		return this.client.resource(url, Avatar);
	}

	/** The authenticated user's blocklist collection. */
	public blocklist(): Collection<User> {
		this.authenticated();
		const url = this.user.relations.blocked;
		if (!url) throw new Error("The authenticated user does not expose a 'blocked' relation");

		return this.client.collection(url, User);
	}

	public inventory(): Collection<Product> {
		this.authenticated();
		const url = this.user.relations.inventory;
		if (!url) throw new Error("The authenticated user does not expose an 'inventory' relation");

		return this.client.collection(url, Product);
	}
}
