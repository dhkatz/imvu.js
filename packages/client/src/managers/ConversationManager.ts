import { BaseManager } from './BaseManager.js';
import { Conversation } from '../resources/Conversation.js';
import type { Collection } from '../collections/Collection.js';
import type { FetchOptions } from '../client/Client.js';
import { ConversationObserver, type ConversationObserveOptions } from '../chat/ConversationObserver.js';

/** The account's IMs (private and group conversations). */
export class ConversationManager extends BaseManager {
	/** The account's conversations, most recent first. Fresh on every read. */
	public list(): Collection<Conversation> {
		return this.client.collection(`/user/user-${this.client.account.id}/conversations`, Conversation);
	}

	public fetch(id: string, options?: FetchOptions): Promise<Conversation> {
		return this.client.resource(`/conversation/conversation-${id}`, Conversation, options);
	}

	/**
	 * Send a text IM. Pass a conversation to reply in it, or one or more user ids to
	 * message them. Messaging people who are not friends needs a verified email
	 * (`RATE-001` otherwise).
	 */
	public async send(to: Conversation | string | number | Array<string | number>, text: string): Promise<void> {
		if (to instanceof Conversation) return to.send(text);

		const users = (Array.isArray(to) ? to : [to]).map((id) => `https://api.imvu.com/user/user-${id}`);
		await this.client.request(`/user/user-${this.client.account.id}/conversations`, {
			method: 'POST',
			data: { participants: users, payloads: [{ type: 'text', content: text }] },
		});
	}

	/** Follow incoming IMs. See {@link ConversationObserver}. */
	public observe(options?: ConversationObserveOptions): Promise<ConversationObserver> {
		return ConversationObserver.start(this.client, this.list(), options);
	}
}
