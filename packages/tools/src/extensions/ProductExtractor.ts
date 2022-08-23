import type { ResponseType } from 'axios';
import imageType from 'image-type';
import JSZip from 'jszip';

import { Product } from '@imvu/client';

import { BaseExtension } from './BaseExtenstion';

export type ProductManifest = {
  id: number;
  revision: number;
  files: Array<{
    name: string;
    url?: string;
    original_dimensions?: string;
    tags?: string[];
  }>;
};

export class ProductExtractor extends BaseExtension {
  public async parse(product: number | Product): Promise<Buffer> {
    const { revision, files, id } = await this.manifest(product);

    const zip = new JSZip();

    for (const file of files) {
      const url = file.url ?? file.name;
      const buffer = await this.download(`${id}/${revision}/${url}`);
      const type = await imageType(buffer);

      if (!type) {
        zip.file(file.name, buffer);
      } else {
        if (!file.name.endsWith(type.ext)) {
          file.name += `.${type.ext}`;
        }

        zip.file(file.name, buffer);
      }
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  private async manifest(product: number | Product): Promise<ProductManifest> {
    const pid = typeof product === 'number' ? product : product.id;

    let i: number;

    for (i = 1; i < 10; i++) {
      try {
        const response = await this.download(`/${pid}/${i}`);

        if (response.length === 0) {
          i--;
          break;
        }
      } catch {
        i--;
        break;
      }
    }

    if (i === 10) {
      throw new Error('Failed to download product after 10 attempts');
    }

    const files = await this.download<ProductManifest['files']>(
      `/${pid}/${i}/_contents.json`,
      'json'
    );

    return {
      id: pid,
      revision: i,
      files,
    };
  }

  private async download<T = Buffer>(
    url: string,
    responseType: ResponseType = 'arraybuffer'
  ): Promise<T> {
    const response = await this.client.http.get(url, {
      baseURL: 'https://userimages-akm.imvu.com/productdata',
      responseType,
    });

    return response.data;
  }
}
