import {JsonProperty} from '@dhkatz/json-ts';

import {Client} from '@/client';
import {BaseModel, ModelOptions} from './BaseModel';
import {User} from './User';

export class Product extends BaseModel {
  @JsonProperty({ type: Number, name: 'product_id' })
  public id: number;

  @JsonProperty('product_name')
  public name: string;

  @JsonProperty('creator_cid')
  public creatorId: number;

  @JsonProperty('creator_name')
  public creatorName: string;

  @JsonProperty('rating')
  public rating: string; // TODO Add interface/enum/class

  @JsonProperty('product_price')
  public price: number;

  @JsonProperty('discount_price')
  public discountPrice: number;

  @JsonProperty('product_page')
  public page: string;

  @JsonProperty('creator_page')
  public creatorPage: string;

  @JsonProperty('is_bundle')
  public isBundle: boolean;

  @JsonProperty('product_image')
  public image: string;

  @JsonProperty('gender')
  public gender: string | null; // TODO: Update to interface/enum/class

  @JsonProperty({ name: 'categories', type: String })
  public categories: string[];

  @JsonProperty({ name: 'is', type: String })
  public types: string[];

  public creator: User;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.id = undefined;
    this.name = undefined;
    this.creatorId = undefined;
    this.creatorName = undefined;
    this.rating = undefined;
    this.price = undefined;
    this.discountPrice = undefined;
    this.page = undefined;
    this.creatorPage = undefined;
    this.isBundle = undefined;
    this.image = undefined;
    this.gender = undefined;
    this.categories = undefined;
    this.types = undefined;
  }

  public async load(): Promise<void> {
    this.creator = await this.client.users.fetch(this.creatorId);
  }
}
