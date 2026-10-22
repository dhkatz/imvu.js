import {
	Animation,
	BlendVertex,
	Bone,
	Cal3DError,
	Color,
	Influence,
	Keyframe,
	LightType,
	Material,
	Mesh,
	MorphAnimation,
	MorphKeyframe,
	MorphTarget,
	MorphTrack,
	Quaternion,
	Skeleton,
	Submesh,
	TextureMap,
	Track,
	Vector3,
	Vertex,
	detect,
	load,
} from '../src/index.js';
import { decodeKeyframe, encodeKeyframe } from '../src/compression.js';
import { BinaryWriter } from '../src/io/BinaryWriter.js';
import { formatFloat } from '../src/io/text.js';
import { parseXml } from '../src/io/xml.js';

/** Plain-data view of a model (drops back-references and parse metadata) for deep comparison. */
const data = (value: unknown) =>
	JSON.parse(
		JSON.stringify(value, (key, field) =>
			key === 'skeleton' || key === 'version' || key === 'compressed' ? undefined : field
		)
	);

const f = Math.fround;

// ---------------------------------------------------------------- fixtures

function makeSkeleton(): Skeleton {
	return new Skeleton({
		sceneAmbientColor: new Color(f(0.2), f(0.2), f(0.2), 1),
		bones: [
			new Bone({
				name: 'Root',
				translation: new Vector3(0, 0, f(1.5)),
				rotation: new Quaternion(0, 0, f(0.7071068), f(0.7071068)),
			}),
			new Bone({
				name: 'Spine',
				parentId: 0,
				translation: new Vector3(f(10.25), 0, 0),
				localTranslation: new Vector3(f(-10.25), 0, 0),
			}),
			new Bone({
				name: 'Omni01',
				parentId: 0,
				lightType: LightType.Omni,
				lightColor: new Color(f(0.5), f(0.25), 1, 1),
			}),
			new Bone({ name: 'Head & Neck', parentId: 1 }),
		],
	});
}

function makeMesh(): Mesh {
	const vertex = (x: number, boneId: number) =>
		new Vertex({
			position: new Vector3(f(x), f(x * 2), f(x * 3)),
			normal: new Vector3(0, 0, 1),
			color: new Color(1, f(0.5), 0, 1),
			texCoords: [{ u: f(x / 10), v: f(1 - x / 10) }],
			influences: [new Influence(boneId, f(0.75)), new Influence(0, f(0.25))],
		});
	const body = new Submesh({
		materialId: 0,
		vertices: [vertex(1, 1), vertex(2, 1), vertex(3, 3)],
		faces: [[0, 1, 2]],
		morphTargets: [
			new MorphTarget('Smile', [new BlendVertex(2, new Vector3(f(3.5), 6, 9), new Vector3(0, 1, 0), [{ u: 0, v: 0 }])]),
		],
	});
	const empty = new Submesh({ materialId: 1, textureCoordinateCount: 1 });
	return new Mesh([body, empty]);
}

function makeMaterial(): Material {
	return new Material({
		ambient: new Color(10, 20, 30, 0),
		diffuse: new Color(255, 255, 255, 255),
		specular: new Color(229, 229, 229, 229),
		shininess: f(0.05),
		maps: [new TextureMap('shirt.jpg'), new TextureMap('shirt_alpha.jpg', 'Opacity')],
	});
}

function makeAnimation(): Animation {
	const spin = (time: number, z: number) => new Quaternion(0, 0, f(Math.sin(z / 2)), f(Math.cos(z / 2)));
	return new Animation({
		duration: 2,
		tracks: [
			new Track({
				boneId: 0,
				keyframes: [
					new Keyframe(0, new Vector3(0, 0, f(1.5)), spin(0, 0)),
					new Keyframe(1, new Vector3(0, f(2.5), f(1.5)), spin(1, 1)),
					new Keyframe(2, new Vector3(0, 5, f(1.5)), spin(2, 2)),
				],
			}),
			new Track({
				boneId: 1,
				translationIsDynamic: false,
				keyframes: [
					new Keyframe(0, new Vector3(f(10.25), 0, 0), spin(0, 0)),
					new Keyframe(2, new Vector3(f(10.25), 0, 0), spin(2, 1)),
				],
			}),
			new Track({
				boneId: 3,
				translationRequired: false,
				keyframes: [new Keyframe(0, null, spin(0, 0)), new Keyframe(2, null, spin(2, f(0.5)))],
			}),
		],
	});
}

