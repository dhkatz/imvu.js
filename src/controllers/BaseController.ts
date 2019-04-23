import axios, { AxiosInstance } from 'axios';
import { deserialize } from 'json-typescript-mapper';

export class BaseController {
  public http: AxiosInstance;

  constructor(public base: string = '') {
    this.http = axios.create({ baseURL: `https://api.imvu.com${base}` });
  }
}

// tslint:disable-next-line:no-empty-interface
export interface ControllerOptions<T, U> {
  name?: string;
  params?: (params: U) => U;
}

export function Controller<T, U extends { id?: any } = { id: number }>(cls: new () => T, options: ControllerOptions<T, U> = {}) {
  // tslint:disable-next-line:max-classes-per-file
  return class extends BaseController {
    public constructor() {
      super(options.name || `/${cls.name.split(/(?=[A-Z])/).join('_').toLowerCase()}`);
    }

    public async get(params: U): Promise<T[] | null> {
      const p = options.params ? options.params(params) : params;

      try {
        const id = typeof params.id === 'string' || typeof params.id === 'number';
        const { data } = id ? await this.http.get(`${this.base}-${p.id}`) : await this.http.get('', { params: p });

        if (id) {
          return [deserialize(cls, data.denormalized[`https://api.imvu.com${this.base}${this.base}-${params.id}`].data as any)];
        }

        const count = Object.keys(data.http).length - 1;

        return Object.values(data.denormalized as any[]).reduce((current: T[], value: any, index: number) => {
          return [...current, ...(index >= count ? [] : [deserialize(cls, value.data)])];
        }, []);
      } catch (err) {
        return null;
      }
    }
  };
}
