import { Resource } from './Resource';
import { User } from './User';

export class Product extends Resource<ProductRelations> {
	public name = '';
	public creatorId = -1;
	public creatorName = '';
	public rating = ''; // TODO Add interface/enum/class
	public price = -1;
	public profit = 0;
	public discountPrice = -1;
	public page = '';
	public creatorPage = '';
	public isBundle = false;
	public image = '';
	public gender: string | null = null; // TODO: Update to interface/enum/class
	public categories: string[] = [];
	public types: string[] = [];
	public tags: string[] = [];
	public isPurchasable = false;

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('product_name' in data) this.name = data.product_name;
		if ('creator_cid' in data) this.creatorId = data.creator_cid;
		if ('creator_name' in data) this.creatorName = data.creator_name;
		if ('rating' in data) this.rating = data.rating;
		if ('product_price' in data) this.price = data.product_price;
		if ('profit' in data) this.profit = data.profit;
		if ('discount_price' in data) this.discountPrice = data.discount_price;
		if ('product_page' in data) this.page = data.product_page;
		if ('creator_page' in data) this.creatorPage = data.creator_page;
		if ('is_bundle' in data) this.isBundle = data.is_bundle;
		if ('product_image' in data) this.image = data.product_image;
		if ('gender' in data) this.gender = data.gender;
		if ('categories' in data) this.categories = data.categories;
		if ('is' in data) this.types = data.is;
		if ('tags' in data) this.tags = data.tags;
		if ('is_purchasable' in data) this.isPurchasable = data.is_purchasable;
	}

	public async creator(): Promise<User | null> {
		return this.relationship('creator', User);
	}

	public async parent(): Promise<Product | null> {
		return this.relationship('parent', Product);
	}

	/**
	 * Async iterator for all the product's ancestors.
	 * This is more efficient than calling `product.parent()` until it returns `null`.
	 */
	public async *ancestors(): AsyncIterableIterator<Product> {
		yield* this.paginatedRelationship('ancestor_products', Product);
	}
}

export interface ProductRelations {
	creator: string;
	parent: string;
	ancestor_products: string;
}
