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
  public next: (client: Client, offset: number) => Promise<T[]>;

  public constructor(client: Client, next: (client: Client, offset: number) => Promise<T[]>) {
    this.client = client;
    this.next = next;
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    let offset = 0;
    while (true) {
      try {
        const objects = await this.next(this.client, offset);

        if (!objects.length) {
          return;
        }

        for (const object of objects) {
          if (object === null) {
            continue;
          }

          yield object;
        }

        offset += 25;
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
  public constructor(client: Client, controller: U, url: string) {
    super(client, async (client, offset) => {
      const { data } = await client.resource(url, { params: { start_index: offset, limit: 25 } });

      let base = '';

      if (typeof controller === 'function') {
        const basename = (controller as any).basename;
        if (typeof basename === 'string') {
          base = `/${basename}`;
        } else {
          base = `/${controller.name.replace(/([A-Z])/g, (g) => `_${g.toLowerCase()}`)}`;
        }
      }

      return Promise.all(
        data.items
          .map((url: string) => {
            return client.utils.id(url);
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
