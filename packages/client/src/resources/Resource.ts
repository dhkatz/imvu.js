import { Client } from '../client';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';
import { APIResource } from '../types';
import { Constructor } from 'type-fest';
import { URLPaginator } from '../util/Paginator';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ResourceOptions {}

@JsonObject()
export abstract class Resource<
	TRelations = APIResource['relations'],
	TUpdates = APIResource['updates']
> {
	@JsonProperty()
	public readonly _id: string = '';

	public constructor(protected readonly client: Client, protected options: ResourceOptions = {}) {
		Object.defineProperty(this, 'client', {
			enumerable: false,
			writable: false,
		});

		Object.defineProperty(this, 'options', {
			enumerable: false,
		});
	}

	public get id(): string {
		return this._id;
	}

	/**
	 * @internal
	 */
	public relations: Partial<TRelations> = {};

	/**
	 * @internal
	 */
	public updates: Partial<TUpdates> = {};

	protected authenticated(): void {
		if (!this.client.authenticated) {
			throw new Error('Cannot retrieve data without user authentication!');
		}
	}

	protected async relationship<T extends Resource, K extends keyof TRelations>(
		relation: K,
		cls: Constructor<T>
	): Promise<T | null> {
		if (this.relations && relation in this.relations) {
			return this.client.resource<T>(`${this.relations[relation]}`, cls, undefined);
		}

		return null;
	}

	protected async *paginatedRelationship<T extends Resource, K extends keyof TRelations>(
		relation: K,
		cls: Constructor<T>
	): AsyncIterableIterator<T> {
		if (this.relations && relation in this.relations) {
			yield* new URLPaginator(this.client, cls, `${this.relations[relation]}`);
		}
	}
}