function makeMorphAnimation(): MorphAnimation {
	return new MorphAnimation({
		duration: 1,
		tracks: [new MorphTrack('Smile', [new MorphKeyframe(0, 0), new MorphKeyframe(f(0.5), 1), new MorphKeyframe(1, 0)])],
	});
}

// ---------------------------------------------------------------- round trips

describe.each([
	['skeleton', makeSkeleton, Skeleton],
	['mesh', makeMesh, Mesh],
	['material', makeMaterial, Material],
	['animation', makeAnimation, Animation],
	['morphAnimation', makeMorphAnimation, MorphAnimation],
] as const)('%s', (kind, make, Type) => {
	it('round-trips through binary', () => {
		const original = make();
		const bytes = original.toBinary();
		expect(detect(bytes)).toEqual({ kind, format: 'binary', version: 919 });
		const parsed = (Type as { parse(input: Uint8Array): unknown }).parse(bytes);
		expect(data(parsed)).toEqual(data(original));
	});

	it('round-trips through XML', () => {
		const original = make();
		const xml = original.toXml();
		expect(detect(xml)).toEqual({ kind, format: 'xml', version: 919 });
		expect(data((Type as { parse(input: string): unknown }).parse(xml))).toEqual(data(original));
		// XML bytes are detected too, and load() dispatches on the sniffed kind.
		const file = load(new TextEncoder().encode(xml));
		expect(file.kind).toBe(kind);
		expect(data(file.value)).toEqual(data(original));
	});

	it('rejects the wrong kind of file', () => {
		const other = kind === 'mesh' ? makeSkeleton() : makeMesh();
		expect(() => (Type as { parse(input: Uint8Array): unknown }).parse(other.toBinary())).toThrow(Cal3DError);
		expect(() => (Type as { parse(input: string): unknown }).parse(other.toXml())).toThrow(Cal3DError);
	});
});

// ---------------------------------------------------------------- object model

describe('Skeleton', () => {
	it('links bones by parent id', () => {
		const skeleton = makeSkeleton();
		const spine = skeleton.getBone('Spine')!;
		expect(spine.id).toBe(1);
		expect(spine.parent?.name).toBe('Root');
		expect(skeleton.getBone(0)!.children.map((bone) => bone.name)).toEqual(['Spine', 'Omni01']);
		expect(skeleton.roots.map((bone) => bone.name)).toEqual(['Root']);
		expect(skeleton.lights.map((bone) => bone.name)).toEqual(['Omni01']);
		expect([...skeleton.walk()].map(({ bone, depth }) => `${depth}:${bone.name}`)).toEqual([
			'0:Root',
			'1:Spine',
			'2:Head & Neck',
			'1:Omni01',
		]);
	});

	it('writes child ids and light data to XML', () => {
		const xml = makeSkeleton().toXml();
		expect(xml).toContain('<BONE ID="2" NAME="Omni01" LIGHTTYPE="1" LIGHTCOLOR="0.5 0.25 1">');
		expect(xml).toContain('<CHILDID>1</CHILDID>');
		expect(xml).toContain('NAME="Head &amp; Neck"');
	});

	it('refuses to share a bone between skeletons', () => {
		const skeleton = makeSkeleton();
		expect(() => new Skeleton().addBone(skeleton.bones[0]!)).toThrow(Cal3DError);
	});

	it('reads pre-911 binary skeletons (no lights or ambient color)', () => {
		const out = new BinaryWriter().magic('CSF').int32(700).int32(2);
		for (const [name, parent] of [
			['A', -1],
			['B', 0],
		] as const) {
			out.string(name);
			for (let i = 0; i < 14; i++) out.float32(i === 6 ? 1 : 0); // t3, r4 (w=1), lt3, lr4
			out.int32(parent).int32(parent === -1 ? 1 : 0);
			if (parent === -1) out.int32(1);
		}
		const skeleton = Skeleton.parse(out.finish());
		expect(skeleton.version).toBe(700);
		expect(skeleton.bones.map((bone) => [bone.name, bone.parentId, bone.lightType])).toEqual([
			['A', -1, 0],
			['B', 0, 0],
		]);
		expect(skeleton.bones[0]!.rotation).toEqual(new Quaternion(0, 0, 0, 1));
	});

	it('reads strings up to the first NUL, like IMVU', () => {
		// Declared length 6, but the text ends early: the cursor follows the NUL, not the length.
		const out = new BinaryWriter().magic('CSF').int32(919).int32(1).float32(0).float32(0).float32(0);
		out.int32(6).bytes([0x41, 0x42, 0]);
		for (let i = 0; i < 14; i++) out.float32(0);
		out.int32(-1).int32(0).float32(0).float32(0).float32(0).int32(0);
		expect(Skeleton.parse(out.finish()).bones[0]!.name).toBe('AB');
	});
});

