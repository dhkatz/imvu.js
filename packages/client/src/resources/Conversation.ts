import { Resource } from './Resource.js';
import { ConversationMessage } from './ConversationMessage.js';
import type { Collection } from '../collections/Collection.js';

/** IMVU's spam signal for a conversation member: how much the server trusts them. */
export type Trust = 'trusted' | 'untrusted' | 'high_risk';
const TRUST: Record<number, Trust> = { 0: 'trusted', 1: 'untrusted', 2: 'high_risk' };

export interface ConversationMember {
	userId: string;
	/** Their avatar name, as the conversation lists it. */
	name: string;
	trust: Trust;
}

/**
 * An IM conversation (`/conversation/conversation-<id>`): two people, or a group.
 * Reach one through `client.account.conversations`.
 */
export class Conversation extends Resource<ConversationRelations> {
	public members: ConversationMember[] = [];
	public unreadMessages = 0;
	/** The folder it is in, e.g. `inbox`. */
	public label = '';

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('participants' in data) {
			this.members = (data.participants ?? []).map((member: Record<string, any>) => ({
				userId: /user-([^/?#]+)$/.exec(String(member.user ?? ''))?.[1] ?? '',
				name: String(member.name ?? ''),
				trust: TRUST[Number(member.trust)] ?? 'untrusted',
			}));
		}
		if ('unread_messages' in data) this.unreadMessages = Number(data.unread_messages) || 0;
		if ('label' in data) this.label = data.label ?? '';
	}

	/** Everyone in the conversation except `userId` (normally yourself). */
	public others(userId: string | number): ConversationMember[] {
		return this.members.filter((member) => member.userId !== String(userId));
	}

	/** The messages, newest first. Fresh on every read. */
	public messages(): Collection<ConversationMessage> {
		return this.collectionRelationship('messages', ConversationMessage);
	}

	/** The latest message, from the cache (the conversation list embeds it). */
	public get lastMessage(): ConversationMessage | undefined {
		const url = this.relations.last_message;
		return url ? this.client.cached(url, ConversationMessage, Infinity) : undefined;
	}

	/** Send a text message to this conversation as the logged-in account. */
	public async send(text: string): Promise<void> {
		const url = this.relations.messages ?? `${this.url}/messages`;
		await this.client.request(url, { method: 'POST', data: { payloads: [{ type: 'text', content: text }] } });
	}
}

export interface ConversationRelations {
	messages: string;
	last_message: string;
	participants: string;
}
