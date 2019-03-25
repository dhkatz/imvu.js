import { JsonProperty } from 'json-typescript-mapper';

export interface UserQueryParams {
  id?: number;
  username?: string;
}

export class User {
  @JsonProperty('created')
  public created?: Date;

  @JsonProperty('registered')
  public registered?: number;

  @JsonProperty('gender')
  public gender?: string; // TODO: Add interface/class

  @JsonProperty('display_name')
  public displayName: string;

  @JsonProperty('age')
  public age?: number;

  @JsonProperty('country')
  public country?: string;

  @JsonProperty('state')
  public state?: string;

  @JsonProperty('avatar_image')
  public avatarImage?: string;

  @JsonProperty('avatar_portrait_image')
  public avatarPortraitImage?: string;

  @JsonProperty('is_vip')
  public isVip?: boolean;

  @JsonProperty('is_ap')
  public isAp?: boolean;

  @JsonProperty('is_creator')
  public isCreator?: boolean;

  @JsonProperty('is_adult')
  public isAdult?: boolean;

  @JsonProperty('is_ageverified')
  public isAgeVerified?: boolean;

  @JsonProperty('is_staff')
  public isStaff?: boolean;
}
