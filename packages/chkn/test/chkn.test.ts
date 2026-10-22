import { Bone, Material, Mesh, Skeleton, Submesh, TextureMap, Vertex } from '@imvu/cal3d';

import {
	CdnProductSource,
	CflArchive,
	CflCompression,
	ChknError,
	Product,
	ProductDefinition,
	cflToChkn,
	decompressLzma,
	expandTemplate,
	findImports,
	parseTemplate,
	probeLatestRevision,
	productIdFromUrl,
	readChkn,
	writeChkn,
	writeTemplate,
	type ProductSource,
	type TemplateDict,
} from '../src/index.js';
import { crc32 } from '../src/zip.js';

const encode = (text: string) => new TextEncoder().encode(text);
const decodeText = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
const base64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
/** Plain objects for comparison (templates use prototype-less dictionaries). */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

// Encoded by Python's liblzma (FORMAT_ALONE, size field dropped), independent of this decoder.
const LZMA_TEXT = {
	data: new Uint8Array([
		...Array.from({ length: 20 }, () => [
			...encode('<Template><ProductName>Bell Choker</ProductName></Template>\n'),
		]).flat(),
		...Array.from({ length: 2 }, () => Array.from({ length: 256 }, (_, i) => i)).flat(),
	]),
	// lc=3 lp=0 pb=2, with end marker
	lzma: base64(
		'XQAAAQAAHhUIptO2udG4+V5Rnm8Neamr0qSL3ZPgR944XGD0+gWR/faWEaowf9fr7yn7Q4pchS1AYYmUgDygjq0+tbuGITzzOwDN1hH9AxssPuOqPOBB3aCM4gVVUNk8TVS2Bdx3OHSfimf/N1Z7arsWj7L+DR7kJeTyIrwMuRDVyUla5DzD7qwxRaJktOLUu6+XJp0jM40pDqXhjGMso9lb+ZIbVL8Q7D7M30WKK9Oh2x6IrxHMseWwLGqd2sofran7HK5tvf+PKVJWDoVn4oKLMAV7dIfYo1ZnWRr/qTGcXyBLVRzJhCUrPwhsPoWLswozHs5mYHW/ndprM9rBdXo4IljTIDP45y//UGg1oGQmzOMGPgl/LeSS5/LXZzms7fgxf/dNhiA='
	),
};
const LZMA_BINARY = {
	data: Uint8Array.from({ length: 3000 }, (_, i) => (i * 7919) % 251),
	// lc=0 lp=2 pb=0, with end marker
	lzma: base64(
		'EgAAAQAAACOW4+yXEY74LWzBB5jhUjMUV4f8z1B+svdcFIK4nuzvZUpo8PLk4QRJMuz7j/gruW9i4+TheLk1yn55BRnn3gyeorPCLK/a41Dse+W9j1M4AjRQxWRdiDVBTEYvwbXdQ6p5SpW+B0cX2UaiiCBI6J+uqCHaY+gMQtgLCsm46VZQ76z2Rn7qrgrzkqZ43AtnmU9nTclFyydWwlHX3rfpLscIXCemzH4CdlP+KLy32ou/biiyiXxBEMPaFgW/WraXUGMI3fPZCAbv4BT6mZOI2qOdvJ5mc8C6pmUPKAWwpQXxQDprn4NZQ+z+W2T20diUs76ACBBiIQwBTwp80aer7o97DROwtJRAUypHCPxcf//4aLAA'
	),
};
const LZMA_EMPTY = base64('XQAAAQAAg//7///AAAAA');

// ---------------------------------------------------------------- LZMA

describe('decompressLzma', () => {
	it.each([
		['text', LZMA_TEXT],
		['binary', LZMA_BINARY],
	])('decodes %s with and without a known size', (_, fixture) => {
		expect(decompressLzma(fixture.lzma)).toEqual(fixture.data);
		expect(decompressLzma(fixture.lzma, fixture.data.length)).toEqual(fixture.data);
	});

	it('decodes an empty stream', () => {
		expect(decompressLzma(LZMA_EMPTY)).toEqual(new Uint8Array());
	});

	it('rejects corrupt and truncated input', () => {
		expect(() => decompressLzma(LZMA_TEXT.lzma.subarray(0, 40))).toThrow(ChknError);
		expect(() => decompressLzma(new Uint8Array([0xff, 0, 0, 1, 0, 0]))).toThrow(/properties/);
		expect(() => decompressLzma(LZMA_TEXT.lzma, 10)).toThrow(/longer than its declared size/);
	});
});

