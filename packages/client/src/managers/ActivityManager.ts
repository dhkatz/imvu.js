import { BaseManager } from '../managers/index.js';
import { URLPaginator } from '../util/Paginator.js';

type Activity = any;

/**
 * Manage a client's activity feed.
 */
export class ActivityManager extends BaseManager {
	public async *list(): AsyncIterableIterator<Activity> {
		yield* new URLPaginator(this.client, null!, `/user/user-${this.client.account.id}/activity`);
	}
}
