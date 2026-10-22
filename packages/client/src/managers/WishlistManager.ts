import { BaseManager } from './BaseManager.js';
import { Product } from '../resources/index.js';
import type { Collection } from '../collections/Collection.js';

export class WishlistManager extends BaseManager {
	public get base(): string {
		return `/user/user-${this.client.account.id}/wishlist`;
	}

	public list(): Collection<Product> {
		this.authenticated();
		return this.client.account.user.wishlist();
	}

	public async count(): Promise<number> {
		this.authenticated();
		return this.list().count();
	}

	public async add(product: Product): Promise<boolean>;
	public async add(id: number | string): Promise<boolean>;
	public async add(product: number | string | Product): Promise<boolean> {
		const id = await this.client.utils.id(product);

		try {
			await this.client.request(`${this.base}?limit=0`, {
				method: 'POST',
				data: { id: `https://api.imvu.com/product/product-${id}` },
			});
			this.invalidateAccountWishlist();

			return true;
		} catch {
			return false;
		}
	}

	public async remove(product: Product): Promise<boolean>;
	public async remove(id: number | string): Promise<boolean>;
	public async remove(product: number | string | Product): Promise<boolean> {
		const id = await this.client.utils.id(product);

		try {
			await this.client.request(`${this.base}/product-${id}`, { method: 'DELETE' });
			this.invalidateAccountWishlist();

			return true;
		} catch {
			return false;
		}
	}

	private invalidateAccountWishlist(): void {
		this.list()._invalidate();
	}
}
