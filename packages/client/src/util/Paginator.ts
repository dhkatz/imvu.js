import { Class } from 'type-fest';

import { Client } from '../client';
import { Resource } from '../resources';
import { BaseController } from '../controllers';
import { APIResource } from '../types';

export interface PaginatorOptions<T extends Resource> {
	next: (client: Client, offset: number) => Promise<T[]>;
	limit?: number;
}

/**
 * Instances of this class generate instances of T.
 * @template T A class type extending `BaseModel`
 */
export class Paginator<T extends Resource> {
	protected offset = 0;
	protected readonly limit: number = 25;

	public constructor(protected client: Client, protected options: PaginatorOptions<T>) {
		this.client = client;
		this.limit = options.limit ?? this.limit;
	}

	public async next(): Promise<T[]> {
		return this.options.next(this.client, this.offset);
	}

	public async prev(): Promise<T[]> {
		this.offset -= this.limit;

		return this.next();
	}

	public async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		while (true) {
			try {
				const objects = await this.next();

				this.offset += 25;

				if (!objects.length) {
					return;
				}

				for (const object of objects) {
					if (object === null) {
						continue;
					}

					yield object;
				}
			} catch (err) {
				return;
			}
		}
	}
}

export class URLPaginator<
	T extends Resource,
	U extends BaseController<T, any> | Class<T>
> extends Paginator<T> {
	public constructor(client: Client, controller: U, url: string) {
		super(client, {
			next: async (client) => {
				const response = await client.request(url, {
					params: { start_index: this.offset, limit: this.limit },
				});

				const data = response.denormalized[response.id].data;

				return data.items
					.map((url: string) => {
						const ref = response.denormalized[url].relations?.ref;

						return ref ? response.denormalized[ref] : null;
					})
					.filter((resource: APIResource<T> | null) => resource !== null)
					.map((resource: APIResource<T>) => {
						return typeof controller === 'function'
							? client.deserialize(controller, resource)
							: controller.deserialize(resource);
					});
			},
		});
	}
}
