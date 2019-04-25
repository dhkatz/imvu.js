import axios, { AxiosInstance } from 'axios';

export class BaseModel {
  public http: AxiosInstance;

  public constructor(http?: AxiosInstance) {
    if (http) {
      this.http = http;
    } else {
      this.http = axios.create({ baseURL: 'https://api.imvu.com' });
    }
  }
}
