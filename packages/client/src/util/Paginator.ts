import { Client } from '../client';
import { Resource } from '../resources';
import { BaseController } from '../controllers';
import { Constructor } from 'type-fest';

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
  U extends BaseController<T, any> | Constructor<T>
> extends Paginator<T> {
  public constructor(client: Client, controller: U, url: string) {
    super(client, async (client, offset) => {
      const { data } = await client.http.get(url, { params: { start_index: offset, limit: 25 } });

      const base =
        typeof controller === 'function'
          ? `/${controller.name.replace(/([A-Z])/g, (g) => `_${g.toLowerCase()}`)}`
          : '';

      return Promise.all(
        data['denormalized'][data.id]['data']['items']
          .map((url: string) => {
            const match = url.match(/\d+(-\d+)?$/);

            return match ? match[0] : null;
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
