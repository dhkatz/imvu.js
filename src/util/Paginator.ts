import { Client } from '@/client';
import { BaseModel } from '@/models';
import {BaseController} from "@/controllers";

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

export class URLPaginator<T extends BaseModel> extends Paginator<T> {
  public constructor(client: Client, controller: BaseController<T>, url: string) {
    super(client, async (client, offset) => {
      const { data } = await client.http.get(url, { params: { start_index: offset, limit: 25 } });

      return Promise.all(data['denormalized'][data.id]['data']['items']
        .map((url: string) => parseInt(url.split('-').pop()))
        .map((id: number) => controller.fetch(id)));
    });
  }
}
