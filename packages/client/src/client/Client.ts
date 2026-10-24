import type { Constructor } from '../types.js';
import { EventEmitter } from 'events';

import { REST, APIResource, APISuccessResponse, type RequestOptions } from '@imvu/rest';
import { XmlRpcGateway, solveRswAsync } from '@imvu/xmlrpc';

import { BaseController } from '../controllers/index.js';
import { GetMatched, Product, Resource, Room, User, type CurrentUser } from '../resources/index.js';
import { AccountManager } from '../managers/index.js';
import { Collection, type CollectionOptions } from '../collections/Collection.js';
import { Utilities } from './Utilities.js';
import { DocumentStore } from './DocumentStore.js';
import { RealtimeCoordinator, type RealtimeManagerFactory } from './RealtimeCoordinator.js';
import { XmlRpcCoordinator, type XmlRpcCoordinatorOptions } from './XmlRpcCoordinator.js';
import type { RemoteDocument } from '../resources/RemoteDocument.js';
import type { DocumentWatch } from './DocumentWatch.js';

/** How {@link Client.resource} and controller `fetch` use the cache. */
export interface FetchOptions {
	/** Skip the cache and read from the API. */
	force?: boolean;
	/** Treat a cached copy older than this many milliseconds as missing. Defaults to {@link ClientOptions.cacheMaxAge}. */
	maxAge?: number;
}

export interface ClientOptions {
	/** Maximum number of documents retained strongly in the hot LRU. */
	maximumStrongDocuments?: number;
	/**
	 * How long a cached resource may answer `fetch` before it is read again, in ms.
	 * Defaults to no limit: cached copies are reused until evicted, invalidated over
	 * IMQ (`stale`), refreshed, or fetched with `{ force: true }`.
	 */
	cacheMaxAge?: number;
	/** Test/custom transport hook; defaults to the real IMQ manager. */
	realtimeManagerFactory?: RealtimeManagerFactory /** XML-RPC gateway settings (gateway instance, session storage, pacing). */;
	xmlrpc?: XmlRpcCoordinatorOptions;
}

/**
 * The main client for interacting with the IMVU API. Wraps a low-level {@link REST}
 * instance with resource classes, controllers, and managers.
 */
export class Client extends EventEmitter {
	public readonly rest: REST;

	public readonly utils: Utilities;
	public readonly documents: DocumentStore;
	public readonly realtime: RealtimeCoordinator;
	/** IMVU's legacy XML-RPC gateway, logged in lazily on first use. */
	public readonly xmlrpc: XmlRpcCoordinator;
	/** See {@link ClientOptions.cacheMaxAge}. */
	public readonly cacheMaxAge: number;

	readonly #inFlight = new Map<string, Promise<Resource>>();

	public constructor(rest: REST = new REST(), options: ClientOptions = {}) {
		super();

		this.rest = rest;
		this.cacheMaxAge = options.cacheMaxAge ?? Infinity;
		const previous = rest.onResponse;
		// Every response's embedded documents feed the cache.
		this.rest.onResponse = (response) => {
			previous?.(response);
			this.documents.ingest(response);
		};
		// IMVU's challenges are RSW time-lock puzzles (imvupow::ChallengeRSWSimple in the web client).
		this.rest.proofOfWork ??= (nonce) => solveRswAsync(nonce);
		this.utils = new Utilities(this);
		this.documents = new DocumentStore(this, options.maximumStrongDocuments);
		this.realtime = new RealtimeCoordinator(this, options.realtimeManagerFactory);
		this.xmlrpc = new XmlRpcCoordinator({
			...options.xmlrpc,
			// Fault 110 asks for proof of work; solve the session's REST challenges, then retry.
			gateway:
				options.xmlrpc?.gateway ??
				new XmlRpcGateway({
					proofOfWork: async () => {
						await this.rest.solveChallenges();
					},
				}),
		});
	}

	public get authenticated(): boolean {
		return this.rest.authenticated;
	}

	public readonly users = new BaseController<User, { username?: string }>(this, 'user', User);
	public readonly matched = new BaseController<GetMatched>(this, 'get_matched', GetMatched);
	public readonly products = new BaseController<Product, { creator?: string }>(this, 'product', Product);
	public readonly rooms = new BaseController(this, 'room', Room);

	#account?: AccountManager;

	public get account(): AccountManager {
		if (!this.authenticated || !this.#account) {
			throw new Error(`You must be logged into to access account information!`);
		}

		return this.#account;
	}

	/**
	 * Log the client in, then set up the account's canonical current user.
	 * @example
	 * await client.login('username', 'password');
	 */
	public async login(username: string, password: string, options: Record<string, any> = {}): Promise<void> {
		await this.rest.login(username, password, options);

		// Always fresh: account-only relations appear only once authenticated.
		const user = (await this.users.fetch(this.rest.cid, { force: true })) as CurrentUser | null;

		if (!user) {
			throw new Error(`Unable to fetch client user ${this.rest.cid}`);
		}

		this.#account = new AccountManager(this, user);
		this.xmlrpc._setCredentials(username, password);
	}

