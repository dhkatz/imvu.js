import { Constructor } from 'type-fest';

import { Resource } from '../resources';
import { Client } from '../client';
import { APIResource } from '../types';

export interface BaseQuery {
	id?: unknown;
}

export interface ControllerOptions<T, U> {
	name?: string;
	transform?: (query: U) => U;
	process?: (object: T | null) => Promise<T | null>;
}

export class BaseController<T extends Resource, U extends BaseQuery = BaseQuery> {
	private readonly base: string;

	private cache: Map<string, { ttl: number; value: T | null }> = new Map();

	public constructor(
		protected readonly client: Client,
		protected readonly model: Constructor<T>,
		private options: ControllerOptions<T, U> = {}
	) {
		this.base =
			options.name ||
			`${model.name
				.split(/(?=[A-Z])/)
				.join('_')
				.toLowerCase()}`;
	}

	/**
	 * Retrieve instances of resource from IMVU's API
	 * This is a lot faster than searching, so fetch with an ID if you can.
	 * @param id Request ID
	 */
	public async fetch(id: number | string): Promise<T | null> {
		id = await this.client.utils.id(id);

		const cached = this.getCached(id);

		if (cached) {
			return cached;
		}

		try {
			const resource = await this.client.resource(`/${this.base}/${this.base}-${id}`, this.model);

			return this.setCached(
				id,
				this.options.process ? await this.options.process(resource) : resource
			);
		} catch (err) {
			if (err instanceof TypeError) {
				throw err;
			} else {
				console.error(err);

				return this.options.process ? this.options.process(null) : null;
			}
		}
	}

	/**
	 * Search for and retrieve objects based on a given query
	 * @param query Request query to search for
	 */
	public async search(query: U): Promise<T[]> {
		const params = this.options.transform ? this.options.transform(query) : query;

		const response = await this.client.request(`/${this.base}`, { params });

		const data = response.denormalized[response.id].data;

		return data.items
			.map((url: string) => {
				const ref = response.denormalized[url].relations?.ref;

				const resource = ref ? response.denormalized[ref] : response.denormalized[url];

				if (!resource) return null;

				if (!resource.data.id) {
					const id = (ref ?? url).match(/\d+(?:-\d+)?$/);

					if (!id) throw new Error(`Unable to parse resource ID from '${ref ?? url}'`);

					resource.data.id = id[0];
				}
			})
			.filter((resource: APIResource<T> | null) => resource !== null)
			.map((resource: APIResource<T>) =>
				this.setCached(resource.data.id, this.deserialize(resource))
			);
	}

	public deserialize(object: APIResource<T>): T {
		return this.client.deserialize(this.model, object);
	}

	private getCached(id: string): T | null {
		const cached = this.cache.get(id);

		if (!cached) {
			return null;
		}

		if (cached.ttl < Date.now()) {
			this.cache.delete(id);

			return null;
		}

		return cached.value;
	}

	private setCached(
		id: string,
		value: T | null,
		ttl: number = Date.now() + 1000 * 60 * 10
	): T | null {
		this.cache.set(id, { ttl, value });

		return value;
	}
}
