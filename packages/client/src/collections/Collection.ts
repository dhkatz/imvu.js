import type { AxiosRequestConfig } from 'axios';
import type { Constructor } from 'type-fest';
import type { APIResource, APIUpdateTarget } from '@imvu/rest';

import type { Client } from '../client/Client.js';
import type { DocumentWatch } from '../client/DocumentWatch.js';
import type { Resource } from '../resources/Resource.js';
import { RemoteDocument } from '../resources/RemoteDocument.js';

export interface PageOptions {
	offset?: number;
	limit?: number;
}

interface LoadedPage<T> {
	items: readonly T[];
	responseItemCount: number;
	totalCount: number;
}

export class CollectionNotWatchableError extends Error {
	public constructor(public readonly collectionUrl: string) {
		super(`The collection '${collectionUrl}' does not advertise realtime updates`);
		this.name = 'CollectionNotWatchableError';
	}
}

/** A sparse URL-backed collection with fresh page reads and optional realtime invalidation. */
export class Collection<T = APIResource> extends RemoteDocument implements AsyncIterable<T> {
	/** Total reported by the most recent page/count response. */
	public totalCount?: number;

	public constructor(
		client: Client,
		url: string,
		/** @internal The model used to hydrate each normalized item, if any. */
		public readonly itemType?: Constructor<Resource>
	) {
		super(client, url);
	}

	public get watchability(): 'unknown' | 'supported' | 'unsupported' {
		if (this.updateTarget === undefined) return 'unknown';
		return this.updateTarget === null ? 'unsupported' : 'supported';
	}

	public async count(): Promise<number> {
		const document = await this.fetch({ params: { start_index: 0, limit: 0 } });
		this.applyMetadata(document.totalCount, document.updates);
		return document.totalCount;
	}

	/** Fetch a fresh range of items. Collection membership is intentionally not cached. */
	public async page({ offset = 0, limit = 25 }: PageOptions = {}): Promise<readonly T[]> {
		return (await this.loadPage(offset, limit)).items;
	}

	public async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		let offset = 0;
		const limit = 25;

		while (true) {
			const page = await this.loadPage(offset, limit);
			yield* page.items;

			if (page.responseItemCount === 0 || offset + page.responseItemCount >= page.totalCount) return;
			offset += page.responseItemCount;
		}
	}

	public override async watch(): Promise<DocumentWatch<this>> {
		// Re-probe unsupported collections as well as unknown ones, so an endpoint
		// that gains update metadata can become watchable without a client change.
		if (!this.updateTarget) await this.count();
		if (!this.updateTarget) throw new CollectionNotWatchableError(this.url);
		return super.watch();
	}

	private async loadPage(offset: number, limit: number): Promise<LoadedPage<T>> {
		if (!Number.isInteger(offset) || offset < 0) {
			throw new RangeError('Collection page offset must be a non-negative integer');
		}
		if (!Number.isInteger(limit) || limit <= 0) {
			throw new RangeError('Collection page limit must be a positive integer');
		}

		const document = await this.fetch({ params: { start_index: offset, limit } });
		this.applyMetadata(document.totalCount, document.updates);

		const itemType = this.itemType;
		const items = itemType
			? document.items.map((item) => this.client.utils.deserialize(itemType, item))
			: document.items;

		return {
			items: items as T[],
			responseItemCount: document.itemUrls.length,
			totalCount: document.totalCount,
		};
	}

	private fetch(config?: AxiosRequestConfig) {
		return this.client.rest.collection(this.url, config);
	}

	private applyMetadata(totalCount: number, updateTarget: APIUpdateTarget | null): void {
		this.totalCount = totalCount;
		this._applyRemoteMetadata(this.url, updateTarget);
	}
}
