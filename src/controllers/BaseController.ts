import { deserialize, JSONObject } from 'json-typescript-mapper';

import { BaseModel } from '../models';
import { Client } from '../client/Client';

export interface BaseQuery {
  id?: any;
}

export abstract class BaseController<T extends BaseModel, U extends BaseQuery = BaseQuery> {
  public client: Client;
  public base: string;

  public cache: Map<number, { ttl: number; value: T }> = new Map();
  public ttl: number = 60000;

  public constructor(client: Client, base: string = '') {
    this.client = client;
    this.base = base;
  }

  public abstract async fetch(id: number, cache: boolean): Promise<T | null>;
  
  public abstract async search(query: U, cache: boolean): Promise<T[]>;
}

export interface ControllerOptions<T, U> {
  name?: string;
  transform?: (query: U) => U;
  process?: (object: T | null) => Promise<T | null>;
  ttl?: number;
}

// eslint-disable-next-line
export function Controller<T extends BaseModel, U extends BaseQuery = { id: number }>(cls: new (...args: any[]) => T, options: ControllerOptions<T, U> = {}) {
  const DerivedController = class extends BaseController<T, U> {
    public constructor(client: Client) {
      super(client, options.name || `/${cls.name.split(/(?=[A-Z])/).join('_').toLowerCase()}`);

      this.ttl = options.ttl || 60000;
    }

    /**
     * Retrieve instances of resource from IMVU's API
     * This is a lot faster than searching, so fetch with an ID if you can.
     * @param id Request ID
     * @param cache Whether to cache the new object if it isn't already
     */
    public async fetch(id: number, cache: boolean = true): Promise<T | null> {
      if (this.cache.has(id) && this.cache.get(id).ttl > Date.now()) {
        return this.cache.get(id).value;
      }

      try {
        const { data } = await this.client.http.get(`${this.base}-${id}`, { baseURL: `https://api.imvu.com${this.base}` });

        const json: JSONObject = data.denormalized[`https://api.imvu.com${this.base}${this.base}-${id}`].data;
        const object = deserialize(cls, json, this.client);

        if (cache) {
          this.cache.set(id, { ttl: Date.now() + this.ttl, value: object });
        }

        await object.load();

        return options.process ? options.process(object) : object;
      } catch (err) {
        if (cache) {
          this.cache.set(id, { ttl: Date.now() + this.ttl, value: null });
        }

        return options.process ? options.process(null) : null;
      }
    }

    /**
     * Search for and retrieve objects based on a given query
     * @param query Request query to search for
     * @param cache Whether to cache the results or not
     */
    public async search(query: U, cache: boolean = true): Promise<T[]> {
      const params = options.transform ? options.transform(query) : query;

      const { data } = await this.client.http.get('', { params, baseURL: `https://api.imvu.com${this.base}` });
      
      const ids: string[] = data.hasOwnProperty('data') ? 
        data.data.items.map((url: string) => url.split('-')[-1]) :
        (Object.values(data.denormalized).pop() as any).data.items.map((url: string) => url.split('-').pop());

      return Promise.all(ids.map((id: string) => this.fetch(parseInt(id, 10), cache)));
    }
  };

  return DerivedController;
}
