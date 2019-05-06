import { JsonProperty } from 'json-typescript-mapper';

import { BaseModel, ModelOptions } from './BaseModel';
import { Client } from '../IMVU';
import { Product } from './Product';
import { GetMatched } from './GetMatched';
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
    let offset = 0;
    while (true) {
      try {
        const products = await this.client.products.search({ creator: this.username, start_index: 0, limit: 25, offset });
        
        if (!products.length) {
          return;
        }

        offset += 25;

        for (const product of products) {
          if (product === null) {
            continue;
          }

          yield product;
        }
      } catch (err) {
        return;
      }
    }
  }

  public async * wishlist(): AsyncIterableIterator<Product> {
    let offset = 0;
    while (true) {
      try {
        const { data } = await this.client.http.get(`/user/user-${this.id}/wishlist`, { params: { start_index: offset, limit: 25 } })

        const products: Product[] = await Promise.all((Object.values(data.denormalized).pop() as any).data.items
          .map((url: string) => parseInt(url.split('-').pop()))
          .map((id: number) => this.client.products.fetch(id)));
        
        if (!products.length) {
          return;
        }

        offset += 25;

        for (const product of products) {
          if (product === null) {
            continue;
          }

          yield product;
        }
      } catch (err) {
        return;
      }
    }
  }
}
