import { Cal3DError } from './errors.js';
import type { Cal3DInput } from './format.js';
import type { BinaryReader } from './io/BinaryReader.js';
import { binaryHeader, expectBody, openFile, xmlDocument, type ParseOptions } from './io/document.js';
import { expectTag, floats } from './io/values.js';
import { parseFloats, writeXml, type XmlElement, type XmlNode } from './io/xml.js';

export class MorphKeyframe {
	public constructor(
		/** Seconds from the start of the animation. */
		public time: number,
		/** Blend weight of the morph target, nominally 0–1. */
		public weight: number
	) {}
}

/** The weight curve of one morph target, which it names (see `MorphTarget.name` in a mesh). */
export class MorphTrack {
	public constructor(
		public morphName: string,
		public readonly keyframes: MorphKeyframe[] = []
	) {}

	/** The weight at `time`, linearly interpolated and clamped to the first/last keyframe. */
	public sample(time: number): number {
		const frames = this.keyframes;
		if (frames.length === 0) return 0;
		const nextIndex = frames.findIndex((frame) => frame.time >= time);
		if (nextIndex === 0) return frames[0]!.weight;
		if (nextIndex === -1) return frames.at(-1)!.weight;
		const a = frames[nextIndex - 1]!;
		const b = frames[nextIndex]!;
		return b.time === a.time ? a.weight : a.weight + ((b.weight - a.weight) * (time - a.time)) / (b.time - a.time);
	}
}

export interface MorphAnimationInit {
	duration: number;
	tracks?: MorphTrack[];
}

/**
 * A Cal3D morph animation (`.cpf` binary / `.xpf` XML): weight curves for a mesh's
 * morph targets, matched by name. IMVU uses these for facial expressions.
 */
export class MorphAnimation {
	/** Length in seconds. */
	public duration: number;
	public readonly tracks: MorphTrack[];
	/** The version of the file this was parsed from (`undefined` for animations built in code). */
	public version: number | undefined;

	public constructor(init: MorphAnimationInit) {
		this.duration = init.duration;
		this.tracks = init.tracks ?? [];
	}

	/** Parse a binary or XML morph animation file. */
	public static parse(input: Cal3DInput, options?: ParseOptions): MorphAnimation {
		const file = openFile(input, 'morphAnimation', options);
		const animation = file.format === 'binary' ? readBinary(file.reader) : readXml(file.body);
		animation.version = file.version;
		return animation;
	}

	public getTrack(morphName: string): MorphTrack | undefined {
		return this.tracks.find((track) => track.morphName === morphName);
	}

	/** Every morph weight at `time`, by morph name. */
	public sample(time: number): Map<string, number> {
		return new Map(this.tracks.map((track) => [track.morphName, track.sample(time)]));
	}

	public toBinary(): Uint8Array {
		const out = binaryHeader('morphAnimation').float32(this.duration).int32(this.tracks.length);
		for (const track of this.tracks) {
			out.string(track.morphName).int32(track.keyframes.length);
			for (const keyframe of track.keyframes) out.float32(keyframe.time).float32(keyframe.weight);
		}
		return out.finish();
	}

	public toXml(): string {
		const body: XmlNode = {
			name: 'ANIMATION',
			attributes: { DURATION: floats(this.duration), NUMTRACKS: this.tracks.length },
			children: this.tracks.map((track): XmlNode => ({
				name: 'TRACK',
				attributes: { MORPHNAME: track.morphName, NUMKEYFRAMES: track.keyframes.length },
				children: track.keyframes.map((keyframe): XmlNode => ({
					name: 'KEYFRAME',
					attributes: { TIME: floats(keyframe.time) },
					children: [{ name: 'WEIGHT', text: floats(keyframe.weight) }],
				})),
			})),
		};
		return writeXml(xmlDocument('morphAnimation', body));
	}
}

function readBinary(reader: BinaryReader): MorphAnimation {
	const duration = reader.float32();
	if (!(duration > 0)) throw new Cal3DError(`Invalid morph animation duration ${duration}`);
	const trackCount = reader.int32();
	if (trackCount < 0) throw new Cal3DError(`Invalid track count ${trackCount}`);

	const animation = new MorphAnimation({ duration });
	for (let i = 0; i < trackCount; i++) {
		const track = new MorphTrack(reader.string());
		const keyframeCount = reader.int32();
		if (keyframeCount < 0) throw new Cal3DError(`Invalid keyframe count ${keyframeCount}`);
		for (let k = 0; k < keyframeCount; k++) track.keyframes.push(new MorphKeyframe(reader.float32(), reader.float32()));
		animation.tracks.push(track);
	}
	return animation;
}

function readXml(body: XmlElement | undefined): MorphAnimation {
	const element = expectBody(body, 'ANIMATION');
	const duration = element.float('DURATION');
	if (!(duration > 0)) throw new Cal3DError(`Invalid morph animation duration ${duration}`);
	const animation = new MorphAnimation({ duration });

	for (const node of element.children) {
		if (!node.is('TRACK')) throw new Cal3DError(`Unexpected <${node.name}> in <ANIMATION>`);
		const track = new MorphTrack(node.attr('MORPHNAME') ?? '');
		for (const frame of node.children) {
			if (!frame.is('KEYFRAME')) throw new Cal3DError(`Unexpected <${frame.name}> in <TRACK>`);
			const weight = frame.children[0];
			expectTag(weight, 'WEIGHT');
			track.keyframes.push(new MorphKeyframe(frame.float('TIME'), parseFloats(weight.text, 1)[0]!));
		}
		animation.tracks.push(track);
	}
	return animation;
}
