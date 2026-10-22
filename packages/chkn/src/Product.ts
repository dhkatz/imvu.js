import { Material, Mesh, Skeleton } from '@imvu/cal3d';

import { CflArchive } from './Cfl.js';
import { ChknError } from './errors.js';
import { ProductDefinition, type MaterialSpec, type MeshSpec } from './ProductDefinition.js';
import type { ProductSource } from './ProductSource.js';
import {
	createDict,
	expandTemplate,
	findImports,
	parseTemplate,
	productIdFromUrl,
	type TemplateDict,
	type TemplateValue,
	writeTemplate,
} from './template.js';
import { writeZip } from './zip.js';

/** An entry of a product's `_contents.json`. */
export interface ManifestEntry {
	readonly name: string;
	/** The file's name on the CDN (`<md5>.<ext>`), relative to the CFL URL. */
	readonly url?: string;
	/** e.g. `['original', 'thumbnail']` for textures. */
	readonly tags?: readonly string[];
	/** `"width,height"` of an original texture. */
	readonly original_dimensions?: string;
}

export interface LoadProductOptions {
	/** Products already loaded, shared across loads (parents are often shared). */
	readonly cache?: Map<number, Promise<Product>>;
}

/** One body part's assembled Cal3D data. */
export interface ModelPart {
	readonly id: number;
	readonly meshSpec: MeshSpec;
	/** `null` when the mesh file is missing from the whole product chain. */
	readonly mesh: Mesh | null;
	/** Material slots by index — the `materialId` of the mesh's submeshes. */
	readonly materials: Map<number, { readonly spec: MaterialSpec; readonly material: Material | null }>;
}

export interface ChknOptions {
	/** Roll the whole ancestor chain into one self-contained CHKN (see `Product.flattenedFiles`). */
	readonly flatten?: boolean;
}

export interface ProductModel {
	readonly skeleton: Skeleton | null;
	readonly parts: ModelPart[];
}

/**
 * An IMVU product with its whole inheritance chain loaded: its CFL archive, its
 * `_contents.json` manifest, its own template, its parent product, and the
 * expanded {@link ProductDefinition}.
 *
 * ```ts
 * const source = new CdnProductSource({ revisions: { 53938393: 1, 512: 11 } });
 * const product = await Product.load(53938393, source);
 * product.definition.meshes; // Map { 0 => { asset: 'Room.MESH.xmf', … } }
 * const { skeleton, parts } = await product.loadModel();
 * ```
 */
export class Product {
	readonly #source: ProductSource;

	/** @internal Use {@link Product.load}. */
	public constructor(
		public readonly id: number,
		/** The CFL's URL. */
		public readonly url: string,
		public readonly archive: CflArchive,
		/** `_contents.json` entries by file name. */
		public readonly manifest: ReadonlyMap<string, ManifestEntry>,
		/** This product's own template, before inheritance (deletion markers included). */
		public readonly template: TemplateDict,
		/** The product it derives from (its first `__DATAIMPORT`), if any. */
		public readonly parent: Product | null,
		/** The expanded template. */
		public readonly definition: ProductDefinition,
		source: ProductSource
	) {
		this.#source = source;
	}

	/** Load a product and, recursively, every product it imports. */
	public static async load(
		productId: number,
		source: ProductSource,
		options: LoadProductOptions = {}
	): Promise<Product> {
		return loadProduct(productId, source, options.cache ?? new Map(), new Set());
	}

	/** Parents, nearest first. */
	public get ancestors(): Product[] {
		const chain: Product[] = [];
		for (let product = this.parent; product; product = product.parent) chain.push(product);
		return chain;
	}

	/** Names of the files this product itself carries: CFL entries and `_contents.json` names. */
	public get ownAssetNames(): Set<string> {
		return new Set([...this.archive.names, ...this.manifest.keys()]);
	}

	/** Names of every file reachable through the chain. */
	public get assetNames(): Set<string> {
		const names = new Set<string>();
		for (const product of [this, ...this.ancestors]) for (const name of product.ownAssetNames) names.add(name);
		return names;
	}

