import {BaseController, BaseQuery} from "@/controllers/BaseController";
import {Room} from "@/models/Room";
import {Client} from "@/client";

export interface RoomQuery extends BaseQuery {
  /**
   * Room IDs are of the format 'XXXXXXXXX-YYYY',
   * where X is the owner's ID and Y is the
   * room's sub-ID
   */
  id: string;
}

export class RoomController extends BaseController<Room, RoomQuery> {
  constructor(client: Client) {
    super(client, Room);
  }
}
