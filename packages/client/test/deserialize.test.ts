import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Avatar, Client, Product, User } from '../src';

const loadFixture = (name: string) =>
	JSON.parse(readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8')) as {
		url: string;
		id: string;
		data: Record<string, unknown>;
		relations: Record<string, string>;
		updates: Record<string, unknown>;
	};

// Mirror the REST layer's _id back-fill from the resource URL.
const node = (fixture: ReturnType<typeof loadFixture>) => ({
	...fixture,
	data: { ...fixture.data, _id: fixture.id },
});

describe('Resource.build (offline, fixture-based)', () => {
	const client = new Client();

	it('builds a Product from a captured API payload', () => {
		const product = Product.build(client, node(loadFixture('product')));

		expect(product).toBeInstanceOf(Product);
		expect(product.id).toBe('51522827');
		expect(product.name).toBe("✖ 90'S Glasses. C");
		expect(product.creatorId).toBe(157473407);
		expect(product.price).toBe(609);
		expect(product.discountPrice).toBe(579);
		expect(product.isPurchasable).toBe(true);
		expect(product.gender).toBe('male');
		expect(product.types).toEqual(['avatar_attachment', 'clothing_product']);
		expect(product.relations).toEqual(loadFixture('product').relations);
	});

	it('builds a User, keeping the mixed-format date fields raw', () => {
		const user = User.build(client, node(loadFixture('user')));

		expect(user).toBeInstanceOf(User);
		expect(user.id).toBe('283489608');
		expect(user.username).toBe('TroII');
		expect(user.age).toBe(28);
		expect(user.state).toBeNull();
		expect(user.isAgeVerified).toBe(false); // relies on the is_ageverified mapping
		expect(user.created).toBe('2020-07-28T22:35:34Z'); // ISO string
		expect(user.registered).toBe(1595975734); // unix number
	});

	it('builds an Avatar, incl. the products array (renamed to _products)', () => {
		const avatar = Avatar.build(client, node(loadFixture('avatar')));

		expect(avatar).toBeInstanceOf(Avatar);
		expect(avatar.gender).toBe('male');
		expect(avatar._products.length).toBe(15);
		expect(avatar._products[0].product_id).toBe(53900678);
	});

	it('never leaves a field unset — an empty payload yields all defaults', () => {
		const product = Product.build(client, { data: {}, relations: null, updates: null });

		expect(product.name).toBe('');
		expect(product.price).toBe(-1);
		expect(product.categories).toEqual([]);
	});
});

describe('_patch (partial, in-place — the IMQ update path)', () => {
	const client = new Client();

	it('only touches fields present in the payload', () => {
		const product = Product.build(client, node(loadFixture('product')));

		product._patch({ product_price: 999 });

		expect(product.price).toBe(999); // updated
		expect(product.name).toBe("✖ 90'S Glasses. C"); // untouched
		expect(product.creatorId).toBe(157473407); // untouched
	});
});
