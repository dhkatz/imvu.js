import { JsonProperty } from 'json-typescript-mapper';

import { BaseModel } from './BaseModel';

export class Product extends BaseModel {
  @JsonProperty('product_id')
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

  @JsonProperty('categories')
  public categories: string[];

  @JsonProperty('is')
  public types: string[];

  public constructor() {
    super();

    this.id = void 0;
    this.name = void 0;
    this.creatorId = void 0;
    this.creatorName = void 0;
    this.rating = void 0;
    this.price = void 0;
    this.discountPrice = void 0;
    this.page = void 0;
    this.creatorPage = void 0;
    this.isBundle = void 0;
    this.image = void 0;
    this.gender = void 0;
    this.categories = void 0;
    this.types = void 0;
  }
}
