import { Resource } from './Resource';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';

@JsonObject()
export class Login extends Resource {
	@JsonProperty()
	public user: { id: string } = { id: '' };

	@JsonProperty()
	public sauce = '';

	@JsonProperty('session_id')
	public sessionId = '';

	@JsonProperty()
	public source = '';
}
