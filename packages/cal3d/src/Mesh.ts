import { Cal3DError } from './errors.js';
import { FileVersion, type Cal3DInput } from './format.js';
import type { BinaryReader } from './io/BinaryReader.js';
import type { BinaryWriter } from './io/BinaryWriter.js';
import { binaryHeader, openFile, xmlDocument, type ParseOptions } from './io/document.js';
import { expectTag, floats, readVector, writeVector } from './io/values.js';
import { parseFloats, parseInts, writeXml, type XmlElement, type XmlNode } from './io/xml.js';
import { Color, Vector3 } from './math.js';

/** A `(u, v)` texture coordinate. */
export interface TextureCoordinate {
	u: number;
	v: number;
}

/** A triangle: three indices into its submesh's `vertices`. */
export type Face = [number, number, number];

/** How strongly one bone pulls a vertex. A vertex's weights normally sum to 1. */
export class Influence {
	public constructor(
		/** Index of the bone in the skeleton. */
		public boneId: number,
		public weight: number
	) {}
}

export interface VertexInit {
	position?: Vector3;
	normal?: Vector3;
	color?: Color;
	texCoords?: TextureCoordinate[];
	influences?: Influence[];
}

export class Vertex {
	public position: Vector3;
	public normal: Vector3;
	/** RGB floats 0–1 (`a` is unused). White when the file has no vertex colors. */
	public color: Color;
	/** One entry per texture-coordinate set of the submesh (IMVU meshes have one). */
	public texCoords: TextureCoordinate[];
	public influences: Influence[];

	public constructor(init: VertexInit = {}) {
		this.position = init.position ?? new Vector3();
		this.normal = init.normal ?? new Vector3();
		this.color = init.color ?? new Color(1, 1, 1, 1);
		this.texCoords = init.texCoords ?? [];
		this.influences = init.influences ?? [];
	}
}

/**
 * A vertex as a morph target displaces it. Values are absolute (the vertex's position
 * and normal at full morph weight), as the file stores them; use {@link MorphTarget.offsets}
 * for deltas.
 */
export class BlendVertex {
	public constructor(
		/** Index of the displaced vertex in the submesh. */
		public vertexId: number,
		public position: Vector3,
		public normal: Vector3,
		public texCoords: TextureCoordinate[] = []
	) {}
}

/** A named blend shape (morph) of a submesh; morph animations drive its weight by name. */
export class MorphTarget {
	public constructor(
		public name: string,
		/** Displaced vertices, in ascending `vertexId` order; vertices not listed don't move. */
		public readonly blendVertices: BlendVertex[] = []
	) {}

	/**
	 * Per-vertex position and normal deltas against `submesh`, `vertexCount * 3` long
	 * with zeros for untouched vertices — the layout of three.js relative morph attributes.
	 */
	public offsets(submesh: Submesh): { positions: Float32Array; normals: Float32Array } {
		const positions = new Float32Array(submesh.vertices.length * 3);
		const normals = new Float32Array(submesh.vertices.length * 3);
		for (const blend of this.blendVertices) {
			const vertex = submesh.vertices[blend.vertexId];
			if (!vertex) continue;
			const i = blend.vertexId * 3;
			positions.set(blend.position.subtract(vertex.position).toArray(), i);
			normals.set(blend.normal.subtract(vertex.normal).toArray(), i);
		}
		return { positions, normals };
	}
}

/** Flat typed arrays for a submesh, ready for a GPU buffer (e.g. a three.js `BufferGeometry`). */
export interface SubmeshBuffers {
	/** xyz per vertex. */
	readonly positions: Float32Array;
	/** xyz per vertex. */
	readonly normals: Float32Array;
	/** rgb per vertex. */
	readonly colors: Float32Array;
	/** uv per vertex, one array per texture-coordinate set. */
	readonly texCoords: Float32Array[];
	/** Three per face. */
	readonly indices: Uint32Array;
	/** `maxInfluences` bone ids per vertex (heaviest first; unused slots are 0 with weight 0). */
	readonly skinIndices: Uint16Array;
	/** `maxInfluences` weights per vertex, matching `skinIndices`. */
	readonly skinWeights: Float32Array;
}

