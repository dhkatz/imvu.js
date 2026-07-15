import { Resource } from './Resource';
import { User } from './User';

export class Room extends Resource {
	public name = '';
	public description = '';
	public privacy = '';
	public rating = 0;
	public capacity = 0;

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('name' in data) this.name = data.name;
		if ('description' in data) this.description = data.description;
		if ('privacy' in data) this.privacy = data.privacy;
		if ('rating' in data) this.rating = data.rating;
		if ('capacity' in data) this.capacity = data.capacity;
	}

	public async moderators(): Promise<User[]> {
		return this.client.resources(`/room/room-${this.id}/moderators`, User);
	}
}
