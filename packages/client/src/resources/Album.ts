import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { Resource } from './Resource';
import { User } from './User';
import { Photo } from './Photo';

@JsonObject()
export class Album extends Resource<AlbumRelations> {
	@JsonProperty()
	public title = '';

	@JsonProperty()
	public visibility = 0;

	@JsonProperty()
	public description = '';

	public async owner(): Promise<User | null> {
		return this.relationship('owner', User);
	}

	public async *photos(): AsyncIterableIterator<Photo> {
		yield* this.paginatedRelationship('photos', Photo);
	}
}

export interface AlbumRelations {
	owner: string;
	photos: string;
}
