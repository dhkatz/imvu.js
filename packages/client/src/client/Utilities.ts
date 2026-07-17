import { Client } from './Client.js';
import { Constructor } from 'type-fest';
import { APIResource } from '../types.js';
import { Resource, ResourceConstructor } from '../resources/index.js';

export class Utilities {
	public constructor(private client: Client) {}

	public async id<T extends Resource<any>>(resource: T | string | number, user = false): Promise<string> {
		if (typeof resource === 'string') {
			const match = resource.match(/\d+(-\d+)?$/);

			if (match) {
				return match[0];
			}

			if (user) {
				// Assume it's a username
				try {
					const { data } = await this.client.resource('/user', { params: { username: user } });

					const id = data.id?.match(/\d+(-\d+)?$/);

					if (id) {
						return id[0];
					}
				} catch (error) {
					throw new Error(`No users found with the username "${resource}"!`, { cause: error });
				}

				throw new Error(`No users found with the username "${resource}"!`);
			}

			throw new Error(`Could not parse "${resource}" as an ID!`);
		} else if (typeof resource === 'number') {
			return `${resource}`;
		} else {
			return `${resource.id}`;
		}
	}

	public deserialize<T extends Resource<any>>(cls: Constructor<T>, data: APIResource<T>): T {
		// Every resource class inherits the `build` factory from Resource; delegate to
		// it. The cast bridges the plain `Constructor<T>` call sites use to the richer
		// `ResourceConstructor<T>` `build` needs.
		return (cls as unknown as ResourceConstructor<T>).build(this.client, data);
	}
}
