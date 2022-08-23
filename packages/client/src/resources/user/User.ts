import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { URLPaginator } from '../../util/Paginator';
import type { GetMatched, Product } from '../index';

import { Resource } from '../Resource';
import { Profile, Room } from '../index';
import { Creator } from '../product/Creator';

@JsonObject()
export class User extends Resource {
  @JsonProperty({ name: 'legacy_cid' })
  public id = 0;

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

  public async profile(): Promise<Profile> {
    return this.client.resource(`/profile/profile-user-${this.id}`, Profile);
  }

  public async creator(): Promise<Creator | null> {
    if (this.relations?.creator_details) {
      return this.client.resource(this.relations.creator_details, Creator);
    }

    return null;
  }

  public async spouse(): Promise<User | null> {
    if (this.relations?.spouse) {
      return this.client.users.fetch(this.relations.spouse);
    }

    return null;
  }

  public async matched(): Promise<GetMatched | null> {
    if (this.relations?.matched) {
      return this.client.matched.fetch(this.relations.matched);
    }

    return null;
  }

  public async current_room(): Promise<Room | null> {
    if (this.relations?.current_room) {
      return this.client.rooms.fetch(this.relations.current_room);
    }

    return null;
  }

  public async gift(product: Product, message?: string): Promise<boolean>;
  public async gift(product: number, message?: string): Promise<boolean>;
  public async gift(product: number | Product, message = ''): Promise<boolean> {
    this.authenticated();

    try {
      await this.client.http.post(`/user/user-${this.client.account.id}/gifts`, {
        id: `https://api.imvu.com/user/user-${this.id}`,
        is_thank_you: false,
        message,
        product_id: typeof product === 'number' ? product : product.id,
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
    this.authenticated();

    return this.client.account.friends.add(this);
  }

  public async *wishlist(): AsyncIterableIterator<Product> {
    yield* new URLPaginator(this.client, this.client.products, `/user/user-${this.id}/wishlist`);
  }
}
