import { IMQManager, type IMQManagerOptions, type IMQStatus } from '@imvu/imq';

import type { Client } from './Client.js';
import { DocumentWatch } from './DocumentWatch.js';
import type { RemoteDocument } from '../resources/RemoteDocument.js';

export interface RealtimeMountLike {
	on(event: 'message', listener: (message: unknown) => void): unknown;
	off(event: 'message', listener: (message: unknown) => void): unknown;
	unsubscribe(): void;
}

export interface RealtimeManagerLike {
	on(event: 'status', listener: (status: IMQStatus) => void): unknown;
	on(event: 'error', listener: (error: Error) => void): unknown;
	connect(options?: { timeout?: number }): Promise<void>;
	close(): void;
	subscribeMessage(queueName: string, mountName: string): RealtimeMountLike;
}

export type RealtimeManagerFactory = (options: IMQManagerOptions) => RealtimeManagerLike;

interface Binding {
	mount: RealtimeMountLike;
	handler: (message: unknown) => void;
	watches: Set<DocumentWatch<RemoteDocument>>;
}

/** Bridges REST update targets to reference-counted IMQ invalidations. */
export class RealtimeCoordinator {
	private manager?: RealtimeManagerLike;
	private connecting?: Promise<RealtimeManagerLike>;
	private connectedOnce = false;
	private readonly bindings = new Map<string, Binding>();

	public constructor(
		private readonly client: Client,
		private readonly createManager: RealtimeManagerFactory = (options) => new IMQManager(options) as RealtimeManagerLike
	) {}

	public async watch<T extends RemoteDocument>(document: T): Promise<DocumentWatch<T>> {
		if (!document.updateTarget) {
			throw new Error(`The document '${document.url}' does not advertise realtime updates`);
		}

		const manager = await this.ensureManager();
		const { queue, mount } = document.updateTarget;
		const key = `${queue}\0${mount}`;
		let binding = this.bindings.get(key);

		if (!binding) {
			const messageMount = manager.subscribeMessage(queue, mount);
			const watches = new Set<DocumentWatch<RemoteDocument>>();
			const handler = (): void => {
				const documents = new Set([...watches].map((watch) => watch.document));
				for (const watchedDocument of documents) watchedDocument._invalidate();
				for (const watch of watches) watch._emitInvalidation();
			};

			messageMount.on('message', handler);
			binding = { mount: messageMount, handler, watches };
			this.bindings.set(key, binding);
		}

		let watch!: DocumentWatch<T>;
		watch = new DocumentWatch(document, () => this.release(key, watch));
		binding.watches.add(watch);
		return watch;
	}

	public close(): void {
		const watches = new Set([...this.bindings.values()].flatMap((binding) => [...binding.watches]));
		for (const watch of watches) watch.close();

		// Normally every binding is released by closing its last watch. Keep this
		// defensive cleanup for a custom manager/watch implementation.
		for (const binding of this.bindings.values()) {
			binding.mount.off('message', binding.handler);
			binding.mount.unsubscribe();
		}
		this.bindings.clear();
		this.manager?.close();
		this.manager = undefined;
		this.connecting = undefined;
		this.connectedOnce = false;
	}

	private release(key: string, watch: DocumentWatch<RemoteDocument>): void {
		const binding = this.bindings.get(key);
		if (!binding) return;

		binding.watches.delete(watch);
		if (binding.watches.size > 0) return;

		binding.mount.off('message', binding.handler);
		binding.mount.unsubscribe();
		this.bindings.delete(key);
	}

	private ensureManager(): Promise<RealtimeManagerLike> {
		if (this.manager) return Promise.resolve(this.manager);
		if (this.connecting) return this.connecting;

		this.connecting = this.connect().finally(() => {
			this.connecting = undefined;
		});
		return this.connecting;
	}

	private async connect(): Promise<RealtimeManagerLike> {
		const response = await this.client.request('/login/me');
		const login = response.denormalized[response.id];
		const url = login.relations?.imq;
		const sessionIdValue = (login.data as Record<string, unknown>).session_id;
		const sessionId =
			typeof sessionIdValue === 'string' || typeof sessionIdValue === 'number' ? String(sessionIdValue) : '';

		if (!url || !sessionId || !this.client.rest.cid) {
			throw new Error('The authenticated session does not expose IMQ connection details');
		}

		const manager = this.createManager({
			url,
			userId: this.client.rest.cid,
			sessionId,
			metadata: { app: 'imvu_next', platform_type: 'big' },
		});

		manager.on('status', (status) => {
			if (status !== 'connected') return;
			if (this.connectedOnce) this.invalidateAll();
			this.connectedOnce = true;
		});
		manager.on('error', (error) => this.client.emit('imqError', error));
		await manager.connect({ timeout: 15_000 });
		this.manager = manager;
		return manager;
	}

	private invalidateAll(): void {
		for (const binding of this.bindings.values()) {
			const documents = new Set([...binding.watches].map((watch) => watch.document));
			for (const document of documents) document._invalidate();
			for (const watch of binding.watches) watch._emitInvalidation();
		}
	}
}
