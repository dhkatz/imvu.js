import { BaseManager } from '../managers';
import { URLPaginator } from '../util/Paginator';

type Activity = any;

/**
 * Manage a client's activity feed.
 */
export class ActivityManager extends BaseManager {
	public async *list(): AsyncIterableIterator<Activity> {
		yield* new URLPaginator(this.client, null!, `/user/user-${this.client.account.id}/activity`);
	}
}
