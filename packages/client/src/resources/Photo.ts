import { Resource } from './Resource';
import { User } from './User';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';
import { Album } from './Album';

@JsonObject()
export class Photo extends Resource {
	@JsonProperty()
	public title = '';

	@JsonProperty()
	public caption = '';

	@JsonProperty()
	public keywords = '';

	@JsonProperty()
	public shareable = true;

	public async owner(): Promise<User | null> {
		return this.relations?.owner ? this.client.users.fetch(this.relations.owner) : null;
	}

	public async album(): Promise<Album | null> {
		return this.relations?.album ? this.client.resource(this.relations.album, Album) : null;
	}
}
