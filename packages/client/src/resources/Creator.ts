import { Resource } from './Resource.js';
import { Product } from './Product.js';
import { ProductSaleEvent } from './ProductSaleEvent.js';
import type { Collection } from '../collections/Collection.js';

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

	public products(): Collection<Product> {
		return this.collectionRelationship('products', Product);
	}

	public sales(): Collection<ProductSaleEvent> {
		this.authenticated();
		return this.collectionRelationship('product_sale_events', ProductSaleEvent);
	}
}

export interface CreatorRelations {
	products: string;
	product_sale_events: string;
}
