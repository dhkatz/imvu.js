import { Resource } from './Resource.js';
import { ChatParticipant } from './ChatParticipant.js';
import { Room } from './Room.js';
import type { Collection } from '../collections/Collection.js';
import { ChatObserver, type ObserveOptions } from '../chat/ChatObserver.js';
import { ChatSession, type JoinOptions } from '../chat/ChatSession.js';

/** A classic room's chat (`/chat/chat-<a>-<b>`), reached from {@link Room.chat}. */
export class Chat extends Resource<ChatRelations> {
	public activity = '';
	public capacity = 0;
	/** IMQ queue that carries the chat lines, e.g. `/chat/1103542142`. */
	public imqQueue = '';
	/** Message mount on {@link imqQueue}, normally `messages`. */
	public imqMessagesMount = '';
	public lastUpdated = '';

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('activity' in data) this.activity = data.activity;
		if ('capacity' in data) this.capacity = data.capacity;
		if ('imq_queue' in data) this.imqQueue = data.imq_queue ?? '';
		if ('imq_messages_mount' in data) this.imqMessagesMount = data.imq_messages_mount ?? '';
		if ('last_updated' in data) this.lastUpdated = data.last_updated ?? '';
	}

	/** The `chatId` used inside chat payloads: the {@link imqQueue} suffix, not the REST id. */
	public get realtimeId(): string {
		return this.imqQueue.split('/').filter(Boolean).at(-1) ?? '';
	}

	public async room(): Promise<Room | null> {
		return this.relationship('room', Room);
	}

	/** Everyone currently in the chat. Fresh on every read; no need to join. */
	public participants(): Collection<ChatParticipant> {
		// Participant edges carry the data (seat, outfit, join time); `ref` is the user.
		return this.collectionRelationship('participants', ChatParticipant, { items: 'edge' });
	}

	/**
	 * Watch who joins, leaves and changes outfit or seat, without joining the room.
	 * Requires a logged-in client (IMQ).
	 */
	public observe(options?: ObserveOptions): Promise<ChatObserver> {
		return ChatObserver.start(this.client, this, options);
	}

	/** Join the chat as the logged-in account. Others in the room will see you. */
	public join(options?: JoinOptions): Promise<ChatSession> {
		return ChatSession.join(this.client, this, options);
	}
}

export interface ChatRelations {
	room: string;
	participants: string;
}
