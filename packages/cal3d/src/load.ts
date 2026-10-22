import { Animation } from './Animation.js';
import { Cal3DError } from './errors.js';
import { detect, type Cal3DInput, type FileKind } from './format.js';
import { Material } from './Material.js';
import { Mesh } from './Mesh.js';
import { MorphAnimation } from './MorphAnimation.js';
import { Skeleton } from './Skeleton.js';

export type Cal3DFile =
	| { readonly kind: 'skeleton'; readonly value: Skeleton }
	| { readonly kind: 'mesh'; readonly value: Mesh }
	| { readonly kind: 'material'; readonly value: Material }
	| { readonly kind: 'animation'; readonly value: Animation }
	| { readonly kind: 'morphAnimation'; readonly value: MorphAnimation };

/**
 * Parse any Cal3D file, binary or XML, identifying its kind from its contents.
 *
 * ```ts
 * const file = load(bytes);
 * if (file.kind === 'mesh') console.log(file.value.submeshes.length);
 * ```
 */
export function load(input: Cal3DInput): Cal3DFile {
	const detected = detect(input);
	if (!detected) throw new Cal3DError('Not a Cal3D file');
	const options = { format: detected.format };
	switch (detected.kind satisfies FileKind) {
		case 'skeleton':
			return { kind: 'skeleton', value: Skeleton.parse(input, options) };
		case 'mesh':
			return { kind: 'mesh', value: Mesh.parse(input, options) };
		case 'material':
			return { kind: 'material', value: Material.parse(input, options) };
		case 'animation':
			return { kind: 'animation', value: Animation.parse(input, options) };
		case 'morphAnimation':
			return { kind: 'morphAnimation', value: MorphAnimation.parse(input, options) };
	}
}