describe('Mesh', () => {
	it('summarizes its submeshes', () => {
		const mesh = makeMesh();
		expect(mesh.vertexCount).toBe(3);
		expect(mesh.faceCount).toBe(1);
		expect(mesh.morphNames).toEqual(['Smile']);
		expect(mesh.submeshes[0]!.boneIds).toEqual([0, 1, 3]);
		expect(mesh.submeshes[0]!.getMorphTarget('Smile')?.blendVertices).toHaveLength(1);
	});

	it('flattens a submesh into typed arrays', () => {
		const buffers = makeMesh().submeshes[0]!.toBuffers({ maxInfluences: 2 });
		expect([...buffers.positions.subarray(0, 3)]).toEqual([1, 2, 3]);
		expect(buffers.texCoords).toHaveLength(1);
		expect(buffers.texCoords[0]![0]).toBeCloseTo(0.1);
		expect([...buffers.indices]).toEqual([0, 1, 2]);
		expect([...buffers.skinIndices.subarray(4, 6)]).toEqual([3, 0]); // heaviest first
		expect([...buffers.skinWeights.subarray(4, 6)]).toEqual([0.75, 0.25]);
	});

	it('computes morph deltas', () => {
		const submesh = makeMesh().submeshes[0]!;
		const { positions } = submesh.getMorphTarget('Smile')!.offsets(submesh);
		expect([...positions]).toEqual([0, 0, 0, 0, 0, 0, 0.5, 0, 0]);
	});

	it('treats a header-only XML file as an empty mesh', () => {
		const mesh = Mesh.parse('<HEADER MAGIC="XMF" VERSION="910"/>');
		expect(mesh.submeshes).toEqual([]);
		expect(mesh.version).toBe(910);
	});

	it('reads XML the way IMVU writes and loads it', () => {
		const xml = `<?xml version="1.0"?>
			<!-- lowercase tags, no colors (pre-911), LOD elements, a placeholder morph -->
			<header magic="xmf" version="900" />
			<mesh numsubmesh="1">
				<submesh numvertices="2" numfaces="1" numsprings="0" numtexcoords="1" nummorphs="2" material="4">
					<vertex numinfluences="1" id="0">
						<pos>1 2 3</pos><norm>0 0 1</norm>
						<collapseid>-1</collapseid><collapsecount>0</collapsecount>
						<texcoord>0.25 0.75</texcoord>
						<influence id="7">1</influence>
					</vertex>
					<vertex numinfluences="0" id="1">
						<pos>4 5 6</pos><norm>0 1 0</norm><texcoord>1 1</texcoord>
					</vertex>
					<morph name="Placeholder" numblendverts="1" morphid="">
						<blendvertex vertexid="5" posdiff=""><position/><normal/></blendvertex>
					</morph>
					<morph name="Real">
						<blendvertex vertexid="1"><position>4 5 7</position><normal>0 1 0</normal><texcoord>0 0</texcoord></blendvertex>
					</morph>
					<face vertexid="0 1 1"/>
				</submesh>
			</mesh>`;
		const submesh = Mesh.parse(xml).submeshes[0]!;
		expect(submesh.materialId).toBe(4);
		expect(submesh.vertices[0]!.position).toEqual(new Vector3(1, 2, 3));
		expect(submesh.vertices[0]!.color).toEqual(new Color(1, 1, 1, 1)); // white default
		expect(submesh.vertices[0]!.texCoords).toEqual([{ u: 0.25, v: 0.75 }]);
		expect(submesh.vertices[0]!.influences).toEqual([new Influence(7, 1)]);
		expect(submesh.morphTargets.map((morph) => [morph.name, morph.blendVertices.length])).toEqual([
			['Placeholder', 0],
			['Real', 1],
		]);
		expect(submesh.faces).toEqual([[0, 1, 1]]);
	});

	it('requires vertex colors from version 911 on', () => {
		const xml = `<HEADER MAGIC="XMF" VERSION="919"/><MESH><SUBMESH NUMVERTICES="1" NUMTEXCOORDS="0">
			<VERTEX NUMINFLUENCES="0"><POS>0 0 0</POS><NORM>0 0 1</NORM></VERTEX></SUBMESH></MESH>`;
		expect(() => Mesh.parse(xml)).toThrow(/COLOR/);
	});
});

