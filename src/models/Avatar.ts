import {ICustomConverter, JsonProperty} from '@dhkatz/json-ts';

import { Client } from '@/client';
import { Product } from './Product';
import {BaseModel, ModelOptions} from './BaseModel';
import {User} from "@/models/User";

export type PartialProduct = { id: string; product_id: number; owned: boolean; rating: string };

const PartialProductConverter: ICustomConverter<PartialProduct> = {
  fromJson: (data: any): PartialProduct => data,
  toJson: (data: PartialProduct): any => data
};

export class Avatar extends BaseModel {
  @JsonProperty('look_url')
  public lookUrl: string;

  @JsonProperty('asset_url')
  public assetUrl: string;

  @JsonProperty({ name: 'products', type: Object, converter: PartialProductConverter })
  public _products?: PartialProduct[];

  public products: Product[];

  public user: User;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.lookUrl = undefined;
    this.assetUrl = undefined;
    this._products = undefined;
    this.products = undefined;
  }

  public async load(): Promise<void> {
    if (!this.products) {
      this.products = await Promise.all(this._products.map((product) => this.client.products.fetch(product.product_id)));
    }

    if (!this.lookUrl) {
      this.lookUrl = this._products.map(p => p.product_id).join('%2C');
    }
  }
}
