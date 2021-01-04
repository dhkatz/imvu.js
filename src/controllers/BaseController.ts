import { deserialize } from '@dhkatz/json-ts';

import { BaseModel } from '@/models';
import { Client } from '@/client';

export interface BaseQuery {
  id?: any;
}

export interface ControllerOptions<T, U> {
  name?: string;
  transform?: (query: U) => U;
  process?: (object: T | null) => Promise<T | null>;
  ttl?: number;
}

export abstract class BaseController<T extends BaseModel, U extends BaseQuery = BaseQuery> {
  public client: Client;
  public model: new (...args: any[]) => T;
  public options: ControllerOptions<T, U>;
  public base: string;

  public cache: Map<number, { ttl: number; value: T }> = new Map();
  public ttl = 60000;

  protected constructor(client: Client, model: new (...args: any[]) => T, options: ControllerOptions<T, U> = {}) {
    this.client = client;
    this.model = model;
    this.options = options;

    this.ttl = options.ttl || 60000;

    this.base = options.name || `/${model.name.split(/(?=[A-Z])/).join('_').toLowerCase()}`;
  }

  /**
   * Retrieve instances of resource from IMVU's API
   * This is a lot faster than searching, so fetch with an ID if you can.
   * @param id Request ID
   * @param cache Whether to cache the new object if it isn't already
   */
  public async fetch(id: number, cache = true): Promise<T | null> {
    if (this.cache.has(id) && this.cache.get(id).ttl > Date.now()) {
      return this.cache.get(id).value;
    }

    try {
      const {data} = await this.client.http.get(`${this.base}-${id}`, {baseURL: `https://api.imvu.com${this.base}`});

      const cls = this.model;
      const json: any = data.denormalized[data.id].data;
      const instance = new cls(this.client);
      const object = deserialize(instance, json);

      if (cache) {
        this.cache.set(id, {ttl: Date.now() + this.ttl, value: object});
      }

      await object.load();

      return this.options.process ? this.options.process(object) : object;
    } catch (err) {
      if (cache) {
        this.cache.set(id, {ttl: Date.now() + this.ttl, value: null});
      }

      return this.options.process ? this.options.process(null) : null;
    }
  }

  /**
   * Search for and retrieve objects based on a given query
   * @param query Request query to search for
   * @param cache Whether to cache the results or not
   */
  public async search(query: U, cache = true): Promise<T[]> {
    const params = this.options.transform ? this.options.transform(query) : query;

    const {data} = await this.client.http.get('', {params, baseURL: `https://api.imvu.com${this.base}`});

    const ids: string[] = 'data' in data ?
      data.data.items.map((url: string) => url.split('-').pop()) :
      data.denormalized[data.id].data.items.map((url: string) => url.split("-").pop());

    return Promise.all(ids.map((id: string) => this.fetch(parseInt(id, 10), cache)));
  }
}