	public async logout(): Promise<void> {
		this.realtime.close();
		this.xmlrpc._clear();
		await this.rest.logout();
		this.documents.clear();
		this.#account = undefined;
	}

	public watch<T extends RemoteDocument>(document: T): Promise<DocumentWatch<T>> {
		return this.realtime.watch(document);
	}

	/** Return the canonical sparse collection for a URL. */
	public collection<T extends Resource>(
		url: string,
		itemType: Constructor<T>,
		options?: CollectionOptions
	): Collection<T>;
	public collection<T = APIResource>(url: string): Collection<T>;
	public collection<T>(url: string, itemType?: Constructor<Resource>, options: CollectionOptions = {}): Collection<T> {
		const existing = this.documents.get<Collection<T>>(url, Collection);
		if (existing) {
			if (existing.itemType !== itemType || (existing.options.items ?? 'ref') !== (options.items ?? 'ref')) {
				throw new TypeError(`Collection '${url}' is already registered with a different item type`);
			}
			return existing;
		}

		return this.documents.remember(new Collection<T>(this, url, itemType, options));
	}

	public request<T extends object = Record<string, any>>(
		url: string,
		options?: RequestOptions
	): Promise<APISuccessResponse<T>> {
		return this.rest.request<T>(url, options);
	}

	/**
	 * Fetch a resource, deserialized into `cls` when provided. With a class, a fresh
	 * cached instance is returned without a request (see {@link FetchOptions}), and
	 * concurrent fetches of the same URL share one request. Without a class, or with
	 * query `params`, this always reads the API.
	 */
	public async resource<T extends object = Record<string, any>>(
		url: string,
		options?: RequestOptions
	): Promise<APIResource<T>>;
	public async resource<T extends Resource>(
		url: string,
		cls: Constructor<T>,
		options?: RequestOptions & FetchOptions
	): Promise<T>;
	public async resource(
		url: string,
		clsOrOptions?: Constructor<Resource> | RequestOptions,
		options?: RequestOptions & FetchOptions
	): Promise<Resource | APIResource> {
		const cls = typeof clsOrOptions === 'function' ? clsOrOptions : undefined;
		const opts = typeof clsOrOptions === 'object' ? clsOrOptions : options;
		if (!cls) return this.rest.resource(url, opts);

		const { force, maxAge, ...rest } = (opts ?? {}) as RequestOptions & FetchOptions;
		const request = Object.keys(rest).length > 0 ? (rest as RequestOptions) : undefined;
		const cacheable = !request?.params && (request?.method ?? 'GET') === 'GET';
		if (!cacheable) return this.utils.deserialize(cls, await this.rest.resource(url, request));

		const key = this.canonicalURL(url);
		if (!force) {
			const cached = this.cached(key, cls, maxAge);
			if (cached) return cached;
		}

		let pending = this.#inFlight.get(key);
		if (!pending) {
			pending = this.rest
				.resource(url, request)
				.then((node) => this.utils.deserialize(cls, node))
				.finally(() => this.#inFlight.delete(key));
			this.#inFlight.set(key, pending);
		}
		return pending;
	}

	/** The canonical absolute URL for an API path (`/user/user-1` → `https://api.imvu.com/user/user-1`). */
	public canonicalURL(url: string): string {
		if (/^[a-z][a-z\d+\-.]*:\/\//i.test(url)) return url;
		const base = (this.rest.baseURL ?? 'https://api.imvu.com').replace(/\/+$/, '');
		return `${base}/${url.replace(/^\/+/, '')}`;
	}

	/** A cached instance of `cls` at `url` that is fresh enough to use, if any. */
	public cached<T extends Resource>(url: string, cls: Constructor<T>, maxAge = this.cacheMaxAge): T | undefined {
		const document = this.documents.get(this.canonicalURL(url), cls);
		if (!document || document.stale || document.fetchedAt === 0) return undefined;
		return Date.now() - document.fetchedAt <= maxAge ? document : undefined;
	}

	public async resources<T extends object = Record<string, any>>(
		url: string,
		options?: RequestOptions
	): Promise<APIResource<T>[]>;
	public async resources<T extends Resource>(url: string, cls: Constructor<T>, options?: RequestOptions): Promise<T[]>;
	public async resources(
		url: string,
		clsOrOptions?: Constructor<Resource> | RequestOptions,
		options?: RequestOptions
	): Promise<Resource[] | APIResource[]> {
		const cls = typeof clsOrOptions === 'function' ? clsOrOptions : undefined;
		const opts = typeof clsOrOptions === 'object' ? clsOrOptions : options;

		const nodes = await this.rest.resources(url, opts);

		return cls ? nodes.map((node) => this.utils.deserialize(cls, node)) : nodes;
	}
}