// ---------------------------------------------------------------- CFL

/** A CFL as IMVU writes it: LZMA entries and directory, optionally DFL3 hashes. */
function imvuCfl(hashed: boolean): Uint8Array {
	const parts: number[] = [...encode(hashed ? 'DFL3' : 'CFL3'), 0, 0, 0, 0, 0, 0, 0, 0];
	const u32 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24];
	const entries = [
		{ name: 'index.xml', fixture: LZMA_TEXT },
		{ name: 'mesh.xmf', fixture: LZMA_BINARY },
	].map(({ name, fixture }) => {
		const offset = parts.length;
		parts.push(...u32(fixture.lzma.length), ...fixture.lzma);
		return { name, size: fixture.data.length, offset };
	});
	const directory: number[] = [];
	for (const entry of entries) {
		directory.push(
			...u32(entry.size),
			...u32(entry.offset),
			...u32(CflCompression.Lzma),
			entry.name.length,
			0,
			...encode(entry.name)
		);
		if (hashed) directory.push(...u32(4), ...encode('abcd'));
	}
	const directoryOffset = parts.length;
	parts.push(...u32(CflCompression.None), ...u32(directory.length), ...directory);
	const bytes = Uint8Array.from(parts);
	bytes.set(u32(directoryOffset), 4);
	bytes.set(u32(directory.length), 8);
	return bytes;
}

describe('CflArchive', () => {
	it.each([false, true])('reads LZMA entries (hashed: %s)', (hashed) => {
		const archive = CflArchive.parse(imvuCfl(hashed));
		expect(archive.hashed).toBe(hashed);
		expect(archive.names).toEqual(['index.xml', 'mesh.xmf']);
		expect(archive.entry('mesh.xmf')).toMatchObject({
			size: 3000,
			compression: CflCompression.Lzma,
			hash: hashed ? 'abcd' : null,
		});
		expect(archive.get('index.xml')).toEqual(LZMA_TEXT.data);
		expect(archive.get('mesh.xmf')).toEqual(LZMA_BINARY.data);
		expect(archive.get('missing')).toBeUndefined();
	});

	it('round-trips through create()', () => {
		const files = {
			'index.xml': encode('<Template/>'),
			'Ünïcode.xrf': new Uint8Array([1, 2, 3]),
			'empty.txt': new Uint8Array(),
		};
		const archive = CflArchive.parse(CflArchive.create(files));
		expect(archive.names).toEqual(Object.keys(files));
		for (const [name, data] of Object.entries(files)) expect(archive.get(name)).toEqual(data);
		expect(archive.text('index.xml')).toBe('<Template/>');
	});

	it('rejects what it cannot read', () => {
		expect(() => CflArchive.parse(encode('PK\x03\x04xxxxxxxx'))).toThrow(/Not a CFL/);
		expect(() => CflArchive.parse(imvuCfl(false).subarray(0, 100))).toThrow(ChknError);
		expect(() => CflArchive.create({ '日本.xml': new Uint8Array() })).toThrow(/Latin-1/);
	});
});

// ---------------------------------------------------------------- CHKN

/** A ZIP with one deflated entry, as other tools write them. */
async function deflatedZip(name: string, data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
	const nameBytes = encode(name);
	const out = new Uint8Array(30 + nameBytes.length + compressed.length + 46 + nameBytes.length + 22);
	const view = new DataView(out.buffer);
	const header = (p: number, central: boolean) => {
		const shift = central ? 2 : 0;
		view.setUint32(p, central ? 0x02014b50 : 0x04034b50, true);
		view.setUint16(p + 8 + shift, 8, true);
		view.setUint32(p + 14 + shift, crc32(data), true);
		view.setUint32(p + 18 + shift, compressed.length, true);
		view.setUint32(p + 22 + shift, data.length, true);
		view.setUint16(p + 26 + shift, nameBytes.length, true);
	};
	header(0, false);
	out.set(nameBytes, 30);
	out.set(compressed, 30 + nameBytes.length);
	const central = 30 + nameBytes.length + compressed.length;
	header(central, true);
	out.set(nameBytes, central + 46);
	const end = central + 46 + nameBytes.length;
	view.setUint32(end, 0x06054b50, true);
	view.setUint16(end + 8, 1, true);
	view.setUint16(end + 10, 1, true);
	view.setUint32(end + 12, 46 + nameBytes.length, true);
	view.setUint32(end + 16, central, true);
	return out;
}

