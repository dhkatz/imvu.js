import { Client, Resource } from '@imvu/client';

export class Utilities {
  public constructor(private client: Client) {}

  public async id<T extends Resource>(resource: T | string | number): Promise<string> {
    if (typeof resource === 'string') {
      if (resource.match(/^\d+$/)) {
        return resource;
      }

      // Assume it's a username
      const [search] = await this.client.users.search({ username: resource });

      if (!search) {
        throw new Error(`No users found with the username "${resource}"!`);
      }

      return `${search.id}`;
    } else if (typeof resource === 'number') {
      return `${resource}`;
    } else {
      return `${resource.id}`;
    }
  }
}
