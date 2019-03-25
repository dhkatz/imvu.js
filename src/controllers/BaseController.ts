import axios, { AxiosInstance } from 'axios';

export default class BaseController {
  protected http: AxiosInstance;

  constructor(base: string = '') {
    this.http = axios.create({ baseURL: `https://api.imvu.com${base}` });
  }
}
