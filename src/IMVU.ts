import { EventEmitter } from 'events';

import axios, { AxiosInstance } from 'axios';
import cookies from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

import { GetMatchedController, ProductController, UserController } from './controllers';
import { OutfitViewer } from './util';
import { Avatar, ClientUser } from './models';
import { IMQStream } from './socket';

cookies(axios);

export interface Client extends EventEmitter {
  on(event: 'ready', listener: () => void): this;
}

/**
 * The main client for interacting with the IMVU API controllers.
 */
export class Client extends EventEmitter {
  public username: string; 
  public password: string;

  public authenticated: boolean;

  public user: ClientUser;

  public http: AxiosInstance;
  public cookies: CookieJar;
  public stream: IMQStream;

  public users: UserController;
  public matched: GetMatchedController;
  public products: ProductController;

  public viewer: OutfitViewer;

  /* istanbul ignore next */ 
  public constructor() {
    super();

    this.cookies = new CookieJar();
    this.http = axios.create({ baseURL: 'https://api.imvu.com', jar: this.cookies, withCredentials: true });

    this.users = new UserController(this);
    this.products = new ProductController(this);
    this.matched = new GetMatchedController(this);

    this.viewer = new OutfitViewer(this);
  }

  public async login(username: string, password: string) {
    const { status } = await this.http.post('/login', { gdpr_cookie_acceptance: true, username, password });

    if (status >= 200 && status < 300) {
      this.username = username;
      this.password = password;
    } else {
      throw new Error('Unable to login to the IMVU API! Invalid username/password or the servers are offline!');
    }

    const [user] = await this.users.search({ username: this.username });

    const { data } = await this.http.get(`/avatar/avatar-${user.id}`)

    const json = data.denormalized[`https://api.imvu.com/avatar/avatar-${user.id}`].data;

    const avatar = new (Function.bind.apply(Avatar, [user, user.client, user.options])) as Avatar;

    for (const key of Object.keys(user)) {
      avatar[key] = user[key];
    }

    avatar._products = json.products;

    const clientUser = new (Function.bind.apply(ClientUser, [avatar, avatar.client, avatar.options])) as ClientUser;

    for (const key of Object.keys(avatar)) {
      clientUser[key] = avatar[key];
    }

    await clientUser.load();

    this.user = clientUser;

    this.authenticated = true;

    this.stream = new IMQStream(this);

    this.stream.on('authenticated', () => this.emit('ready'));

    this.stream.on('send_message', (message) => console.log(message));
  }
}

export default {
  Client,
};
