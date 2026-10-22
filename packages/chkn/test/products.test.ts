/**
 * Loads real products from IMVU's public productdata CDN (no login needed).
 * Opt in with IMVU_RUN_LIVE_TESTS=true. Revisions are pinned where known, so the
 * tests don't depend on probing (which is a heuristic).
 */
import { CdnProductSource, CflArchive, Product, readChkn, type ProductSource } from '../src/index.js';

const live = process.env.IMVU_RUN_LIVE_TESTS === 'true' ? describe : describe.skip;

const PRODUCTDATA = 'https://userimages-akm.imvu.com/productdata';

const download = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
};

live('IMVU products (live CDN)', () => {
	const source = new CdnProductSource({
		revisions: { 53938393: 3, 512: 11, 51522827: 1, 50585005: 1, 669: 16, 47735882: 2, 682: 12 },
	});
	const cache = new Map<number, Promise<Product>>();

	it('reads a CFL whose files match the CDN copies', async () => {
		const archive = CflArchive.parse(await download(`${PRODUCTDATA}/53938393/1`));
		expect(archive.names).toContain('index.xml');
		const manifest = JSON.parse(archive.text('_contents.json')!) as { name: string; url?: string }[];
		const mesh = manifest.find((entry) => entry.name.endsWith('.xmf'))!;
		expect(archive.get(mesh.name)).toEqual(await download(`${PRODUCTDATA}/53938393/1/${mesh.url}`));
	});

	it('assembles a room from its own and its parent room’s files', async () => {
		const product = await Product.load(53938393, source, { cache });
		expect(product.ancestors.map((ancestor) => ancestor.id)).toEqual([512]);
		expect(product.definition.productType).toBe('Room');
		expect(product.definition.sceneAmbient).toEqual([20, 20, 20]);

		const { skeleton, parts } = product.loadModel();
		expect(skeleton?.lights.length).toBeGreaterThan(0);
		for (const part of parts) {
			expect(part.mesh).not.toBeNull();
			for (const submesh of part.mesh!.submeshes) expect(part.materials.get(submesh.materialId)?.material).toBeTruthy();
		}
		// The shadow plane's material comes from the parent room.
		expect(product.ownerOf('BlueScreenPlane_UnderShadow.jpg')?.id).toBe(512);
	});

	it('follows a three-product chain and fetches full-size textures', async () => {
		const product = await Product.load(51522827, source, { cache });
		expect([product, ...product.ancestors].map((p) => p.id)).toEqual([51522827, 50585005, 669]);
		expect(product.definition.attachmentNodeName).toBe('Head');

		const material = product.loadModel().parts[0]!.materials.get(0)!.material!;
		const diffuse = material.diffuseMap!.filename;
		expect(product.getFile(diffuse)!.length).toBeLessThan(2000); // CFL placeholder
		const full = await product.fetchAsset(diffuse);
		expect(full.length).toBeGreaterThan(100_000);

		const chkn = await readChkn(await product.toChkn());
		expect(chkn.get(diffuse)).toEqual(full);
	});

	it('flattens a real chain into a standalone product', async () => {
		const product = await Product.load(51522827, source, { cache });
		const files = await readChkn(await product.toChkn({ flatten: true }));
		expect(new TextDecoder().decode(files.get('index.xml'))).not.toContain('__DATAIMPORT');
		// The mesh comes from an ancestor; it is now in the one file.
		const meshName = product.definition.meshes.get(0)!.asset!;
		expect(product.ownerOf(meshName)?.id).not.toBe(51522827);
		expect(files.get(meshName)).toEqual(product.getFile(meshName));

		const standalone: ProductSource = {
			fetchCfl: async () => ({ bytes: CflArchive.create(files), url: 'memory://flat' }),
			fetchUrl: async (url) => {
				throw new Error(`unexpected fetch ${url}`);
			},
		};
		const flat = await Product.load(51522827, standalone);
		expect(flat.ancestors).toEqual([]);
		const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
		expect(plain(flat.definition.template)).toEqual(plain(product.definition.template));
		const meshes = (p: Product) => p.loadModel().parts.map((part) => part.mesh?.toBinary());
		expect(meshes(flat)).toEqual(meshes(product));
	});

	it('inherits mesh and material slots from an attachment base', async () => {
		const product = await Product.load(47735882, source, { cache });
		expect(product.definition.attachmentNodeName).toBe('Neck03');
		const [part] = product.loadModel().parts;
		expect(part!.id).toBe(2);
		expect(part!.mesh?.submeshes.map((submesh) => submesh.materialId)).toEqual([0, 1]);
		expect(part!.materials.get(1)!.spec.raw.TwoSided).toBe('1');
	});
});
