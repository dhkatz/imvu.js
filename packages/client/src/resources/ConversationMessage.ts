import { Resource } from './Resource.js';
import { User } from './User.js';
import type { FetchOptions } from '../client/Client.js';

export interface MessagePayload {
	/** `text`, `sticker`, `sticker_instance`, `gift`, `dollar_store_gift`, `html` or `moderation`. */
	type: string;
	content?: string;
	[field: string]: unknown;
}

/** One IM: `/message/message-<conversation>-<message>`. */
export class ConversationMessage extends Resource {
	public payloads: MessagePayload[] = [];
	/** When it was sent (ISO 8601). */
	public created = '';
	/** The sender's user URL. */
	public sentBy = '';

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('payloads' in data) this.payloads = data.payloads ?? [];
		if ('created' in data) this.created = data.created;
		if ('sent_by' in data) this.sentBy = data.sent_by ?? '';
	}

	/** The text of the message: its `text` payloads, joined. Empty for stickers, gifts and so on. */
	public get text(): string {
		return this.payloads
			.filter((payload) => payload.type === 'text' && typeof payload.content === 'string')
			.map((payload) => payload.content)
			.join('\n');
	}

	/** The sender's user id (cid). */
	public get senderId(): string {
		return /user-([^/?#]+)$/.exec(this.sentBy)?.[1] ?? '';
	}

	/** The id of the conversation this message belongs to. */
	public get conversationId(): string {
		return messageIds(this.url).conversationId;
	}

	/** Position within the conversation: later messages have higher numbers. */
	public get order(): number {
		return messageIds(this.url).order;
	}

	/** The sender, from the cache. */
	public get sender(): User | undefined {
		return this.client.users.resolve(this.senderId);
	}

	/** The sender, read from the API only if not cached. */
	public async fetchSender(options?: FetchOptions): Promise<User> {
		const user = await this.client.users.fetch(this.senderId, options);
		if (!user) throw new Error(`User ${this.senderId} was not found`);
		return user;
	}
}

/** `…/message-143108734037-203028777` → conversation `143108734037`, order `203028777`. */
export function messageIds(url: string): { conversationId: string; order: number } {
	const match = /message-(\d+)-(\d+)\/?(?:[?#].*)?$/.exec(url);
	return { conversationId: match?.[1] ?? '', order: match ? Number(match[2]) : 0 };
}
