import {
	compressedKeyframeSize,
	decodeKeyframe,
	encodeKeyframe,
	HIGH_RANGE_LIMIT,
	LOW_RANGE_LIMIT,
	type DecodedKeyframe,
	type TrackFlags,
} from './compression.js';
import { Cal3DError } from './errors.js';
import { FileVersion, type Cal3DInput } from './format.js';
import type { BinaryReader } from './io/BinaryReader.js';
import { binaryHeader, expectBody, openFile, xmlDocument, type ParseOptions } from './io/document.js';
import { floats, readQuaternion, readVector, writeQuaternion, writeVector } from './io/values.js';
import { parseFloats, writeXml, type XmlElement, type XmlNode } from './io/xml.js';
import { Quaternion, Vector3 } from './math.js';
import type { Bone, Skeleton } from './Skeleton.js';

/** IMVU's marker for "no translation" in uncompressed binary keyframes. */
const INVALID_COORD = Math.fround(1e10);

export class Keyframe {
	public constructor(
		/** Seconds from the start of the animation. */
		public time: number,
		/** The bone's translation relative to its parent, or `null` to keep the skeleton's. */
		public translation: Vector3 | null,
		/** The bone's rotation relative to its parent (file convention, see {@link Quaternion}). */
		public rotation: Quaternion
	) {}
}

export interface TrackInit {
	boneId: number;
	keyframes?: Keyframe[];
	translationRequired?: boolean;
	translationIsDynamic?: boolean;
	highRangeRequired?: boolean;
}

/** The keyframes animating one bone. */
export class Track {
	/** Index of the animated bone in the skeleton. */
	public boneId: number;
	public readonly keyframes: Keyframe[];
	/** Whether keyframes carry translations (otherwise only the rotation is animated). */
	public translationRequired: boolean;
	/** Whether the translation changes between keyframes (otherwise only the first one stores it). */
	public translationIsDynamic: boolean;
	/** Whether compressed translations need the ±2²³ range rather than ±128. */
	public highRangeRequired: boolean;

	public constructor(init: TrackInit) {
		this.boneId = init.boneId;
		this.keyframes = init.keyframes ?? [];
		this.translationRequired = init.translationRequired ?? true;
		this.translationIsDynamic = init.translationIsDynamic ?? true;
		this.highRangeRequired = init.highRangeRequired ?? true;
	}

	public getBone(skeleton: Skeleton): Bone | undefined {
		return skeleton.getBone(this.boneId);
	}

	/**
	 * The pose at `time`, interpolated between the surrounding keyframes (linear
	 * translation, spherical rotation) and clamped to the first/last keyframe.
	 */
	public sample(time: number): { translation: Vector3 | null; rotation: Quaternion } {
		const frames = this.keyframes;
		if (frames.length === 0) throw new Cal3DError(`Track for bone ${this.boneId} has no keyframes`);
		const nextIndex = frames.findIndex((frame) => frame.time >= time);
		if (nextIndex === 0) return pose(frames[0]!);
		if (nextIndex === -1) return pose(frames.at(-1)!);

		const a = frames[nextIndex - 1]!;
		const b = frames[nextIndex]!;
		const t = b.time === a.time ? 0 : (time - a.time) / (b.time - a.time);
		return {
			translation:
				a.translation && b.translation ? lerp(a.translation, b.translation, t) : (a.translation?.clone() ?? null),
			rotation: slerp(a.rotation, b.rotation, t),
		};
	}
}

export interface AnimationInit {
	duration: number;
	tracks?: Track[];
}

export interface AnimationBinaryOptions {
	/**
	 * Write IMVU's compressed keyframes (smaller, lossy: 11-bit rotations, times snapped
	 * to 1/30 s, at most ~34 s). Default `false`: full-precision floats.
	 */
	readonly compress?: boolean;
}

/** A Cal3D skeletal animation (`.caf` binary / `.xaf` XML): per-bone keyframe tracks. */
export class Animation {
	/** Length in seconds. */
	public duration: number;
	public readonly tracks: Track[];
	/** The version of the file this was parsed from (`undefined` for animations built in code). */
	public version: number | undefined;
	/** Whether the parsed binary file used compressed keyframes. */
	public compressed = false;

	public constructor(init: AnimationInit) {
		this.duration = init.duration;
		this.tracks = init.tracks ?? [];
	}

	/** Parse a binary or XML animation file. */
	public static parse(input: Cal3DInput, options?: ParseOptions): Animation {
		const file = openFile(input, 'animation', options);
		const animation = file.format === 'binary' ? readBinary(file.reader, file.version) : readXml(file.body);
		animation.version = file.version;
		return animation;
	}

	public getTrack(boneId: number): Track | undefined {
		return this.tracks.find((track) => track.boneId === boneId);
	}

