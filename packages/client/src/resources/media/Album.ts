import { Resource } from '../Resource';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';

@JsonObject()
export class Album extends Resource {
  @JsonProperty()
  public title = '';

  @JsonProperty()
  public visibility = 0;

  @JsonProperty()
  public description = '';
}
