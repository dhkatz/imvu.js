/**
 * Parses real IMVU products from the public productdata CDN (no login needed).
 * Opt in with IMVU_RUN_LIVE_TESTS=true; product files are creators' content, so
 * they are fetched at test time rather than committed as fixtures.
 */
import { Animation, Material, Mesh, MorphAnimation, Skeleton, detect, load, type Cal3DFile } from '../src/index.js';

const live = process.env.IMVU_RUN_LIVE_TESTS === 'true' ? describe : describe.skip;

const CDN = 'https://userimages-akm.imvu.com/productdata';

interface ManifestEntry {
	readonly name: string;
	readonly url?: string;
}

interface ProductFiles {
	readonly manifest: ManifestEntry[];
	readonly files: Map<string, Uint8Array>;
}

/** Download every Cal3D file of a product revision, keyed by its original name. */
async function fetchProduct(productId: number, revision = 1): Promise<ProductFiles> {
	const base = `${CDN}/${productId}/${revision}`;
	const manifest = (await (await fetch(`${base}/_contents.json`)).json()) as ManifestEntry[];
	const files = new Map<string, Uint8Array>();
	for (const entry of manifest.filter((item) => /\.x[smapr]f$/i.test(item.name))) {
		const response = await fetch(`${base}/${entry.url ?? entry.name}`);
		if (!response.ok) throw new Error(`${entry.name}: HTTP ${response.status}`);
		files.set(entry.name, new Uint8Array(await response.arrayBuffer()));
	}
	return { manifest, files };
}

function loadAll(product: ProductFiles): Map<string, Cal3DFile> {
	return new Map([...product.files].map(([name, bytes]) => [name, load(bytes)]));
}

/** Plain-data view for deep comparison (drops back-references and parse metadata). */
const data = (value: unknown) =>
	JSON.parse(
		JSON.stringify(value, (key, field) =>
			key === 'skeleton' || key === 'version' || key === 'compressed' ? undefined : field
		)
	);

live('IMVU products (live CDN)', () => {
	it('loads a room: skeleton with lights, mesh and materials', async () => {
		// "PrvRmDrkC v02 Furniture": binary files despite their .x?f names.
		const product = await fetchProduct(53938393);
		const files = loadAll(product);

		const skeleton = files.get('RootNode_skeleton.Room.xsf')!.value as Skeleton;
		expect(detect(product.files.get('RootNode_skeleton.Room.xsf')!)?.format).toBe('binary');
		expect(skeleton.bones).toHaveLength(19);
		expect(skeleton.roots.map((bone) => bone.name)).toEqual(['skeleton.Room']);
		// index.xml declares <SceneAmbient>20 20 20</SceneAmbient>; the skeleton stores it as floats.
		expect(skeleton.sceneAmbientColor.r).toBeCloseTo(20 / 255, 5);
		expect(skeleton.lights.map((bone) => bone.name)).toEqual(['Omni01', 'Omni02', 'Omni03', 'Omni04']);

		const mesh = files.get('Room.MESH.xmf')!.value as Mesh;
		expect(mesh.submeshes.length).toBeGreaterThan(0);
		for (const submesh of mesh.submeshes) {
			expect(submesh.faces.flat().every((index) => index < submesh.vertices.length)).toBe(true);
			expect(submesh.boneIds.every((id) => id < skeleton.bones.length)).toBe(true);
		}

		// Every texture a material names ships with the product, except the shadow plane's,
		// which comes from the parent room it derives from (product 512).
		const shipped = new Set(product.manifest.map((entry) => entry.name));
		const materials = [...files.values()]
			.filter((file) => file.kind === 'material')
			.map((file) => file.value as Material);
		expect(materials).toHaveLength(2);
		for (const map of materials.flatMap((material) => material.maps)) {
			expect(shipped.has(map.filename) || map.filename.startsWith('BlueScreenPlane')).toBe(true);
		}
		expect(materials.flatMap((material) => material.maps.map((map) => map.type))).toContain('Opacity');
	});

	it('loads an avatar product with XML meshes, morph targets and animations', async () => {
		const product = await fetchProduct(47426582);
		const files = loadAll(product);
		const byKind = (kind: Cal3DFile['kind']) =>
			[...files.values()].filter((file) => file.kind === kind).map((file) => file.value);

		const [skeleton] = byKind('skeleton') as Skeleton[];
		expect(skeleton!.roots.map((bone) => bone.name)).toEqual(['Female03MasterRoot']);

		const meshes = byKind('mesh') as Mesh[];
		const xmlMeshes = [...product.files.values()].filter((bytes) => detect(bytes)?.format === 'xml');
		expect(xmlMeshes.length).toBeGreaterThan(0);
		expect(meshes.some((mesh) => mesh.morphNames.length > 0)).toBe(true);
		for (const submesh of meshes.flatMap((mesh) => mesh.submeshes)) {
			expect(submesh.boneIds.every((id) => id < skeleton!.bones.length)).toBe(true);
			for (const morph of submesh.morphTargets) {
				expect(morph.blendVertices.every((blend) => blend.vertexId < submesh.vertices.length)).toBe(true);
			}
		}

		for (const animation of byKind('animation') as Animation[]) {
			expect(animation.duration).toBeGreaterThan(0);
			expect(animation.tracks.every((track) => track.boneId < skeleton!.bones.length)).toBe(true);
		}
		expect((byKind('morphAnimation') as MorphAnimation[]).length).toBeGreaterThan(0);
	});

	it('round-trips every file of several products through both writers', async () => {
		for (const productId of [53938393, 15596965, 47426582]) {
			const files = loadAll(await fetchProduct(productId));
			expect(files.size).toBeGreaterThan(0);
			for (const [name, file] of files) {
				const value = file.value;
				expect(data(load(value.toBinary()).value), `${productId}/${name} via binary`).toEqual(data(value));
				expect(data(load(value.toXml()).value), `${productId}/${name} via XML`).toEqual(data(value));
			}
		}
	});
});
