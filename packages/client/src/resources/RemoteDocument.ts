import type { APIUpdateTarget } from '@imvu/rest';

import type { Client } from '../client/Client.js';
import type { DocumentWatch } from '../client/DocumentWatch.js';

/** Shared state for any remotely addressable node, edge, or collection document. */
export abstract class RemoteDocument {
	public revision = 0;
	public stale = false;
	/** Undefined until metadata is loaded; null means the API explicitly provides no update target. */
	public updateTarget: APIUpdateTarget | null | undefined;

	protected _url = '';

	protected constructor(
		protected readonly client: Client,
		url = ''
	) {
		this._url = url;

		Object.defineProperty(this, 'client', {
			enumerable: false,
			writable: false,
		});
	}

	/** Canonical REST URL and cache identity for this document. */
	public get url(): string {
		return this._url;
	}

	/** @internal Apply address/update metadata from an authoritative REST response. */
	public _applyRemoteMetadata(url: string, updateTarget: APIUpdateTarget | null): void {
		this._url = url;
		this.updateTarget = updateTarget;
		this.stale = false;
	}

	/** @internal Mark this document stale after an IMQ invalidation. */
	public _invalidate(): void {
		this.revision++;
		this.stale = true;
	}

	/** Observe explicit IMQ invalidations for this document. */
	public watch(): Promise<DocumentWatch<this>> {
		return this.client.watch(this);
	}
}
