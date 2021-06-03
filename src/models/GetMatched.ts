import { JsonProperty } from '@dhkatz/json-ts';

import { BaseModel } from './BaseModel';

export class GetMatched extends BaseModel<Record<string, unknown>> {
  @JsonProperty('avatarname')
  public username: string;

  @JsonProperty('story')
  public story: string;

  @JsonProperty({ name: 'progress', type: Number })
  public progress: number[];

  @JsonProperty('status')
  public status: string;

  @JsonProperty('ap_profile')
  public isApProfile: boolean;

  public relations = {
    user: () => this.client.users.search({ username: this.username })
  }
}