describe('CHKN', () => {
	it('round-trips files through a ZIP', async () => {
		const files = new Map([
			['index.xml', encode('<Template/>')],
			['textures/ä.png', new Uint8Array([137, 80, 78, 71])],
		]);
		expect(await readChkn(writeChkn(files))).toEqual(files);
	});

	it('reads deflated entries and checks CRCs', async () => {
		const data = encode('deflate me '.repeat(100));
		expect(await readChkn(await deflatedZip('a.txt', data))).toEqual(new Map([['a.txt', data]]));

		const corrupt = writeChkn({ 'a.txt': encode('hello') });
		corrupt[30 + 5] ^= 0xff; // flip a data byte
		await expect(readChkn(corrupt)).rejects.toThrow(/CRC/);
		await expect(readChkn(encode('not a zip at all, definitely not'))).rejects.toThrow(/Not a ZIP/);
	});

	it('converts a CFL byte for byte', async () => {
		const files = await readChkn(cflToChkn(imvuCfl(true)));
		expect([...files.keys()]).toEqual(['index.xml', 'mesh.xmf']);
		expect(files.get('mesh.xmf')).toEqual(LZMA_BINARY.data);
	});
});

// ---------------------------------------------------------------- templates

describe('parseTemplate', () => {
	it('builds dictionaries the way the classic client does', () => {
		const dict = parseTemplate(`<?xml version="1.0" encoding="UTF-8" ?>
			<Template>
				<__DATAIMPORT>product://512/index.xml</__DATAIMPORT>
				<ProductName> Bell Choker </ProductName>
				<ParticleSystems>
				</ParticleSystems>
				<Mesh0><Asset>a.xmf</Asset><Index>2</Index></Mesh0>
				<Mesh0><Asset>b.xmf</Asset></Mesh0>
				<Skeleton delete="true"/>
				<Material delete="true"><TextureMap0><Asset>keep.xrf</Asset></TextureMap0></Material>
				<Note>a &amp; b</Note>
			</Template>`);
		expect(plain(dict)).toEqual({
			Template: {
				__DATAIMPORT: 'product://512/index.xml',
				ProductName: ' Bell Choker ', // text is kept as written…
				ParticleSystems: '', // …unless it is only whitespace
				Mesh0: { Asset: 'b.xmf' }, // a repeated tag keeps the last
				Skeleton: null, // deletion marker
				Material: { TextureMap0: { Asset: 'keep.xrf' } }, // children win over delete
				Note: 'a & b',
			},
		});
		expect(findImports(dict)).toEqual(['product://512/index.xml']);
		expect(productIdFromUrl('product://512/index.xml')).toBe(512);
		expect(productIdFromUrl('http://example.com')).toBeNull();
	});

	it("drops Overridable='0' from material slots of creator-tool templates", () => {
		const xml = (creator: string) =>
			`<Template>${creator}<Material><TextureMap0><Overridable>0</Overridable></TextureMap0><TextureMap1><Overridable>1</Overridable></TextureMap1></Material></Template>`;
		expect(plain(parseTemplate(xml('<CreatorVersion>0.32.7</CreatorVersion>')).Template).Material).toEqual({
			TextureMap0: {},
			TextureMap1: { Overridable: '1' },
		});
		expect(plain(parseTemplate(xml('')).Template).Material.TextureMap0).toEqual({ Overridable: '0' });
	});

	it('rewrites to XML that parses back the same', () => {
		const dict = parseTemplate(
			'<Template><__DATAIMPORT>product://1/index.xml</__DATAIMPORT><B>2 &lt; 3</B><A><X/><Y>1</Y></A><Gone delete="1"/></Template>'
		);
		const xml = writeTemplate(dict);
		expect(xml).toContain('<Template>\n<__DATAIMPORT>product://1/index.xml</__DATAIMPORT><A>'); // import first, then sorted
		expect(xml).toContain('<Gone delete="true"></Gone>');
		expect(plain(parseTemplate(xml))).toEqual(plain(dict));
	});
});