	public toBinary({ compress = false }: AnimationBinaryOptions = {}): Uint8Array {
		const out = binaryHeader('animation');
		out.int32(compress ? 1 : 0);
		out.float32(this.duration);
		out.int32(this.tracks.length);

		for (const track of this.tracks) {
			if (!compress) {
				out.int32(track.boneId).int32(track.keyframes.length);
				for (const keyframe of track.keyframes) {
					out.float32(keyframe.time);
					writeVector(out, keyframe.translation ?? new Vector3(INVALID_COORD, INVALID_COORD, INVALID_COORD));
					writeQuaternion(out, keyframe.rotation);
				}
				continue;
			}

			if (track.boneId < 0 || track.boneId > 0x1fff)
				throw new Cal3DError(`Bone id ${track.boneId} is not compressible`);
			if (track.keyframes.length > 0xffff) throw new Cal3DError(`Track has too many keyframes to compress`);
			const flags = compressionFlags(track);
			out.bytes([
				track.boneId & 0xff,
				((track.boneId >> 8) & 0x1f) |
					(flags.translationRequired ? 0x80 : 0) |
					(flags.highRangeRequired ? 0x40 : 0) |
					(flags.translationIsDynamic ? 0x20 : 0),
				track.keyframes.length & 0xff,
				track.keyframes.length >> 8,
			]);
			track.keyframes.forEach((keyframe, i) => out.bytes(encodeKeyframe(keyframe, flags, i === 0)));
		}
		return out.finish();
	}

	public toXml(): string {
		const body: XmlNode = {
			name: 'ANIMATION',
			attributes: { DURATION: floats(this.duration), NUMTRACKS: this.tracks.length },
			children: this.tracks.map(
				(track): XmlNode => ({
					name: 'TRACK',
					attributes: {
						BONEID: track.boneId,
						TRANSLATIONREQUIRED: track.translationRequired ? 1 : 0,
						TRANSLATIONISDYNAMIC: track.translationIsDynamic ? 1 : 0,
						HIGHRANGEREQUIRED: track.highRangeRequired ? 1 : 0,
						NUMKEYFRAMES: track.keyframes.length,
					},
					children: track.keyframes.map((keyframe, i): XmlNode => {
						const writeTranslation =
							track.translationRequired && keyframe.translation && (track.translationIsDynamic || i === 0);
						return {
							name: 'KEYFRAME',
							attributes: { TIME: floats(keyframe.time) },
							children: [
								...(writeTranslation
									? [{ name: 'TRANSLATION', text: floats(...keyframe.translation!.toArray()) }]
									: []),
								{ name: 'ROTATION', text: floats(...keyframe.rotation.toArray()) },
							],
						};
					}),
				})
			),
		};
		return writeXml(xmlDocument('animation', body));
	}
}

/** Track flags as they must be for compression: translations off when no keyframe has one, high range when needed. */
function compressionFlags(track: Track): TrackFlags {
	const translations = track.keyframes.flatMap((keyframe) => keyframe.translation?.toArray() ?? []);
	const largest = Math.max(0, ...translations.map(Math.abs));
	if (largest > HIGH_RANGE_LIMIT) throw new Cal3DError(`Translation ${largest} exceeds the compressible range`);
	return {
		translationRequired: track.translationRequired && translations.length > 0,
		translationIsDynamic: track.translationIsDynamic,
		highRangeRequired: track.highRangeRequired || largest > LOW_RANGE_LIMIT,
	};
}

function pose(frame: Keyframe): { translation: Vector3 | null; rotation: Quaternion } {
	return { translation: frame.translation?.clone() ?? null, rotation: frame.rotation.clone() };
}

function lerp(a: Vector3, b: Vector3, t: number): Vector3 {
	return new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

function slerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
	let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
	const sign = dot < 0 ? -1 : 1; // take the short way round
	dot *= sign;
	let wa = 1 - t;
	let wb = t * sign;
	if (dot < 0.9995) {
		const theta = Math.acos(dot);
		const sin = Math.sin(theta);
		wa = Math.sin((1 - t) * theta) / sin;
		wb = (Math.sin(t * theta) / sin) * sign;
	}
	const q = new Quaternion(wa * a.x + wb * b.x, wa * a.y + wb * b.y, wa * a.z + wb * b.z, wa * a.w + wb * b.w);
	const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
	return new Quaternion(q.x / length, q.y / length, q.z / length, q.w / length);
}

// ---------------------------------------------------------------- binary

function readBinary(reader: BinaryReader, version: number): Animation {
	let compressed = version >= FileVersion.AnimationCompression;
	if (version >= FileVersion.CompressionFlag) compressed = reader.int32() !== 0;

	const duration = reader.float32();
	if (!(duration > 0)) throw new Cal3DError(`Invalid animation duration ${duration}`);
	const trackCount = reader.int32();
	if (trackCount < 0) throw new Cal3DError(`Invalid track count ${trackCount}`);

	const animation = new Animation({ duration });
	animation.compressed = compressed;
	for (let i = 0; i < trackCount; i++) {
		animation.tracks.push(compressed ? readCompressedTrack(reader, version) : readTrack(reader));
	}
	return animation;
}

