import { BaseManager, Product, User } from '../';

export class GiftsManager extends BaseManager {
	public async gift(
		user: User | string | number,
		product: Product | string | number,
		message = ''
	): Promise<boolean> {
		const id = await this.client.utils.id(user, true);
		const productId = await this.client.utils.id(product, true);

		try {
			await this.client.http.post(`/user/user-${this.client.account.id}/gifts`, {
				id: `https://api.imvu.com/user/user-${id}`,
				product_id: `https://api.imvu.com/product/product-${productId}`,
				is_thank_you: false,
				txn_id: `gift-${this.client.account.id}-${id}-${Math.floor(Date.now() / 1000)}`,
				type: 1,
				message,
			});
		} catch (error) {
			console.error(error);
			return false;
		}

		return true;
	}
}
