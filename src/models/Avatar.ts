import { JsonProperty } from 'json-typescript-mapper';

import Product from './Product';
import User from './User';

export default class Avatar extends User {
  @JsonProperty('look_url')
  public lookUrl?: string;

  @JsonProperty('asset_url')
  public assetUrl?: string;

  @JsonProperty({ clazz: Product, name: 'products'})
  public products?: Product[];
}
