import {BaseManager} from "@/managers/BaseManager";
import {Product} from "@/models";
import {URLPaginator} from "@/util/Paginator";
import {authenticated} from "@/util/Decorators";

export class WishlistManager extends BaseManager {
  public async * list(): AsyncIterableIterator<Product> {
    yield * new URLPaginator(this.client, this.client.products, `/user/user-${this.client.user.id}/wishlist`);
  }

  @authenticated()
  public async count(): Promise<number> {
    const { data } = await this.client.http.get(`/user/user-${this.client.user.id}/wishlist?limit=0`);

    return data.denormalized[data.id].data['total_count'];
  }

  public async add(product: Product): Promise<boolean>;
  public async add(id: number): Promise<boolean>;
  public async add(product: number | Product): Promise<boolean> {
    const id = typeof product === 'number' ? product : product.id;

    try {
      await this.client.http.post(
        `/user/user-${this.client.user.id}/wishlist?limit=0`,
        { id: `https://api.imvu.com/product/product-${id}` }
      );

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
      await this.client.http.delete(`/user/user-${this.client.user.id}/wishlist/product-${id}`);

      return true;
    } catch (e) {
      return false;
    }
  }
}
