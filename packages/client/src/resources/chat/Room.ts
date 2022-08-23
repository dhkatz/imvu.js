import { JsonObject, JsonProperty } from 'typescript-json-serializer';

import { Resource } from '../Resource';

@JsonObject()
export class Room extends Resource {
  public id = -1;

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
}
