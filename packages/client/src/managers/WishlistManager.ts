import { BaseManager } from './BaseManager';
import { Product } from '../resources';
import { URLPaginator } from '../util/Paginator';

export class WishlistManager extends BaseManager {
  public get base(): string {
    return `/user/user-${this.client.account.id}/wishlist`;
  }

  public async *list(): AsyncIterableIterator<Product> {
    this.authenticated();

    yield* new URLPaginator(this.client, this.client.products, this.base);
  }

  public async count(): Promise<number> {
    this.authenticated();

    const { data } = await this.client.resource(`${this.base}?limit=0`);

    return data['total_count'];
  }

  public async add(product: Product): Promise<boolean>;
  public async add(id: number | string): Promise<boolean>;
  public async add(product: number | string | Product): Promise<boolean> {
    const id = await this.client.utils.id(product);

    try {
      await this.client.http.post(`${this.base}?limit=0`, {
        id: `https://api.imvu.com/product/product-${id}`,
      });

      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  public async remove(product: Product): Promise<boolean>;
  public async remove(id: number | string): Promise<boolean>;
  public async remove(product: number | string | Product): Promise<boolean> {
    const id = await this.client.utils.id(product);

    try {
      await this.client.http.delete(`${this.base}/product-${id}`);

      return true;
    } catch (e) {
      return false;
    }
  }
}
