import { Resource } from './Resource';

export class Login extends Resource {
	public user: { id: string } = { id: '' };
	public sauce = '';
	public sessionId = '';
	public source = '';

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('user' in data) this.user = data.user;
		if ('sauce' in data) this.sauce = data.sauce;
		if ('session_id' in data) this.sessionId = data.session_id;
		if ('source' in data) this.source = data.source;
	}
}
