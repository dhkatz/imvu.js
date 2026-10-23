import { Resource } from './Resource.js';
import { User } from './User.js';
import type { FetchOptions } from '../client/Client.js';

/**
 * Someone in a classic room's chat: `<chat>/participants/user-<cid>`. Readable by any
 * logged-in account without joining the room.
 */
export class ChatParticipant extends Resource<ChatParticipantRelations> {
	/** When they joined (ISO 8601). */
	public created = '';
	public lastUpdated = '';
	public seatNumber = 0;
	public seatFurniId = 0;
	/** `https://api.imvu.com/look/<pid>%2C<pid>…`: the outfit as product ids. See {@link productIds}. */
	public lookUrl = '';
	public lookImage = '';
	public lookThumbnail = '';
	public assetUrl = '';
	public outfitGender = '';
	public renderedImage = '';
	public nftProductIds: string[] = [];

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('created' in data) this.created = data.created;
		if ('last_updated' in data) this.lastUpdated = data.last_updated;
		if ('seat_number' in data) this.seatNumber = Number(data.seat_number) || 0;
		if ('seat_furni_id' in data) this.seatFurniId = Number(data.seat_furni_id) || 0;
		if ('look_url' in data) this.lookUrl = data.look_url ?? '';
		if ('look_image' in data) this.lookImage = data.look_image ?? '';
		if ('look_thumbnail' in data) this.lookThumbnail = data.look_thumbnail ?? '';
		if ('asset_url' in data) this.assetUrl = data.asset_url ?? '';
		if ('outfit_gender' in data) this.outfitGender = data.outfit_gender ?? '';
		if ('rendered_image' in data) this.renderedImage = data.rendered_image ?? '';
		if ('nft_product_ids' in data) this.nftProductIds = (data.nft_product_ids ?? []).map(String);
	}

	/** The participant's user id (cid), from the canonical URL. */
	public get userId(): string {
		return participantUserId(this.url);
	}

	/** The outfit's product ids, avatar body first, decoded from {@link lookUrl}. */
	public get productIds(): string[] {
		return productIdsFromLookUrl(this.lookUrl);
	}

	/**
	 * The participant's user, from the cache. Participant reads embed the full user, so
	 * this is normally set without any request. Use {@link fetchUser} when it is not.
	 */
	public get user(): User | undefined {
		const url = this.relations.ref ?? `/user/user-${this.userId}`;
		return this.client.cached(url, User, Infinity);
	}

	/** The participant's user, read from the API only if it is not cached. */
	public async fetchUser(options?: FetchOptions): Promise<User> {
		const user = await this.client.users.fetch(this.userId, options);
		if (!user) throw new Error(`User ${this.userId} was not found`);
		return user;
	}
}

export interface ChatParticipantRelations {
	ref: string;
}

/** `…/participants/user-123` → `'123'`. */
export function participantUserId(url: string): string {
	return /\/user-([^/?#]+)\/?(?:[?#].*)?$/.exec(url)?.[1] ?? '';
}

/** `https://api.imvu.com/look/1%2C2%2C3` → `['1', '2', '3']`. */
export function productIdsFromLookUrl(lookUrl: string): string[] {
	const segment = lookUrl.split(/[?#]/)[0].split('/').filter(Boolean).at(-1) ?? '';
	if (!segment || !lookUrl.includes('/look/')) return [];
	return decodeURIComponent(segment)
		.split(',')
		.filter((id) => /^\d+$/.test(id));
}
