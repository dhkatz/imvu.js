import { Product } from '../models';
import { BaseQuery, BaseController} from './BaseController';
import {Client} from "@/client";

export interface ProductQuery extends BaseQuery {
  id?: number | string | number[];
  creator?: string;
  start_index?: number;
  limit?: number;
  offset?: number;
}

export class ProductController extends BaseController<Product, ProductQuery> {
  public constructor(client: Client) {
    super(client, Product, { ttl: 60000 * 5 });
  }

}
