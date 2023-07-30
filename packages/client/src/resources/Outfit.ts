import { Product, Resource } from '../resources';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';

@JsonObject()
export class Outfit extends Resource<OutfitRelations> {
	@JsonProperty()
	public outfitName = '';

	@JsonProperty()
	public dirty = '0';

	@JsonProperty()
	public fullImage = '';

	@JsonProperty()
	public outfitImage = '';

	@JsonProperty()
	public rating = 'GA';

	@JsonProperty()
	public privacy = '0';

	@JsonProperty()
	public pids: number[] = [];

	public async *products(): AsyncIterableIterator<Product> {
		yield* this.paginatedRelationship('products', Product);
	}
}

export interface OutfitRelations {
	products: string;
}