	/** The nearest product in the chain that carries `name` (what the client calls its data source). */
	public ownerOf(name: string): Product | undefined {
		for (const product of [this, ...this.ancestors]) {
			if (product.archive.has(name) || product.manifest.has(name)) return product;
		}
		return undefined;
	}

	/** A file from the CFL archives of the chain, nearest first (no network). */
	public getFile(name: string): Uint8Array | undefined {
		for (const product of [this, ...this.ancestors]) {
			const data = product.archive.get(name);
			if (data) return data;
		}
		return undefined;
	}

	/** The CDN URL of a file listed in the chain's manifests. */
	public getAssetUrl(name: string): string | undefined {
		const owner = this.ownerOf(name);
		if (!owner?.manifest.has(name)) return undefined;
		const reference = owner.manifest.get(name)!.url ?? name;
		return `${owner.url}/${encodeURIComponent(reference).replace(/%2F/gi, '/')}`;
	}

	/**
	 * A file's contents. Textures come from the CDN: the copies inside CFLs are tiny
	 * placeholders (16×16 PNGs), and the manifest tags the full-size file `original`.
	 * Everything else comes from the CFL, falling back to the CDN.
	 */
	public async fetchAsset(name: string): Promise<Uint8Array> {
		const owner = this.ownerOf(name);
		if (!owner) throw new ChknError(`Product ${this.id} has no asset ${JSON.stringify(name)}`);
		const entry = owner.manifest.get(name);
		const preferCdn = entry?.tags?.includes('original') ?? false;
		if (!preferCdn) {
			const data = owner.archive.get(name) ?? this.getFile(name);
			if (data) return data;
		}
		const url = this.getAssetUrl(name);
		if (!url) throw new ChknError(`Product ${this.id}: ${JSON.stringify(name)} is in no CFL and has no CDN URL`);
		return this.#source.fetchUrl(url);
	}

	/** Parse the product's skeleton, if it has one. */
	public loadSkeleton(): Skeleton | null {
		const asset = this.definition.skeletonAsset;
		const data = asset ? this.getFile(asset) : undefined;
		return data ? Skeleton.parse(data) : null;
	}

	/**
	 * Parse the product's Cal3D data: its skeleton and, per body part, the mesh and the
	 * materials its submeshes refer to. Textures are not downloaded — each material's
	 * maps name them; fetch them with {@link fetchAsset}.
	 */
	public loadModel(): ProductModel {
		const parse = <T>(asset: string | undefined, parser: (data: Uint8Array) => T): T | null => {
			const data = asset ? this.getFile(asset) : undefined;
			return data ? parser(data) : null;
		};
		const parts = [...this.definition.meshes.values()].map(
			(meshSpec): ModelPart => ({
				id: meshSpec.index,
				meshSpec,
				mesh: parse(meshSpec.asset, (data) => Mesh.parse(data)),
				materials: new Map(
					[...this.definition.materialsFor(meshSpec.index)].map(([index, spec]) => [
						index,
						{ spec, material: parse(spec.asset, (data) => Material.parse(data)) },
					])
				),
			})
		);
		return { skeleton: this.loadSkeleton(), parts };
	}

	/**
	 * Package the product as a `.chkn` (a ZIP that IMVU's create mode opens), with
	 * textures replaced by their full-size CDN originals.
	 *
	 * By default it holds the product's own CFL entries, so its `index.xml` still
	 * imports the parent. With `flatten: true` it is self-contained: see
	 * {@link flattenedFiles}.
	 */
	public async toChkn({ flatten = false }: ChknOptions = {}): Promise<Uint8Array> {
		if (flatten) return writeZip(await this.flattenedFiles());
		const files: [string, Uint8Array][] = [];
		for (const name of this.archive.names) {
			const original = this.manifest.get(name)?.tags?.includes('original');
			files.push([name, original ? await this.fetchAsset(name) : this.archive.get(name)!]);
		}
		return writeZip(files);
	}

