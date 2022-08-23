import { Resource } from '../Resource';
import { Product } from './Product';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';
import { URLPaginator } from '../../util/Paginator';

@JsonObject()
export class Creator extends Resource {
  @JsonProperty()
  public id = '';

  @JsonProperty('creator_tier')
  public tier = 0;

  @JsonProperty()
  public isPro = false;

  @JsonProperty()
  public isActive = false;

  @JsonProperty()
  public isTopSeller = false;

  @JsonProperty()
  public isVeteran = false;

  public async *products(): AsyncIterableIterator<Product> {
    yield* new URLPaginator(
      this.client,
      this.client.products,
      `/creator/creator-${this.id}/products`
    );
  }

  public async *sales(): AsyncIterableIterator<Product> {
    this.authenticated();

    yield* new URLPaginator(
      this.client,
      this.client.products,
      `/creator/creator-${this.id}/product_sale_events`
    );
  }
}
