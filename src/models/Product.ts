import { JsonProperty } from 'json-typescript-mapper';

export default class Product {
  @JsonProperty('product_id')
  public Id?: number;

  @JsonProperty('product_name')
  public name?: string;

  @JsonProperty('creator_cid')
  public creatorId?: number;

  @JsonProperty('creator_name')
  public creatorName?: string;

  @JsonProperty('rating')
  public rating?: string; // TODO Add interface/enum/class

  @JsonProperty('product_price')
  public price?: number;

  @JsonProperty('discount_price')
  public discountPrice?: number;

  @JsonProperty('product_page')
  public page?: string;

  @JsonProperty('creator_page')
  public creatorPage?: string;

  @JsonProperty('is_bundle')
  public isBundle?: boolean;

  @JsonProperty('product_image')
  public image?: string;

  @JsonProperty('gender')
  public gender?: string; // TODO: Update to interface/enum/class

  @JsonProperty('categories')
  public categories?: string[];

  @JsonProperty('is')
  public types?: string[];
}
