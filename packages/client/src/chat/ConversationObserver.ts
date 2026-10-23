import { EventEmitter } from 'node:events';

import type { Client } from '../client/Client.js';
import type { RealtimeSubscription } from '../client/RealtimeCoordinator.js';
import { CollectionNotWatchableError, type Collection } from '../collections/Collection.js';
import { Conversation } from '../resources/Conversation.js';
import type { ConversationMessage } from '../resources/ConversationMessage.js';

export interface ConversationObserveOptions {
	/** Also report messages the logged-in account sent. Default `false`. */
	includeOwn?: boolean;
	/** How many recent conversations to read at start (to know what is already seen). Default 50. */
	initialConversations?: number;
}

export interface ConversationObserverEvents {
	/** A new message, in order within its conversation. */
	message: [message: ConversationMessage, conversation: Conversation];
	error: [error: Error];
}

/** Recent messages read per notification; more than this between two notifications is unusual. */
const PAGE = 20;

/**
 * Follows the account's IMs. It listens to the conversation list's IMQ updates, reads
 * the new messages of each conversation that changed, and emits them in order. History
 * is never replayed: at start it notes the latest message of the recent conversations,
 * and for a conversation it has not seen, only messages sent after it started count.
 * After an IMQ reconnect it re-checks the recent conversations, so nothing is missed.
 */
export class ConversationObserver extends EventEmitter<ConversationObserverEvents> {
	readonly #lastSeen = new Map<string, number>();
	readonly #options: Required<ConversationObserveOptions>;
	readonly #startedAt = Date.now();
	#queue: Promise<void> = Promise.resolve();
	#subscription?: RealtimeSubscription;
	#stopReconnect?: () => void;
	#closed = false;

	private constructor(
		private readonly client: Client,
		private readonly list: Collection<Conversation>,
		options: ConversationObserveOptions
	) {
		super();
		this.#options = {
			includeOwn: options.includeOwn ?? false,
			initialConversations: options.initialConversations ?? 50,
		};
		Object.defineProperty(this, 'client', { enumerable: false });
	}

	/** @internal Use `client.account.conversations.observe()`. */
	public static async start(
		client: Client,
		list: Collection<Conversation>,
		options: ConversationObserveOptions = {}
	): Promise<ConversationObserver> {
		const observer = new ConversationObserver(client, list, options);
		await observer.open();
		return observer;
	}

	public get closed(): boolean {
		return this.#closed;
	}

	/** Resolves once everything received so far has been handled (useful in tests). */
	public idle(): Promise<void> {
		return this.#queue;
	}

	public close(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#subscription?.close();
		this.#stopReconnect?.();
		this.removeAllListeners();
	}

	private async open(): Promise<void> {
		for (const conversation of await this.list.page({ limit: this.#options.initialConversations })) {
			this.#lastSeen.set(conversation.id, conversation.lastMessage?.order ?? 0);
		}

		const target = this.list.updateTarget;
		if (!target) throw new CollectionNotWatchableError(this.list.url);
		this.#subscription = await this.client.realtime.listen(target.queue, target.mount, ({ message }) =>
			this.enqueue(() => this.onInvalidation(message))
		);
		this.#stopReconnect = this.client.realtime.onReconnect(() => this.enqueue(() => this.recheck()));
	}

	private enqueue(task: () => Promise<void>): void {
		this.#queue = this.#queue.then(async () => {
			if (this.#closed) return;
			try {
				await task();
			} catch (error) {
				if (this.listenerCount('error') > 0) this.emit('error', error as Error);
			}
		});
	}

	private async onInvalidation(raw: unknown): Promise<void> {
		const event = (typeof raw === 'string' ? safeParse(raw) : raw) as { action?: string; objects?: unknown } | null;
		if (!event || event.action === 'deleted' || !Array.isArray(event.objects)) return;

		// One message produces several notifications for the same conversation; check each once.
		const ids = new Set<string>();
		for (const url of event.objects) {
			const id = /conversation-([^/?#]+)/.exec(String(url))?.[1];
			if (id) ids.add(id);
		}
		for (const id of ids) await this.check(id);
	}

	/** After a reconnect: re-read the recent conversations and check any with newer messages. */
	private async recheck(): Promise<void> {
		for (const conversation of await this.list.page({ limit: this.#options.initialConversations })) {
			const latest = conversation.lastMessage?.order ?? 0;
			if (latest > (this.#lastSeen.get(conversation.id) ?? 0)) await this.check(conversation.id);
		}
	}

	private async check(conversationId: string): Promise<void> {
		const conversation = await this.client.resource(`/conversation/conversation-${conversationId}`, Conversation, {
			force: true,
		});
		const seen = this.#lastSeen.get(conversationId);
		const recent = await conversation.messages().page({ limit: PAGE });

		const fresh = recent
			.filter((message) =>
				seen === undefined ? Date.parse(message.created) >= this.#startedAt - 60_000 : message.order > seen
			)
			.sort((a, b) => a.order - b.order);
		if (recent.length > 0) {
			this.#lastSeen.set(conversationId, Math.max(seen ?? 0, ...recent.map((message) => message.order)));
		}

		const self = String(this.client.rest.cid);
		for (const message of fresh) {
			if (this.#closed) return;
			if (!this.#options.includeOwn && message.senderId === self) continue;
			this.emit('message', message, conversation);
		}
	}
}

function safeParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
