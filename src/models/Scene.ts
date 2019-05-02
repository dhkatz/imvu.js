import { BaseModel, ModelOptions } from './BaseModel';
import { Client } from '../IMVU';
import { Avatar } from './Avatar';
import { Product } from './Product';
import { deserialize, JSONObject } from 'json-typescript-mapper';

/**
 * Object containing information about a "Products in Scene" URL
 * This object does not come from the API and is instead contructed by the OutfitViewer class.
 */
export class Scene extends BaseModel {
  public avatars: Avatar[] = [];

  public _furniture: Array<{ product_id: number; }> = [];

  private cache: Product[] | null = null;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);
  }

  public async furniture(): Promise<Product[]> {
    if (Array.isArray(this.cache)) {
      return this.cache;
    }

    const products = await Promise.all(this._furniture.map(async (product: { product_id: number; }): Promise<Product | null> => {
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
