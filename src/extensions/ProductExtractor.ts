import { Product } from '@/models';
import { BaseExtension } from './BaseExtenstion';

export class ProductExtractor extends BaseExtension {
  public async parse(product: number | Product): Promise<void> {

  }
}
