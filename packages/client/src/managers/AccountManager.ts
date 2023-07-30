import { URLPaginator } from '../util/Paginator';
import { Client } from '../client';
import { Avatar, Product, User } from '../resources';

import {
	BaseManager,
	FollowerManager,
	FriendManager,
	RouletteManager,
	WalletManager,
	WishlistManager,
} from './index';
import { GiftsManager } from './GiftsManager';

export class AccountManager extends BaseManager {
	public readonly friends: FriendManager;
	public readonly roulette: RouletteManager;
	public readonly wallet: WalletManager;
	public readonly wishlist: WishlistManager;
	public readonly followers: FollowerManager;
	public readonly gifts: GiftsManager;

	public constructor(client: Client, public readonly user: User, public readonly avatar: Avatar) {
		super(client);

		this.friends = new FriendManager(client);
		this.roulette = new RouletteManager(client);
		this.wallet = new WalletManager(client);
		this.wishlist = new WishlistManager(client);
		this.followers = new FollowerManager(client);
		this.gifts = new GiftsManager(client);
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

	/**
	 * An asynchronous generator which yields each `User` on the client's blocklist.
	 */
	public async *blocklist(): AsyncIterableIterator<User> {
		this.authenticated();

		yield* new URLPaginator(this.client, User, `/user/user-${this.user.id}/blocked`);
	}

	public async *inventory(): AsyncIterableIterator<Product> {
		this.authenticated();

		yield* new URLPaginator(this.client, Product, `/user/user-${this.user.id}/inventory`);
	}
}
