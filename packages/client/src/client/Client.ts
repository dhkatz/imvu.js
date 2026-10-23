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

export interface ClientOptions {
	/** Maximum number of documents retained strongly in the hot LRU. */
	maximumStrongDocuments?: number;
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

	public constructor(rest: REST = new REST(), options: ClientOptions = {}) {
		super();

		this.rest = rest;
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

		const user = (await this.users.fetch(this.rest.cid)) as CurrentUser | null;

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
	 * Fetch a resource from the IMVU API, deserialized into `cls` when provided.
	 */
	public async resource<T extends object = Record<string, any>>(
		url: string,
		options?: RequestOptions
	): Promise<APIResource<T>>;
	public async resource<T extends Resource>(url: string, cls: Constructor<T>, options?: RequestOptions): Promise<T>;
	public async resource(
		url: string,
		clsOrOptions?: Constructor<Resource> | RequestOptions,
		options?: RequestOptions
	): Promise<Resource | APIResource> {
		const cls = typeof clsOrOptions === 'function' ? clsOrOptions : undefined;
		const opts = typeof clsOrOptions === 'object' ? clsOrOptions : options;

		const node = await this.rest.resource(url, opts);

		return cls ? this.utils.deserialize(cls, node) : node;
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
