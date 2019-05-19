import { Client } from '@/client';
import { BaseModel } from '@/models';

/**
 * Instances of this class generate instances of T.
 * @template T A class type extending `BaseModel` 
 */
export class Paginator<T extends BaseModel> {
  public client: Client;
  public next: (client: Client, offset: number) => Promise<T[]>;

  public constructor(client: Client, next: (client: Client, offset: number) => Promise<T[]>) {
    this.client = client;
    this.next = next;
  }

  public async * [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    let offset = 0;
    while (true) {
      try {
        const objects = await this.next(this.client, offset);
        
        if (!objects.length) {
          return;
        }

        offset += 25;

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

export enum Paginators {
  User = 'users',
  Product = 'products'
}

export class URLPaginator<T extends BaseModel> extends Paginator<T> {
  public constructor(client: Client, type: Paginators, url: string) {
    super(client, async (client, offset) => {
      const { data } = await client.http.get(url, { params: { start_index: offset, limit: 25 } });

      return Promise.all((Object.values(data.denormalized).pop() as any).data.items
        .map((url: string) => parseInt(url.split('-').pop()))
        .map((id: number) => client[type].fetch(id)));
    });
  }
}