export interface SubmeshInit {
	materialId?: number;
	vertices?: Vertex[];
	faces?: Face[];
	morphTargets?: MorphTarget[];
	textureCoordinateCount?: number;
}

/** A part of a mesh drawn with one material. */
export class Submesh {
	/** Index of the material this submesh is drawn with (IMVU: the product's material slot). */
	public materialId: number;
	public readonly vertices: Vertex[];
	public readonly faces: Face[];
	public readonly morphTargets: MorphTarget[];
	/** Texture-coordinate sets per vertex. */
	public textureCoordinateCount: number;

	public constructor(init: SubmeshInit = {}) {
		this.materialId = init.materialId ?? 0;
		this.vertices = init.vertices ?? [];
		this.faces = init.faces ?? [];
		this.morphTargets = init.morphTargets ?? [];
		this.textureCoordinateCount = init.textureCoordinateCount ?? this.vertices[0]?.texCoords.length ?? 0;
	}

	public getMorphTarget(name: string): MorphTarget | undefined {
		return this.morphTargets.find((morph) => morph.name === name);
	}

	/** Ids of every bone that influences this submesh. */
	public get boneIds(): number[] {
		const ids = new Set<number>();
		for (const vertex of this.vertices) for (const influence of vertex.influences) ids.add(influence.boneId);
		return [...ids].sort((a, b) => a - b);
	}

	/** Flatten into typed arrays. Influences beyond `maxInfluences` are dropped (weights are not renormalized). */
	public toBuffers({ maxInfluences = 4 }: { maxInfluences?: number } = {}): SubmeshBuffers {
		const count = this.vertices.length;
		const positions = new Float32Array(count * 3);
		const normals = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		const texCoords = Array.from({ length: this.textureCoordinateCount }, () => new Float32Array(count * 2));
		const skinIndices = new Uint16Array(count * maxInfluences);
		const skinWeights = new Float32Array(count * maxInfluences);

		this.vertices.forEach((vertex, i) => {
			positions.set(vertex.position.toArray(), i * 3);
			normals.set(vertex.normal.toArray(), i * 3);
			colors.set([vertex.color.r, vertex.color.g, vertex.color.b], i * 3);
			texCoords.forEach((set, s) => {
				const uv = vertex.texCoords[s];
				if (uv) set.set([uv.u, uv.v], i * 2);
			});
			const heaviest = [...vertex.influences].sort((a, b) => b.weight - a.weight).slice(0, maxInfluences);
			heaviest.forEach((influence, slot) => {
				skinIndices[i * maxInfluences + slot] = influence.boneId;
				skinWeights[i * maxInfluences + slot] = influence.weight;
			});
		});

		return {
			positions,
			normals,
			colors,
			texCoords,
			indices: Uint32Array.from(this.faces.flat()),
			skinIndices,
			skinWeights,
		};
	}
}

/**
 * A Cal3D mesh (`.cmf` binary / `.xmf` XML): one or more submeshes, each with its own
 * material slot, vertices skinned to a skeleton's bones, and optional morph targets.
 */
export class Mesh {
	public readonly submeshes: Submesh[];
	/** The version of the file this was parsed from (`undefined` for meshes built in code). */
	public version: number | undefined;

	public constructor(submeshes: Submesh[] = []) {
		this.submeshes = submeshes;
	}

	/**
	 * Parse a binary or XML mesh file. An XML file holding only a `<HEADER/>` is an empty
	 * mesh — IMVU creators use that to remove a mesh inherited from a parent product.
	 */
	public static parse(input: Cal3DInput, options?: ParseOptions): Mesh {
		const file = openFile(input, 'mesh', options);
		const mesh = file.format === 'binary' ? readBinary(file.reader, file.version) : readXml(file.body, file.version);
		mesh.version = file.version;
		return mesh;
	}

	public get vertexCount(): number {
		return this.submeshes.reduce((sum, submesh) => sum + submesh.vertices.length, 0);
	}

	public get faceCount(): number {
		return this.submeshes.reduce((sum, submesh) => sum + submesh.faces.length, 0);
	}

