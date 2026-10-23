import { EventEmitter } from 'node:events';

import { IMVUAPIError } from '@imvu/rest';

import type { Client } from '../client/Client.js';
import type { RealtimeSubscription } from '../client/RealtimeCoordinator.js';
import { CollectionNotWatchableError, type Collection } from '../collections/Collection.js';
import type { Chat } from '../resources/Chat.js';
import { ChatParticipant, participantUserId } from '../resources/ChatParticipant.js';

export interface ObserveOptions {
	/**
	 * Re-read a participant whenever the server reports it updated, to detect outfit
	 * and seat changes. Default `true`. Every participant's 45 s keepalive also counts
	 * as an update, so turn this off to cut REST traffic to joins and leaves only.
	 */
	trackChanges?: boolean;
}

export type ParticipantChange = 'outfit' | 'seat';

export interface ParticipantLeave {
	userId: string;
	url: string;
	/** Their last known state (outfit, seat, join time). */
	participant: ChatParticipant;
}

export interface ChatObserverEvents {
	join: [participant: ChatParticipant];
	leave: [event: ParticipantLeave];
	update: [participant: ChatParticipant, changes: ParticipantChange[]];
	error: [error: Error];
}

interface Snapshot {
	look: string;
	seat: string;
}

/**
 * Live view of who is in a classic room's chat. Works without joining: it reads
 * `<chat>/participants` once, then follows the collection's IMQ invalidations
 * (`created` = join, `deleted` = leave, `updated` = outfit/seat/keepalive), and
 * resynchronizes from REST after IMQ reconnects. Events are delivered in order.
 */
export class ChatObserver extends EventEmitter<ChatObserverEvents> {
	readonly #members = new Map<string, ChatParticipant>();
	readonly #trackChanges: boolean;
	readonly #collection: Collection<ChatParticipant>;
	#queue: Promise<void> = Promise.resolve();
	#subscription?: RealtimeSubscription;
	#stopReconnect?: () => void;
	#closed = false;

	private constructor(
		private readonly client: Client,
		public readonly chat: Chat,
		options: ObserveOptions
	) {
		super();
		this.#trackChanges = options.trackChanges ?? true;
		this.#collection = chat.participants();
		Object.defineProperty(this, 'client', { enumerable: false });
	}

	/** @internal Use {@link Chat.observe}. */
	public static async start(client: Client, chat: Chat, options: ObserveOptions = {}): Promise<ChatObserver> {
		const observer = new ChatObserver(client, chat, options);
		await observer.open();
		return observer;
	}

	/** Everyone currently present. */
	public get participants(): ChatParticipant[] {
		return [...this.#members.values()];
	}

	public get closed(): boolean {
		return this.#closed;
	}

	public get(userId: string | number): ChatParticipant | undefined {
		return this.participants.find((participant) => participant.userId === String(userId));
	}

	public has(userId: string | number): boolean {
		return this.get(userId) !== undefined;
	}

	/** Resolves once all events received so far have been handled (useful in tests). */
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
		await this.sync(false);

		const target = this.#collection.updateTarget;
		if (!target) throw new CollectionNotWatchableError(this.#collection.url);

		this.#subscription = await this.client.realtime.listen(target.queue, target.mount, ({ message }) =>
			this.enqueue(() => this.onInvalidation(message))
		);
		this.#stopReconnect = this.client.realtime.onReconnect(() => this.enqueue(() => this.sync(true)));
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
		if (!event || !Array.isArray(event.objects)) return;

		for (const url of event.objects) {
			if (typeof url !== 'string' || !url.includes('/participants/')) continue;

			if (event.action === 'deleted') this.remove(url);
			else if (event.action === 'created' || !this.#members.has(url) || this.#trackChanges) await this.refresh(url);
		}
	}

	private async refresh(url: string): Promise<void> {
		const existing = this.#members.get(url);
		const before = existing && snapshot(existing);

		let participant: ChatParticipant;
		try {
			participant = await this.client.resource(url, ChatParticipant);
		} catch (error) {
			// The participant is gone by the time we read it (left right after an update).
			if (error instanceof IMVUAPIError) return this.remove(url);
			throw error;
		}
		if (this.#closed) return;

		this.#members.set(url, participant);
		if (!before) this.emit('join', participant);
		else this.emitChanges(participant, before);
	}

	private remove(url: string): void {
		const participant = this.#members.get(url);
		// Someone we never saw arrive (joined and left between reads) is not news.
		if (!participant) return;
		this.#members.delete(url);
		this.emit('leave', { userId: participantUserId(url), url, participant });
	}

	/** Re-read the whole list; with `emit`, report the differences as events. */
	private async sync(emit: boolean): Promise<void> {
		const before = new Map([...this.#members].map(([url, participant]) => [url, snapshot(participant)]));
		const present = new Map<string, ChatParticipant>();
		for await (const participant of this.#collection) present.set(participant.url, participant);
		if (this.#closed) return;

		for (const url of [...this.#members.keys()]) {
			if (!present.has(url)) {
				if (emit) this.remove(url);
				else this.#members.delete(url);
			}
		}
		for (const [url, participant] of present) {
			this.#members.set(url, participant);
			if (!emit) continue;
			const previous = before.get(url);
			if (!previous) this.emit('join', participant);
			else this.emitChanges(participant, previous);
		}
	}

	private emitChanges(participant: ChatParticipant, before: Snapshot): void {
		const after = snapshot(participant);
		const changes: ParticipantChange[] = [];
		if (after.look !== before.look) changes.push('outfit');
		if (after.seat !== before.seat) changes.push('seat');
		if (changes.length > 0) this.emit('update', participant, changes);
	}
}

function snapshot(participant: ChatParticipant): Snapshot {
	return { look: participant.lookUrl, seat: `${participant.seatNumber}:${participant.seatFurniId}` };
}

function safeParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