describe('expandTemplate', () => {
	const grandparent = parseTemplate(
		'<Template><ProductType>Avatar Clothing</ProductType><Mesh2><Index>6</Index><Asset>old.xmf</Asset></Mesh2><Skeleton><Asset>s.xsf</Asset></Skeleton></Template>'
	);
	const parent = parseTemplate(
		'<Template><__DATAIMPORT>product://1/index.xml</__DATAIMPORT><ProductName>Parent</ProductName><Material><TextureMap3><Asset>m.xrf</Asset><Index>3</Index></TextureMap3></Material></Template>'
	);
	const child = parseTemplate(
		'<Template><__DATAIMPORT>product://2/index.xml</__DATAIMPORT><Mesh2><Asset>new.xmf</Asset></Mesh2><Material><TextureMap3><AlphaBlending>1</AlphaBlending></TextureMap3></Material><Skeleton delete="true"/></Template>'
	);

	it('merges the chain: parents fill in, children win, deletions remove', () => {
		const expandedParent = expandTemplate(
			parent,
			new Map([['product://1/index.xml', expandTemplate(grandparent, new Map())]])
		);
		const expanded = expandTemplate(child, new Map([['product://2/index.xml', expandedParent]]));
		expect(plain(expanded)).toEqual({
			Template: {
				ProductType: 'Avatar Clothing',
				ProductName: 'Parent',
				Mesh2: { Asset: 'new.xmf', Index: '6' },
				Material: { TextureMap3: { AlphaBlending: '1', Asset: 'm.xrf', Index: '3' } },
			},
		});
		expect(findImports(child)).toEqual(['product://2/index.xml']); // input untouched
	});

	it('requires every import to be supplied', () => {
		expect(() => expandTemplate(child, new Map())).toThrow(/was not loaded/);
		expect(plain(expandTemplate(child, new Map([['product://2/index.xml', null]]))).Template.Mesh2).toEqual({
			Asset: 'new.xmf',
		});
	});
});

// ---------------------------------------------------------------- product definitions

const definition = (xml: string) =>
	new ProductDefinition(expandTemplate(parseTemplate(xml), new Map()).Template as TemplateDict);

