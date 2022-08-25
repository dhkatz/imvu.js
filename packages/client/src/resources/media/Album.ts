import { Resource } from '../Resource';
import { JsonObject, JsonProperty } from 'typescript-json-serializer';
import { User } from '@imvu/client';
import { URLPaginator } from '../../util/Paginator';
import { Photo } from './Photo';

@JsonObject()
export class Album extends Resource {
  @JsonProperty()
  public title = '';

  @JsonProperty()
  public visibility = 0;

  @JsonProperty()
  public description = '';

  public async owner(): Promise<User | null> {
    return this.relations ? this.client.users.fetch(this.relations.owner) : null;
  }

  public async *photos(): AsyncIterableIterator<Photo> {
    yield* new URLPaginator(this.client, Photo, `/album/album-${this.id}/photos`);
  }
}
