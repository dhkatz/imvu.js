import { URLPaginator } from '../util/Paginator.js';
import { BaseManager } from './BaseManager.js';
import { Product } from '../resources/index.js';

export class CartManager extends BaseManager {
	public get base(): string {
		return `/cart/cart-${this.client.account.id}`;
	}

	public async *products(): AsyncIterableIterator<Product> {
		this.authenticated();

		yield* new URLPaginator(this.client, Product, `${this.base}/products`);
	}

	public async price(): Promise<number> {
		const { data } = await this.client.resource(this.base);

		return data['total_price'];
	}
}
