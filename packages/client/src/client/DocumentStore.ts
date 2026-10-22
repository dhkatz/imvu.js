import type { APIResource } from '@imvu/rest';

import type { Client } from './Client.js';
import { RemoteDocument } from '../resources/RemoteDocument.js';
import { Resource, type ResourceConstructor } from '../resources/Resource.js';

/**
 * Per-client canonical identity registry. Weak references preserve identity while
 * callers hold a document; a bounded strong LRU keeps recently used documents hot.
 */
export class DocumentStore {
	private readonly identities = new Map<string, WeakRef<RemoteDocument>>();
	private readonly strong = new Map<string, RemoteDocument>();
	private readonly finalizer = new FinalizationRegistry<{ key: string; reference: WeakRef<RemoteDocument> }>(
		({ key, reference }) => {
			if (this.identities.get(key) === reference) {
				this.identities.delete(key);
			}
		}
	);

	public constructor(
		private readonly client: Client,
		private readonly maximumStrongSize = 1_000
	) {}

	public get strongSize(): number {
		return this.strong.size;
	}

	public get<T extends RemoteDocument>(url: string, cls?: abstract new (...args: any[]) => T): T | undefined {
		const document = this.identities.get(url)?.deref();
		if (!document) {
			this.identities.delete(url);
			this.strong.delete(url);
			return undefined;
		}

		if (cls && !(document instanceof cls)) return undefined;

		this.touch(url, document);
		return document as T;
	}

	public remember<T extends RemoteDocument>(document: T): T {
		if (!document.url) return document;

		const existing = this.get<T>(document.url);
		if (existing) {
			if (existing.constructor !== document.constructor) {
				throw new TypeError(
					`Canonical URL '${document.url}' is already registered as ${existing.constructor.name}, not ${document.constructor.name}`
				);
			}
			return existing;
		}

		const reference = new WeakRef<RemoteDocument>(document);
		this.identities.set(document.url, reference);
		this.finalizer.register(document, { key: document.url, reference });
		this.touch(document.url, document);
		return document;
	}

	public upsertResource<T extends Resource>(cls: ResourceConstructor<T>, node: APIResource): T {
		const existing = this.get<T>(node.url, cls);
		if (existing) {
			existing._hydrate(node);
			return existing;
		}

		return this.remember(cls.build(this.client, node));
	}

	public clear(): void {
		this.identities.clear();
		this.strong.clear();
	}

	private touch(key: string, document: RemoteDocument): void {
		this.strong.delete(key);
		this.strong.set(key, document);

		while (this.strong.size > this.maximumStrongSize) {
			const oldest = this.strong.keys().next().value as string | undefined;
			if (oldest === undefined) break;
			this.strong.delete(oldest);
		}
	}
}
