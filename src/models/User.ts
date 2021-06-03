import {JsonProperty} from '@dhkatz/json-ts';

import {Paginator, URLPaginator} from '@/util/Paginator';
import {BaseModel, Product} from '@/models';

export class User extends BaseModel<Record<string, unknown>> {
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

  public relations = {
    spouse: () => this.client.users.fetch(1),
    matched: () => this.client.matched.fetch(this.id),
    profile: () => ({} as any)
  };

  public async * shop(): AsyncIterableIterator<Product> {
    yield * new Paginator(
      this.client,
      (client, offset) => client.products.search({
        creator: this.username, start_index: 0, limit: 25, offset
      })
    );
  }

  public async * wishlist(): AsyncIterableIterator<Product> {
    yield * new URLPaginator(this.client, this.client.products, `/user/user-${this.id}/wishlist`);
  }
}
