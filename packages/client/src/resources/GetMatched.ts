import { Resource } from './Resource.js';
import { User } from './User.js';

export class GetMatched extends Resource<GetMatchedRelations> {
	public username = '';
	public story = '';
	public progress: number[] = [];
	public status = '';
	public apProfile: '0' | '1' = '0';

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('avatarname' in data) this.username = data.avatarname;
		if ('story' in data) this.story = data.story;
		if ('progress' in data) this.progress = data.progress;
		if ('status' in data) this.status = data.status;
		if ('ap_profile' in data) this.apProfile = data.ap_profile;
	}

	public async user(): Promise<User | null> {
		return this.relationship('user', User);
	}
}

export interface GetMatchedRelations {
	user: string;
}
