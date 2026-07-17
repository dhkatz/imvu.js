import { Constructor } from 'type-fest';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { EventEmitter } from 'events';

import { REST, APIResource, APISuccessResponse } from '@imvu/rest';

import { BaseController } from '../controllers/index.js';
import { Avatar, GetMatched, Product, Resource, Room, User } from '../resources/index.js';
import { AccountManager } from '../managers/index.js';
import { Utilities } from './Utilities.js';

/**
 * The main client for interacting with the IMVU API. Wraps a low-level {@link REST}
 * instance with resource classes, controllers, and managers.
 */
export class Client extends EventEmitter {
	public readonly rest: REST;

	public readonly utils: Utilities = new Utilities(this);

	public constructor(rest: REST = new REST()) {
		super();

		this.rest = rest;
	}

	/** The underlying axios instance (used by managers for raw POST/DELETE calls). */
	public get http(): AxiosInstance {
		return this.rest.http;
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
	 * Log the client in, then set up the account (client user + avatar).
	 * @example
	 * await client.login('username', 'password');
	 */
	public async login(username: string, password: string, options: Record<string, any> = {}): Promise<void> {
		await this.rest.login(username, password, options);

		// Set up the client user, including the base user and avatar.
		const user = await this.users.fetch(this.rest.cid);

		if (!user) {
			throw new Error(`Unable to fetch client user ${this.rest.cid}`);
		}

		const avatar = await this.resource(`/avatar/avatar-${user.id}`, Avatar);

		this.#account = new AccountManager(this, user, avatar);
	}

	public async logout(): Promise<void> {
		return this.rest.logout();
	}

	public request<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APISuccessResponse<T>> {
		return this.rest.request<T>(url, config);
	}

	/**
	 * Fetch a resource from the IMVU API, deserialized into `cls` when provided.
	 */
	public async resource<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>>;
	public async resource<T extends Resource>(url: string, cls: Constructor<T>, config?: AxiosRequestConfig): Promise<T>;
	public async resource<T extends Resource>(
		url: string,
		clsOrConfig?: Constructor<T> | AxiosRequestConfig,
		config?: AxiosRequestConfig
	): Promise<T | APIResource<T>> {
		const cls = typeof clsOrConfig === 'function' ? clsOrConfig : undefined;
		const cfg = typeof clsOrConfig === 'object' ? clsOrConfig : config;

		const node = await this.rest.resource<T>(url, cfg);

		return cls ? this.utils.deserialize(cls, node) : node;
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
		clsOrConfig?: Constructor<T> | AxiosRequestConfig,
		config?: AxiosRequestConfig
	): Promise<T[] | APIResource<T>[]> {
		const cls = typeof clsOrConfig === 'function' ? clsOrConfig : undefined;
		const cfg = typeof clsOrConfig === 'object' ? clsOrConfig : config;

		const nodes = await this.rest.resources<T>(url, cfg);

		return cls ? nodes.map((node) => this.utils.deserialize(cls, node)) : nodes;
	}
}
