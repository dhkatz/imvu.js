import { GetMatchedController, ProductController, UserController } from './controllers';

export class Client {
  public user: UserController;
  public matched: GetMatchedController;
  public product: ProductController;

  constructor(public username: string, public password: string) {
    this.user = new UserController();
    this.product = new ProductController();
    this.matched = new GetMatchedController();
  }
}

export default {
  Client,
};