	/** Names of all morph targets across submeshes. */
	public get morphNames(): string[] {
		return [...new Set(this.submeshes.flatMap((submesh) => submesh.morphTargets.map((morph) => morph.name)))];
	}

	public toBinary(): Uint8Array {
		const out = binaryHeader('mesh').int32(this.submeshes.length);
		for (const submesh of this.submeshes) writeBinarySubmesh(out, submesh);
		return out.finish();
	}

	public toXml(): string {
		const body: XmlNode = {
			name: 'MESH',
			attributes: { NUMSUBMESH: this.submeshes.length },
			children: this.submeshes.map(xmlSubmesh),
		};
		return writeXml(xmlDocument('mesh', body));
	}
}

// ---------------------------------------------------------------- binary

function readBinary(reader: BinaryReader, version: number): Mesh {
	const count = reader.int32();
	if (count < 0) throw new Cal3DError(`Invalid submesh count ${count}`);
	const mesh = new Mesh();
	for (let i = 0; i < count; i++) mesh.submeshes.push(readBinarySubmesh(reader, version));
	return mesh;
}

function readBinarySubmesh(reader: BinaryReader, version: number): Submesh {
	const hasColors = version >= FileVersion.VertexColors;
	const hasMorphs = version >= FileVersion.MorphTargetsInMeshes;

	const materialId = reader.int32();
	const vertexCount = reader.int32();
	const faceCount = reader.int32();
	reader.int32(); // level-of-detail count: unused by IMVU
	const springCount = reader.int32();
	const texCoordCount = reader.int32();
	const morphCount = hasMorphs ? reader.int32() : 0;
	if (vertexCount < 0 || faceCount < 0 || springCount < 0 || texCoordCount < 0 || morphCount < 0) {
		throw new Cal3DError('Invalid submesh header');
	}

	const submesh = new Submesh({ materialId, textureCoordinateCount: texCoordCount });
	const readUVs = (): TextureCoordinate[] =>
		Array.from({ length: texCoordCount }, () => ({ u: reader.float32(), v: reader.float32() }));

	for (let v = 0; v < vertexCount; v++) {
		const vertex = new Vertex({ position: readVector(reader), normal: readVector(reader) });
		if (hasColors) vertex.color = new Color(reader.float32(), reader.float32(), reader.float32(), 1);
		reader.int32(); // collapse id   } progressive-mesh LOD data,
		reader.int32(); // collapse count } unused by IMVU
		vertex.texCoords = readUVs();
		const influenceCount = reader.int32();
		if (influenceCount < 0) throw new Cal3DError(`Invalid influence count ${influenceCount}`);
		for (let i = 0; i < influenceCount; i++) vertex.influences.push(new Influence(reader.int32(), reader.float32()));
		if (springCount > 0) reader.float32(); // cloth weight
		submesh.vertices.push(vertex);
	}

	// Cloth springs: two vertex ids, spring coefficient, idle length. Unused by IMVU.
	for (let s = 0; s < springCount; s++) reader.bytesOf(16);

	for (let m = 0; m < morphCount; m++) {
		const morph = new MorphTarget(reader.string());
		// Blend vertices are listed by ascending vertex id, ended by an id ≥ the vertex count.
		let nextId = reader.int32();
		for (let v = 0; v < vertexCount; v++) {
			if (v < nextId) continue;
			morph.blendVertices.push(new BlendVertex(v, readVector(reader), readVector(reader), readUVs()));
			nextId = reader.int32();
		}
		submesh.morphTargets.push(morph);
	}

	for (let f = 0; f < faceCount; f++) submesh.faces.push([reader.int32(), reader.int32(), reader.int32()]);
	return submesh;
}

