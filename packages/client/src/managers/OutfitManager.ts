import { BaseManager } from './BaseManager';

export class OutfitManager extends BaseManager {
	public get base(): string {
		return `/user/user-${this.account.id}/outfits`;
	}
}
