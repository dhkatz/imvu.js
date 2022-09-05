import { Product, Resource } from '@imvu/client';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';
import { URLPaginator } from '../../util/Paginator';

@JsonObject()
export class Outfit extends Resource {
  @JsonProperty()
  public outfitName = '';

  @JsonProperty()
  public dirty = '0';

  @JsonProperty()
  public fullImage = '';

  @JsonProperty()
  public outfitImage = '';

  @JsonProperty()
  public rating = 'GA';

  @JsonProperty()
  public privacy = '0';

  @JsonProperty()
  public pids: number[] = [];

  public async *products(): AsyncIterableIterator<Product> {
    const products = this.relations?.products;

    if (!products) return;

    yield* new URLPaginator(this.client, this.client.products, products);
  }
}
