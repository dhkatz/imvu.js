import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { Resource } from './Resource';
import { User } from './User';

@JsonObject()
export class Room extends Resource {
	@JsonProperty()
	public name = '';

	@JsonProperty()
	public description = '';

	@JsonProperty()
	public privacy = '';

	@JsonProperty()
	public rating = 0;

	@JsonProperty()
	public capacity = 0;

	public async moderators(): Promise<User[]> {
		return this.client.resources(`/room/room-${this.id}/moderators`, User);
	}
}
