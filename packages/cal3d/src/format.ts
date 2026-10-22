/**
 * File-level constants of the Cal3D formats, as IMVU's fork defines them
 * (github.com/imvu/cal3d, `global.h` / `xmlformat.h`).
 *
 * Every kind of file exists in a binary and an XML flavor. The binary magic is
 * four bytes (`CSF\0`, …); the XML flavor starts with `<HEADER MAGIC="XSF" VERSION="…"/>`.
 * IMVU's CDN serves both under the XML extensions (`.xsf`, `.xmf`, …), so the
 * extension says nothing about which flavor a file is — sniff it with {@link detect}.
 */
import { decodeText } from './io/text.js';

export type FileKind = 'skeleton' | 'mesh' | 'material' | 'animation' | 'morphAnimation';
export type FileFormat = 'binary' | 'xml';

/** Accepted input: raw file bytes, or XML text. */
export type Cal3DInput = Uint8Array | ArrayBuffer | string;

interface KindInfo {
	readonly binaryMagic: string;
	readonly xmlMagic: string;
}

export const FILE_KINDS: Readonly<Record<FileKind, KindInfo>> = {
	skeleton: { binaryMagic: 'CSF', xmlMagic: 'XSF' },
	mesh: { binaryMagic: 'CMF', xmlMagic: 'XMF' },
	material: { binaryMagic: 'CRF', xmlMagic: 'XRF' },
	animation: { binaryMagic: 'CAF', xmlMagic: 'XAF' },
	morphAnimation: { binaryMagic: 'CPF', xmlMagic: 'XPF' },
};

/** The version this library writes (IMVU's `LIBRARY_VERSION`). */
export const CURRENT_FILE_VERSION = 919;
/** The oldest version IMVU's loader accepts. */
export const EARLIEST_COMPATIBLE_FILE_VERSION = 699;

/** Version gates: a file of at least this version carries the feature. */
export const FileVersion = {
	/** Vertex colors in meshes, light data in skeletons, map types in materials, morph targets in meshes. */
	VertexColors: 911,
	NodeLights: 911,
	MaterialTypes: 911,
	MorphTargetsInMeshes: 911,
	/** Binary animations are keyframe-compressed from here on… */
	AnimationCompression: 913,
	/** …913–915 compressed files carry only the compressed data, 916 adds a full-precision rotation, */
	AnimationCompression4: 916,
	/** 917 adds a full-precision translation as well, */
	AnimationCompression5: 917,
	/** and 918 drops both again. */
	AnimationCompression6: 918,
	/** 919 adds an explicit compression flag, so compression became optional. */
	CompressionFlag: 919,
} as const;

export interface Detected {
	readonly kind: FileKind;
	readonly format: FileFormat;
	readonly version: number;
}

/** Identify a Cal3D file from its contents, or return `null` when it is not one. */
export function detect(input: Cal3DInput): Detected | null {
	if (typeof input !== 'string') {
		const bytes = toBytes(input);
		if (bytes.length >= 8 && bytes[3] === 0) {
			const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);
			const kind = kindFromMagic(magic, 'binaryMagic');
			if (kind) {
				const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(4, true);
				return { kind, format: 'binary', version };
			}
		}
	}

	const text = typeof input === 'string' ? input : decodeText(toBytes(input).subarray(0, 512));
	const header = /<\s*header\b([^>]*)>/i.exec(text);
	if (!header) return null;
	const magic = /\bmagic\s*=\s*["']([^"']*)["']/i.exec(header[1]!)?.[1]?.toUpperCase();
	const kind = magic ? kindFromMagic(magic, 'xmlMagic') : null;
	if (!kind) return null;
	const version = Number.parseInt(/\bversion\s*=\s*["']([^"']*)["']/i.exec(header[1]!)?.[1] ?? '', 10);
	return { kind, format: 'xml', version: Number.isNaN(version) ? 0 : version };
}

function kindFromMagic(magic: string, field: keyof KindInfo): FileKind | null {
	for (const [kind, info] of Object.entries(FILE_KINDS) as [FileKind, KindInfo][]) {
		if (info[field] === magic) return kind;
	}
	return null;
}

export function toBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
	return input instanceof Uint8Array ? input : new Uint8Array(input);
}
