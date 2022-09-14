import { BaseManager } from './BaseManager';
import { Room } from '../resources';
import { URLPaginator } from '../util/Paginator';

export class RoomManager extends BaseManager {
	public async *recent(): AsyncIterableIterator<Room> {
		yield* new URLPaginator(this.client, Room, `/user/user-${this.client.account.id}/recent_rooms`);
	}

	public async *favorites(): AsyncIterableIterator<Room> {
		yield* new URLPaginator(
			this.client,
			Room,
			`/user/user-${this.client.account.id}/favorite_rooms`
		);
	}

	public async *managed(): AsyncIterableIterator<Room> {
		yield* new URLPaginator(
			this.client,
			Room,
			`/user/user-${this.client.account.id}/managed_rooms`
		);
	}

	public async *owned(
		type: 'closed' | 'listed' | 'inventory' | 'shared' | 'marriage'
	): AsyncIterableIterator<Room> {
		yield* new URLPaginator(
			this.client,
			Room,
			`/user/user-${this.client.account.id}/my_rooms?type=${type}`
		);
	}
}
