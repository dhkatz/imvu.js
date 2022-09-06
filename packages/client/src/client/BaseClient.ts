import { EventEmitter } from 'events';

import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { FileCookieStore } from 'tough-cookie-file-store';
import { wrapper } from 'axios-cookiejar-support';

type Timeout = ReturnType<typeof setTimeout>;

export class BaseClient extends EventEmitter {
	protected username = '';
	protected password = '';
	protected sauce = '';
	protected cid = 0;

	public ready = false;
	public authenticated = false;

	public readonly http: AxiosInstance;
	public readonly cookies: CookieJar;

	private intervals: Set<Timeout> = new Set();

	public constructor() {
		super();

		this.cookies = new CookieJar(new FileCookieStore('./cookies.json'));
		this.http = wrapper(
			axios.create({
				baseURL: 'https://api.imvu.com',
				jar: this.cookies,
				withCredentials: true,
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
		const { status } = await this.http.post(
			'/login',
			{
				gdpr_cookie_acceptance: true,
				username,
				password,
				remember_device: true,
				'2fa_code': options.twoFactorCode,
			},
			{ validateStatus: () => true }
		);

		if (status >= 200 && status < 300) {
			this.username = username;
			this.password = password;
		} else {
			throw new Error(
				'Unable to log in to the IMVU API! Invalid username/password or the servers are offline!'
			);
		}

		// Setup the "sauce", basically a JSON authentication token
		// The token must be included with every non-GET request

		const { data: info } = await this.http.get('/login/me');

		const loginInfo = info['denormalized'][info.id];

		this.sauce = loginInfo['data']['sauce'];
		const cid = loginInfo['relations']['quick_chat_profile'].match(/\d+(-\d+)?$/);

		if (!cid) {
			throw new Error(
				`Unable to fetch client user ${loginInfo['relations']['quick_chat_profile']}`
			);
		}

		this.cid = parseInt(cid[0], 10);

		this.http.defaults.headers.post['x-imvu-sauce'] = this.sauce;
		this.http.defaults.headers.post['x-imvu-application'] = 'next_desktop/1';
		this.http.defaults.headers.put['x-imvu-sauce'] = this.sauce;
		this.http.defaults.headers.put['x-imvu-application'] = 'next_desktop/1';
		this.http.defaults.headers.patch['x-imvu-sauce'] = this.sauce;
		this.http.defaults.headers.patch['x-imvu-application'] = 'next_desktop/1';
		this.http.defaults.headers.delete['x-imvu-sauce'] = this.sauce;
		this.http.defaults.headers.delete['x-imvu-application'] = 'next_desktop/1';

		this.authenticated = true;

		// TODO: Connect to the IMVU WebSocket server using the IMQ library

		this.emit('ready');
	}

	public logout(): void {
		this.destroy();
	}

	public destroy(): void {
		for (const i of this.intervals) this.clearInterval(i);

		this.intervals.clear();

		this.username = '';
		this.password = '';
	}

	public setInterval(callback: (...args: never[]) => void, ms: number, ...args: never[]): Timeout {
		const interval = setInterval(callback, ms, ...args);
		this.intervals.add(interval);
		return interval;
	}

	public clearInterval(interval: Timeout): void {
		clearInterval(interval);
		this.intervals.delete(interval);
	}
}
