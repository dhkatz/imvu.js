import axios, { AxiosInstance } from 'axios';
import cookies from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

import { BaseClient } from '@/client';
import { GetMatchedController, ProductController, UserController } from '@/controllers';
import { OutfitViewer } from '@/extensions';
import { Avatar, ClientUser } from '@/models';
import { WebSocketManager, GatewayMessage } from '@/client/websocket';

cookies(axios);

export interface Client extends BaseClient {
  on(event: 'raw', listener: (message: GatewayMessage) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'stream_error', listener: (id: number) => void): this;
  on(event: 'stream_ready', listener: (id: number) => void): this;
}

/**
 * The main client for interacting with the IMVU API controllers.
 */
export class Client extends BaseClient {
  public username: string; 
  public password: string;

  public ready: boolean;
  public authenticated: boolean;

  public user: ClientUser;

  public http: AxiosInstance;
  public cookies: CookieJar;
  public socket: WebSocketManager;

  public users: UserController;
  public matched: GetMatchedController;
  public products: ProductController;

  public viewer: OutfitViewer;

  /* istanbul ignore next */ 
  public constructor() {
    super();

    this.cookies = new CookieJar();
    this.http = axios.create({ baseURL: 'https://api.imvu.com', jar: this.cookies, withCredentials: true });

    this.socket = new WebSocketManager(this);

    this.users = new UserController(this);
    this.products = new ProductController(this);
    this.matched = new GetMatchedController(this);

    this.viewer = new OutfitViewer(this);
  }

  public destroy(): void {
    super.destroy();
    this.socket.destroy();

    this.username = null;
    this.password = null;
  }

  /**
   * Logs the client in and establishes a WebSocket connection with IMVU.
   * @param {string} username The username of the account to login with
   * @param {string} password The password of the account to login with
   * @returns {Promise<string>} The password of the account used
   * @example
   * client.login('username', 'password');
   */
  public async login(username: string, password: string): Promise<string> {
    if (typeof username !== 'string' && typeof password !== 'string') {
      throw new Error('Cannot call login with incorrect username or password types!');
    }

    const { status } = await this.http.post('/login', { gdpr_cookie_acceptance: true, username, password });

    if (status >= 200 && status < 300) {
      this.username = username;
      this.password = password;
    } else {
      throw new Error('Unable to login to the IMVU API! Invalid username/password or the servers are offline!');
    }

    const [user] = await this.users.search({ username: this.username });

    const { data } = await this.http.get(`/avatar/avatar-${user.id}`);

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

    return new Promise(async (resolve, reject) => {
      try {
        await this.socket.connect();

        this.authenticated = true;

        resolve();
      } catch (err) {
        this.destroy();
        reject(err);
      }
    });
  }

  public async holidays(): Promise<Array<{ title: string; date: Date }>> {
    const { data } = await this.http.get('/holiday');

    const holidays = data['denormalized']['https://api.imvu.com/holiday']['data']['items'] as Array<{ title: string; date: Date }>;

    return holidays.map((value) => ({ ...value, date: new Date(value.date) }));
  }
}
