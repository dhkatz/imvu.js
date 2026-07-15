import { Client } from './Client';
import { Constructor, Writable } from 'type-fest';
import { APIResource } from '../types';
import { AxiosRequestConfig } from 'axios';
import { Resource, ResourceConstructor } from '../resources';

export class Utilities {
	public constructor(private client: Client) {}

	public async id<T extends Resource<any>>(resource: T | string | number, user = false): Promise<string> {
		if (typeof resource === 'string') {
			const match = resource.match(/\d+(-\d+)?$/);

			if (match) {
				return match[0];
			}

			if (user) {
				// Assume it's a username
				try {
					const { data } = await this.resource('/user', { params: { username: user } });

					const id = data.id?.match(/\d+(-\d+)?$/);

					if (id) {
						return id[0];
					}
				} catch (error) {
					throw new Error(`No users found with the username "${resource}"!`);
				}

				throw new Error(`No users found with the username "${resource}"!`);
			}

			throw new Error(`Could not parse "${resource}" as an ID!`);
		} else if (typeof resource === 'number') {
			return `${resource}`;
		} else {
			return `${resource.id}`;
		}
	}

	public deserialize<T extends Resource<any>>(cls: Constructor<T>, data: APIResource<T>): T {
		// Every resource class inherits the `build` factory (validate → construct)
		// from Resource; delegate to it. The cast bridges the plain `Constructor<T>`
		// call sites use to the richer `ResourceConstructor<T>` `build` needs.
		return (cls as unknown as ResourceConstructor<T>).build(this.client, data);
	}

	/**
	 * Convenience method for fetching a resource from the IMVU API.
	 * This will automatically attempt to deserialize the response into the specified type.
	 */
	public async resource<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>>;
	public async resource<T extends Resource<any>>(
		url: string,
		cls: Constructor<T>,
		config?: AxiosRequestConfig
	): Promise<T>;
	public async resource<T extends Resource<any>>(
		url: string,
		cls?: Constructor<T> | AxiosRequestConfig,
		config?: AxiosRequestConfig
	): Promise<T | APIResource<T>> {
		cls = typeof cls === 'function' ? cls : undefined;
		config = typeof cls === 'object' ? cls : config;

		const response = await this.client.request<T>(url, config);

		const data = response.denormalized[response.id].data;

		let resource: APIResource<Writable<T>>;
		// Support for searches (i.e /user?username=Example)
		if ('items' in data) {
			if (data.total_count !== 1) {
				throw new Error(`The resource at '${url}' does not contain a single resource`);
			}

			resource = response.denormalized[data.items[0]] as APIResource<Writable<T>>;
		} else {
			resource = response.denormalized[response.id] as APIResource<Writable<T>>;
		}

		// This is a hack to provide an id to resources which don't include their own id
		if (!resource.data._id) {
			const id = response.id.match(/\d+(?:-\d+)?$/);

			resource.data._id = id ? id[0] : '';
		}

		return cls ? this.deserialize(cls, resource as APIResource<T>) : (resource as APIResource<T>);
	}

	public async resources<T extends object = Record<string, any>>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<APIResource<T>[]>;
	public async resources<T extends Resource<any>>(
		url: string,
		cls: Constructor<T>,
		config?: AxiosRequestConfig
	): Promise<T[]>;
	public async resources<T extends Resource<any>>(
		url: string,
		cls?: Constructor<T> | AxiosRequestConfig,
		config?: AxiosRequestConfig
	): Promise<T[] | APIResource<T>[]> {
		const model = typeof cls === 'function' ? cls : undefined;
		config = typeof cls === 'object' ? cls : config;

		const response = await this.client.request(url, config);

		const data = response.denormalized[response.id].data;

		if (!Array.isArray(data.items)) {
			throw new Error(`The resource at '${url}' does not contain a list of resources`);
		}

		return data.items
			.map((url: string) => {
				const ref = response.denormalized[url].relations?.ref;

				const resource = response.denormalized[ref ?? url] as APIResource<Writable<T>>;

				// Sometimes
				if (!resource) return null;

				// This is a hack to provide an id to resources which don't include their own id
				if (!resource.data.id) {
					const id = (ref ?? url).match(/\d+(?:-\d+)?$/);

					resource.data.id = id ? id[0] : '';
				}

				return model ? this.deserialize(model, resource as APIResource<T>) : resource;
			})
			.filter((resource) => resource !== null) as T extends Resource<any> ? T[] : APIResource<T>[];
	}
}
