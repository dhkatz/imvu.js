import {BaseModel} from "@/models/BaseModel";
import {JsonProperty} from "@dhkatz/json-ts";

export class Album extends BaseModel {
  @JsonProperty()
  public title: string;

  @JsonProperty()
  public visibility: number;

  @JsonProperty()
  public description: string;

  load(): Promise<void> {
    return Promise.resolve(undefined);
  }

}
