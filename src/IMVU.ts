import axios, { AxiosInstance } from 'axios';

import { GetMatchedController, ProductController, UserController } from './controllers';

export class Client {
  public username: string; 
  public password: string;

  public http: AxiosInstance;

  public user: UserController;
  public matched: GetMatchedController;
  public product: ProductController;

  /* istanbul ignore next */ 
  public constructor(username: string, password: string) {
    this.username = username;
    this.password = password;

    this.http = axios.create({ baseURL: 'https://api.imvu.com' });

    this.user = new UserController();
    this.product = new ProductController();
    this.matched = new GetMatchedController();
  }
}

export default {
  Client,
};
