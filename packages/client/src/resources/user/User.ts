import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { URLPaginator } from '../../util/Paginator';
import { GetMatched, Product } from '../index';

import { Resource } from '../Resource';
import { ProfileUser, Room } from '../index';
import { Creator } from '../product/Creator';

@JsonObject()
export class User extends Resource {
	@JsonProperty()
	public created: Date = new Date();

	@JsonProperty()
	public registered = 0;

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
		yield* new URLPaginator(this.client, Product, `/user/user-${this.id}/wishlist`);
	}

	public async profile(): Promise<ProfileUser | null> {
		return this.relations?.profile
			? this.client.resource(this.relations.profile, ProfileUser)
			: null;
	}

	public async creator(): Promise<Creator | null> {
		return this.relations?.creator_details
			? this.client.resource(this.relations.creator_details, Creator)
			: null;
	}

	public async spouse(): Promise<User | null> {
		return this.relations?.spouse ? this.client.users.fetch(this.relations.spouse) : null;
	}

	public async matched(): Promise<GetMatched | null> {
		return this.relations?.matched ? this.client.matched.fetch(this.relations.matched) : null;
	}

	public async current_room(): Promise<Room | null> {
		return this.relations?.current_room
			? this.client.rooms.fetch(this.relations.current_room)
			: null;
	}

	public async gift(product: number | string | Product, message = ''): Promise<boolean> {
		this.authenticated();

		const id = await this.client.utils.id(product);

		try {
			await this.client.http.post(`/user/user-${this.client.account.id}/gifts`, {
				id: `https://api.imvu.com/user/user-${this.id}`,
				is_thank_you: false,
				message,
				product_id: id,
				txn_id: `gift-${this.client.account.id}-${this.id}-${Math.floor(Date.now() / 1000)}`,
				type: 1,
			});

			return true;
		} catch (e) {
			console.error(e);
			return false;
		}
	}

	/**
	 * A convenience method for sending a friend request to this user.
	 * @return {Promise<boolean>}
	 */
	public async add(): Promise<boolean> {
		return this.client.account.friends.add(this);
	}

	/**
	 * A convenience method for removing a user from your friends list.
	 * @return {Promise<boolean>}
	 */
	public async remove(): Promise<boolean> {
		return this.client.account.friends.remove(this);
	}
}
