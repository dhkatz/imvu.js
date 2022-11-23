import { Class } from 'type-fest';

import { Client } from '../client';
import { Resource } from '../resources';

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

export class URLPaginator<T extends Resource, U extends Class<T>> extends Paginator<T> {
	public constructor(client: Client, controller: U, url: string) {
		super(client, {
			next: async (client) =>
				client.resources(url, controller, {
					params: { start_index: this.offset, limit: this.limit },
				}),
		});
	}
}
