import { Product, Resource } from '../resources/index.js';

export class Outfit extends Resource<OutfitRelations> {
	public outfitName = '';
	public dirty = '0';
	public fullImage = '';
	public outfitImage = '';
	public rating = 'GA';
	public privacy = '0';
	public pids: number[] = [];

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('outfit_name' in data) this.outfitName = data.outfit_name;
		if ('dirty' in data) this.dirty = data.dirty;
		if ('full_image' in data) this.fullImage = data.full_image;
		if ('outfit_image' in data) this.outfitImage = data.outfit_image;
		if ('rating' in data) this.rating = data.rating;
		if ('privacy' in data) this.privacy = data.privacy;
		if ('pids' in data) this.pids = data.pids;
	}

	public async *products(): AsyncIterableIterator<Product> {
		yield* this.paginatedRelationship('products', Product);
	}
}

export interface OutfitRelations {
	products: string;
}
