import { GetMatched } from '../models';
import { BaseController } from './BaseController';
import {Client} from "@/client";

export class GetMatchedController extends BaseController<GetMatched> {
  public constructor(client: Client) {
    super(client, GetMatched);
  }
}
