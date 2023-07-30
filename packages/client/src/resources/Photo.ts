import { Resource } from './Resource';
import { User } from './User';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';
import { Album } from './Album';

@JsonObject()
export class Photo extends Resource<PhotoRelations> {
	@JsonProperty()
	public title = '';

	@JsonProperty()
	public caption = '';

	@JsonProperty()
	public keywords = '';

	@JsonProperty()
	public shareable = true;

	@JsonProperty()
	public pid = -1;

	public get id() {
		return `${this.pid}`;
	}

	public async owner(): Promise<User | null> {
		return this.relationship('owner', User);
	}

	public async album(): Promise<Album | null> {
		return this.relationship('album', Album);
	}
}

export interface PhotoRelations {
	owner: string;
	album: string;
}