describe('Material', () => {
	it('finds maps by type', () => {
		const material = makeMaterial();
		expect(material.diffuseMap?.filename).toBe('shirt.jpg');
		expect(material.opacityMap?.filename).toBe('shirt_alpha.jpg');
		expect(material.getMap('opacity')).toBe(material.opacityMap);
	});

	it('defaults untyped XML maps to diffuse', () => {
		const material = Material.parse(`<HEADER MAGIC="XRF" VERSION="900" />
			<MATERIAL NUMMAPS="1"><AMBIENT>128 98 98 0</AMBIENT><DIFFUSE>240 184 184 0</DIFFUSE>
			<SPECULAR>229 229 229 0</SPECULAR><SHININESS>0.05</SHININESS><MAP>skin.tga</MAP></MATERIAL>`);
		expect(material.ambient).toEqual(new Color(128, 98, 98, 0));
		expect(material.shininess).toBe(f(0.05));
		expect(material.maps).toEqual([new TextureMap('skin.tga', 'Diffuse Color')]);
	});

	it('reads pre-911 binary materials (maps without types)', () => {
		const out = new BinaryWriter()
			.magic('CRF')
			.int32(700)
			.bytes(new Array(12).fill(0))
			.float32(0)
			.int32(1)
			.string('a.tga');
		expect(Material.parse(out.finish()).maps).toEqual([new TextureMap('a.tga', '')]);
	});
});

