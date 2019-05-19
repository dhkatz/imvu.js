import { Scene } from '@/models';
import { BaseExtension } from './BaseExtenstion';

export interface OutfitViewerOptions {
  load?: boolean;
}

export class OutfitViewer extends BaseExtension {
  public static AVATAR_PATTERN: RegExp = /avatar(\d+)=(?:(\d+)(?:(?:(?:%3B)|;))?)+/mig;
  public static ROOM_PATTERN: RegExp = /room=((\d+)(?:x\d)?(?:(?:(?:%3B)|;))?)+/mi;

  /**
   * Parse a 'Products in Scene' URL and return a `Scene`
   * Large scenes may need longer to retrieve all `Product` information
   * @param {string} url A 'Products In Scene' URL
   * @param {OutfitViewerOptions} options The options for the parser
   * @returns {Promise<Scene>} Returns a promise that resolves to the parsed `Scene`
   */
  public async parse(url: string, options: OutfitViewerOptions = {}): Promise<Scene> {
    const data = url.match(OutfitViewer.AVATAR_PATTERN);

    // The separator might be URL encoded or not
    const separator = url.includes('%3B') ? '%3B' : ';';

    const scene = new Scene(this.client);

    const avatars = new Map(data.map((value: string) => {
      const split = value.split('=');
      const id = parseInt(split[0].replace('avatar', ''));
      const products = split[1]
        .split(separator)
        .map((value) => parseInt(value, 10));

      return [id, products];
    }));

    const furniture = (OutfitViewer.ROOM_PATTERN.exec(url) || [''])[0]
      .replace('room=', '')
      .replace(/x\d+/g, '')
      .split(separator)
      .map((value) => parseInt(value));

    scene.data = {
      avatars,
      furniture,
    };

    if (options.load !== false) {
      await scene.load();
    }

    return scene;
  }
}
