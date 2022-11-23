import { Client } from '@imvu/client';

export abstract class BaseExtension {
	public constructor(public client: Client) {}
}
