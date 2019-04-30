import { deserialize, JsonProperty, JSONObject } from 'json-typescript-mapper';

import { Product } from './Product';
import { User } from './User';
import { Client } from '../IMVU';
import { ModelOptions } from './BaseModel';

export class Avatar extends User {
  @JsonProperty('look_url')
  public lookUrl?: string;

  @JsonProperty('asset_url')
  public assetUrl?: string;

  @JsonProperty({ type: Product, name: 'products'})
  private _products?: Product[];

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.lookUrl = undefined;
    this.assetUrl = undefined;
    this._products = undefined;
  }

  public async products(): Promise<Product[]> {
    return Promise.all(this._products.map(async (product: Product): Promise<Product | null> => {
      try {
        const { data } = await this.http.get(`/product/product-${product.id}`);

        return deserialize<Product, JSONObject>(Product, (Object.values(data.denormalized)[0] as any).data);
      } catch {
        return null;
      }
    }));
  }
}
