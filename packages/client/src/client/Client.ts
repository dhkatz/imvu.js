import { Constructor } from 'type-fest';

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CookieJar, Store } from 'tough-cookie';
import { FileCookieStore } from 'tough-cookie-file-store';
import { wrapper } from 'axios-cookiejar-support';
import { EventEmitter } from 'events';

import { BaseController } from '../controllers';
import { Avatar, GetMatched, Product, Resource, Room, User } from '../resources';
import { AccountManager } from '../managers';
import { APIResource, APIResponse, APISuccessResponse } from '../types';
import { Utilities } from './Utilities';

/**
 * The main client for interacting with the IMVU API controllers.
 */
export class Client extends EventEmitter {
	protected username = '';
	protected password = '';
	protected sauce = '';
	protected cid = 0;

	public ready = false;
	public authenticated = false;

	public readonly http: AxiosInstance;
	public readonly cookies: CookieJar;
	protected readonly store: Store;

	public readonly utils: Utilities = new Utilities(this);

	public constructor() {
		super();

		this.store = new FileCookieStore('./cookies.json');
		this.cookies = new CookieJar(this.store, { rejectPublicSuffixes: false });
		this.http = wrapper(
			axios.create({
				baseURL: 'https://api.imvu.com',
				jar: this.cookies,
				withCredentials: true,
				validateStatus: () => true,
			})
		);
	}

	public readonly users = new BaseController<User, { username?: string }>(this, 'user', User);
	public readonly matched = new BaseController<GetMatched>(this, 'get_matched', GetMatched);
	public readonly products = new BaseController<Product, { creator?: string }>(
		this,
		'product',
		Product
	);
	public readonly rooms = new BaseController(this, 'room', Room);

	#account?: AccountManager;

	public get account(): AccountManager {
		if (!this.authenticated || !this.#account) {
			throw new Error(`You must be logged into to access account information!`);
		}

		return this.#account;
	}

	/**
	 * Logs the client in and establishes a WebSocket connection with IMVU.
	 * @param {string} username The username of the account to log in with
	 * @param {string} password The password of the account to log in with
	 * @param options
	 * @returns {Promise<void>}
	 * @example
	 * await client.login('username', 'password');
	 */
	public async login(
		username: string,
		password: string,
		options: Record<string, any> = {}
	): Promise<void> {
		const cookies = await this.cookies.getCookies('https://imvu.com/');

		const session = cookies.find((c) => c.key === '_imvu_avnm');

		if (session?.value.toLowerCase() !== username.toLowerCase()) {
			await this.request('/login', {
				method: 'POST',
				data: {
					gdpr_cookie_acceptance: true,
					username,
					password,
					remember_device: true,
					'2fa_code': options.twoFactorCode,
				},
			});
		}

		this.username = username;
		this.password = password;

		// Set up the "sauce", basically a JSON authentication token
		// The token must be included with every non-GET request

		const data = await this.request('/login/me');

		const resource = data.denormalized[data.id];

		this.sauce = resource.data.sauce;
		this.cid = parseInt(resource?.relations?.quick_chat_profile ?? '0', 10);

		for (const method of ['post', 'put', 'patch', 'delete'] as const) {
			this.http.defaults.headers[method]['x-imvu-sauce'] = this.sauce;
			this.http.defaults.headers[method]['x-imvu-application'] = 'next_desktop/1';
		}

		this.authenticated = true;

		// Set up the client user, including the base user and avatar.

		const user = await this.users.fetch(this.cid);

		if (!user) {
			throw new Error(`Unable to fetch client user ${this.cid}`);
		}

		const avatar = await this.resource(`/avatar/avatar-${user.id}`, Avatar);

		this.#account = new AccountManager(this, user, avatar);
	}

	public async logout(): Promise<void> {
		return;
	}

	public async request<T extends object = Record<string, any>>(
		url: string,
		config: AxiosRequestConfig = {}
	): Promise<APISuccessResponse<T>> {
		const { data } = await this.http.request<APIResponse<T>>({ url, ...config });

		if (data.status === 'failure') {
			throw new Error(`(${data.status}) ${data.message} (${data.error})`);
		}

		return data;
	}

	/**
	 * Convenience method for fetching a resource from the IMVU API.
	 * This will automatically attempt to deserialize the response into the specified type.
	 */
	public async resource<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>>;
	public async resource<T extends Resource>(
		url: string,
		cls: Constructor<T>,
		config?: AxiosRequestConfig
	): Promise<T>;
	public async resource<T extends Resource>(
		url: string,
		cls?: Constructor<T> | AxiosRequestConfig,
		config?: AxiosRequestConfig
	): Promise<T | APIResource<T>> {
		return this.utils.resource(url, cls as Constructor<T>, config);
	}

	public async resources<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>[]>;
	public async resources<T extends Resource>(
		url: string,
		cls: Constructor<T>,
		config?: AxiosRequestConfig
	): Promise<T[]>;
	public async resources<T extends Resource>(
		url: string,
		cls?: Constructor<T> | AxiosRequestConfig,
		config?: AxiosRequestConfig
	): Promise<T[] | APIResource<T>[]> {
		return this.utils.resources(url, cls as Constructor<T>, config);
	}
}
