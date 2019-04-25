import { JsonProperty } from 'json-typescript-mapper';

import { BaseModel } from './BaseModel';

export class User extends BaseModel {
  @JsonProperty('created')
  public created: Date;

  @JsonProperty('registered')
  public registered: number;

  @JsonProperty('gender')
  public gender?: string; // TODO: Add interface/class

  @JsonProperty('display_name')
  public displayName: string;

  @JsonProperty('age')
  public age?: number;

  @JsonProperty('country')
  public country: string;

  @JsonProperty('state')
  public state?: string;

  @JsonProperty('avatar_image')
  public avatarImage: string;

  @JsonProperty('avatar_portrait_image')
  public avatarPortraitImage: string;

  @JsonProperty('is_vip')
  public isVip: boolean;

  @JsonProperty('is_ap')
  public isAp: boolean;

  @JsonProperty('is_creator')
  public isCreator: boolean;

  @JsonProperty('is_adult')
  public isAdult: boolean;

  @JsonProperty('is_ageverified')
  public isAgeVerified: boolean;

  @JsonProperty('is_staff')
  public isStaff: boolean;

  public constructor() {
    super();

    this.created = void 0;
    this.registered = void 0;
    this.gender = void 0;
    this.displayName = void 0;
    this.age = void 0;
    this.country = void 0;
    this.state = void 0;
    this.avatarImage = void 0;
    this.avatarPortraitImage = void 0;
    this.isVip = void 0;
    this.isAp = void 0;
    this.isCreator = void 0;
    this.isAdult = void 0;
    this.isAgeVerified = void 0;
    this.isStaff = void 0;
  }
}
