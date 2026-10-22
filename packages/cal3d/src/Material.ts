import { Cal3DError } from './errors.js';
import { FileVersion, type Cal3DInput } from './format.js';
import type { BinaryReader } from './io/BinaryReader.js';
import { binaryHeader, expectBody, openFile, xmlDocument, type ParseOptions } from './io/document.js';
import { expectTag, floats } from './io/values.js';
import { parseFloats, parseInts, writeXml, type XmlElement, type XmlNode } from './io/xml.js';
import { Color } from './math.js';

/** Map types IMVU's tools write. Others may appear; `type` is free text. */
export const TextureMapType = {
	Diffuse: 'Diffuse Color',
	Opacity: 'Opacity',
} as const;

/**
 * A texture a material uses. Cal3D does not embed images: `filename` names a file
 * shipped alongside (in an IMVU product, an entry of its `_contents.json`).
 */
export class TextureMap {
	public constructor(
		public filename: string,
		/** What the texture is for, e.g. `'Diffuse Color'` or `'Opacity'` (see {@link TextureMapType}). */
		public type: string = TextureMapType.Diffuse
	) {}
}

export interface MaterialInit {
	ambient?: Color;
	diffuse?: Color;
	specular?: Color;
	shininess?: number;
	maps?: TextureMap[];
}

/**
 * A Cal3D material (`.crf` binary / `.xrf` XML): base colors and texture maps.
 * A mesh's submeshes refer to materials by index (their `materialId`).
 *
 * IMVU's renderer only uses the texture maps — it reads and discards the colors and
 * shininess — but they are kept here as written.
 */
export class Material {
	/** Ambient color, bytes 0–255. */
	public ambient: Color;
	/** Diffuse color, bytes 0–255. */
	public diffuse: Color;
	/** Specular color, bytes 0–255. */
	public specular: Color;
	public shininess: number;
	public readonly maps: TextureMap[];
	/** The version of the file this was parsed from (`undefined` for materials built in code). */
	public version: number | undefined;

	public constructor(init: MaterialInit = {}) {
		this.ambient = init.ambient ?? new Color();
		this.diffuse = init.diffuse ?? new Color();
		this.specular = init.specular ?? new Color();
		this.shininess = init.shininess ?? 0;
		this.maps = init.maps ?? [];
	}

	/** Parse a binary or XML material file. */
	public static parse(input: Cal3DInput, options?: ParseOptions): Material {
		const file = openFile(input, 'material', options);
		const material = file.format === 'binary' ? readBinary(file.reader, file.version) : readXml(file.body);
		material.version = file.version;
		return material;
	}

	/** The first map of a type (case-insensitive), e.g. `getMap('Opacity')`. */
	public getMap(type: string): TextureMap | undefined {
		const wanted = type.toLowerCase();
		return this.maps.find((map) => map.type.toLowerCase() === wanted);
	}

	/** The diffuse texture, if any. */
	public get diffuseMap(): TextureMap | undefined {
		return this.getMap(TextureMapType.Diffuse);
	}

	/** The opacity (alpha mask) texture, if any. */
	public get opacityMap(): TextureMap | undefined {
		return this.getMap(TextureMapType.Opacity);
	}

	public toBinary(): Uint8Array {
		const out = binaryHeader('material');
		for (const color of [this.ambient, this.diffuse, this.specular]) out.bytes(color.toArray().map(toByte));
		out.float32(this.shininess);
		out.int32(this.maps.length);
		for (const map of this.maps) out.string(map.filename).string(map.type);
		return out.finish();
	}

	public toXml(): string {
		const color = (name: string, value: Color): XmlNode => ({ name, text: value.toArray().map(toByte).join(' ') });
		const body: XmlNode = {
			name: 'MATERIAL',
			attributes: { NUMMAPS: this.maps.length },
			children: [
				color('AMBIENT', this.ambient),
				color('DIFFUSE', this.diffuse),
				color('SPECULAR', this.specular),
				{ name: 'SHININESS', text: floats(this.shininess) },
				...this.maps.map((map): XmlNode => ({ name: 'MAP', attributes: { TYPE: map.type }, text: map.filename })),
			],
		};
		return writeXml(xmlDocument('material', body));
	}
}

const toByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

function readBinary(reader: BinaryReader, version: number): Material {
	const color = () => {
		const [r, g, b, a] = reader.bytesOf(4);
		return new Color(r, g, b, a);
	};
	const material = new Material({ ambient: color(), diffuse: color(), specular: color(), shininess: reader.float32() });

	const mapCount = reader.int32();
	if (mapCount < 0) throw new Cal3DError(`Invalid map count ${mapCount}`);
	const hasTypes = version >= FileVersion.MaterialTypes;
	for (let i = 0; i < mapCount; i++) {
		const filename = reader.string();
		material.maps.push(new TextureMap(filename, hasTypes ? reader.string() : ''));
	}
	return material;
}

function readXml(body: XmlElement | undefined): Material {
	const element = expectBody(body, 'MATERIAL');
	const [ambient, diffuse, specular, shininess, ...maps] = element.children;
	expectTag(ambient, 'AMBIENT');
	expectTag(diffuse, 'DIFFUSE');
	expectTag(specular, 'SPECULAR');
	expectTag(shininess, 'SHININESS');

	const color = (node: XmlElement) => {
		const [r, g, b, a] = parseInts(node.text, 4);
		return new Color(r, g, b, a);
	};
	const material = new Material({
		ambient: color(ambient),
		diffuse: color(diffuse),
		specular: color(specular),
		shininess: parseFloats(shininess.text, 1)[0],
	});
	for (const map of maps) {
		expectTag(map, 'MAP');
		material.maps.push(new TextureMap(map.text.trim(), map.attr('TYPE') ?? TextureMapType.Diffuse));
	}
	return material;
}
