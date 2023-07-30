import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { Resource } from './Resource';
import { User } from './User';

@JsonObject()
export class Product extends Resource<ProductRelations> {
	@JsonProperty('product_name')
	public name = '';

	@JsonProperty('creator_cid')
	public creatorId = -1;

	@JsonProperty()
	public creatorName = '';

	@JsonProperty()
	public rating = ''; // TODO Add interface/enum/class

	@JsonProperty('product_price')
	public price = -1;

	@JsonProperty()
	public profit = 0;

	@JsonProperty()
	public discountPrice = -1;

	@JsonProperty('product_page')
	public page = '';

	@JsonProperty()
	public creatorPage = '';

	@JsonProperty()
	public isBundle = false;

	@JsonProperty('product_image')
	public image = '';

	@JsonProperty()
	public gender: string | null = null; // TODO: Update to interface/enum/class

	@JsonProperty()
	public categories: string[] = [];

	@JsonProperty({ name: 'is' })
	public types: string[] = [];

	@JsonProperty()
	public tags: string[] = [];

	@JsonProperty()
	public isPurchasable = false;

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
