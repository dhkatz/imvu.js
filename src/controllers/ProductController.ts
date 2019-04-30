import { Product } from '../models';
import { Controller, BaseQuery } from './BaseController';

export interface ProductQuery extends BaseQuery {
  id?: number | string | number[];
  creator?: string;
}

export const ProductController = Controller<Product, ProductQuery>(Product);
export type ProductController = InstanceType<typeof ProductController>;
