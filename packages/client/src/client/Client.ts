import { JsonSerializer } from 'typescript-json-serializer';
import { Constructor } from 'type-fest';

import { BaseClient } from './index';
import { BaseController, ProductController, RoomController, UserController } from '../controllers';
import { Avatar, GetMatched, Resource } from '../resources';
import { AccountManager } from '../managers';
import { APIResource, APIResponse } from '../types';
import { Utilities } from './Utilities';
import { AxiosRequestConfig } from 'axios';

/**
 * The main client for interacting with the IMVU API controllers.
 */
export class Client extends BaseClient {
  public users: UserController = new UserController(this);
  public matched: BaseController<GetMatched> = new BaseController(this, GetMatched);
  public products: ProductController = new ProductController(this);
  public rooms: RoomController = new RoomController(this);

  public utils: Utilities = new Utilities(this);

  private cache: Map<Constructor<unknown>, Map<string, { ttl: number; value: Resource | null }>> =
    new Map();

  private serializer = new JsonSerializer({
    formatPropertyName: (name: string) => name.replace(/([A-Z])/g, '_$1').toLowerCase(),
  });

  public get account(): AccountManager {
    if (!this.#account) {
      throw new Error('Client account cannot be accessed before logging in!');
    }

    return this.#account;
  }

  public async login(username: string, password: string, options: any = {}) {
    await super.login(username, password, options);
    // Set up the client user, including the base user and avatar.

    const user = await this.users.fetch(this.cid);

    if (!user) {
      throw new Error(`Unable to fetch client user ${this.cid}`);
    }

    // This is an ugly hack to build the avatar

    const avatar = await this.resource(`/avatar/avatar-${user.id}`, Avatar);

    this.#account = new AccountManager(this, user, avatar);
  }

  public async holidays(): Promise<Array<{ title: string; date: Date }>> {
    const { data } = await this.http.get('/holiday');

    const holidays = data['denormalized'][data.id]['data']['items'] as Array<{
      title: string;
      date: Date;
    }>;

    return holidays.map((value) => ({ ...value, date: new Date(value.date) }));
  }

  /**
   * Convenience method for fetching a resource from the IMVU API.
   * This will automatically attempt to deserialize the response into the specified type.
   */
  public async resource<T extends object = Record<string, any>>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<APIResource<T>>;
  public async resource<T extends Resource>(
    url: string,
    cls: Constructor<T>,
    config?: AxiosRequestConfig
  ): Promise<T>;
  public async resource<T extends Resource>(
    url: string,
    cls?: Constructor<T> | AxiosRequestConfig,
    config?: AxiosRequestConfig
  ): Promise<T | APIResource<T>> {
    cls = typeof cls === 'function' ? cls : undefined;
    config = typeof cls === 'object' ? cls : config;

    if (cls && !this.cache.has(cls)) {
      this.cache.set(cls, new Map());
    }

    const cache = cls && (this.cache.get(cls) as Map<string, { ttl: number; value: T | null }>);

    const matched_id = url.match(/\d+(-\d+)?$/);
    const key = matched_id ? matched_id[0] : url;

    const cached = cache?.get(key);

    if (cached && cached.ttl > Date.now() && cached.value) {
      return cached.value;
    }

    const { data } = await this.http.get<APIResponse<T>>(url, config);

    if (data.status === 'failure') {
      throw new Error(data.message);
    }

    const json = this.#transformDates(data.denormalized[data.id].data);

    if (matched_id && !json.id) {
      json.id = matched_id[0];
    }

    const { relations, updates } = data.denormalized[data.id];

    if (cls) {
      const instance = new cls(this);

      const resource = this.serializer.deserialize(json, instance) as T;

      if (relations) resource.relations = relations;
      if (updates) resource.updates = updates;

      cache?.set(key, { ttl: Date.now() + 1000 * 60 * 10, value: resource });

      return resource;
    }

    return { data: json, relations, updates };
  }

  /**
   * Convert all the fields in a JSON response ending in _datetime to Date objects.
   * @param value
   * @private
   */
  #transformDates<T>(value: T): T {
    if (typeof value === 'object') {
      if (value instanceof Date) {
        return value;
      }

      if (Array.isArray(value)) {
        return value.map((v) => this.#transformDates(v)) as unknown as T;
      }

      if (!value) {
        return value;
      }

      return Object.entries(value).reduce((acc, [key, val]) => {
        acc[key as keyof T] = key.endsWith('_datetime') ? new Date(val) : this.#transformDates(val);

        return acc;
      }, {} as T);
    }

    return value;
  }

  #account?: AccountManager;
}

export interface Client extends BaseClient {
  on(event: 'ready', listener: () => void): this;
}
