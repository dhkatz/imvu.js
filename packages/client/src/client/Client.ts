import { JsonSerializer } from 'typescript-json-serializer';
import { Constructor } from 'type-fest';

import { BaseClient } from './index';
import { BaseController, ProductController, RoomController, UserController } from '../controllers';
import { Avatar, GetMatched, Resource } from '../resources';
import { AccountManager } from '../managers';
import { APIResource, APIResponse, APISuccessResponse } from '../types';
import { Utilities } from './Utilities';
import { AxiosRequestConfig } from 'axios';

/**
 * The main client for interacting with the IMVU API controllers.
 */
export class Client extends BaseClient {
	public users: UserController = new UserController(this);
	public matched: BaseController<GetMatched> = new BaseController(this, GetMatched);
	public products: ProductController = new ProductController(this);
	public rooms: RoomController = new RoomController(this);

	public utils: Utilities = new Utilities(this);

	private serializer = new JsonSerializer({
		formatPropertyName: (name: string) => name.replace(/([A-Z])/g, '_$1').toLowerCase(),
	});

	public get account(): AccountManager {
		if (!this.#account) {
			throw new Error('Client account cannot be accessed before logging in!');
		}

		return this.#account;
	}

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
		config = typeof cls === 'object' ? cls : config ?? {};
		config.validateStatus = () => true;

		const { data: response } = await this.http.get<APIResponse<T>>(url, config);

		if (response.status === 'failure') {
			throw new Error(response.message);
		}

		const resource = response.denormalized[response.id];

		if (!resource.data.id) {
			const id = response.id.match(/\d+(?:-\d+)?$/);

			if (!id) throw new Error(`Unable to parse resource ID from '${response.id}'`);

			resource.data.id = id[0];
		}

		return cls ? this.deserialize(cls, resource) : resource;
	}

	public async request<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APISuccessResponse<T>> {
		const { data } = await this.http.get<APIResponse<T>>(url, config);

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

	#account?: AccountManager;
}

export interface Client extends BaseClient {
	on(event: 'ready', listener: () => void): this;
}
