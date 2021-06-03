import {BaseModel} from "@/models/BaseModel";
import {JsonProperty} from "@dhkatz/json-ts";

export class Profile extends BaseModel {
  @JsonProperty('image')
  public image: string;

  @JsonProperty('online')
  public online: boolean;

  @JsonProperty('avatar_name')
  public username: string;

  @JsonProperty('title')
  public displayName: string;

  @JsonProperty('approx_following_count')
  public followingCount: number;

  @JsonProperty('approx_follower_count')
  public followerCount: number;

  public async load(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
