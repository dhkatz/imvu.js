import { Resource } from './Resource.js';
import { User } from './User.js';
import { Chat } from './Chat.js';
import type { ChatSession, JoinOptions } from '../chat/ChatSession.js';

export class Room extends Resource<RoomRelations> {
	public name = '';
	public description = '';
	/** `'public'` or `'private'`. */
	public privacy = '';
	/** `listed`, `marriage`, `shared`, `shop_together`, `closed`, … */
	public type = '';
	public rating = 0;
	public capacity = 0;
	public occupancy = 0;
	public language = '';
	public ownerUsername = '';
	public contentRating = '';
	public isFriendsOnly = false;
	public isNonGuestOnly = false;
	public isAgeVerified = false;
	public isVip = false;
	public isAp = false;
	/** Live (audience) rooms use hangouts instead of a classic chat; {@link chat} returns null for them. */
	public supportsAudience = false;

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('name' in data) this.name = data.name;
		if ('description' in data) this.description = data.description;
		if ('privacy' in data) this.privacy = data.privacy;
		if ('type' in data) this.type = data.type;
		if ('rating' in data) this.rating = data.rating;
		if ('capacity' in data) this.capacity = data.capacity;
		if ('occupancy' in data) this.occupancy = data.occupancy;
		if ('language' in data) this.language = data.language ?? '';
		if ('owner_avatarname' in data) this.ownerUsername = data.owner_avatarname ?? '';
		if ('content_rating' in data) this.contentRating = String(data.content_rating ?? '');
		if ('is_friends_only' in data) this.isFriendsOnly = Boolean(data.is_friends_only);
		if ('is_non_guest_only' in data) this.isNonGuestOnly = Boolean(data.is_non_guest_only);
		if ('is_age_verified' in data) this.isAgeVerified = Boolean(data.is_age_verified);
		if ('is_vip' in data) this.isVip = Boolean(data.is_vip);
		if ('is_ap' in data) this.isAp = Boolean(data.is_ap);
		if ('supports_audience' in data) this.supportsAudience = Boolean(data.supports_audience);
	}

	public async moderators(): Promise<User[]> {
		return this.client.resources(`/room/room-${this.id}/moderators`, User);
	}

	/** The room's classic chat, or null for live (audience) rooms. */
	public async chat(): Promise<Chat | null> {
		return this.relationship('chat', Chat);
	}

	/** Join this room's chat. Shorthand for `(await room.chat()).join()`. */
	public async join(options?: JoinOptions): Promise<ChatSession> {
		const chat = await this.chat();
		if (!chat) throw new Error(`Room '${this.id}' has no classic chat to join (live rooms are not supported yet)`);
		return chat.join(options);
	}
}

export interface RoomRelations {
	owner: string;
	chat: string;
	moderators: string;
	scene: string;
}
