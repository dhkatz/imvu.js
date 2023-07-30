import { Resource } from './Resource';
import { Product } from './Product';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';

@JsonObject()
export class Creator extends Resource<CreatorRelations> {
	@JsonProperty('creator_tier')
	public tier = 0;

	@JsonProperty()
	public isPro = false;

	@JsonProperty()
	public isActive = false;

	@JsonProperty()
	public isTopSeller = false;

	@JsonProperty()
	public isVeteran = false;

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
