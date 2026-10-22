/**
 * A typed view of an expanded product template (the `Template` dictionary after
 * inheritance), following the classic client's `ProductDescription` accessors.
 *
 * Specs are returned with their raw template dictionary (`raw`) so every setting
 * IMVU defines stays reachable; the commonly needed fields are lifted out.
 */
import type { TemplateDict, TemplateValue } from './template.js';

const isDict = (value: TemplateValue | undefined): value is TemplateDict => typeof value === 'object' && value !== null;

/** A mesh slot: which `.xmf` fills which body part / mesh index. */
export interface MeshSpec {
	readonly index: number;
	/** The mesh file name, e.g. `Room.MESH.xmf`. */
	readonly asset: string | undefined;
	readonly raw: TemplateDict;
}

/** A material slot (`TextureMapN`): which `.xrf` a submesh with this `materialId` uses, plus render settings. */
export interface MaterialSpec {
	/** Matches `Submesh.materialId` in the mesh. */
	readonly index: number;
	/** The material file name, e.g. `Room.MAT[0].xrf`. */
	readonly asset: string | undefined;
	readonly raw: TemplateDict;
}

/** One body part of a body-pattern product (`BodyPatternDef/BodyPartN`), or of an old clothing product. */
export interface BodyPartSpec {
	readonly id: number;
	readonly mesh: TemplateDict | undefined;
	readonly material: TemplateDict | undefined;
	readonly raw: TemplateDict;
}

/** A Cal3D animation an ensemble plays (`SkeletalAnimationEffectN` / `MorphAnimationEffectN`). */
export interface AnimationEffectSpec {
	/** The `.xaf`/`.xpf` file name. */
	readonly asset: string | undefined;
	readonly raw: TemplateDict;
}

export interface EnsembleSpec {
	readonly skeletalAnimations: AnimationEffectSpec[];
	readonly morphAnimations: AnimationEffectSpec[];
	readonly raw: TemplateDict;
}

/** A named action (`ActionN`) — e.g. a pose or a furniture interaction. */
export interface ActionSpec {
	readonly name: string | undefined;
	/** `Avatar`, `Room`, …, when the template says. */
	readonly type: string | undefined;
	readonly ensembles: EnsembleSpec[];
	readonly raw: TemplateDict;
}

/** Values of keys starting with `prefix`, in key order (the client's `valuesStartingWithKey`). */
export function valuesStartingWith(dict: TemplateValue | undefined, prefix: string): TemplateValue[] {
	if (!isDict(dict)) return [];
	return Object.keys(dict)
		.filter((key) => key.startsWith(prefix))
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
		.map((key) => dict[key]!);
}

/** Values of `{prefix}{n}` keys, by ascending `n` (the client's `numericallySortedValuesStartingWithKey`). */
export function numberedValues(dict: TemplateValue | undefined, prefix: string): TemplateValue[] {
	if (!isDict(dict)) return [];
	return Object.keys(dict)
		.filter((key) => key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)))
		.map((key) => [Number(key.slice(prefix.length)), dict[key]!] as const)
		.sort((a, b) => a[0] - b[0])
		.map(([, value]) => value);
}

/** Python-style `int()` of template text: an optionally signed decimal, surrounding whitespace allowed. */
export function toInt(value: TemplateValue | undefined): number | undefined {
	if (typeof value !== 'string' || !/^\s*[+-]?\d+\s*$/.test(value)) return undefined;
	return Number.parseInt(value, 10);
}

/** Template text as a number (`'0.5'` → 0.5), or `undefined`. */
export function toNumber(value: TemplateValue | undefined): number | undefined {
	if (typeof value !== 'string' || value.trim() === '') return undefined;
	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
}

const text = (value: TemplateValue | undefined): string | undefined => (typeof value === 'string' ? value : undefined);

export class ProductDefinition {
	/** @param template The expanded `Template` dictionary. */
	public constructor(public readonly template: TemplateDict) {}

	/** A top-level text property, e.g. `property('ProductName')`. */
	public property(name: string): string | undefined {
		return text(this.template[name]);
	}

	public get name(): string {
		return this.property('ProductName') ?? '';
	}

	/** The product type name (`Avatar Clothing`, `Room`, `Room Attachment`, …), defaulting like the client does. */
	public get productType(): string {
		const info = this.template.product_info;
		return (isDict(info) ? text(info.product_type) : undefined) || this.property('ProductType') || 'Avatar Clothing';
	}

	public get productTypeId(): number | undefined {
		return toInt(this.template.ProductTypeID);
	}

	/** The bone an attachment is attached to (e.g. `Neck03`), or `''`. */
	public get attachmentNodeName(): string {
		return this.property('AttachmentNodeName') ?? '';
	}

	/** Whether the product was made with IMVU's creator tools (it records a `CreatorVersion`). */
	public get isStudioProduct(): boolean {
		return (this.property('CreatorVersion') ?? '').length > 0;
	}

	public get isBodyPattern(): boolean {
		return 'BodyPatternDef' in this.template;
	}

