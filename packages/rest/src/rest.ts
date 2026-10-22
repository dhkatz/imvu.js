import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CookieJar, Store } from 'tough-cookie';
import FileCookieStore from 'tough-cookie-file-store';
import { wrapper } from 'axios-cookiejar-support';

import {
	APICollection,
	APICollectionNode,
	APIResource,
	APIResourceNode,
	APIResponse,
	APISuccessResponse,
	APIUpdateTarget,
	ResourceId,
} from './types.js';
import { IMVUAPIError } from './errors.js';

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
	public cid: ResourceId = '';
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
		this.cid = resourceId(resource?.relations?.quick_chat_profile ?? '');

		for (const method of ['post', 'put', 'patch', 'delete'] as const) {
			this.http.defaults.headers[method]['x-imvu-sauce'] = this.sauce;
			this.http.defaults.headers[method]['x-imvu-application'] = 'next_desktop/1';
		}

		this.authenticated = true;
	}

	public async logout(): Promise<void> {
		this.authenticated = false;
		this.sauce = '';
		this.cid = '';
	}

	public async request<T extends object = Record<string, any>>(
		url: string,
		config: AxiosRequestConfig = {}
	): Promise<APISuccessResponse<T>> {
		const { data } = await this.http.request<APIResponse<T>>({ url, ...config });

		if (data.status === 'failure') {
			throw new IMVUAPIError(data.error, data.message, data);
		}

		return data;
	}

	/**
	 * Fetch a single resource and return its normalized envelope with raw data.
	 * Handles the search shape (`/user?username=…`) and derives an opaque string ID
	 * without mutating the payload.
	 */
	public async resource<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>> {
		const response = await this.request<T>(url, config);
		const data = response.denormalized[response.id].data as Record<string, any>;

		let resourceUrl: string;
		if ('items' in data) {
			if (data.total_count !== 1) {
				throw new Error(`The resource at '${url}' does not contain a single resource`);
			}
			const edge = response.denormalized[data.items[0]] as APIResourceNode;
			resourceUrl = edge.relations?.ref ?? data.items[0];
		} else {
			resourceUrl = response.id;
		}

		return this.normalizeResource<T>(response, resourceUrl);
	}

	/** Fetch one bounded page from a node-group or edge-group document. */
	public async collection<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APICollection<T>> {
		const response = await this.request(url, config);
		const root = response.denormalized[response.id] as APICollectionNode<T>;

		if (!Array.isArray(root.data.items)) {
			throw new Error(`The resource at '${url}' does not contain a list of resources`);
		}

		const { items: itemUrls, total_count: totalCount, ...data } = root.data;
		const items = itemUrls
			.map((itemUrl) => {
				const edge = response.denormalized[itemUrl] as APIResourceNode | undefined;
				const resourceUrl = edge?.relations?.ref ?? itemUrl;

				return response.denormalized[resourceUrl] ? this.normalizeResource(response, resourceUrl) : null;
			})
			.filter((resource): resource is APIResource => resource !== null);

		return {
			url: response.id,
			data: data as T,
			itemUrls,
			items,
			totalCount,
			relations: root.relations ?? {},
			updates: updateTarget(root.updates),
		};
	}

	/**
	 * Fetch a collection and return the raw (un-modeled) API nodes.
	 */
	public async resources<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>[]> {
		return (await this.collection<T>(url, config)).items as APIResource<T>[];
	}

	private normalizeResource<T extends object>(response: APISuccessResponse, url: string): APIResource<T> {
		const node = response.denormalized[url] as APIResourceNode<T> | undefined;
		if (!node) {
			throw new Error(`The response does not contain the resource '${url}'`);
		}

		return {
			url,
			id: resourceId(url, node.data),
			data: node.data,
			relations: node.relations ?? {},
			updates: updateTarget(node.updates),
		};
	}
}

function updateTarget(value: Partial<APIUpdateTarget> | null): APIUpdateTarget | null {
	return value && typeof value.queue === 'string' && typeof value.mount === 'string'
		? (value as APIUpdateTarget)
		: null;
}

/** Extract the API's opaque identifier without converting or numerically parsing it. */
function resourceId(url: string, data: Record<string, any> = {}): ResourceId {
	const supplied = data._id ?? data.id;
	if (supplied !== undefined && supplied !== null && supplied !== '') {
		return String(supplied);
	}

	const segment = url.split(/[/?#]/).filter(Boolean).at(-1) ?? '';
	const separator = segment.indexOf('-');
	const currentId = separator >= 0 ? segment.slice(separator + 1) : segment;

	// The URL remains the canonical identity. Preserve unfamiliar identifiers
	// rather than dropping them if a future endpoint stops using numeric IDs.
	return currentId;
}
