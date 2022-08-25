import { BaseManager } from './BaseManager';
import { Product } from '../resources';
import { URLPaginator } from '../util/Paginator';

export class WishlistManager extends BaseManager {
  public async *list(): AsyncIterableIterator<Product> {
    this.authenticated();

    yield* new URLPaginator(
      this.client,
      this.client.products,
      `/user/user-${this.client.account.id}/wishlist`
    );
  }

  public async count(): Promise<number> {
    this.authenticated();

    const { data } = await this.client.resource(
      `/user/user-${this.client.account.id}/wishlist?limit=0`
    );

    return data['total_count'];
  }

  public async add(product: Product): Promise<boolean>;
  public async add(id: number): Promise<boolean>;
  public async add(product: number | Product): Promise<boolean> {
    const id = typeof product === 'number' ? product : product.id;

    try {
      await this.client.http.post(`/user/user-${this.client.account.id}/wishlist?limit=0`, {
        id: `https://api.imvu.com/product/product-${id}`,
      });

      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  public async remove(product: Product): Promise<boolean>;
  public async remove(id: number): Promise<boolean>;
  public async remove(product: number | Product): Promise<boolean> {
    const id = typeof product === 'number' ? product : product.id;

    try {
      await this.client.http.delete(`/user/user-${this.client.account.id}/wishlist/product-${id}`);

      return true;
    } catch (e) {
      return false;
    }
  }
}
