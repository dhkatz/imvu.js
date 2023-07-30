import { Client } from '../client';
import { AccountManager } from './AccountManager';

export class BaseManager {
	public constructor(protected client: Client) {}

	protected get account(): AccountManager {
		return this.client.account;
	}

	protected authenticated(): boolean {
		if (!this.client.authenticated) {
			throw new Error('Cannot retrieve data without user authentication!');
		}

		return true;
	}
}
