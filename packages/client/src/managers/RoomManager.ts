import { BaseManager } from './BaseManager.js';
import { Room } from '../resources/index.js';
import type { Collection } from '../collections/Collection.js';

export class RoomManager extends BaseManager {
	public recent(): Collection<Room> {
		return this.client.collection(`/user/user-${this.client.account.id}/recent_rooms`, Room);
	}

	public favorites(): Collection<Room> {
		return this.client.collection(`/user/user-${this.client.account.id}/favorite_rooms`, Room);
	}

	public managed(): Collection<Room> {
		return this.client.collection(`/user/user-${this.client.account.id}/managed_rooms`, Room);
	}

	public owned(type: 'closed' | 'listed' | 'inventory' | 'shared' | 'marriage' = 'listed'): Collection<Room> {
		return this.client.collection(`/user/user-${this.client.account.id}/my_rooms?type=${type}`, Room);
	}
}
