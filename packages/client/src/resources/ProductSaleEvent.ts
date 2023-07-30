import { Resource, Product, User } from '../resources';
import { JsonProperty } from 'typescript-json-serializer';

@JsonProperty()
export class ProductSaleEvent extends Resource<ProductSaleEventRelations> {
	@JsonProperty('purchased_datetime')
	public timestamp: Date = new Date();

	@JsonProperty()
	public incomeAvailableDatetime: Date = new Date();

	@JsonProperty()
	public buyerId = '';

	@JsonProperty()
	public recipientId = '';

	@JsonProperty()
	public productId = '';

	@JsonProperty()
	public productName = '';

	@JsonProperty()
	public transactionId = '';

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