function writeBinarySubmesh(out: BinaryWriter, submesh: Submesh): void {
	const texCoordCount = submesh.textureCoordinateCount;
	const writeUVs = (uvs: TextureCoordinate[]) => {
		for (let s = 0; s < texCoordCount; s++) out.float32(uvs[s]?.u ?? 0).float32(uvs[s]?.v ?? 0);
	};

	out.int32(submesh.materialId);
	out.int32(submesh.vertices.length);
	out.int32(submesh.faces.length);
	out.int32(0); // LOD steps
	out.int32(0); // springs
	out.int32(texCoordCount);
	out.int32(submesh.morphTargets.length);

	for (const vertex of submesh.vertices) {
		writeVector(out, vertex.position);
		writeVector(out, vertex.normal);
		out.float32(vertex.color.r).float32(vertex.color.g).float32(vertex.color.b);
		out.int32(-1).int32(0); // no LOD collapse
		writeUVs(vertex.texCoords);
		out.int32(vertex.influences.length);
		for (const influence of vertex.influences) out.int32(influence.boneId).float32(influence.weight);
	}

	for (const morph of submesh.morphTargets) {
		out.string(morph.name);
		for (const blend of sortedBlendVertices(morph)) {
			out.int32(blend.vertexId);
			writeVector(out, blend.position);
			writeVector(out, blend.normal);
			writeUVs(blend.texCoords);
		}
		out.int32(submesh.vertices.length + 1);
	}

	for (const face of submesh.faces) out.int32(face[0]).int32(face[1]).int32(face[2]);
}

function sortedBlendVertices(morph: MorphTarget): BlendVertex[] {
	return [...morph.blendVertices].sort((a, b) => a.vertexId - b.vertexId);
}

// ---------------------------------------------------------------- XML

function readXml(body: XmlElement | undefined, version: number): Mesh {
	if (!body) return new Mesh();
	if (!body.is('MESH')) throw new Cal3DError(`Expected <MESH> after <HEADER>, got <${body.name}>`);
	const hasColors = version >= FileVersion.VertexColors;

	const mesh = new Mesh();
	for (const node of body.children) {
		if (!node.is('SUBMESH')) continue;
		const texCoordCount = node.int('NUMTEXCOORDS');
		const submesh = new Submesh({ materialId: node.int('MATERIAL'), textureCoordinateCount: texCoordCount });

		for (const child of node.children) {
			if (child.is('VERTEX')) submesh.vertices.push(readXmlVertex(child, texCoordCount, hasColors));
			else if (child.is('MORPH'))
				submesh.morphTargets.push(readXmlMorph(child, texCoordCount, submesh.vertices.length));
			else if (child.is('FACE')) submesh.faces.push(parseInts(child.attr('VERTEXID') ?? '', 3) as Face);
			else if (!child.is('SPRING')) throw new Cal3DError(`Unexpected <${child.name}> in <SUBMESH>`);
		}

		const declared = node.int('NUMVERTICES', submesh.vertices.length);
		if (declared !== submesh.vertices.length) {
			throw new Cal3DError(`<SUBMESH> declares ${declared} vertices but has ${submesh.vertices.length}`);
		}
		mesh.submeshes.push(submesh);
	}
	return mesh;
}

function readXmlVertex(node: XmlElement, texCoordCount: number, colorsRequired: boolean): Vertex {
	const children = [...node.children];
	const take = (name: string): XmlElement => {
		const next = children.shift();
		expectTag(next, name);
		return next;
	};

	const vertex = new Vertex({
		position: Vector3.fromArray(parseFloats(take('POS').text, 3)),
		normal: Vector3.fromArray(parseFloats(take('NORM').text, 3)),
	});
	if (children[0]?.is('COLOR')) {
		const [r, g, b] = parseFloats(take('COLOR').text, 3);
		vertex.color = new Color(r, g, b, 1);
	} else if (colorsRequired) {
		throw new Cal3DError('<VERTEX> lacks <COLOR>');
	}
	if (children[0]?.is('COLLAPSEID')) {
		take('COLLAPSEID');
		take('COLLAPSECOUNT');
	}
	for (let s = 0; s < texCoordCount; s++) {
		const [u, v] = parseFloats(take('TEXCOORD').text, 2);
		vertex.texCoords.push({ u: u!, v: v! });
	}
	const influenceCount = node.int('NUMINFLUENCES');
	if (influenceCount < 0) throw new Cal3DError(`Invalid NUMINFLUENCES ${influenceCount}`);
	for (let i = 0; i < influenceCount; i++) {
		const influence = take('INFLUENCE');
		vertex.influences.push(new Influence(influence.int('ID'), parseFloats(influence.text, 1)[0]!));
	}
	return vertex;
}

