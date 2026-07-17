import { Resource } from './Resource.js';
import { User } from './User.js';
import { Photo } from './Photo.js';

export class Album extends Resource<AlbumRelations> {
	public title = '';
	public visibility = 0;
	public description = '';

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('title' in data) this.title = data.title;
		if ('visibility' in data) this.visibility = data.visibility;
		if ('description' in data) this.description = data.description;
	}

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
