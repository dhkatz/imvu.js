import { Product } from './Product.js';
import { Resource } from './Resource.js';
import { User } from './User.js';

export class ProductSaleEvent extends Resource<ProductSaleEventRelations> {
	public timestamp = ''; // ISO datetime on the wire (purchased_datetime)
	public incomeAvailableDatetime = ''; // ISO datetime
	public buyerId = '';
	public recipientId = '';
	public productId = '';
	public productName = '';
	public transactionId = '';

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('purchased_datetime' in data) this.timestamp = data.purchased_datetime;
		if ('income_available_datetime' in data) this.incomeAvailableDatetime = data.income_available_datetime;
		if ('buyer_id' in data) this.buyerId = String(data.buyer_id);
		if ('recipient_id' in data) this.recipientId = String(data.recipient_id);
		if ('product_id' in data) this.productId = String(data.product_id);
		if ('product_name' in data) this.productName = data.product_name;
		if ('transaction_id' in data) this.transactionId = String(data.transaction_id);
	}

	public async buyer(): Promise<User | null> {
		return this.relationship('buyer', User);
	}

	public async recipient(): Promise<User | null> {
		return this.relationship('recipient', User);
	}

	public async product(): Promise<Product | null> {
		return this.relationship('product', Product);
	}
}

export interface ProductSaleEventRelations {
	buyer: string;
	recipient: string;
	product: string;
}
