import { Constructor } from 'type-fest';

import { Resource } from '../resources';
import { Client } from '../client';
import { APIResource } from '../types';

export class BaseController<
	T extends Resource,
	U extends Record<string, any> = Record<string, any>
> {
	public constructor(
		protected readonly client: Client,
		protected readonly model: Constructor<T>,
		protected readonly base: string
	) {}

	/**
	 * Retrieve instances of resource from IMVU's API
	 * This is a lot faster than searching, so fetch with an ID if you can.
	 * @param id Request ID
	 */
	public async fetch(id: string | number): Promise<T | null> {
		id = await this.client.utils.id(id);

		return this.client.resource(`/${this.base}/${this.base}-${id}`, this.model);
	}

	/**
	 * Search for and retrieve objects based on a given query
	 * @param params Request query parameters to search for
	 */
	public async search(params: U): Promise<T[]> {
		return this.client.resources(`/${this.base}`, this.model, { params });
	}

	protected deserialize(object: APIResource<T>): T {
		return this.client.deserialize(this.model, object);
	}
}
