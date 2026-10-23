import { IMQManager, type IMQManagerOptions, type IMQStatus } from '@imvu/imq';

import type { Client } from './Client.js';
import { DocumentWatch } from './DocumentWatch.js';
import type { RemoteDocument } from '../resources/RemoteDocument.js';

/** A message delivered on a mount: the sender (from the IMQ envelope) and the decoded payload. */
export interface RealtimeMessage {
	userId: string;
	queueName: string;
	mountName: string;
	message: unknown;
}

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
	sendMessage(queueName: string, mountName: string, message: unknown, callback?: (errorMessage?: string) => void): void;
}

export type RealtimeManagerFactory = (options: IMQManagerOptions) => RealtimeManagerLike;

/** A raw mount subscription from {@link RealtimeCoordinator.listen}. */
export interface RealtimeSubscription {
	close(): void;
}

type MessageListener = (message: RealtimeMessage) => void;

interface Binding {
	mount: RealtimeMountLike;
	handler: (message: unknown) => void;
	watches: Set<DocumentWatch<RemoteDocument>>;
	listeners: Set<MessageListener>;
}

/** Bridges REST update targets to reference-counted IMQ invalidations and raw mount subscriptions. */
export class RealtimeCoordinator {
	private manager?: RealtimeManagerLike;
	private connecting?: Promise<RealtimeManagerLike>;
	private connectedOnce = false;
	private readonly bindings = new Map<string, Binding>();
	private readonly reconnectListeners = new Set<() => void>();

	public constructor(
		private readonly client: Client,
		private readonly createManager: RealtimeManagerFactory = (options) => new IMQManager(options) as RealtimeManagerLike
	) {}

	public async watch<T extends RemoteDocument>(document: T): Promise<DocumentWatch<T>> {
		if (!document.updateTarget) {
			throw new Error(`The document '${document.url}' does not advertise realtime updates`);
		}

		const { queue, mount } = document.updateTarget;
		const key = await this.bind(queue, mount);
		const binding = this.bindings.get(key)!;

		let watch!: DocumentWatch<T>;
		watch = new DocumentWatch(document, () => this.releaseWatch(key, watch));
		binding.watches.add(watch);
		return watch;
	}

	/**
	 * Subscribe to every message on a mount, sharing the IMQ subscription with any
	 * watches of the same target. Connects IMQ on first use.
	 */
	public async listen(queue: string, mount: string, listener: MessageListener): Promise<RealtimeSubscription> {
		const key = await this.bind(queue, mount);
		this.bindings.get(key)!.listeners.add(listener);

		let closed = false;
		return {
			close: () => {
				if (closed) return;
				closed = true;
				const binding = this.bindings.get(key);
				binding?.listeners.delete(listener);
				this.releaseIfUnused(key);
			},
		};
	}

	/** Send a message on a mount; resolves once the gateway acknowledges it. */
	public async send(queue: string, mount: string, message: unknown): Promise<void> {
		const manager = await this.ensureManager();
		await new Promise<void>((resolve, reject) => {
			manager.sendMessage(queue, mount, message, (errorMessage) => {
				if (errorMessage) reject(new Error(`IMQ rejected the message on ${queue}/${mount}: ${errorMessage}`));
				else resolve();
			});
		});
	}

	/**
	 * Run `listener` after each IMQ reconnect (not the first connect). Subscriptions
	 * are restored automatically, but anything delivered while disconnected was missed,
	 * so this is the cue to resynchronize from REST. Returns an unsubscribe function.
	 */
	public onReconnect(listener: () => void): () => void {
		this.reconnectListeners.add(listener);
		return () => this.reconnectListeners.delete(listener);
	}

	public close(): void {
		const watches = new Set([...this.bindings.values()].flatMap((binding) => [...binding.watches]));
		for (const watch of watches) watch.close();

		// Normally every binding is released by closing its last watch or listener. Keep
		// this defensive cleanup for raw listeners and custom manager/watch implementations.
		for (const binding of this.bindings.values()) {
			binding.mount.off('message', binding.handler);
			binding.mount.unsubscribe();
		}
		this.bindings.clear();
		this.reconnectListeners.clear();
		this.manager?.close();
		this.manager = undefined;
		this.connecting = undefined;
		this.connectedOnce = false;
	}

	private async bind(queue: string, mount: string): Promise<string> {
		const manager = await this.ensureManager();
		const key = `${queue}\0${mount}`;
		if (this.bindings.has(key)) return key;

		const messageMount = manager.subscribeMessage(queue, mount);
		const binding: Binding = {
			mount: messageMount,
			watches: new Set(),
			listeners: new Set(),
			handler: (raw) => {
				const documents = new Set([...binding.watches].map((watch) => watch.document));
				for (const watchedDocument of documents) watchedDocument._invalidate();
				for (const watch of binding.watches) watch._emitInvalidation();

				if (binding.listeners.size === 0) return;
				const message = toRealtimeMessage(raw, queue, mount);
				for (const listener of binding.listeners) listener(message);
			},
		};

		messageMount.on('message', binding.handler);
		this.bindings.set(key, binding);
		return key;
	}

	private releaseWatch(key: string, watch: DocumentWatch<RemoteDocument>): void {
		this.bindings.get(key)?.watches.delete(watch);
		this.releaseIfUnused(key);
	}

	private releaseIfUnused(key: string): void {
		const binding = this.bindings.get(key);
		if (!binding || binding.watches.size > 0 || binding.listeners.size > 0) return;

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
			if (this.connectedOnce) {
				this.invalidateAll();
				for (const listener of this.reconnectListeners) listener();
			}
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

function toRealtimeMessage(raw: unknown, queueName: string, mountName: string): RealtimeMessage {
	const isEnvelope = typeof raw === 'object' && raw !== null && 'message' in raw;
	const event = (isEnvelope ? raw : {}) as Partial<RealtimeMessage>;
	return {
		userId: String(event.userId ?? ''),
		queueName: event.queueName ?? queueName,
		mountName: event.mountName ?? mountName,
		message: isEnvelope ? event.message : raw,
	};
}
