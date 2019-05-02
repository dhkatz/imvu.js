import { deserialize, JsonProperty, JSONObject } from 'json-typescript-mapper';

import { Product } from './Product';
import { User } from './User';
import { Client } from '../IMVU';
import { ModelOptions } from './BaseModel';

export interface PartialProduct { id: string; product_id: number; owned: boolean; rating: string; };

export class Avatar extends User {
  @JsonProperty('look_url')
  public lookUrl?: string;

  @JsonProperty('asset_url')
  public assetUrl?: string;

  @JsonProperty('products')
  public _products?: PartialProduct[];

  private cache: Product[] | null = null;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.lookUrl = undefined;
    this.assetUrl = undefined;
    this._products = undefined;
  }

  public async products(): Promise<Product[]> {
    if (Array.isArray(this.cache)) {
      return this.cache;
    }

    const products = await Promise.all(this._products.map(async (product: PartialProduct): Promise<Product | null> => {
      try {
        const { data } = await this.http.get(`/product/product-${product.product_id}`);

        return deserialize<Product, JSONObject>(Product, (Object.values(data.denormalized)[0] as any).data);
      } catch {
        return null;
      }
    }));

    this.cache = products;

    return products;
  }
}
