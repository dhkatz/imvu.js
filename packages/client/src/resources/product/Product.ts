import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { Resource } from '../Resource';
import type { User } from '../user/User';
import { URLPaginator } from '../../util/Paginator';

@JsonObject()
export class Product extends Resource {
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

	public async creator(): Promise<User | null> {
		return this.client.users.fetch(this.creatorId);
	}

	public async parent(): Promise<Product | null> {
		if (this.relations?.parent) {
			return this.client.products.fetch(this.relations.parent);
		}

		return null;
	}

	public async *ancestors(): AsyncIterableIterator<Product> {
		yield* new URLPaginator(this.client, Product, `/products/product-${this.id}/ancestor_products`);
	}
}
