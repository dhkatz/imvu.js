import { Product } from '../models';
import { Controller, BaseQuery } from './BaseController';

export interface ProductQuery extends BaseQuery {
  id?: number | string | number[];
  creator?: string;
  start_index: number;
  limit: number;
  offset: number;
}

export const ProductController = Controller<Product, ProductQuery>(Product);

export type ProductController = InstanceType<typeof ProductController>;
