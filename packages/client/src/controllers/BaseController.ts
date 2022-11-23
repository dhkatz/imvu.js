import { Constructor } from 'type-fest';

import { Resource } from '../resources';
import { Client } from '../client';
import { APIResource } from '../types';

export class BaseController<
	TResource extends Resource | object = Record<string, any>,
	TParams extends Record<string, any> = Record<string, any>,
	TResponse = TResource extends Resource ? TResource : APIResource<TResource>
> {
	public constructor(
		protected readonly client: Client,
		protected readonly base: string,
		protected readonly model?: Constructor<TResource>
	) {}

	/**
	 * Retrieve instances of resource from IMVU's API
	 * This is a lot faster than searching, so fetch with an ID if you can.
	 * @param id Request ID
	 */
	public async fetch(id: string | number): Promise<TResponse | null> {
		id = await this.client.utils.id(id);

		return (await this.client.resource(
			`/${this.base}/${this.base}-${id}`,
			this.model as Constructor<Resource>
		)) as TResponse | null;
	}

	/**
	 * Search for and retrieve objects based on a given query
	 * @param params Request query parameters to search for
	 */
	public async search(params: TParams): Promise<TResponse[]> {
		if (this.model) {
			return (await this.client.resources(`/${this.base}`, this.model as Constructor<Resource>, {
				params,
			})) as TResponse[];
		}

		return (await this.client.resources(`/${this.base}`, { params })) as TResponse[];
	}
}
