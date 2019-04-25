import axios, { AxiosInstance } from 'axios';
import { deserialize } from 'json-typescript-mapper';

import { BaseModel } from '@/models';
import { Memoize } from '@/util';

export abstract class BaseController<T, U> {
  public http: AxiosInstance;
  public base: string;

  public constructor(base: string = '') {
    this.http = axios.create({ baseURL: `https://api.imvu.com${base}` });
    this.base = base;
  }

  public abstract async fetch(params: U): Promise<T[] | null>;
}

// tslint:disable-next-line:no-empty-interface
export interface ControllerOptions<T, U> {
  name?: string;
  params?: (params: U) => U;
}

// eslint-disable-next-line
export function Controller<T extends BaseModel, U extends { id?: any } = { id: number }>(cls: new () => T, options: ControllerOptions<T, U> = {}) {
  // tslint:disable-next-line:max-classes-per-file
  const DerivedController = class extends BaseController<T, U> {
    public constructor() {
      super(options.name || `/${cls.name.split(/(?=[A-Z])/).join('_').toLowerCase()}`);
    }

    public async fetch(params: U): Promise<T[] | null> {
      const p = options.params ? options.params(params) : params;

      try {
        const id = typeof params.id === 'string' || typeof params.id === 'number';
        const { data } = id ? await this.http.get(`${this.base}-${p.id}`) : await this.http.get('', { params: p });

        if (id) {
          return [deserialize(cls, data.denormalized[`https://api.imvu.com${this.base}${this.base}-${params.id}`].data)];
        }

        const count = Object.keys(data.http).length - 1;

        const objects: T[] = Object.values(data.denormalized as Record<string, any>).reduce((current: T[], value: any, index: number) => {
          const obj = deserialize(cls, value.data);
          return [...current, ...(index >= count ? [] : [obj])];
        }, []);

        return objects.length > 0 ? objects : null;
      } catch (err) {
        return null;
      }
    }
  };

  // tslint:disable-next-line:max-line-length
  Memoize({ hash: (params: U) => JSON.stringify(params), ttl: 1000 * 30, prototype: true })(DerivedController.prototype, 'fetch');

  return DerivedController;
}
