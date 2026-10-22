import { Client } from './Client.js';
import { Constructor } from 'type-fest';
import { APIResource } from '../types.js';
import { Resource, ResourceConstructor } from '../resources/index.js';

export class Utilities {
	public constructor(private client: Client) {}

	public async id<T extends Resource<any>>(resource: T | string | number, user = false): Promise<string> {
		if (typeof resource === 'string') {
			if (resource.includes('/')) {
				const segment = resource.split(/[/?#]/).filter(Boolean).at(-1) ?? '';
				const separator = segment.indexOf('-');
				return separator >= 0 ? segment.slice(separator + 1) : segment;
			}

			if (/^\d+(?:-\d+)*$/.test(resource)) return resource;

			if (user) {
				// Assume it's a username
				try {
					const found = await this.client.resource('/user', { params: { username: resource } });
					if (found.id) return found.id;
				} catch (error) {
					throw new Error(`No users found with the username "${resource}"!`, { cause: error });
				}

				throw new Error(`No users found with the username "${resource}"!`);
			}

			// IDs are deliberately opaque strings. Callers that mean a username use
			// the user-resolution path above.
			return resource;
		} else if (typeof resource === 'number') {
			return `${resource}`;
		} else {
			return `${resource.id}`;
		}
	}

	public deserialize<T extends Resource<any>>(cls: Constructor<T>, data: APIResource): T {
		return this.client.documents.upsertResource(cls as unknown as ResourceConstructor<T>, data);
	}
}