	/**
	 * The scene ambient color as bytes from `<SceneAmbient>r g b</SceneAmbient>`, or
	 * `undefined` (the client then falls back to the skeleton's ambient color).
	 */
	public get sceneAmbient(): [number, number, number] | undefined {
		const parts = this.property('SceneAmbient')?.trim().split(/\s+/);
		if (!parts || parts.length !== 3 || parts.some((part) => toInt(part) === undefined)) return undefined;
		return parts.map((part) => Math.min(255, Math.max(0, toInt(part)!))) as [number, number, number];
	}

	/** The skeleton file name. */
	public get skeletonAsset(): string | undefined {
		const skeleton = this.template.Skeleton;
		return isDict(skeleton) ? text(skeleton.Asset) : undefined;
	}

	/** Body parts by id: from `BodyPatternDef`, or synthesized from top-level meshes for older clothing. */
	public get bodyParts(): Map<number, BodyPartSpec> {
		const result = new Map<number, BodyPartSpec>();
		const specs = valuesStartingWith(this.template.BodyPatternDef, 'BodyPart').filter(isDict);
		if (specs.length > 0) {
			for (const spec of specs) {
				const id = toInt(spec.BodyPartId);
				if (id === undefined) continue;
				result.set(id, {
					id,
					mesh: isDict(spec.Mesh) ? spec.Mesh : undefined,
					material: isDict(spec.Material) ? spec.Material : undefined,
					raw: spec,
				});
			}
			return result;
		}

		// Older clothing: top-level MeshN + one shared Material, body parts from BodyPartIdN.
		const bodyPartIds = this.#declaredBodyPartIds();
		const defaultIndex = bodyPartIds[0] ?? 0;
		const material = isDict(this.template.Material) ? this.template.Material : undefined;
		for (const mesh of this.#topLevelMeshes()) {
			const id = toInt(mesh.Index) ?? defaultIndex;
			result.set(id, { id, mesh, material, raw: mesh });
		}
		for (const id of bodyPartIds) {
			if (!result.has(id)) result.set(id, { id, mesh: undefined, material: undefined, raw: {} as TemplateDict });
		}
		return result;
	}

	/** Mesh slots by index (= body part id), body-pattern meshes first, then top-level `MeshN`. */
	public get meshes(): Map<number, MeshSpec> {
		const result = new Map<number, MeshSpec>();
		for (const [id, part] of this.bodyParts) {
			if (part.mesh) result.set(id, { index: id, asset: text(part.mesh.Asset), raw: part.mesh });
		}
		const fallbackIndex = this.#declaredBodyPartIds()[0] ?? [...this.bodyParts.keys()][0] ?? 0;
		for (const mesh of this.#topLevelMeshes()) {
			const index = toInt(mesh.Index) ?? fallbackIndex;
			if (!result.has(index)) result.set(index, { index, asset: text(mesh.Asset), raw: mesh });
		}
		return result;
	}

	/**
	 * Material slots for a body part, keyed by material index (`Index`, else position):
	 * the top-level `Material` when it has entries, else the body part's own.
	 */
	public materialsFor(bodyPartId: number): Map<number, MaterialSpec> {
		const top = this.template.Material;
		const source = isDict(top) && Object.keys(top).length > 0 ? top : this.bodyParts.get(bodyPartId)?.material;
		const result = new Map<number, MaterialSpec>();
		valuesStartingWith(source, 'TextureMap').forEach((spec, position) => {
			if (!isDict(spec) || Object.keys(spec).length === 0) return;
			const index = spec.Index === undefined ? position : toInt(spec.Index);
			if (index === undefined) return;
			result.set(index, { index, asset: text(spec.Asset), raw: spec });
		});
		return result;
	}

	/** Embedded actions (`ActionN`), in numeric order. */
	public get actions(): ActionSpec[] {
		return numberedValues(this.template, 'Action')
			.filter(isDict)
			.map((spec): ActionSpec => {
				const definition = isDict(spec.Definition) ? spec.Definition : undefined;
				const actionDefinition =
					definition && isDict(definition.ActionDefinition) ? definition.ActionDefinition : undefined;
				return {
					name: text(spec.Name),
					type: definition ? text(definition.ActionType) : undefined,
					ensembles: numberedValues(actionDefinition, 'EnsembleDefinition').filter(isDict).map(ensemble),
					raw: spec,
				};
			});
	}

	#topLevelMeshes(): TemplateDict[] {
		return valuesStartingWith(this.template, 'Mesh').filter(isDict);
	}

	#declaredBodyPartIds(): number[] {
		return valuesStartingWith(this.template, 'BodyPartId')
			.map(toInt)
			.filter((id): id is number => id !== undefined);
	}
}

function ensemble(spec: TemplateDict): EnsembleSpec {
	const effects = (prefix: string) =>
		numberedValues(spec, prefix)
			.filter(isDict)
			.map((effect): AnimationEffectSpec => ({ asset: text(effect.AssetName), raw: effect }));
	return {
		skeletalAnimations: effects('SkeletalAnimationEffect'),
		morphAnimations: effects('MorphAnimationEffect'),
		raw: spec,
	};
}
