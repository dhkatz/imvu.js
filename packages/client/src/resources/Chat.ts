import { Resource } from './Resource';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';

@JsonObject()
export class Chat extends Resource {
	@JsonProperty()
	public activity = '';

	@JsonProperty()
	public capacity = 0;
}
