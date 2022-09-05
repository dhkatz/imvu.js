import { Client } from '../client';
import { Resource } from '../resources';
import { BaseController } from '../controllers';
import { Class } from 'type-fest';

/**
 * Instances of this class generate instances of T.
 * @template T A class type extending `BaseModel`
 */
export class Paginator<T extends Resource> {
  public client: Client;
  public next: (client: Client) => Promise<T[]>;

  public constructor(client: Client, next: (client: Client) => Promise<T[]>) {
    this.client = client;
    this.next = next;
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    while (true) {
      try {
        const objects = await this.next(this.client);

        if (!objects.length) {
          return;
        }

        for (const object of objects) {
          if (object === null) {
            continue;
          }

          yield object;
        }
      } catch (err) {
        return;
      }
    }
  }
}

export class URLPaginator<
  T extends Resource,
  U extends BaseController<T, any> | Class<T>
> extends Paginator<T> {
  private offset = 0;

  public constructor(client: Client, controller: U, url: string) {
    super(client, async (client) => {
      const response = await client.request(url, {
        params: { start_index: this.offset, limit: 25 },
      });

      const data = response.denormalized[response.id].data;

      let base = '';

      if (typeof controller === 'function') {
        const basename = (controller as any).basename;
        if (typeof basename === 'string') {
          base = `/${basename}`;
        } else {
          base = `/${controller.name.replace(/([A-Z])/g, (g) => `_${g.toLowerCase()}`)}`;
        }
      }

      this.offset += 25;

      return Promise.all(
        data.items
          .map((url: string) => {
            const ref = response.denormalized[url].relations?.ref;

            return ref ? response.denormalized[ref] : null;
          })
          .filter((id: string | null) => id !== null)
          .map((id: string) => {
            if (typeof controller === 'function') {
              return client.resource(`${base}${base}-${id}`, controller);
            }

            return controller.fetch(id);
          })
      );
    });
  }
}
