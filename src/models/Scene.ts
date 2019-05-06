import { BaseModel } from './BaseModel';
import { Avatar } from './Avatar';
import { Product } from './Product';

export interface SceneData {
  avatars: Map<number, number[]>;
  furniture: number[];
}

/**
 * Object containing information about a "Products in Scene" URL
 * This object does not come from the API and is instead contructed by the OutfitViewer class.
 */
export class Scene extends BaseModel {
  public data: SceneData = { avatars: new Map(), furniture: [] };

  public avatars: Avatar[] = [];

  public furniture: Product[] = [];

  /**
   * Load the `Avatar` and `Product` objects from the `Scene` data.
   */
  public async load(): Promise<void> {
    this.avatars = await Promise.all([...this.data.avatars].map(async ([id, products]: [number, number[]]) => {

      // This is what I consider an "ugly hack" to create an Avatar instance using methods that exit on the client.
      // Without this, I'd probably have to write a way to create Avatars separately even though they aren't
      // provided by the API.
      const user = await this.client.users.fetch(id);

      const avatar = new (Function.bind.apply(Avatar, [user, user.client, user.options])) as Avatar;

      for (const key of Object.keys(user)) {
        avatar[key] = user[key];
      }

      // End of ugly hack, 'avatar' should now be an instance of Avatar with all the properties from 'user'.

      avatar._products = products.map((value) => { return { product_id: value, owned: true }; }) as any;
      avatar.lookUrl = `https://api.imvu.com/look/${products.join('%2C')}`;

      await avatar.load();

      return avatar;
    }));

    this.furniture = await Promise.all(this.data.furniture.map((value) => this.client.products.fetch(value)));
  }
}
