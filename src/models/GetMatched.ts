import { JsonProperty } from 'json-typescript-mapper';

import { BaseModel, ModelOptions } from './BaseModel';
import { Client } from '../IMVU';
import { User } from './User';

export class GetMatched extends BaseModel {
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

  public user: User;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.username = undefined;
    this.story = undefined;
    this.progress = undefined;
    this.status = undefined;
    this.isApProfile = undefined;
  }

  public async load(): Promise<void> {
    const [user] = await this.client.users.search({ username: this.username })

    this.user = user;
  }
}
