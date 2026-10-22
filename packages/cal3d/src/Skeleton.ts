import { Cal3DError } from './errors.js';
import { FileVersion, type Cal3DInput } from './format.js';
import type { BinaryReader } from './io/BinaryReader.js';
import { binaryHeader, expectBody, openFile, xmlDocument, type ParseOptions } from './io/document.js';
import { expectTag, floats, readQuaternion, readVector, writeQuaternion, writeVector } from './io/values.js';
import { parseFloats, parseIntLoose, writeXml, type XmlElement, type XmlNode } from './io/xml.js';
import { Color, Quaternion, Vector3 } from './math.js';

/** Bones can double as scene lights (IMVU rooms use this for lighting). */
export const LightType = {
	None: 0,
	Omni: 1,
	Directional: 2,
	Target: 3,
	Ambient: 4,
} as const;
export type LightType = (typeof LightType)[keyof typeof LightType];

export interface BoneInit {
	name: string;
	/** Index of the parent bone, or `-1` for a root. */
	parentId?: number;
	translation?: Vector3;
	rotation?: Quaternion;
	localTranslation?: Vector3;
	localRotation?: Quaternion;
	lightType?: number;
	lightColor?: Color;
}

/**
 * One bone (node) of a {@link Skeleton}.
 *
 * `translation`/`rotation` place the bone relative to its parent (the bind pose);
 * `localTranslation`/`localRotation` are the inverse bind pose — the transform from
 * model space into this bone's space, which skinning applies before the bone's
 * animated world transform.
 */
export class Bone {
	public name: string;
	public parentId: number;
	public translation: Vector3;
	public rotation: Quaternion;
	public localTranslation: Vector3;
	public localRotation: Quaternion;
	/** A {@link LightType}; anything but `None` makes this bone a light. */
	public lightType: number;
	/** Light color as RGB floats (`a` is unused). */
	public lightColor: Color;

	/** @internal Set by the owning skeleton. */
	public skeleton: Skeleton | null = null;

	public constructor(init: BoneInit) {
		this.name = init.name;
		this.parentId = init.parentId ?? -1;
		this.translation = init.translation ?? new Vector3();
		this.rotation = init.rotation ?? new Quaternion();
		this.localTranslation = init.localTranslation ?? new Vector3();
		this.localRotation = init.localRotation ?? new Quaternion();
		this.lightType = init.lightType ?? LightType.None;
		this.lightColor = init.lightColor ?? new Color(0, 0, 0, 1);
	}

	/** This bone's index in its skeleton (what meshes and animations refer to), or `-1` if detached. */
	public get id(): number {
		return this.skeleton ? this.skeleton.bones.indexOf(this) : -1;
	}

	public get parent(): Bone | null {
		return this.skeleton?.bones[this.parentId] ?? null;
	}

	public get children(): Bone[] {
		const id = this.id;
		return id === -1 ? [] : this.skeleton!.bones.filter((bone) => bone.parentId === id);
	}

	public get isRoot(): boolean {
		return this.parentId < 0;
	}

	public get isLight(): boolean {
		return this.lightType !== LightType.None;
	}
}

export interface SkeletonInit {
	bones?: Bone[];
	sceneAmbientColor?: Color;
}

/** A Cal3D skeleton (`.csf` binary / `.xsf` XML): a flat list of bones linked by parent index. */
export class Skeleton {
	public readonly bones: Bone[] = [];
	/** Scene ambient light as RGB floats (`a` is unused). IMVU rooms set it; avatars leave it black. */
	public sceneAmbientColor: Color;
	/** The version of the file this was parsed from (`undefined` for skeletons built in code). */
	public version: number | undefined;

	public constructor(init: SkeletonInit = {}) {
		this.sceneAmbientColor = init.sceneAmbientColor ?? new Color(0, 0, 0, 1);
		for (const bone of init.bones ?? []) this.addBone(bone);
	}

	/** Parse a binary or XML skeleton file. */
	public static parse(input: Cal3DInput, options?: ParseOptions): Skeleton {
		const file = openFile(input, 'skeleton', options);
		const skeleton = file.format === 'binary' ? readBinary(file.reader, file.version) : readXml(file.body);
		skeleton.version = file.version;
		return skeleton;
	}

	/** Append a bone (its id becomes the next index) and return it. */
	public addBone(bone: Bone): Bone {
		if (bone.skeleton && bone.skeleton !== this)
			throw new Cal3DError(`Bone "${bone.name}" already belongs to a skeleton`);
		bone.skeleton = this;
		this.bones.push(bone);
		return bone;
	}

	public getBone(idOrName: number | string): Bone | undefined {
		return typeof idOrName === 'number' ? this.bones[idOrName] : this.bones.find((bone) => bone.name === idOrName);
	}

	/** Bones without a parent. */
	public get roots(): Bone[] {
		return this.bones.filter((bone) => bone.isRoot);
	}

	/** Bones that act as scene lights. */
	public get lights(): Bone[] {
		return this.bones.filter((bone) => bone.isLight);
	}

	/** Depth-first walk from the roots, parents before children. */
	public *walk(): Generator<{ bone: Bone; depth: number }> {
		const visit = function* (bone: Bone, depth: number): Generator<{ bone: Bone; depth: number }> {
			yield { bone, depth };
			for (const child of bone.children) yield* visit(child, depth + 1);
		};
		for (const root of this.roots) yield* visit(root, 0);
	}

