import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { Product } from '../product/Product';
import { Resource } from '../Resource';

export type PartialProduct = { id: string; product_id: number; owned: boolean; rating: string };

@JsonObject()
export class Avatar extends Resource {
  @JsonProperty()
  public lookUrl = '';

  @JsonProperty()
  public assetUrl = '';

  @JsonProperty()
  public gender = '';

  @JsonProperty({ name: 'products', type: Object })
  public _products: PartialProduct[] = [];

  public async *products(): AsyncIterableIterator<Product> {
    for (const product of this._products) {
      const p = await this.client.products.fetch(product.product_id);

      if (p) {
        yield p;
      }
    }
  }
}
