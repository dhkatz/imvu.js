import { Client } from '../client';
import { APIResource } from '../types';
import { Constructor } from 'type-fest';
import { URLPaginator } from '../util/Paginator';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ResourceOptions {}

/** A resource class: constructable, with a `build` factory. */
export type ResourceConstructor<T extends Resource<any> = Resource<any>> = {
	new (client: Client, options?: ResourceOptions): T;
	readonly name: string;
	build(client: Client, node: APIResource): T;
};

export abstract class Resource<TRelations = APIResource['relations'], TUpdates = APIResource['updates']> {
	public _id = '';

	public constructor(
		protected readonly client: Client,
		protected options: ResourceOptions = {}
	) {
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

	/**
	 * Construct a resource from a raw API node, then populate it via `_patch`.
	 * No validation — we trust the wire types and rely on tests for API drift
	 * (see MODERNIZATION.md). Fields keep their defaults until `_patch` overwrites
	 * them, so an instance is never in an unset state.
	 */
	public static build<T extends Resource<any>>(
		this: ResourceConstructor<T>,
		client: Client,
		node: APIResource
	): T {
		const instance = new this(client);

		instance._patch((node.data ?? {}) as Record<string, any>);
		Object.assign(instance, { relations: node.relations ?? {}, updates: node.updates ?? {} });

		return instance;
	}

	/**
	 * Assign fields from a raw (possibly partial) API payload. Used by `build` for
	 * the initial data and, later, by IMQ for in-place live updates — hence the
	 * `in` guards, so a partial payload only touches the fields it carries.
	 * Subclasses override this and call `super._patch(data)`.
	 * @internal
	 */
	public _patch(data: Record<string, any>): void {
		if (typeof data._id === 'string') this._id = data._id;
	}

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
