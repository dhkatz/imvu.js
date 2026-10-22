import imageType from 'image-type';
import JSZip from 'jszip';

import { Product } from '@imvu/client';

import { BaseExtension } from './BaseExtenstion.js';

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

		const files = await this.downloadJSON<ProductManifest['files']>(`/${pid}/${i}/_contents.json`);

		return {
			id: parseInt(`${pid}`),
			revision: i,
			files,
		};
	}

	private async download(path: string): Promise<Buffer> {
		const response = await this.fetchProductData(path);
		return Buffer.from(await response.arrayBuffer());
	}

	private async downloadJSON<T>(path: string): Promise<T> {
		return (await this.fetchProductData(path)).json() as Promise<T>;
	}

	private async fetchProductData(path: string): Promise<Response> {
		const response = await this.client.rest.fetch(path, { baseURL: 'https://userimages-akm.imvu.com/productdata' });
		if (!response.ok) {
			throw new Error(`Failed to download product data '${path}' (HTTP ${response.status})`);
		}
		return response;
	}
}
