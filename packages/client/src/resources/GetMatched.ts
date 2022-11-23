import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { Resource } from './Resource';
import { User } from './User';

@JsonObject()
export class GetMatched extends Resource {
	@JsonProperty('avatarname')
	public username = '';

	@JsonProperty()
	public story = '';

	@JsonProperty()
	public progress: number[] = [];

	@JsonProperty()
	public status = '';

	@JsonProperty()
	public apProfile: '0' | '1' = '0';

	public async user(): Promise<User | null> {
		return this.relations?.user ? this.client.users.fetch(this.relations.user) : null;
	}
}
