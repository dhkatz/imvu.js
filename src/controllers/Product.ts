import { Product } from '@/models';
import { Controller } from '.';

export interface ProductQueryParams {
  id?: number;
  creator?: string;
}

export const ProductController = Controller<Product, ProductQueryParams>(Product);
export type ProductController = InstanceType<typeof ProductController>;
