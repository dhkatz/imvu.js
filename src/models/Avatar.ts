import { JsonProperty } from 'json-typescript-mapper';

import { Client } from '@/client';
import { Product } from './Product';
import { User } from './User';
import { ModelOptions } from './BaseModel';

export class Avatar extends User {
  @JsonProperty('look_url')
  public lookUrl?: string;

  @JsonProperty('asset_url')
  public assetUrl?: string;

  @JsonProperty('products')
  public _products?: Array<{ id: string; product_id: number; owned: boolean; rating: string; }>;

  public outfit: Product[];

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.lookUrl = undefined;
    this.assetUrl = undefined;
    this._products = undefined;
    this.outfit = undefined;
  }

  public async load(): Promise<void> {
    await super.load();

    if (!this.outfit) {
      this.outfit = await Promise.all(this._products.map((product) => this.client.products.fetch(product.product_id)));
    }
  }
}