describe('Animation', () => {
	it('carries a constant translation forward in XML', () => {
		const xml = makeAnimation().toXml();
		// Track 1 has a constant translation: only its first keyframe stores it.
		const track = parseXml(xml)[1]!.children[1]!;
		expect(track.children.map((keyframe) => keyframe.children.map((child) => child.name))).toEqual([
			['TRANSLATION', 'ROTATION'],
			['ROTATION'],
		]);
		expect(Animation.parse(xml).tracks[1]!.keyframes[1]!.translation).toEqual(new Vector3(f(10.25), 0, 0));
	});

	it('samples between keyframes', () => {
		const track = makeAnimation().tracks[0]!;
		const pose = track.sample(0.5);
		expect(pose.translation!.y).toBeCloseTo(1.25);
		expect(pose.rotation.z).toBeCloseTo(Math.sin(0.25), 5);
		expect(pose.rotation.w).toBeCloseTo(Math.cos(0.25), 5);
		expect(track.sample(-1).translation).toEqual(track.keyframes[0]!.translation);
		expect(track.sample(9).rotation).toEqual(track.keyframes[2]!.rotation);
		expect(makeAnimation().tracks[2]!.sample(1).translation).toBeNull();
	});

	it('round-trips through compressed binary within the encoding precision', () => {
		const original = makeAnimation();
		const bytes = original.toBinary({ compress: true });
		expect(bytes.length).toBeLessThan(original.toBinary().length);
		const parsed = Animation.parse(bytes);
		expect(parsed.compressed).toBe(true);
		expect(parsed.tracks.map((track) => [track.boneId, track.translationRequired, track.translationIsDynamic])).toEqual(
			[
				[0, true, true],
				[1, true, false],
				[3, false, true],
			]
		);
		original.tracks.forEach((track, t) =>
			track.keyframes.forEach((keyframe, k) => {
				const decoded = parsed.tracks[t]!.keyframes[k]!;
				expect(decoded.time).toBeCloseTo(keyframe.time, 5);
				keyframe.rotation.toArray().forEach((value, i) => expect(decoded.rotation.toArray()[i]).toBeCloseTo(value, 3));
				if (keyframe.translation) {
					keyframe.translation
						.toArray()
						.forEach((value, i) => expect(decoded.translation!.toArray()[i]).toBeCloseTo(value, 0));
				} else {
					expect(decoded.translation).toBeNull();
				}
			})
		);
	});

	it('rejects animations compression cannot hold', () => {
		const long = new Animation({
			duration: 60,
			tracks: [new Track({ boneId: 0, keyframes: [new Keyframe(60, null, new Quaternion())] })],
		});
		expect(() => long.toBinary({ compress: true })).toThrow(/time/);
		expect(() => long.toBinary()).not.toThrow();
	});
});

describe('MorphAnimation', () => {
	it('samples weights by morph name', () => {
		const animation = makeMorphAnimation();
		expect(animation.getTrack('Smile')!.sample(0.25)).toBeCloseTo(0.5);
		expect(animation.sample(0.5)).toEqual(new Map([['Smile', 1]]));
	});
});

// ---------------------------------------------------------------- compressed keyframes

