import { Client } from '../IMVU';
import { Scene, Avatar } from '../models';

export class OutfitViewer {
  public static AVATAR_PATTERN: RegExp = /avatar(\d+)=(?:(\d+)(?:(?:(?:%3B)|;))?)+/mig;
  public static ROOM_PATTERN: RegExp = /room=((\d+)(?:x\d)?(?:(?:(?:%3B)|;))?)+/mi;

  public client: Client;

  public constructor(client: Client) {
    this.client = client;
  }

  public async parse(url: string): Promise<Scene> {
    const data = url.match(OutfitViewer.AVATAR_PATTERN);

    // The separator might be URL encoded or not
    const separator = url.includes('%3B') ? '%3B' : ';';

    const scene = new Scene(this.client);

    scene.avatars = await Promise.all(data.map(async (value: string) => {
      const split = value.split('=');
      const id = parseInt(split[0].replace('avatar', ''));
      const products = split[1]
        .split(separator)
        .map((value) => parseInt(value, 10));

      // This is what I consider an "ugly hack" to create an Avatar instance using methods that exit on the client.
      // Without this, I'd probably have to write a way to create Avatars separately even though they aren't
      // provided by the API.
      const [user] = await this.client.user.fetch({ id });

      const avatar = new (Function.bind.apply(Avatar, [user, user.client, user.options])) as Avatar;

      for (const key of Object.keys(user)) {
        avatar[key] = user[key];
      }

      // End of ugly hack, 'avatar' should now be an instance of Avatar with all the properties from 'user'.

      avatar._products = products.map((value) => { return { product_id: value, owned: true }; }) as any;
      avatar.lookUrl = `https://api.imvu.com/look/${products.join('%2C')}`;

      return avatar;
    }));

    scene._furniture = (OutfitViewer.ROOM_PATTERN.exec(url) || [''])[0]
      .replace('room=', '')
      .replace(/x\d+/g, '')
      .split(separator)
      .map((value) => { return { product_id: parseInt(value, 10)}; });

    return scene;
  }
}
