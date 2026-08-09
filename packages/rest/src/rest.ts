import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CookieJar, Store } from 'tough-cookie';
import FileCookieStore from 'tough-cookie-file-store';
import { wrapper } from 'axios-cookiejar-support';

import { APIResource, APIResponse, APISuccessResponse } from './types.js';

// axios-cookiejar-support augments axios with `jar`, but that augmentation doesn't
// merge reliably under moduleResolution: NodeNext — declare it explicitly.
declare module 'axios' {
	interface CreateAxiosDefaults {
		jar?: CookieJar;
	}
	interface AxiosRequestConfig {
		jar?: CookieJar;
	}
}

export interface RESTOptions {
	/** API base URL. Defaults to `https://api.imvu.com`. */
	baseURL?: string;
	/** Path to the cookie jar file. Defaults to `./cookies.json`. */
	cookiePath?: string;
}

/**
 * Low-level IMVU REST client: cookie-based auth, HTTP transport, and raw
 * (un-modeled) resource fetching. `@imvu/client` builds the resource/manager
 * layer on top; consumers that just want fast, raw typed JSON (e.g. a renderer
 * that doesn't want class instances) can use this directly.
 */
export class REST {
	public sauce = '';
	public cid = 0;
	public authenticated = false;

	public readonly http: AxiosInstance;
	public readonly cookies: CookieJar;
	protected readonly store: Store;

	protected username = '';
	protected password = '';

	public constructor(options: RESTOptions = {}) {
		this.store = new FileCookieStore(options.cookiePath ?? './cookies.json');
		this.cookies = new CookieJar(this.store, { rejectPublicSuffixes: false });
		this.http = wrapper(
			axios.create({
				baseURL: options.baseURL ?? 'https://api.imvu.com',
				jar: this.cookies,
				withCredentials: true,
				validateStatus: () => true,
			})
		);
	}

	/**
	 * Authenticate. Reuses an existing `_imvu_avnm` session cookie when present
	 * (skipping the login POST) and establishes the "sauce" auth token that must
	 * accompany every non-GET request. If the reused session turns out to be
	 * stale (a matching `_imvu_avnm` cookie but an expired session), it falls
	 * back to a full login POST and retries once.
	 */
	public async login(username: string, password: string, options: Record<string, any> = {}): Promise<void> {
		this.username = username;
		this.password = password;

		const reusedSession = await this.hasSessionFor(username);
		if (!reusedSession) {
			await this.authenticate(options);
		}

		try {
			await this.establishSession();
		} catch (error) {
			if (!reusedSession) {
				throw error; // a fresh login already failed — nothing stale to recover from
			}
			// The cached session was stale; do a real login and try once more.
			await this.authenticate(options);
			await this.establishSession();
		}
	}

	/** True when a cached `_imvu_avnm` cookie matches `username` (the login POST can be skipped — if the session is live). */
	private async hasSessionFor(username: string): Promise<boolean> {
		const cookies = await this.cookies.getCookies('https://imvu.com/');
		const session = cookies.find((c) => c.key === '_imvu_avnm');
		return session?.value.toLowerCase() === username.toLowerCase();
	}

	/** Perform the login POST that establishes a fresh session cookie. */
	private async authenticate(options: Record<string, any>): Promise<void> {
		await this.request('/login', {
			method: 'POST',
			data: {
				gdpr_cookie_acceptance: true,
				username: this.username,
				password: this.password,
				remember_device: true,
				'2fa_code': options.twoFactorCode,
			},
		});
	}

	/** Read `/login/me` for the sauce/cid and wire up the auth headers. Throws if the session isn't valid. */
	private async establishSession(): Promise<void> {
		const data = await this.request('/login/me');
		const resource = data.denormalized[data.id];

		this.sauce = resource.data.sauce;
		this.cid = parseInt(resource?.relations?.quick_chat_profile ?? '0', 10);

		for (const method of ['post', 'put', 'patch', 'delete'] as const) {
			this.http.defaults.headers[method]['x-imvu-sauce'] = this.sauce;
			this.http.defaults.headers[method]['x-imvu-application'] = 'next_desktop/1';
		}

		this.authenticated = true;
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
	 * Fetch a single resource and return its raw (un-modeled) API node. Handles the
	 * search shape (`/user?username=…`) and back-fills an `_id` from the URL for
	 * resources that don't include their own.
	 */
	public async resource<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>> {
		const response = await this.request<T>(url, config);
		const data = response.denormalized[response.id].data as Record<string, any>;

		let resource: APIResource<T>;
		if ('items' in data) {
			if (data.total_count !== 1) {
				throw new Error(`The resource at '${url}' does not contain a single resource`);
			}
			resource = response.denormalized[data.items[0]] as APIResource<T>;
		} else {
			resource = response.denormalized[response.id] as APIResource<T>;
		}

		const fields = resource.data as Record<string, any>;
		if (!fields._id) {
			const id = response.id.match(/\d+(?:-\d+)?$/);
			fields._id = id ? id[0] : '';
		}

		return resource;
	}

	/**
	 * Fetch a collection and return the raw (un-modeled) API nodes.
	 */
	public async resources<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>[]> {
		const response = await this.request(url, config);
		const data = response.denormalized[response.id].data as Record<string, any>;

		if (!Array.isArray(data.items)) {
			throw new Error(`The resource at '${url}' does not contain a list of resources`);
		}

		return (data.items as string[])
			.map((itemUrl) => {
				const ref = response.denormalized[itemUrl].relations?.ref;
				const resource = response.denormalized[ref ?? itemUrl] as APIResource<T> | undefined;

				if (!resource) return null;

				const fields = resource.data as Record<string, any>;
				if (!fields._id) {
					const id = (ref ?? itemUrl).match(/\d+(?:-\d+)?$/);
					fields._id = id ? id[0] : '';
				}

				return resource;
			})
			.filter((resource): resource is APIResource<T> => resource !== null);
	}
}
