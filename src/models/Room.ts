import { JsonProperty } from '@dhkatz/json-ts';

import { Client } from '@/client';
import { BaseModel, ModelOptions } from './BaseModel';

export class Room extends BaseModel {
  public id: number;

  @JsonProperty()
  public name: string;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.name = undefined;
  }

  public async load(): Promise<void> {

  }
}