describe('ProductDefinition', () => {
	it('reads body-pattern products', () => {
		const product = definition(`<Template>
			<ProductName>Room</ProductName><ProductTypeID>107</ProductTypeID><SceneAmbient>20 300 -5</SceneAmbient>
			<Skeleton><Asset>room.xsf</Asset></Skeleton>
			<BodyPatternDef><BodyPart0><BodyPartId>0</BodyPartId>
				<Mesh><Asset>room.xmf</Asset><Index>0</Index></Mesh>
				<Material>
					<TextureMap0><Asset>a.xrf</Asset><Index>0</Index></TextureMap0>
					<TextureMap1><Asset>b.xrf</Asset><Index>7</Index><TwoSided>1</TwoSided></TextureMap1>
				</Material>
			</BodyPart0></BodyPatternDef>
		</Template>`);
		expect(product.name).toBe('Room');
		expect(product.productTypeId).toBe(107);
		expect(product.productType).toBe('Avatar Clothing'); // the client's default
		expect(product.sceneAmbient).toEqual([20, 255, 0]);
		expect(product.skeletonAsset).toBe('room.xsf');
		expect(product.isBodyPattern).toBe(true);
		expect([...product.meshes.values()].map((mesh) => [mesh.index, mesh.asset])).toEqual([[0, 'room.xmf']]);
		const materials = product.materialsFor(0);
		expect([...materials.keys()]).toEqual([0, 7]);
		expect(materials.get(7)!.raw.TwoSided).toBe('1');
	});

	it('synthesizes body parts for older clothing', () => {
		const product = definition(`<Template>
			<BodyPartId0>4</BodyPartId0>
			<Mesh0><Asset>shirt.xmf</Asset></Mesh0>
			<Mesh1><Asset>sleeve.xmf</Asset><Index>6</Index></Mesh1>
			<Material><TextureMap0><Asset>s.xrf</Asset></TextureMap0><TextureMap1><Asset>t.xrf</Asset><Index>9</Index></TextureMap1></Material>
		</Template>`);
		expect([...product.meshes.values()].map((mesh) => [mesh.index, mesh.asset])).toEqual([
			[4, 'shirt.xmf'],
			[6, 'sleeve.xmf'],
		]);
		expect([...product.materialsFor(6)].map(([index, spec]) => [index, spec.asset])).toEqual([
			[0, 's.xrf'],
			[9, 't.xrf'],
		]);
	});

	it('reads actions and their animation ensembles', () => {
		const product = definition(`<Template>
			<Action10><Name>last</Name></Action10>
			<Action2><Name>stance.Aa</Name><Definition><ActionType>Avatar</ActionType><ActionDefinition>
				<EnsembleDefinition0>
					<SkeletalAnimationEffect0><AssetName>a.xaf</AssetName><EffectControls><LoopIterations>0</LoopIterations></EffectControls></SkeletalAnimationEffect0>
					<MorphAnimationEffect0><AssetName>b.xpf</AssetName></MorphAnimationEffect0>
				</EnsembleDefinition0>
			</ActionDefinition></Definition></Action2>
		</Template>`);
		const [stance, last] = product.actions;
		expect(stance!.name).toBe('stance.Aa');
		expect(stance!.type).toBe('Avatar');
		expect(stance!.ensembles[0]!.skeletalAnimations.map((effect) => effect.asset)).toEqual(['a.xaf']);
		expect(stance!.ensembles[0]!.morphAnimations.map((effect) => effect.asset)).toEqual(['b.xpf']);
		expect(last!.name).toBe('last'); // numeric order: Action2 before Action10
	});
});

// ---------------------------------------------------------------- products

/** Products served from memory: `files[pid]` becomes that product's CFL. */
class MemorySource implements ProductSource {
	public readonly requests: string[] = [];
	public constructor(
		private readonly products: Record<number, Record<string, Uint8Array>>,
		private readonly urls: Record<string, Uint8Array> = {}
	) {}

	public async fetchCfl(productId: number) {
		this.requests.push(`cfl:${productId}`);
		const files = this.products[productId];
		if (!files) throw new Error(`no product ${productId}`);
		return { bytes: CflArchive.create(files), url: `https://cdn.test/${productId}/1` };
	}

	public async fetchUrl(url: string) {
		this.requests.push(url);
		const data = this.urls[url];
		if (!data) throw new Error(`404 ${url}`);
		return data;
	}
}

function memoryProducts() {
	const skeleton = new Skeleton({ bones: [new Bone({ name: 'Root' })] });
	const mesh = new Mesh([
		new Submesh({ materialId: 0, vertices: [new Vertex()] }),
		new Submesh({ materialId: 3, vertices: [new Vertex()] }),
	]);
	const material = (texture: string) => new Material({ maps: [new TextureMap(texture)] }).toBinary();
	const manifest = (entries: object[]) => encode(JSON.stringify(entries));

	const base = {
		'index.xml': encode(`<Template><ProductName>Base</ProductName><ProductType>Avatar Attachment</ProductType>
			<Skeleton><Asset>base.xsf</Asset></Skeleton>
			<Mesh0><Asset>base.xmf</Asset><Index>2</Index></Mesh0>
			<Material><TextureMap0><Asset>base.xrf</Asset><Index>0</Index></TextureMap0><TextureMap1><Asset>extra.xrf</Asset><Index>3</Index></TextureMap1></Material>
		</Template>`),
		'base.xsf': skeleton.toBinary(),
		'base.xmf': mesh.toBinary(),
		'base.xrf': material('base.jpg'),
		'extra.xrf': material('extra.jpg'),
		'base.jpg': new Uint8Array([1]), // CFL placeholder
		'_contents.json': manifest([
			{ name: 'base.jpg', url: 'b1.jpg', tags: ['original', 'thumbnail'] },
			{ name: 'extra.jpg', url: 'e1.jpg', tags: ['original'] },
		]),
	};
	const child = {
		'index.xml': encode(`<Template><__DATAIMPORT>product://100/index.xml</__DATAIMPORT><ProductName>Child</ProductName>
			<Material><TextureMap0><Asset>child.xrf</Asset></TextureMap0></Material></Template>`),
		'child.xrf': material('child.jpg'),
		'child.jpg': new Uint8Array([2]),
		'_contents.json': manifest([{ name: 'child.jpg', url: 'c 1.jpg', tags: ['original'] }]),
	};
	const urls = {
		'https://cdn.test/100/1/b1.jpg': new Uint8Array([10, 10]),
		'https://cdn.test/100/1/e1.jpg': new Uint8Array([11, 11]),
		'https://cdn.test/200/1/c%201.jpg': new Uint8Array([20, 20]),
	};
	return new MemorySource({ 100: base, 200: child }, urls);
}

