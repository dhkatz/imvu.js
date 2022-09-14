import { JsonSerializer } from 'typescript-json-serializer';
import { Constructor } from 'type-fest';

import { BaseClient } from './index';
import { BaseController } from '../controllers';
import { Avatar, GetMatched, Product, Resource, Room, User } from '../resources';
import { AccountManager } from '../managers';
import { APIResource, APIResponse, APISuccessResponse } from '../types';
import { Utilities } from './Utilities';
import { AxiosRequestConfig } from 'axios';

/**
 * The main client for interacting with the IMVU API controllers.
 */
export class Client extends BaseClient {
	public readonly users = new BaseController<User, { username?: string }>(this, User, 'user');
	public readonly matched: BaseController<GetMatched> = new BaseController(
		this,
		GetMatched,
		'get_matched'
	);
	public readonly products = new BaseController<Product, { creator?: string }>(
		this,
		Product,
		'product'
	);
	public readonly rooms = new BaseController(this, Room, 'room');

	#account?: AccountManager;

	public get account(): AccountManager {
		if (!this.authenticated || !this.#account) {
			throw new Error(`You must be logged into to access account information!`);
		}

		return this.#account;
	}

	public readonly utils: Utilities = new Utilities(this);

	private readonly serializer = new JsonSerializer({
		formatPropertyName: (name: string) => name.replace(/([A-Z])/g, '_$1').toLowerCase(),
	});

	public async login(username: string, password: string, options: any = {}) {
		await super.login(username, password, options);
		// Set up the client user, including the base user and avatar.

		const user = await this.users.fetch(this.cid);

		if (!user) {
			throw new Error(`Unable to fetch client user ${this.cid}`);
		}

		// This is an ugly hack to build the avatar

		const avatar = await this.resource(`/avatar/avatar-${user.id}`, Avatar);

		this.#account = new AccountManager(this, user, avatar);
	}

	public async holidays(): Promise<Array<{ title: string; date: Date }>> {
		const { data } = await this.http.get('/holiday');

		const holidays = data['denormalized'][data.id]['data']['items'] as Array<{
			title: string;
			date: Date;
		}>;

		return holidays.map((value) => ({ ...value, date: new Date(value.date) }));
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
		cls = typeof cls === 'function' ? cls : undefined;
		config = typeof cls === 'object' ? cls : config;

		const response = await this.request<T>(url, config);

		const resource = response.denormalized[response.id];

		// This is a hack to provide an id to resources which don't include their own id
		if (!resource.data.id) {
			const id = response.id.match(/\d+(?:-\d+)?$/);

			resource.data.id = id ? id[0] : '';
		}

		return cls ? this.deserialize(cls, resource) : resource;
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
		const model = typeof cls === 'function' ? cls : undefined;
		config = typeof cls === 'object' ? cls : config;

		const response = await this.request(url, config);

		const data = response.denormalized[response.id].data;

		if (!Array.isArray(data.items)) {
			throw new Error(`The resource at '${url}' does not contain a list of resources`);
		}

		return data.items
			.map((url: string) => {
				const ref = response.denormalized[url].relations?.ref;

				const resource = response.denormalized[ref ?? url] as APIResource<T>;

				if (!resource) return null;

				// This is a hack to provide an id to resources which don't include their own id
				if (!resource.data.id) {
					const id = (ref ?? url).match(/\d+(?:-\d+)?$/);

					resource.data.id = id ? id[0] : '';
				}

				return model ? this.deserialize(model, resource) : resource;
			})
			.filter((resource) => resource !== null) as T extends Resource ? T[] : APIResource<T>[];
	}

	public async request<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APISuccessResponse<T>> {
		config = config ?? {};
		config.validateStatus = () => true;

		const { data } = await this.http.request<APIResponse<T>>({ url, ...config });

		if (data.status === 'failure') {
			throw new Error(data.message);
		}

		return data;
	}

	public deserialize<T extends Resource>(cls: Constructor<T>, data: APIResource<T>): T {
		const instance = new cls(this);

		const resource = this.serializer.deserialize<T>(data.data, instance);

		if (!resource || Array.isArray(resource)) {
			throw new Error(`Unable to deserialize '${cls.name}'`);
		}

		if (data.relations) resource.relations = data.relations;
		if (data.updates) resource.updates = data.updates;

		return resource;
	}
}

export interface Client extends BaseClient {
	on(event: 'ready', listener: () => void): this;
}
