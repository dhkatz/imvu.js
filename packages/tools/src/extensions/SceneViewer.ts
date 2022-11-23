import { Client, Avatar, PartialProduct, Product } from '@imvu/client';

import { BaseExtension } from './BaseExtenstion';
import { JsonSerializer } from 'typescript-json-serializer';

export interface SceneViewerOptions {
	load?: boolean;
}

export interface SceneData {
	avatars: Map<number, PartialProduct[]>;
	furniture: number[];
}

export class SceneViewer extends BaseExtension {
	public static AVATAR_PATTERN = /avatar(\d+)=(?:(\d+)(?:(?:%3B)|;)?)+/gim;
	public static ROOM_PATTERN = /room=((\d+)(?:x\d)?(?:(?:%3B)|;)?)+/im;

	/**
	 * Parse a 'Products in Scene' URL and return a `Scene`
	 * Large scenes may need longer to retrieve all `Product` information
	 * @param {string} url A 'Products In Scene' URL
	 * @param {SceneViewerOptions} options The options for the parser
	 * @returns {Promise<Scene>} Returns a promise that resolves to the parsed `Scene`
	 */
	public async parse(url: string, options: SceneViewerOptions = {}): Promise<Scene> {
		const data = url.match(SceneViewer.AVATAR_PATTERN) || [];

		// The separator might be URL encoded or not
		const separator = url.includes('%3B') ? '%3B' : ';';

		const avatars = new Map(
			data.map((value: string) => {
				const split = value.split('=');
				const id = parseInt(split[0].replace('avatar', ''));
				const products: PartialProduct[] = split[1]
					.split(separator)
					.map((value) => parseInt(value, 10))
					.map((value) => ({
						id: `https://api.imvu.com/product/product-${value}`,
						product_id: value,
						owned: true,
						rating: '',
					}));

				return [id, products];
			})
		);

		const furniture = (SceneViewer.ROOM_PATTERN.exec(url) || [''])[0]
			.replace('room=', '')
			.replace(/x\d+/g, '')
			.split(separator)
			.map((value) => parseInt(value))
			.filter((p) => !isNaN(p));

		const scene = new Scene(this.client, { avatars, furniture });

		if (options.load !== false) {
			await scene.load();
		}

		return scene;
	}
}

export class Scene {
	public avatars: Avatar[] = [];

	public furniture: Product[] = [];

	protected serializer = new JsonSerializer({
		formatPropertyName: (name: string) => name.replace(/([A-Z])/g, '_$1').toLowerCase(),
	});

	public constructor(public client: Client, public data: SceneData) {}

	/**
	 * Load the `Avatar` and `Product` objects from the `Scene` data.
	 */
	public async load(): Promise<void> {
		const avatars = await Promise.all(
			[...this.data.avatars].map(async ([id, products]: [number, PartialProduct[]]) => {
				const user = await this.client.users.fetch(id);

				if (!user) {
					return null;
				}

				const avatar = new Avatar(this.client);

				const ids = products.map((p) => p.product_id);

				this.serializer.deserializeObject(
					{
						look_url: `https://api.imvu.com/look/${ids.join('%2C')}`,
						asset_url: '',
						legacy_message: `*putOnOutfit ${ids.join(' ')}`,
						products,
					},
					avatar
				);

				return avatar;
			})
		);

		this.avatars = avatars.filter((a) => a !== null) as Avatar[];

		const furniture = await Promise.all(
			this.data.furniture.map((value) => this.client.products.fetch(value))
		);

		this.furniture = furniture.filter((p) => p !== null) as Product[];
	}
}