describe('Product', () => {
	it('loads the inheritance chain and expands the template', async () => {
		const product = await Product.load(200, memoryProducts());
		expect(product.ancestors.map((ancestor) => ancestor.id)).toEqual([100]);
		expect(product.definition.name).toBe('Child');
		expect(product.definition.productType).toBe('Avatar Attachment');
		expect([...product.definition.materialsFor(2)].map(([index, spec]) => [index, spec.asset])).toEqual([
			[0, 'child.xrf'],
			[3, 'extra.xrf'],
		]);
	});

	it('resolves assets through the chain', async () => {
		const source = memoryProducts();
		const product = await Product.load(200, source);
		expect(product.ownerOf('child.xrf')?.id).toBe(200);
		expect(product.ownerOf('base.xmf')?.id).toBe(100);
		expect(product.ownerOf('nope')).toBeUndefined();
		expect(product.assetNames).toContain('base.xsf');
		expect(product.getAssetUrl('child.jpg')).toBe('https://cdn.test/200/1/c%201.jpg');

		// Textures come from the CDN (CFL copies are placeholders); model files from the CFL.
		expect(await product.fetchAsset('child.jpg')).toEqual(new Uint8Array([20, 20]));
		expect(await product.fetchAsset('base.jpg')).toEqual(new Uint8Array([10, 10]));
		expect(await product.fetchAsset('base.xsf')).toEqual(product.getFile('base.xsf'));
		await expect(product.fetchAsset('nope')).rejects.toThrow(ChknError);
	});

	it('assembles the Cal3D model', async () => {
		const model = (await Product.load(200, memoryProducts())).loadModel();
		expect(model.skeleton?.bones.map((bone) => bone.name)).toEqual(['Root']);
		const [part] = model.parts;
		expect(part!.id).toBe(2);
		expect(part!.mesh?.submeshes.map((submesh) => submesh.materialId)).toEqual([0, 3]);
		expect(part!.materials.get(0)!.material?.diffuseMap?.filename).toBe('child.jpg');
		expect(part!.materials.get(3)!.material?.diffuseMap?.filename).toBe('extra.jpg');
	});

	it('exports a CHKN with full-size textures', async () => {
		const files = await readChkn(await (await Product.load(200, memoryProducts())).toChkn());
		expect([...files.keys()].sort()).toEqual(['_contents.json', 'child.jpg', 'child.xrf', 'index.xml']);
		expect(files.get('child.jpg')).toEqual(new Uint8Array([20, 20]));
	});

	it('flattens the ancestor chain into one standalone CHKN', async () => {
		const original = await Product.load(200, memoryProducts());
		const files = await readChkn(await original.toChkn({ flatten: true }));

		expect([...files.keys()].sort()).toEqual([
			'base.jpg',
			'base.xmf',
			'base.xrf',
			'base.xsf',
			'child.jpg',
			'child.xrf',
			'extra.jpg', // listed only in the parent's manifest: fetched from the CDN
			'extra.xrf',
			'index.xml',
		]);
		expect(files.get('base.jpg')).toEqual(new Uint8Array([10, 10])); // full size, not the CFL placeholder
		expect(decodeText(files.get('index.xml'))).not.toContain('__DATAIMPORT');

		// Loaded on its own, the flattened product is the same product.
		const flat = await Product.load(1, new MemorySource({ 1: Object.fromEntries(files) }));
		expect(flat.ancestors).toEqual([]);
		expect(plain(flat.definition.template)).toEqual(plain(original.definition.template));
		const model = (product: Product) => {
			const { skeleton, parts } = product.loadModel();
			return {
				skeleton: skeleton?.toBinary(),
				parts: parts.map((part) => ({
					id: part.id,
					mesh: part.mesh?.toBinary(),
					materials: [...part.materials].map(([index, slot]) => [index, plain(slot.spec), slot.material?.toBinary()]),
				})),
			};
		};
		expect(model(flat)).toEqual(model(original));
	});

	it('lets the nearest product win when flattened file names collide', async () => {
		const source = new MemorySource({
			1: {
				'index.xml': encode('<Template><Skeleton><Asset>s.xsf</Asset></Skeleton></Template>'),
				's.xsf': encode('parent'),
			},
			2: {
				'index.xml': encode('<Template><__DATAIMPORT>product://1/index.xml</__DATAIMPORT></Template>'),
				's.xsf': encode('child'),
			},
		});
		const files = await (await Product.load(2, source)).flattenedFiles();
		expect(decodeText(files.get('s.xsf'))).toBe('child');
	});

	it('shares parents through a cache and rejects cycles', async () => {
		const source = memoryProducts();
		const cache = new Map();
		await Product.load(200, source, { cache });
		await Product.load(100, source, { cache });
		expect(source.requests.filter((request) => request.startsWith('cfl:'))).toEqual(['cfl:200', 'cfl:100']);

		const loop = new MemorySource({
			1: { 'index.xml': encode('<Template><__DATAIMPORT>product://2/index.xml</__DATAIMPORT></Template>') },
			2: { 'index.xml': encode('<Template><__DATAIMPORT>product://1/index.xml</__DATAIMPORT></Template>') },
		});
		await expect(Product.load(1, loop)).rejects.toThrow(/derives from itself/);
	});
});

