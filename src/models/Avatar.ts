import { deserialize, JsonProperty } from 'json-typescript-mapper';

import { Memoize } from '@/util';
import { Product } from './Product';
import { User } from './User';

export class Avatar extends User {
  @JsonProperty('look_url')
  public lookUrl?: string;

  @JsonProperty('asset_url')
  public assetUrl?: string;

  @JsonProperty({ clazz: Product, name: 'products'})
  // tslint:disable-next-line:variable-name
  private _products?: Product[];

  public constructor() {
    super();
  }

  @Memoize(() => Math.round(new Date().getTime() / 3600000 ) * 3600000)
  public async products(): Promise<Product[]> {
    return Promise.all(this._products.map(async (product: Product): Promise<Product | null> => {
      try {
        const { data } = await this.http.get(`/product/product-${product.id}`);

        return deserialize(Product, (Object.values(data.denormalized)[0] as any).data);
      } catch {
        return null;
      }
    }));
  }
}
