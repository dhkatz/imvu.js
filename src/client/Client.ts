import axios, { AxiosInstance } from 'axios';
// import 'axios-debug-log';
import cookies from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

import {BaseClient, ClientUser} from '@/client';
import {GetMatchedController, ProductController, RoomController, UserController} from '@/controllers';
import { OutfitViewer } from '@/extensions';
import {Avatar} from '@/models';
import { IMQManager, GatewayMessage } from '@/client/websocket';
import {deserialize} from "@dhkatz/json-ts";

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
  public sauce: string;

  public ready: boolean;
  public authenticated: boolean;

  public user: ClientUser;

  public http: AxiosInstance;
  public cookies: CookieJar;
  public imq: IMQManager;

  public users: UserController;
  public matched: GetMatchedController;
  public products: ProductController;
  public rooms: RoomController;

  public viewer: OutfitViewer;

  /* istanbul ignore next */
  public constructor() {
    super();

    this.cookies = new CookieJar();
    this.http = axios.create({ baseURL: 'https://api.imvu.com', jar: this.cookies, withCredentials: true });

    this.imq = new IMQManager(this);

    this.users = new UserController(this);
    this.products = new ProductController(this);
    this.matched = new GetMatchedController(this);
    this.rooms = new RoomController(this);

    this.viewer = new OutfitViewer(this);
  }

  public destroy(): void {
    super.destroy();
    this.imq.destroy();

    this.username = null;
    this.password = null;
  }

  /**
   * Logs the client in and establishes a WebSocket connection with IMVU.
   * @param {string} username The username of the account to login with
   * @param {string} password The password of the account to login with
   * @param options
   * @returns {Promise<string>} The password of the account used
   * @example
   * client.login('username', 'password');
   */
  public async login(username: string, password: string, options: any = {}): Promise<void> {
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

    // Setup the "sauce", basically a JSON authentication token
    // The token must be included with every non-GET request

    const { data: info } = await this.http.get('/login/me');

    const loginInfo = info['denormalized'][info.id];

    this.sauce = loginInfo['data']['sauce'];

    axios.defaults.headers.post['x-imvu-sauce'] = loginInfo['data']['sauce'];
    axios.defaults.headers.post['x-imvu-application'] = 'next_desktop/1';
    axios.defaults.headers.delete['x-imvu-sauce'] = loginInfo['data']['sauce'];
    axios.defaults.headers.delete['x-imvu-application'] = 'next_desktop/1';

    // Setup the client user, including the base user and avatar.

    const user = await this.users.fetch(parseInt(loginInfo['relations']['quick_chat_profile']));

    const { data } = await this.http.get(`/avatar/avatar-${user.id}`);

    const json = data.denormalized[data.id].data;

    const avatar = new Avatar(user.client, user.options);

    deserialize(avatar, json);

    await avatar.load();

    const clientUser = new (Function.bind.apply(ClientUser, [user, user.client, user.options])) as ClientUser;

    for (const key of Object.keys(user)) {
      clientUser[key] = user[key];
    }

    clientUser.avatar = avatar;

    await clientUser.load();

    this.user = clientUser;

    if (options.socket === false) {
      this.authenticated = true;
      this.emit('ready');
      return;
    }

    return new Promise( (resolve, reject) => {
      this.imq.connect()
        .then(() => {
          this.authenticated = true;
          this.emit('ready');
          resolve();
        })
        .catch((reason) => {
          this.destroy();
          reject(reason);
        });
    });
  }

  public logout(): void {
    this.destroy();
  }

  public async holidays(): Promise<Array<{ title: string; date: Date }>> {
    const { data } = await this.http.get('/holiday');

    const holidays = data['denormalized'][data.id]['data']['items'] as Array<{ title: string; date: Date }>;

    return holidays.map((value) => ({ ...value, date: new Date(value.date) }));
  }
}
