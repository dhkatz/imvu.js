import type { Constructor } from '../types.js';

import { Resource } from '../resources/index.js';
import { Client, type FetchOptions } from '../client/index.js';
import { APIResource } from '../types.js';

export class BaseController<
	TResource extends Resource | object = Record<string, any>,
	TParams extends Record<string, any> = Record<string, any>,
	TResponse = TResource extends Resource ? TResource : APIResource<TResource>,
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
	public async fetch(id: string | number, options?: FetchOptions): Promise<TResponse | null> {
		id = await this.client.utils.id(id);
		const path = `/${this.base}/${this.base}-${id}`;

		if (!this.model) return (await this.client.resource(path)) as TResponse;
		return (await this.client.resource(path, this.model as Constructor<Resource>, options)) as TResponse | null;
	}

	/**
	 * The cached instance for an id, without any request (`undefined` if not cached or
	 * no longer fresh). The equivalent of discord.js `manager.cache.get(id)`.
	 */
	public resolve(id: string | number): TResponse | undefined {
		if (!this.model) return undefined;
		return this.client.cached(`/${this.base}/${this.base}-${id}`, this.model as Constructor<Resource>) as
			| TResponse
			| undefined;
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
