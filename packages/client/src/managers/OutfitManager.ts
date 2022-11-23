import { BaseManager } from '@imvu/client';

export class OutfitManager extends BaseManager {
	public get base(): string {
		return `/user/user-${this.account.id}/outfits`;
	}
}