// ---------------------------------------------------------------- revisions

/** A fake CDN `fetch` where `revisions` exist for product 7. */
function fakeCdn(revisions: Iterable<number>) {
	const existing = new Set(revisions);
	const calls: string[] = [];
	const fetch = (async (url: string | URL | Request) => {
		const href = url instanceof Request ? url.url : url.toString();
		calls.push(href);
		const revision = Number(href.split('/').pop());
		return new Response(existing.has(revision) ? 'CFL3' : null, { status: existing.has(revision) ? 200 : 404 });
	}) as typeof globalThis.fetch;
	return { fetch, calls };
}

describe('revisions', () => {
	it.each([
		['contiguous from 1', [1, 2, 3], 3],
		['with a gap (like product 512)', [5, 8, 9, 10, 11], 11],
		['starting late (like product 191)', [5, ...Array.from({ length: 12 }, (_, i) => 9 + i)], 20],
		['large', Array.from({ length: 6338 }, (_, i) => i + 1), 6338],
	])('probes the latest revision: %s', async (_, revisions, latest) => {
		const { fetch, calls } = fakeCdn(revisions);
		expect(await probeLatestRevision(7, { fetch, baseUrl: 'https://cdn.test' })).toBe(latest);
		expect(calls.length).toBeLessThan(60);
	});

	it('fails when no revision exists', async () => {
		const { fetch } = fakeCdn([]);
		await expect(probeLatestRevision(7, { fetch, limit: 100 })).rejects.toThrow(/No CFL/);
	});

	it('uses known revisions before probing', async () => {
		const { fetch, calls } = fakeCdn([4]);
		const source = new CdnProductSource({ revisions: { 7: 4 }, fetch, baseUrl: 'https://cdn.test/' });
		expect((await source.fetchCfl(7)).url).toBe('https://cdn.test/7/4');
		expect(calls).toEqual(['https://cdn.test/7/4']);
	});
});
