import { Constructor } from 'type-fest';

import { Resource } from '../resources';
import { Client } from '../client';

export interface BaseQuery {
  id?: unknown;
}

export interface ControllerOptions<T, U> {
  name?: string;
  transform?: (query: U) => U;
  process?: (object: T | null) => Promise<T | null>;
}

export class BaseController<T extends Resource, U extends BaseQuery = BaseQuery> {
  private readonly base: string;

  public constructor(
    protected readonly client: Client,
    protected readonly model: Constructor<T>,
    private options: ControllerOptions<T, U> = {}
  ) {
    this.base =
      options.name ||
      `${model.name
        .split(/(?=[A-Z])/)
        .join('_')
        .toLowerCase()}`;
  }

  /**
   * Retrieve instances of resource from IMVU's API
   * This is a lot faster than searching, so fetch with an ID if you can.
   * @param id Request ID
   */
  public async fetch(id: string): Promise<T | null>;
  public async fetch(id: number): Promise<T | null>;
  public async fetch(id: number | string): Promise<T | null> {
    id = await this.client.utils.id(id);

    try {
      const resource = await this.client.resource(`/${this.base}/${this.base}-${id}`, this.model);

      return this.options.process ? this.options.process(resource) : resource;
    } catch (err) {
      if (err instanceof TypeError) {
        throw err;
      } else {
        console.error(err);

        return this.options.process ? this.options.process(null) : null;
      }
    }
  }

  /**
   * Search for and retrieve objects based on a given query
   * @param query Request query to search for
   */
  public async search(query: U): Promise<T[]> {
    const params = this.options.transform ? this.options.transform(query) : query;

    const { data } = await this.client.resource(`/${this.base}`, { params });

    const ids: string[] = data.items.map((url: string) => {
      return this.client.utils.id(url);
    });

    const objects = await Promise.all(ids.map((id: string) => this.fetch(id)));

    return objects.filter((object: T | null) => object !== null) as T[];
  }
}
