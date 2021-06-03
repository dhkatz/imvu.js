import { JsonProperty } from '@dhkatz/json-ts';

import { BaseModel } from './BaseModel';

export class Room extends BaseModel {
  public id: number;

  @JsonProperty()
  public name: string;

  @JsonProperty()
  public description: string;

  @JsonProperty()
  public privacy: string;

  @JsonProperty()
  public rating: number;

  @JsonProperty()
  public capacity: number;

  public load(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