function readTrack(reader: BinaryReader): Track {
	const boneId = reader.int32();
	const keyframeCount = reader.int32();
	if (boneId < 0) throw new Cal3DError(`Invalid bone id ${boneId}`);
	if (keyframeCount < 0) throw new Cal3DError(`Invalid keyframe count ${keyframeCount}`);

	const track = new Track({ boneId });
	for (let i = 0; i < keyframeCount; i++) {
		const time = reader.float32();
		const translation = readVector(reader);
		const rotation = readQuaternion(reader);
		const invalid =
			translation.x === INVALID_COORD && translation.y === INVALID_COORD && translation.z === INVALID_COORD;
		track.keyframes.push(new Keyframe(time, invalid ? null : translation, rotation));
	}
	// The uncompressed layout has no flags; infer them from the keyframes.
	const first = track.keyframes[0]?.translation;
	track.translationRequired = track.keyframes.some((keyframe) => keyframe.translation !== null);
	track.translationIsDynamic =
		!track.translationRequired || !track.keyframes.every((keyframe) => first && keyframe.translation?.equals(first));
	return track;
}

function readCompressedTrack(reader: BinaryReader, version: number): Track {
	const [b0, b1, b2, b3] = reader.bytesOf(4) as unknown as [number, number, number, number];
	const flags: TrackFlags = {
		translationRequired: (b1 & 0x80) !== 0,
		highRangeRequired: (b1 & 0x40) !== 0,
		translationIsDynamic: (b1 & 0x20) !== 0,
	};
	const track = new Track({ boneId: b0 + (b1 & 0x1f) * 256, ...flags });
	const keyframeCount = b2 + b3 * 256;

	let previous: DecodedKeyframe | null = null;
	for (let i = 0; i < keyframeCount; i++) {
		const bytes = reader.bytesOf(compressedKeyframeSize(flags, previous === null));
		let { time, translation, rotation } = decodeKeyframe(bytes, flags, previous);

		// Versions 916–917 follow each compressed keyframe with full-precision copies.
		if (version >= FileVersion.AnimationCompression4 && version < FileVersion.AnimationCompression6) {
			if (
				version >= FileVersion.AnimationCompression5 &&
				flags.translationRequired &&
				(!previous || flags.translationIsDynamic)
			) {
				translation = readVector(reader);
			}
			rotation = readQuaternion(reader);
		}

		previous = { time, translation, rotation };
		track.keyframes.push(new Keyframe(time, translation, rotation));
	}
	return track;
}

// ---------------------------------------------------------------- XML

function readXml(body: XmlElement | undefined): Animation {
	const element = expectBody(body, 'ANIMATION');
	const duration = element.float('DURATION');
	if (!(duration > 0)) throw new Cal3DError(`Invalid animation duration ${duration}`);
	const animation = new Animation({ duration });

	for (const node of element.children) {
		if (!node.is('TRACK')) throw new Cal3DError(`Unexpected <${node.name}> in <ANIMATION>`);
		const flag = (name: string) => {
			const value = node.attr(name);
			return value ? node.int(name) !== 0 : true; // absent or empty: true, for older files
		};
		const track = new Track({
			boneId: node.int('BONEID'),
			translationRequired: flag('TRANSLATIONREQUIRED'),
			translationIsDynamic: flag('TRANSLATIONISDYNAMIC'),
			highRangeRequired: flag('HIGHRANGEREQUIRED'),
		});

		for (const frame of node.children) {
			if (!frame.is('KEYFRAME')) throw new Cal3DError(`Unexpected <${frame.name}> in <TRACK>`);
			const [first, second] = frame.children;
			const hasTranslation = first?.is('TRANSLATION') ?? false;
			const rotation = hasTranslation ? second : first;
			if (!rotation || !rotation.is('ROTATION')) throw new Cal3DError('<KEYFRAME> lacks <ROTATION>');

			// Tracks with a constant translation may store it on the first keyframe only.
			let translation: Vector3 | null = null;
			const previous = track.keyframes.at(-1);
			if (previous && track.translationRequired && !track.translationIsDynamic) {
				translation = previous.translation?.clone() ?? null;
			}
			if (hasTranslation) translation = Vector3.fromArray(parseFloats(first!.text, 3));

			track.keyframes.push(
				new Keyframe(frame.float('TIME'), translation, Quaternion.fromArray(parseFloats(rotation.text, 4)))
			);
		}
		animation.tracks.push(track);
	}
	return animation;
}
