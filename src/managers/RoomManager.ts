import { BaseManager } from './BaseManager';
import {Room} from "@/models";
import {URLPaginator} from "@/util/Paginator";

export class RoomManager extends BaseManager {
  public async * recent(): AsyncIterableIterator<Room> {
    yield * new URLPaginator(this.client, this.client.rooms, `/user/user-${this.client.user.id}/recent_rooms`);
  }

  public async * favorites(): AsyncIterableIterator<Room> {
    yield * new URLPaginator(this.client, this.client.rooms, `/user/user-${this.client.user.id}/favorite_rooms`);
  }

  public async * managed(): AsyncIterableIterator<Room> {
    yield * new URLPaginator(this.client, this.client.rooms, `/user/user-${this.client.user.id}/managed_rooms`);
  }
}