/**
 * Like IMVU's loader, walk the vertex ids in order and consume a `<BLENDVERTEX>` only
 * when its `VERTEXID` is the next one. Blend vertices out of order or out of range are
 * ignored, along with everything after them — real files contain such placeholders
 * (e.g. `VERTEXID` one past the end with empty `<POSITION/>`), and they must not fail.
 */
function readXmlMorph(node: XmlElement, texCoordCount: number, vertexCount: number): MorphTarget {
	const morph = new MorphTarget(node.attr('NAME') ?? '');
	let next = 0;
	for (let v = 0; v < vertexCount; v++) {
		const blend = node.children[next];
		if (!blend || !blend.is('BLENDVERTEX') || blend.int('VERTEXID') !== v) continue;
		next++;
		const [position, normal, ...uvs] = blend.children;
		expectTag(position, 'POSITION');
		expectTag(normal, 'NORMAL');
		const texCoords: TextureCoordinate[] = [];
		for (let s = 0; s < texCoordCount; s++) {
			expectTag(uvs[s], 'TEXCOORD');
			const [u, v] = parseFloats(uvs[s]!.text, 2);
			texCoords.push({ u: u!, v: v! });
		}
		morph.blendVertices.push(
			new BlendVertex(
				v,
				Vector3.fromArray(parseFloats(position.text, 3)),
				Vector3.fromArray(parseFloats(normal.text, 3)),
				texCoords
			)
		);
	}
	return morph;
}

function xmlSubmesh(submesh: Submesh): XmlNode {
	const texCoordCount = submesh.textureCoordinateCount;
	const uvNodes = (uvs: TextureCoordinate[]): XmlNode[] =>
		Array.from({ length: texCoordCount }, (_, s) => ({
			name: 'TEXCOORD',
			text: floats(uvs[s]?.u ?? 0, uvs[s]?.v ?? 0),
		}));

	const vertices = submesh.vertices.map(
		(vertex, id): XmlNode => ({
			name: 'VERTEX',
			attributes: { ID: id, NUMINFLUENCES: vertex.influences.length },
			children: [
				{ name: 'POS', text: floats(...vertex.position.toArray()) },
				{ name: 'NORM', text: floats(...vertex.normal.toArray()) },
				{ name: 'COLOR', text: floats(vertex.color.r, vertex.color.g, vertex.color.b) },
				...uvNodes(vertex.texCoords),
				...vertex.influences.map(
					(influence): XmlNode => ({
						name: 'INFLUENCE',
						attributes: { ID: influence.boneId },
						text: floats(influence.weight),
					})
				),
			],
		})
	);

	const morphs = submesh.morphTargets.map(
		(morph, id): XmlNode => ({
			name: 'MORPH',
			attributes: { MORPHID: id, NAME: morph.name, NUMBLENDVERTS: morph.blendVertices.length },
			children: sortedBlendVertices(morph).map((blend): XmlNode => {
				const base = submesh.vertices[blend.vertexId];
				return {
					name: 'BLENDVERTEX',
					attributes: {
						VERTEXID: blend.vertexId,
						POSDIFF: floats(base ? blend.position.subtract(base.position).length : 0),
					},
					children: [
						{ name: 'POSITION', text: floats(...blend.position.toArray()) },
						{ name: 'NORMAL', text: floats(...blend.normal.toArray()) },
						...uvNodes(blend.texCoords),
					],
				};
			}),
		})
	);

	const faces = submesh.faces.map((face): XmlNode => ({ name: 'FACE', attributes: { VERTEXID: face.join(' ') } }));

	return {
		name: 'SUBMESH',
		attributes: {
			NUMVERTICES: submesh.vertices.length,
			NUMFACES: submesh.faces.length,
			NUMLODSTEPS: 0,
			NUMSPRINGS: 0,
			NUMMORPHS: submesh.morphTargets.length,
			NUMTEXCOORDS: texCoordCount,
			MATERIAL: submesh.materialId,
		},
		children: [...vertices, ...morphs, ...faces],
	};
}
