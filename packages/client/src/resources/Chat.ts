import { Resource } from './Resource';

export class Chat extends Resource {
	public activity = '';
	public capacity = 0;

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('activity' in data) this.activity = data.activity;
		if ('capacity' in data) this.capacity = data.capacity;
	}
}