describe('compressed keyframes', () => {
	const rotationOnly = { translationRequired: false, highRangeRequired: false, translationIsDynamic: true };
	const lowRange = { translationRequired: true, highRangeRequired: false, translationIsDynamic: true };

	// Hand-assembled bit streams (LSB first), independent of the encoder.
	// Rotation: largest = 3 (w); x, y, z = +0; time = 30 steps at bits 38–47.
	const identityAtOneSecond = [0x03, 0x00, 0x00, 0x00, 0x80, 0x07];
	// Translation: x = +511/511 · 128, y = −511/511 · 128, z = +0, then 2 padding bits.
	const plusMinus128 = [0xff, 0xfd, 0x0f, 0x00];

	it('decodes a hand-built rotation and time', () => {
		const keyframe = decodeKeyframe(Uint8Array.from(identityAtOneSecond), rotationOnly, null);
		expect(keyframe.time).toBe(1);
		expect(keyframe.translation).toBeNull();
		expect(keyframe.rotation).toEqual(new Quaternion(0, 0, 0, 1));
	});

	it('decodes a hand-built low-range translation', () => {
		const keyframe = decodeKeyframe(Uint8Array.from([...plusMinus128, ...identityAtOneSecond]), lowRange, null);
		expect(keyframe.translation).toEqual(new Vector3(128, -128, 0));
	});

	it('encodes to the same bits', () => {
		const keyframe = { time: 1, translation: new Vector3(128, -128, 0), rotation: new Quaternion(0, 0, 0, 1) };
		expect(encodeKeyframe(keyframe, lowRange, true)).toEqual([...plusMinus128, ...identityAtOneSecond]);
		// A negative largest component flips the whole quaternion (same rotation).
		expect(encodeKeyframe({ ...keyframe, rotation: new Quaternion(0, 0, 0, -1) }, rotationOnly, true)).toEqual(
			identityAtOneSecond
		);
	});

	const compressedFile = (version: number, keyframe: number[]) => {
		const out = new BinaryWriter().magic('CAF').int32(version);
		if (version >= 919) out.int32(1);
		out.float32(1).int32(1).bytes([5, 0xa0, 1, 0]).bytes(keyframe); // bone 5: translation, dynamic, low range
		return out.finish();
	};

	it('parses compressed files from 913 (no flag) and 919 (flag)', () => {
		for (const version of [913, 919]) {
			const animation = Animation.parse(compressedFile(version, [...plusMinus128, ...identityAtOneSecond]));
			expect(animation.compressed).toBe(true);
			const track = animation.tracks[0]!;
			expect(track.boneId).toBe(5);
			expect(track.highRangeRequired).toBe(false);
			expect(track.keyframes).toEqual([new Keyframe(1, new Vector3(128, -128, 0), new Quaternion(0, 0, 0, 1))]);
		}
	});

	it('prefers the full-precision copies in 916/917 files', () => {
		const precise = new BinaryWriter()
			.float32(1)
			.float32(2)
			.float32(3)
			.float32(f(0.5))
			.float32(0)
			.float32(0)
			.float32(f(0.5));
		const [x, y, z, ...rotation] = [...new Uint8Array(precise.finish())].reduce<number[][]>(
			(chunks, byte, i) => (i % 4 ? chunks.at(-1)!.push(byte) : chunks.push([byte]), chunks),
			[]
		);
		const v917 = Animation.parse(
			compressedFile(917, [...plusMinus128, ...identityAtOneSecond, ...x!, ...y!, ...z!, ...rotation.flat()])
		);
		expect(v917.tracks[0]!.keyframes[0]!.translation).toEqual(new Vector3(1, 2, 3));
		expect(v917.tracks[0]!.keyframes[0]!.rotation).toEqual(new Quaternion(0.5, 0, 0, 0.5));

		const v916 = Animation.parse(compressedFile(916, [...plusMinus128, ...identityAtOneSecond, ...rotation.flat()]));
		expect(v916.tracks[0]!.keyframes[0]!.translation).toEqual(new Vector3(128, -128, 0));
		expect(v916.tracks[0]!.keyframes[0]!.rotation).toEqual(new Quaternion(0.5, 0, 0, 0.5));
	});
});

// ---------------------------------------------------------------- formats

describe('detect', () => {
	it('identifies binary and XML files and rejects others', () => {
		expect(detect(makeMaterial().toBinary())).toEqual({ kind: 'material', format: 'binary', version: 919 });
		expect(detect('<?xml version="1.0"?>\n<HEADER MAGIC="XPF" VERSION="919"/>')).toEqual({
			kind: 'morphAnimation',
			format: 'xml',
			version: 919,
		});
		expect(detect(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
		expect(detect('<Template></Template>')).toBeNull();
		expect(() => load('<Template></Template>')).toThrow(Cal3DError);
	});

	it('rejects unsupported versions and truncated files', () => {
		const tooNew = new BinaryWriter().magic('CRF').int32(920).finish();
		expect(() => Material.parse(tooNew)).toThrow(/version 920/);
		const truncated = makeMesh().toBinary().subarray(0, 40);
		expect(() => Mesh.parse(truncated)).toThrow(/end of file/);
		expect(() => Skeleton.parse('<HEADER MAGIC="XSF" VERSION="600"/><SKELETON/>')).toThrow(/older/);
	});
});

describe('formatFloat', () => {
	it('prints the shortest text that round-trips the float32', () => {
		expect(formatFloat(f(0.1))).toBe('0.1');
		expect(formatFloat(f(1038.14))).toBe('1038.14');
		expect(formatFloat(1e10)).toBe('10000000000');
		expect(formatFloat(-0)).toBe('0');
		for (const value of [f(Math.PI), f(1 / 3), f(-123.456e-7), f(16777217)]) {
			expect(f(Number(formatFloat(value)))).toBe(value);
		}
	});
});
