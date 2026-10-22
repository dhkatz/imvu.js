import { BaseManager } from './BaseManager.js';
import { Product } from '../resources/index.js';
import type { Collection } from '../collections/Collection.js';

export class CartManager extends BaseManager {
	public get base(): string {
		return `/cart/cart-${this.client.account.id}`;
	}

	public products(): Collection<Product> {
		this.authenticated();
		return this.client.collection(`${this.base}/products`, Product);
	}

	public async price(): Promise<number> {
		const { data } = await this.client.resource(this.base);

		return data['total_price'];
	}
}
