import { Product } from './Product';
import { Resource } from './Resource';

export type PartialProduct = { id: string; product_id: number; owned: boolean; rating: string };

export class Avatar extends Resource {
	public lookUrl = '';
	public assetUrl = '';
	public gender = '';
	public _products: PartialProduct[] = [];

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('look_url' in data) this.lookUrl = data.look_url;
		if ('asset_url' in data) this.assetUrl = data.asset_url;
		if ('gender' in data) this.gender = data.gender;
		if ('products' in data) this._products = data.products;
	}

	public async *products(): AsyncIterableIterator<Product> {
		for (const product of this._products) {
			const p = await this.client.products.fetch(product.product_id);

			if (p) {
				yield p;
			}
		}
	}
}
