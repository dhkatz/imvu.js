import { BaseManager } from './BaseManager.js';
import { Room } from '../resources/index.js';
import { URLPaginator } from '../util/Paginator.js';

export class RoomManager extends BaseManager {
	public async *recent(): AsyncIterableIterator<Room> {
		yield* new URLPaginator(this.client, Room, `/user/user-${this.client.account.id}/recent_rooms`);
	}

	public async *favorites(): AsyncIterableIterator<Room> {
		yield* new URLPaginator(this.client, Room, `/user/user-${this.client.account.id}/favorite_rooms`);
	}

	public async *managed(): AsyncIterableIterator<Room> {
		yield* new URLPaginator(this.client, Room, `/user/user-${this.client.account.id}/managed_rooms`);
	}

	public async *owned(
		type: 'closed' | 'listed' | 'inventory' | 'shared' | 'marriage' = 'listed'
	): AsyncIterableIterator<Room> {
		yield* new URLPaginator(this.client, Room, `/user/user-${this.client.account.id}/my_rooms?type=${type}`);
	}
}
