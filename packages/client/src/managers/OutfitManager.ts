import { BaseManager } from '@imvu/client';
import { URLPaginator } from '../util/Paginator';

export class OutfitManager extends BaseManager {
	public get base(): string {
		return `/user/user-${this.account.id}/outfits`;
	}

	public async *list(): Promise<any> {
		return yield* new URLPaginator(this.client);
	}
}
