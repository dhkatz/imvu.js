import { Resource, Product, User } from '@imvu/client';
import { JsonProperty } from 'typescript-json-serializer';

@JsonProperty()
export class ProductSaleEvent extends Resource {
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
    return this.client.users.fetch(this.buyerId);
  }

  public async recipient(): Promise<User | null> {
    return this.client.users.fetch(this.recipientId);
  }

  public async product(): Promise<Product | null> {
    return this.client.products.fetch(this.productId);
  }
}
