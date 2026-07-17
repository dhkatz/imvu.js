import { Resource } from './Resource.js';
import { Product } from './Product.js';

export class Creator extends Resource<CreatorRelations> {
	public tier = 0;
	public isPro = false;
	public isActive = false;
	public isTopSeller = false;
	public isVeteran = false;

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('creator_tier' in data) this.tier = data.creator_tier;
		if ('is_pro' in data) this.isPro = data.is_pro;
		if ('is_active' in data) this.isActive = data.is_active;
		if ('is_top_seller' in data) this.isTopSeller = data.is_top_seller;
		if ('is_veteran' in data) this.isVeteran = data.is_veteran;
	}

	public async *products(): AsyncIterableIterator<Product> {
		yield* this.paginatedRelationship('products', Product);
	}

	public async *sales(): AsyncIterableIterator<Product> {
		this.authenticated();

		yield* this.paginatedRelationship('product_sale_events', Product);
	}
}

export interface CreatorRelations {
	products: string;
	product_sale_events: string;
}