	/**
	 * The whole ancestor chain rolled up into one standalone product:
	 *
	 * - `index.xml` is the expanded template (every inherited setting written out,
	 *   no `__DATAIMPORT`);
	 * - every file reachable through the chain, the nearest product's copy winning when
	 *   names collide (the same lookup the client does), textures at full size;
	 * - no `_contents.json`: its entries point at each product's own CDN folder, which
	 *   means nothing once the files sit side by side.
	 */
	public async flattenedFiles(): Promise<Map<string, Uint8Array>> {
		const owners = new Map<string, Product>();
		for (const product of [this, ...this.ancestors]) {
			for (const name of product.ownAssetNames) {
				if (name !== 'index.xml' && name !== '_contents.json' && !owners.has(name)) owners.set(name, product);
			}
		}

		const files = new Map<string, Uint8Array>([
			['index.xml', new TextEncoder().encode(writeTemplate({ Template: this.definition.template } as TemplateDict))],
		]);
		const contents = await Promise.all([...owners].map(([name, owner]) => owner.fetchAsset(name)));
		[...owners.keys()].forEach((name, i) => files.set(name, contents[i]!));
		return files;
	}
}

async function loadProduct(
	productId: number,
	source: ProductSource,
	cache: Map<number, Promise<Product>>,
	seen: ReadonlySet<number>
): Promise<Product> {
	if (seen.has(productId)) throw new ChknError(`Product ${productId} derives from itself (${[...seen].join(' → ')})`);
	const cached = cache.get(productId);
	if (cached) return cached;

	const pending = (async () => {
		const { bytes, url } = await source.fetchCfl(productId);
		const archive = CflArchive.parse(bytes);
		const indexXml = archive.text('index.xml');
		if (indexXml === undefined) throw new ChknError(`Product ${productId} has no index.xml`);

		const template = parseTemplate(indexXml);
		fixEmptyKey(template, 'BodyPatternDef');

		const chain = new Set(seen).add(productId);
		const imports = new Map<string, TemplateDict | null>();
		let parent: Product | null = null;
		for (const importUrl of findImports(template)) {
			if (imports.has(importUrl)) continue;
			const parentId = productIdFromUrl(importUrl);
			if (parentId === null)
				throw new ChknError(`Product ${productId} imports an unknown URL ${JSON.stringify(importUrl)}`);
			const imported = await loadProduct(parentId, source, cache, chain);
			parent ??= imported;
			imports.set(importUrl, { Template: imported.definition.template } as TemplateDict);
		}

		const expanded = expandTemplate(template, imports);
		const body = expanded.Template;
		const definition = typeof body === 'object' && body !== null ? body : createDict();
		removeEmptyActions(definition);

		return new Product(
			productId,
			url,
			archive,
			readManifest(archive),
			template,
			parent,
			new ProductDefinition(definition),
			source
		);
	})();

	cache.set(productId, pending);
	try {
		return await pending;
	} catch (error) {
		cache.delete(productId);
		throw error;
	}
}

function readManifest(archive: CflArchive): Map<string, ManifestEntry> {
	const text = archive.text('_contents.json');
	if (text === undefined) return new Map();
	try {
		const entries = JSON.parse(text) as unknown;
		if (!Array.isArray(entries)) return new Map();
		return new Map(
			entries
				.filter((entry): entry is ManifestEntry => typeof entry?.name === 'string')
				.map((entry) => [entry.name, entry])
		);
	} catch {
		return new Map(); // the client logs and carries on, too
	}
}

/** The client's `fixDictionaryKeys`: an empty `<BodyPatternDef/>` still marks a body pattern. */
function fixEmptyKey(dict: TemplateDict, key: string): void {
	for (const [name, value] of Object.entries(dict)) {
		if (typeof value === 'object' && value !== null) fixEmptyKey(value, key);
		else if (name === key && value === '') dict[name] = createDict();
	}
}

/** The client drops top-level `ActionN` entries that are empty. */
function removeEmptyActions(template: TemplateDict): void {
	for (const [key, value] of Object.entries(template) as [string, TemplateValue][]) {
		if (key.startsWith('Action') && value === '') delete template[key];
	}
}
