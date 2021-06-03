import {BaseModel} from "@/models/BaseModel";
import {JsonProperty} from "@dhkatz/json-ts";

export class Chat extends BaseModel {
  @JsonProperty('activity')
  public activity: string;

  @JsonProperty('capacity')
  public capacity: number;
}
