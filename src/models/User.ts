import { JsonProperty } from 'json-typescript-mapper';

import { BaseModel, ModelOptions } from './BaseModel';
import { Client } from '../IMVU';
import { Product } from './Product';

export class User extends BaseModel {
  @JsonProperty('legacy_cid')
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

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

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

  public async products(): Promise<Product[]> {
    const products = await this.client.product.fetch({ creator: this.username });

    return products != null ? products : [];
  }
}
