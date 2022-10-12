import { EventEmitter } from 'events';

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CookieJar, Store } from 'tough-cookie';
import { FileCookieStore } from 'tough-cookie-file-store';
import { wrapper } from 'axios-cookiejar-support';
import { APIResponse, APISuccessResponse } from '../types';

export class BaseClient extends EventEmitter {
	protected username = '';
	protected password = '';
	protected sauce = '';
	protected cid = 0;

	public ready = false;
	public authenticated = false;

	public readonly http: AxiosInstance;
	public readonly cookies: CookieJar;
	protected readonly store: Store;

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

	/**
	 * Logs the client in and establishes a WebSocket connection with IMVU.
	 * @param {string} username The username of the account to log in with
	 * @param {string} password The password of the account to log in with
	 * @param options
	 * @returns {Promise<void>}
	 * @example
	 * await client.login('username', 'password');
	 */
	public async login(username: string, password: string, options: any = {}): Promise<void> {
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

		// TODO: Connect to the IMVU WebSocket server using the IMQ library
	}

	public logout(): void {
		this.destroy();
	}

	public destroy(): void {
		this.username = '';
		this.password = '';
	}

	public async request<T extends object = Record<string, any>>(
		url: string,
		config: AxiosRequestConfig = {}
	): Promise<APISuccessResponse<T>> {
		const { data } = await this.http.request<APIResponse<T>>({ url, ...config });

		if (data.status === 'failure') {
			throw new Error(data.message);
		}

		return data;
	}
}
