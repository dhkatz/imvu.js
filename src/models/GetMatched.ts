import { JsonProperty } from 'json-typescript-mapper';

export class GetMatched {
  @JsonProperty('avatarname')
  public username: string;

  @JsonProperty('story')
  public story: string;

  @JsonProperty('progress')
  public progress: number[];

  @JsonProperty('status')
  public status: string;

  @JsonProperty('ap_profile')
  public isApProfile: boolean;
}
