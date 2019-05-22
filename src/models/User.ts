import { JsonProperty } from 'json-typescript-mapper';

import { Client } from '@/client';
import { Paginator, URLPaginator, Paginators } from '@/util/Paginator';
import { BaseModel, GetMatched, ModelOptions, Product } from '@/models';
import { authenticated } from '@/util/Decorators';

export class User extends BaseModel {
  @JsonProperty({ type: Number, name: 'legacy_cid' } )
  public id: number;

  @JsonProperty('created')
  public created: Date;

  @JsonProperty('registered')
  public registered: number;

  @JsonProperty('gender')
  public gender?: string; // TODO: Add interface/class

  @JsonProperty('display_name')
  public displayName: string;

  @JsonProperty('age')
  public age?: number;

  @JsonProperty('country')
  public country: string;

  @JsonProperty('state')
  public state?: string;

  @JsonProperty('avatar_image')
  public avatarImage: string;

  @JsonProperty('avatar_portrait_image')
  public avatarPortraitImage: string;

  @JsonProperty('username')
  public username: string;

  @JsonProperty('is_vip')
  public isVip: boolean;

  @JsonProperty('is_ap')
  public isAp: boolean;

  @JsonProperty('is_creator')
  public isCreator: boolean;

  @JsonProperty('is_adult')
  public isAdult: boolean;

  @JsonProperty('is_ageverified')
  public isAgeVerified: boolean;

  @JsonProperty('is_staff')
  public isStaff: boolean;

  public matched: GetMatched;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.id = undefined;
    this.created = undefined;
    this.registered = undefined;
    this.gender = undefined;
    this.displayName = undefined;
    this.age = undefined;
    this.country = undefined;
    this.state = undefined;
    this.avatarImage = undefined;
    this.avatarPortraitImage = undefined;
    this.isVip = undefined;
    this.isAp = undefined;
    this.isCreator = undefined;
    this.isAdult = undefined;
    this.isAgeVerified = undefined;
    this.isStaff = undefined;
    this.username = undefined;
  }

  public async load(): Promise<void> {
    const profile = await this.client.matched.fetch(this.id);

    this.matched = profile;
  }

  public async * shop(): AsyncIterableIterator<Product> {
    yield* new Paginator(this.client, (client, offset) => client.products.search({ creator: this.username, start_index: 0, limit: 25, offset }));
  }

  public async * wishlist(): AsyncIterableIterator<Product> {
    yield * new URLPaginator(this.client, Paginators.User, `/user/user-${this.id}/wishlist`);
  }

  /**
   * Add a friend to the client's friends list.
   * @returns {Promise<boolean>} If the operation was successful or not
   */
  @authenticated()
  public async add(): Promise<boolean> {
    return this.client.user.friends.add(this);
  }

  /**
   * Remove a friend from client's friends list.
   * @returns {Promise<boolean>} If the operation was successful or not
   */
  public async remove(): Promise<boolean> {
    return this.client.user.friends.remove(this);
  }
}
