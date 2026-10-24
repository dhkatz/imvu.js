import type { CookieJar } from 'tough-cookie';

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
import { fileCookieStorage, restoreCookieJar, type CookieStorage } from './cookies.js';

export type QueryValue = string | number | boolean | null | undefined;

/** Options for a single request. */
export interface RequestOptions {
	/** HTTP method. Defaults to `GET`. */
	method?: string;
	/** Query parameters, set on the URL (replacing any of the same name); `null`/`undefined` are skipped. */
	params?: Record<string, QueryValue>;
	/** JSON request body. */
	data?: unknown;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	/** Base URL for a relative `url`, overriding {@link RESTOptions.baseURL}. */
	baseURL?: string;
}

export interface RESTOptions {
	/** API base URL. Defaults to `https://api.imvu.com`. */
	baseURL?: string;
	/** Cookie file used by the default Node storage. Defaults to `./cookies.json`. */
	cookiePath?: string;
	/**
	 * Where the session's cookies persist. Defaults to a JSON file at `cookiePath`
	 * outside browsers; `null` keeps them in memory only. Ignored in browsers, which
	 * manage cookies themselves.
	 */
	cookieStorage?: CookieStorage | null;
	/** The `fetch` implementation to use. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/**
	 * Solves proof-of-work challenges, so requests rejected with `VERIFY-001` can be
	 * retried (see {@link REST.solveChallenges}). Without one, `VERIFY-001` throws
	 * like any other API error. `@imvu/client` supplies an RSW solver by default.
	 */
	proofOfWork?: ProofOfWorkSolver;
	/** Times one request may be retried after solving challenges. Defaults to `3`. */
	maxPowRetries?: number;
	/** See {@link REST.onResponse}. */
	onResponse?: (response: APISuccessResponse) => void;
}

/** Turns a challenge nonce (e.g. `rsw,T,N,A,Cipher`) into its solution string. */
export type ProofOfWorkSolver = (nonce: string) => Promise<string>;

/** Error code the API returns when the session must solve proof-of-work challenges first. */
export const POW_REQUIRED = 'VERIFY-001';
/** Challenge already solved or withdrawn; nothing left to do for it. */
const POW_ALREADY_CLEARED = new Set(['POW-003', 'POW-004']);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

/**
 * Browsers own the cookie jar: `Set-Cookie` is unreadable and `Cookie` cannot be
 * set by script. Everywhere else (Node, Deno, Bun) the client manages cookies.
 */
const browserManagesCookies = (): boolean =>
	typeof (globalThis as { document?: unknown }).document !== 'undefined' ||
	typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined';

/**
 * Low-level IMVU REST client: cookie-based auth, HTTP transport, and raw
 * (un-modeled) resource fetching. `@imvu/client` builds the resource/manager
 * layer on top; consumers that just want fast, raw typed JSON (e.g. a renderer
 * that doesn't want class instances) can use this directly.
 *
 * Built on the standard `fetch`, so it carries no HTTP-library dependency.
 */
export class REST {
	public sauce = '';
	public cid: ResourceId = '';
	public authenticated = false;

	public readonly baseURL: string;
	/** See {@link RESTOptions.proofOfWork}. Settable after construction. */
	public proofOfWork?: ProofOfWorkSolver;
	public readonly maxPowRetries: number;
	/**
	 * Called with every successful API response, including all the documents it embeds
	 * (`denormalized`). `@imvu/client` uses it to keep its cache current.
	 */
	public onResponse?: (response: APISuccessResponse) => void;

	protected username = '';
	protected password = '';

	private readonly fetchImpl: typeof fetch;
	private readonly manageCookies: boolean;
	private readonly cookieStorage: CookieStorage | null;
	private jar?: Promise<CookieJar>;
	private saving: Promise<void> = Promise.resolve();
	private solving?: Promise<number>;

	public constructor(options: RESTOptions = {}) {
		this.baseURL = options.baseURL ?? 'https://api.imvu.com';
		this.proofOfWork = options.proofOfWork;
		this.maxPowRetries = options.maxPowRetries ?? 3;
		this.onResponse = options.onResponse;
		this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		this.manageCookies = !browserManagesCookies();
		this.cookieStorage = !this.manageCookies
			? null
			: options.cookieStorage !== undefined
				? options.cookieStorage
				: fileCookieStorage(options.cookiePath ?? './cookies.json');
	}

