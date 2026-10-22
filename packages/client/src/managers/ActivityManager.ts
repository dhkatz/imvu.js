import { BaseManager } from '../managers/index.js';
import type { Collection } from '../collections/Collection.js';

type Activity = any;

/**
 * Manage a client's activity feed.
 */
export class ActivityManager extends BaseManager {
	public list(): Collection<Activity> {
		return this.client.collection<Activity>(`/user/user-${this.client.account.id}/activity`);
	}
}
