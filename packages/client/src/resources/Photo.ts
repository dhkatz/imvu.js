import { Resource } from './Resource';
import { User } from './User';
import { Album } from './Album';

export class Photo extends Resource<PhotoRelations> {
	public title = '';
	public caption = '';
	public keywords = '';
	public shareable = true;
	public pid = -1;

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('title' in data) this.title = data.title;
		if ('caption' in data) this.caption = data.caption;
		if ('keywords' in data) this.keywords = data.keywords;
		if ('shareable' in data) this.shareable = data.shareable;
		if ('pid' in data) this.pid = data.pid;
	}

	public get id() {
		return `${this.pid}`;
	}

	public async owner(): Promise<User | null> {
		return this.relationship('owner', User);
	}

	public async album(): Promise<Album | null> {
		return this.relationship('album', Album);
	}
}

export interface PhotoRelations {
	owner: string;
	album: string;
}
