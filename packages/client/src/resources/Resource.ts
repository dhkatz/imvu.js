import { Client } from '../client/index.js';
import { APIResource } from '../types.js';
import type { Constructor } from '../types.js';
import type { FetchOptions } from '../client/Client.js';
import { Collection, type CollectionOptions } from '../collections/Collection.js';
import { RemoteDocument } from './RemoteDocument.js';

export interface ResourceOptions {}

/** A resource class: constructable, with a `build` factory. */
export type ResourceConstructor<T extends Resource<any> = Resource<any>> = {
	new (client: Client, options?: ResourceOptions): T;
	readonly name: string;
	build(client: Client, node: APIResource): T;
};

export abstract class Resource<
	TRelations = APIResource['relations'],
	TUpdates = NonNullable<APIResource['updates']>,
> extends RemoteDocument {
	public _id = '';

	public constructor(
		client: Client,
		protected options: ResourceOptions = {}
	) {
		super(client);

		Object.defineProperty(this, 'options', {
			enumerable: false,
		});
	}

	public get id(): string {
		return this._id;
	}

	/** When this instance last received data from the API (ms since epoch); 0 if never. */
	public fetchedAt = 0;

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
		this: new (client: Client, options?: ResourceOptions) => T,
		client: Client,
		node: APIResource
	): T {
		const instance = new this(client);
		instance._hydrate(node);

		return instance;
	}

	/** @internal Refresh this canonical instance from an authoritative REST document. */
	public _hydrate(node: APIResource): void {
		this._patch((node.data ?? {}) as Record<string, any>);
		// The normalized envelope is authoritative; legacy `_id` payload members
		// must not replace an opaque/compound ID derived by the REST layer.
		this._id = node.id;
		this.relations = (node.relations ?? {}) as Partial<TRelations>;
		this.updates = (node.updates ?? {}) as Partial<TUpdates>;
		this._applyRemoteMetadata(node.url, node.updates);
		this.fetchedAt = Date.now();
	}

	/**
	 * Assign fields from a raw (possibly partial) API payload. Used by `build` for
	 * the initial data and, later, by IMQ for in-place live updates — hence the
	 * `in` guards, so a partial payload only touches the fields it carries.
	 * Subclasses override this and call `super._patch(data)`.
	 * @internal
	 */
	public _patch(data: Record<string, any>): void {
		if ('_id' in data && data._id !== null && data._id !== undefined) this._id = String(data._id);
	}

	/**
	 * Re-read this resource from REST and update it in place. Resolves to the same
	 * instance, so references held elsewhere see the fresh data and `stale` clears.
	 */
	public async refresh(): Promise<this> {
		if (!this.url) throw new Error(`Cannot refresh a ${this.constructor.name} that has no canonical URL`);

		const node = await this.client.resource(this.url);
		this._hydrate(node);
		this.client.documents.remember(this);
		return this;
	}

	protected authenticated(): void {
		if (!this.client.authenticated) {
			throw new Error('Cannot retrieve data without user authentication!');
		}
	}

	protected async relationship<T extends Resource, K extends keyof TRelations>(
		relation: K,
		cls: Constructor<T>,
		options?: FetchOptions
	): Promise<T | null> {
		if (this.relations && relation in this.relations) {
			return this.client.resource<T>(`${this.relations[relation]}`, cls, options);
		}

		return null;
	}

	protected collectionRelationship<T extends Resource, K extends keyof TRelations>(
		relation: K,
		cls: Constructor<T>,
		options?: CollectionOptions
	): Collection<T> {
		const url = this.relations[relation];
		if (!url) throw new Error(`Resource '${this.url}' does not expose the '${String(relation)}' collection`);

		return this.client.collection(String(url), cls, options);
	}
}
