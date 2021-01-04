import { BaseModel } from './BaseModel';
import {Avatar, PartialProduct} from './Avatar';
import { Product } from './Product';
import {deserialize} from "@dhkatz/json-ts";

export interface SceneData {
  avatars: Map<number, PartialProduct[]>;
  furniture: number[];
}

/**
 * Object containing information about a "Products in Scene" URL
 * This object does not come from the API and is instead constructed by the OutfitViewer class.
 */
export class Scene extends BaseModel {
  public data: SceneData = { avatars: new Map(), furniture: [] };

  public avatars: Avatar[] = [];

  public furniture: Product[] = [];

  /**
   * Load the `Avatar` and `Product` objects from the `Scene` data.
   */
  public async load(): Promise<void> {
    this.avatars = await Promise.all([...this.data.avatars].map(async ([id, products]: [number, PartialProduct[]]) => {
      const user = await this.client.users.fetch(id);

      const avatar = new Avatar(this.client, user.options);

      const ids = products.map(p => p.product_id);

      deserialize(avatar, {
        look_url: `https://api.imvu.com/look/${ids.join('%2C')}`,
        asset_url: '',
        legacy_message: `*putOnOutfit ${ids.join(' ')}`,
        products
      });

      await avatar.load();

      avatar.user = user;

      return avatar;
    }));

    this.furniture = await Promise.all(this.data.furniture.map((value) => this.client.products.fetch(value)));
  }
}
