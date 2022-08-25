import { Client, Resource } from '@imvu/client';

export class Utilities {
  public constructor(private client: Client) {}

  public async id<T extends Resource>(
    resource: T | string | number,
    user = false
  ): Promise<string> {
    if (typeof resource === 'string') {
      const match = resource.match(/\d+(-\d+)?$/);

      if (match) {
        return match[0];
      }

      if (user) {
        // Assume it's a username
        const [search] = await this.client.users.search({ username: resource });

        if (!search) {
          throw new Error(`No users found with the username "${resource}"!`);
        }

        return `${search.id}`;
      }

      throw new Error(`Could not parse "${resource}" as an ID!`);
    } else if (typeof resource === 'number') {
      return `${resource}`;
    } else {
      return `${resource.id}`;
    }
  }
}