	public toBinary(): Uint8Array {
		const out = binaryHeader('skeleton').int32(this.bones.length);
		out.float32(this.sceneAmbientColor.r).float32(this.sceneAmbientColor.g).float32(this.sceneAmbientColor.b);
		for (const bone of this.bones) {
			out.string(bone.name);
			writeVector(out, bone.translation);
			writeQuaternion(out, bone.rotation);
			writeVector(out, bone.localTranslation);
			writeQuaternion(out, bone.localRotation);
			out.int32(bone.parentId);
			out.int32(bone.lightType);
			out.float32(bone.lightColor.r).float32(bone.lightColor.g).float32(bone.lightColor.b);
			const children = bone.children;
			out.int32(children.length);
			for (const child of children) out.int32(child.id);
		}
		return out.finish();
	}

	public toXml(): string {
		const ambient = this.sceneAmbientColor;
		const body: XmlNode = {
			name: 'SKELETON',
			attributes: {
				NUMBONES: this.bones.length,
				SCENEAMBIENTCOLOR: floats(ambient.r, ambient.g, ambient.b),
			},
			children: this.bones.map((bone, id): XmlNode => {
				const attributes: Record<string, string | number> = { ID: id, NAME: bone.name };
				if (bone.isLight) {
					attributes.LIGHTTYPE = bone.lightType;
					attributes.LIGHTCOLOR = floats(bone.lightColor.r, bone.lightColor.g, bone.lightColor.b);
				}
				return {
					name: 'BONE',
					attributes,
					children: [
						{ name: 'TRANSLATION', text: floats(...bone.translation.toArray()) },
						{ name: 'ROTATION', text: floats(...bone.rotation.toArray()) },
						{ name: 'LOCALTRANSLATION', text: floats(...bone.localTranslation.toArray()) },
						{ name: 'LOCALROTATION', text: floats(...bone.localRotation.toArray()) },
						{ name: 'PARENTID', text: String(bone.parentId) },
						...bone.children.map((child): XmlNode => ({ name: 'CHILDID', text: String(child.id) })),
					],
				};
			}),
		};
		return writeXml(xmlDocument('skeleton', body));
	}
}

// ---------------------------------------------------------------- binary

function readBinary(reader: BinaryReader, version: number): Skeleton {
	const hasLights = version >= FileVersion.NodeLights;
	const boneCount = reader.int32();
	if (boneCount < 0) throw new Cal3DError(`Invalid bone count ${boneCount}`);

	const skeleton = new Skeleton();
	if (hasLights) skeleton.sceneAmbientColor = new Color(reader.float32(), reader.float32(), reader.float32(), 1);

	for (let i = 0; i < boneCount; i++) {
		const bone = new Bone({
			name: reader.string(),
			translation: readVector(reader),
			rotation: readQuaternion(reader),
			localTranslation: readVector(reader),
			localRotation: readQuaternion(reader),
			parentId: reader.int32(),
		});
		if (hasLights) {
			bone.lightType = reader.int32();
			bone.lightColor = new Color(reader.float32(), reader.float32(), reader.float32(), 1);
		}
		// Child ids are redundant with parent ids; IMVU's loader validates and drops them too.
		const childCount = reader.int32();
		if (childCount < 0) throw new Cal3DError(`Invalid child count ${childCount} on bone "${bone.name}"`);
		for (let c = 0; c < childCount; c++) {
			if (reader.int32() < 0) throw new Cal3DError(`Invalid child id on bone "${bone.name}"`);
		}
		skeleton.addBone(bone);
	}
	return skeleton;
}

// ---------------------------------------------------------------- XML

function readXml(body: XmlElement | undefined): Skeleton {
	const element = expectBody(body, 'SKELETON');
	const ambient = parseFloats(element.attr('SCENEAMBIENTCOLOR') ?? '', 3);
	const skeleton = new Skeleton({ sceneAmbientColor: new Color(ambient[0], ambient[1], ambient[2], 1) });

	for (const node of element.children) {
		if (!node.is('BONE')) throw new Cal3DError(`Unexpected <${node.name}> in <SKELETON>`);
		const [translation, rotation, localTranslation, localRotation, parent, ...rest] = node.children;
		expectTag(translation, 'TRANSLATION');
		expectTag(rotation, 'ROTATION');
		expectTag(localTranslation, 'LOCALTRANSLATION');
		expectTag(localRotation, 'LOCALROTATION');
		expectTag(parent, 'PARENTID');
		for (const child of rest) expectTag(child, 'CHILDID');

		const color = parseFloats(node.attr('LIGHTCOLOR') ?? '', 3);
		skeleton.addBone(
			new Bone({
				name: node.attr('NAME') ?? '',
				translation: Vector3.fromArray(parseFloats(translation.text, 3)),
				rotation: Quaternion.fromArray(parseFloats(rotation.text, 4)),
				localTranslation: Vector3.fromArray(parseFloats(localTranslation.text, 3)),
				localRotation: Quaternion.fromArray(parseFloats(localRotation.text, 4)),
				parentId: parseIntLoose(parent.text),
				lightType: node.int('LIGHTTYPE', LightType.None),
				lightColor: new Color(color[0], color[1], color[2], 1),
			})
		);
	}
	return skeleton;
}
