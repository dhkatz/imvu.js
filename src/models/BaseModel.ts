import axios, { AxiosInstance } from 'axios';

import { Client } from '../IMVU';

export interface ModelOptions {
  http?: AxiosInstance;
  ref?: string;
}

export class BaseModel {
  public client: Client;
  public http: AxiosInstance;
  public ref: string;

  /* istanbul ignore next */ 
  public constructor(client?: Client, options: ModelOptions = {}) {
    this.ref = options.ref || '';
    this.client = client;

    if (options.http) {
      this.http = options.http;
    } else {
      this.http = axios.create({ baseURL: 'https://api.imvu.com' });
    }
  }
}
