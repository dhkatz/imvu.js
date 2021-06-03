import {JsonProperty} from '@dhkatz/json-ts';

import {BaseModel, Relations} from './BaseModel';
import {User} from './User';

export class Product extends BaseModel<{ creator: User, parent: Product }> {
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

  relations: Relations<{ creator: User, parent: Product | undefined }> = {
    creator: () => this.client.users.fetch(this.creatorId),
    parent: () => this.client.products.fetch(this.parentId),
  };
}
