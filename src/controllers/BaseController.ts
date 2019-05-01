import axios, { AxiosInstance } from 'axios';

import { BaseModel } from '../models';
import { Client } from '../IMVU';
import { deserialize, JSONObject } from 'json-typescript-mapper';

export interface BaseQuery {
  id?: any;
}

export abstract class BaseController<T extends BaseModel, U extends BaseQuery = BaseQuery> {
  public client: Client;
  public http: AxiosInstance;
  public base: string;

  public cache: Map<string, { ttl: number, value: T[] }> = new Map();
  public ttl: number = 60000;

  public constructor(client: Client, base: string = '') {
    this.client = client;
    this.http = base.length > 0 ? axios.create({ baseURL: `https://api.imvu.com${base}` }) : client.http;
    this.base = base;
  }

  public abstract async fetch(query: U, cache: boolean): Promise<T[] | null>;
}

export interface ControllerOptions<T> {
  name?: string;
  transform?: (query: T) => T;
  ttl?: number;
}

// eslint-disable-next-line
export function Controller<T extends BaseModel, U extends { id?: any } = { id: number }>(cls: new (...args: any[]) => T, options: ControllerOptions<U> = {}) {
  const DerivedController = class extends BaseController<T, U> {
    public constructor(client: Client) {
      super(client, options.name || `/${cls.name.split(/(?=[A-Z])/).join('_').toLowerCase()}`);

      this.ttl = options.ttl || 60000;
    }

    /**
     * Retrieve instances of resource from IMVU's API
     * @param query Request query
     * @param cache Whether to cache the new object if it isn't already
     */
    public async fetch(query: U, cache: boolean = true): Promise<T[] | null> {
      const hash = JSON.stringify(query);
      if (this.cache.has(hash) && this.cache.get(hash).ttl > Date.now()) {
        return this.cache.get(hash).value;
      }

      const p = options.transform ? options.transform(query) : query;

      try {
        const id = typeof query.id === 'number';
        const { data } = id ? await this.http.get(`${this.base}-${p.id}`) : await this.http.get('', { params: p });

        let objects: T[];
        if (id) {
          const json: JSONObject = data.denormalized[`https://api.imvu.com${this.base}${this.base}-${query.id}`].data;
          objects = [deserialize(cls, json, this.client, this.http)];

        } else {
          const count = Object.keys(data.http).length - 1;

          objects = Object.values(data.denormalized as Record<string, any>).reduce((current: T[], value: any, index: number) => {
            return [...current, ...(index >= count ? [] : [deserialize(cls, value.data as JSONObject, this.client, this.http)])];
          }, []);
        }

        if (cache) {
          this.cache.set(hash, { ttl: Date.now() + this.ttl, value: objects });
        }

        return objects.length > 0 ? objects : null;
      } catch (err) {
        return null;
      }
    }
  };

  return DerivedController;
}