	/** The session's cookie jar, loaded from storage on first use. */
	public cookies(): Promise<CookieJar> {
		this.jar ??= this.cookieStorage ? this.cookieStorage.load().then(restoreCookieJar) : restoreCookieJar(null);
		return this.jar;
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
		const cookies = await (await this.cookies()).getCookies('https://imvu.com/');
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

	/** Read `/login/me` for the sauce/cid used to authorize writes. Throws if the session isn't valid. */
	private async establishSession(): Promise<void> {
		const data = await this.request('/login/me');
		const resource = data.denormalized[data.id];

		this.sauce = resource.data.sauce;
		this.cid = resourceId(resource?.relations?.quick_chat_profile ?? '');
		this.authenticated = true;
	}

	public async logout(): Promise<void> {
		this.authenticated = false;
		this.sauce = '';
		this.cid = '';
	}

	/**
	 * Send a request through the session and return the raw `Response`, whatever its
	 * status. Resolves `url` against the base URL, sends and records cookies, adds the
	 * auth headers to writes, and follows redirects (capturing cookies set along the way).
	 */
	public async fetch(url: string, options: RequestOptions = {}): Promise<Response> {
		let method = (options.method ?? 'GET').toUpperCase();
		const headers = new Headers(options.headers);
		if (!headers.has('accept')) headers.set('accept', 'application/json, text/plain, */*');

		let body: string | undefined;
		if (options.data !== undefined) {
			body = JSON.stringify(options.data);
			if (!headers.has('content-type')) headers.set('content-type', 'application/json');
		}

		if (method !== 'GET' && method !== 'HEAD' && this.sauce) {
			headers.set('x-imvu-sauce', this.sauce);
			headers.set('x-imvu-application', 'next_desktop/1');
		}

		let target = resolveURL(options.baseURL ?? this.baseURL, url, options.params);

		for (let redirects = 0; ; redirects++) {
			if (this.manageCookies) {
				const cookie = await (await this.cookies()).getCookieString(target);
				if (cookie) headers.set('cookie', cookie);
				else headers.delete('cookie');
			}

			const response = await this.fetchImpl(target, {
				method,
				headers,
				body,
				signal: options.signal,
				credentials: 'include',
				redirect: this.manageCookies ? 'manual' : 'follow',
			});

			if (!this.manageCookies) return response;
			await this.storeCookies(target, response);

			const location = response.headers.get('location');
			if (!REDIRECT_STATUSES.has(response.status) || !location) return response;
			if (redirects >= MAX_REDIRECTS) throw new Error(`Too many redirects requesting '${url}'`);

			await response.body?.cancel();
			target = new URL(location, target).href;
			if (response.status === 303 || (method === 'POST' && (response.status === 301 || response.status === 302))) {
				method = 'GET';
				body = undefined;
				headers.delete('content-type');
			}
		}
	}

	/** Send a request and return the API's success envelope; API failures throw {@link IMVUAPIError}. */
	public async request<T extends object = Record<string, any>>(
		url: string,
		options: RequestOptions = {}
	): Promise<APISuccessResponse<T>> {
		for (let attempt = 0; ; attempt++) {
			try {
				const response = await this.requestOnce<T>(url, options);
				this.onResponse?.(response as APISuccessResponse);
				return response;
			} catch (error) {
				const retry =
					error instanceof IMVUAPIError &&
					error.apiCode === POW_REQUIRED &&
					this.proofOfWork !== undefined &&
					attempt < this.maxPowRetries;
				if (!retry) throw error;
				await this.solveChallenges();
			}
		}
	}

	/**
	 * Solve every outstanding proof-of-work challenge for this session, the way the web
	 * client does: list `/pow`, read each challenge's `nonce`, solve it with
	 * {@link proofOfWork}, and POST `{solution}` back. Concurrent calls share one run.
	 * Resolves to the number of challenges handled. Called automatically when a request
	 * fails with `VERIFY-001`.
	 */
	public solveChallenges(): Promise<number> {
		this.solving ??= this.solveOutstandingChallenges().finally(() => {
			this.solving = undefined;
		});
		return this.solving;
	}

	private async solveOutstandingChallenges(): Promise<number> {
		const solve = this.proofOfWork;
		if (!solve) throw new Error('No proof-of-work solver is configured (RESTOptions.proofOfWork)');

		const list = await this.requestOnce('/pow');
		const challenges: string[] = list.denormalized[list.id]?.data?.items ?? [];
		for (const challenge of challenges) {
			try {
				const document = await this.requestOnce(challenge);
				const nonce = document.denormalized[document.id]?.data?.nonce;
				if (typeof nonce !== 'string' || !nonce) throw new Error(`Challenge '${challenge}' has no nonce`);

				await this.requestOnce(challenge, { method: 'POST', data: { solution: await solve(nonce) } });
			} catch (error) {
				if (error instanceof IMVUAPIError && POW_ALREADY_CLEARED.has(error.apiCode)) continue;
				throw error;
			}
		}
		return challenges.length;
	}

	private async requestOnce<T extends object = Record<string, any>>(
		url: string,
		options: RequestOptions = {}
	): Promise<APISuccessResponse<T>> {
		const response = await this.fetch(url, options);
		const text = await response.text();

		let data: APIResponse<T>;
		try {
			data = JSON.parse(text);
		} catch (error) {
			throw new Error(`Expected a JSON response from '${url}' but got HTTP ${response.status}`, { cause: error });
		}

		if (data.status === 'failure') {
			throw new IMVUAPIError(data.error, data.message, data);
		}

		return data;
	}

	private async storeCookies(url: string, response: Response): Promise<void> {
		const setCookies = response.headers.getSetCookie();
		if (setCookies.length === 0) return;

		const jar = await this.cookies();
		for (const cookie of setCookies) {
			await jar.setCookie(cookie, url, { ignoreError: true });
		}

		const storage = this.cookieStorage;
		if (storage) {
			// Serialize saves so an older snapshot never overwrites a newer one. A failed
			// save only costs the cached session next run, so it never fails the request.
			this.saving = this.saving.then(async () => storage.save(JSON.stringify(await jar.serialize()))).catch(() => {});
		}
	}

	/**
	 * Fetch a single resource and return its normalized envelope with raw data.
	 * Handles the search shape (`/user?username=…`) and derives an opaque string ID
	 * without mutating the payload.
	 */
	public async resource<T extends object = Record<string, any>>(
		url: string,
		options?: RequestOptions
	): Promise<APIResource<T>> {
		const response = await this.request<T>(url, options);
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
		options?: RequestOptions
	): Promise<APICollection<T>> {
		const response = await this.request(url, options);
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
		const edges = itemUrls
			.filter((itemUrl) => response.denormalized[itemUrl])
			.map((itemUrl) => this.normalizeResource(response, itemUrl));

		return {
			url: response.id,
			data: data as T,
			itemUrls,
			items,
			edges,
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
		options?: RequestOptions
	): Promise<APIResource<T>[]> {
		return (await this.collection<T>(url, options)).items as APIResource<T>[];
	}

	private normalizeResource<T extends object>(response: APISuccessResponse, url: string): APIResource<T> {
		const node = response.denormalized[url] as APIResourceNode<T> | undefined;
		if (!node) {
			throw new Error(`The response does not contain the resource '${url}'`);
		}

		return normalizeDocument(url, node);
	}
}

/**
 * Turn one entry of a response's `denormalized` map into a normalized document: the
 * canonical URL, an opaque id derived from it, and the raw data, relations and update
 * target.
 */
export function normalizeDocument<T extends object = Record<string, any>>(
	url: string,
	node: APIResourceNode<T>
): APIResource<T> {
	return {
		url,
		id: resourceId(url, node.data),
		data: node.data,
		relations: node.relations ?? {},
		updates: updateTarget(node.updates),
	};
}

function updateTarget(value: Partial<APIUpdateTarget> | null): APIUpdateTarget | null {
	return value && typeof value.queue === 'string' && typeof value.mount === 'string'
		? (value as APIUpdateTarget)
		: null;
}

/** Join a relative URL onto `baseURL` (keeping any base path, like axios) and apply `params`. */
function resolveURL(baseURL: string, url: string, params?: Record<string, QueryValue>): string {
	const absolute = /^[a-z][a-z\d+\-.]*:\/\//i.test(url)
		? url
		: `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
	if (!params) return absolute;

	const target = new URL(absolute);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
	}
	return target.href;
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
