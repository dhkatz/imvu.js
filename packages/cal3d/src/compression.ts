/**
 * IMVU's compressed binary keyframe encoding (file versions ≥ 913; optional since 919).
 *
 * A compressed keyframe is a bit stream, least-significant bit first:
 *
 * - an optional translation — 3 × (magnitude, sign) with 25-bit magnitudes over ±2²³
 *   units ("high range", 10 bytes) or 9-bit magnitudes over ±2⁷ units (4 bytes) — present
 *   only when the track needs translations and, for tracks whose translation is constant,
 *   only on the first keyframe;
 * - a rotation as "smallest three": 2 bits naming the largest component (dropped and
 *   rebuilt as `√(1 − Σ others²)`), then 3 × (sign, 11-bit magnitude 0–1);
 * - the time in 10 bits of 1/30 s steps.
 *
 * The decoder mirrors `CalLoader::readCompressedKeyframe`, including its 32-bit float
 * arithmetic, so it yields the same values IMVU's client does.
 */
import { Cal3DError } from './errors.js';
import { Quaternion, Vector3 } from './math.js';

const ROTATION_BITS = 11;
const TIME_BITS = 10;
const TIME_STEPS_PER_SECOND = 30;

interface PositionEncoding {
	readonly bits: number;
	readonly range: number;
	readonly bytes: number;
}

const HIGH_RANGE: PositionEncoding = { bits: 25, range: 2 ** 23, bytes: 10 };
const LOW_RANGE: PositionEncoding = { bits: 9, range: 2 ** 7, bytes: 4 };
const POSITION_PADDING_BITS = 2;
const ROTATION_BYTES = 6;

/** The largest translation component the compact ("low range") encoding can hold. */
export const LOW_RANGE_LIMIT = LOW_RANGE.range;
/** The largest translation component compression can hold at all. */
export const HIGH_RANGE_LIMIT = HIGH_RANGE.range;
/** The longest animation time compression can hold (1023 steps of 1/30 s). */
export const MAX_COMPRESSED_TIME = ((1 << TIME_BITS) - 1) / TIME_STEPS_PER_SECOND;

export interface TrackFlags {
	readonly translationRequired: boolean;
	readonly highRangeRequired: boolean;
	readonly translationIsDynamic: boolean;
}

/** Whether this keyframe stores its own translation (vs. none, or the first keyframe's). */
export function translationWritten(flags: TrackFlags, isFirst: boolean): boolean {
	return flags.translationRequired && (isFirst || flags.translationIsDynamic);
}

/** Bytes one compressed keyframe takes. */
export function compressedKeyframeSize(flags: TrackFlags, isFirst: boolean): number {
	const position = flags.highRangeRequired ? HIGH_RANGE : LOW_RANGE;
	return (translationWritten(flags, isFirst) ? position.bytes : 0) + ROTATION_BYTES;
}

// ---------------------------------------------------------------- bits

class BitReader {
	private buffer = 0;
	private bits = 0;
	public bytesRead = 0;

	public constructor(private readonly source: Uint8Array) {}

	public read(count: number): number {
		while (this.bits < count) {
			this.buffer = (this.buffer | (this.source[this.bytesRead++]! << this.bits)) >>> 0;
			this.bits += 8;
		}
		const value = count === 32 ? this.buffer : this.buffer & ((1 << count) - 1);
		this.buffer >>>= count;
		this.bits -= count;
		return value >>> 0;
	}
}

class BitWriter {
	private readonly bytes: number[] = [];
	private buffer = 0;
	private bits = 0;

	public write(value: number, count: number): void {
		for (let bit = 0; bit < count; bit++) {
			this.buffer |= ((value >>> bit) & 1) << this.bits;
			if (++this.bits === 8) {
				this.bytes.push(this.buffer);
				this.buffer = 0;
				this.bits = 0;
			}
		}
	}

	public finish(): number[] {
		if (this.bits > 0) this.bytes.push(this.buffer);
		return this.bytes;
	}
}

const f = Math.fround;
const maxValue = (bits: number) => (1 << bits) - 1;

/** `FixedPointToFloatZeroToOne`, in float32 like the original. */
const fixedToUnit = (value: number, bits: number) => f(f(value) / f(maxValue(bits)));

// ---------------------------------------------------------------- decoding

export interface DecodedKeyframe {
	readonly time: number;
	/** `null` when the track carries no translation. */
	readonly translation: Vector3 | null;
	readonly rotation: Quaternion;
}

/**
 * Decode one keyframe from `bytes` (which must hold at least
 * {@link compressedKeyframeSize} bytes). `previous` supplies the translation of
 * tracks whose translation is constant.
 */
export function decodeKeyframe(
	bytes: Uint8Array,
	flags: TrackFlags,
	previous: DecodedKeyframe | null
): DecodedKeyframe {
	let offset = 0;
	let translation: Vector3 | null = null;

	if (flags.translationRequired) {
		if (previous && !flags.translationIsDynamic) {
			translation = previous.translation?.clone() ?? null;
		} else {
			const encoding = flags.highRangeRequired ? HIGH_RANGE : LOW_RANGE;
			const reader = new BitReader(bytes);
			const component = () => {
				const magnitude = f(fixedToUnit(reader.read(encoding.bits), encoding.bits) * encoding.range);
				return reader.read(1) ? -magnitude : magnitude;
			};
			translation = new Vector3(component(), component(), component());
			reader.read(POSITION_PADDING_BITS);
			offset = encoding.bytes;
		}
	}

	const reader = new BitReader(bytes.subarray(offset));
	const largest = reader.read(2);
	const values = [0, 0, 0, 0];
	let sum = 0;
	for (let i = 0; i < 4; i++) {
		if (i === largest) continue;
		const sign = reader.read(1);
		const magnitude = fixedToUnit(reader.read(ROTATION_BITS), ROTATION_BITS);
		values[i] = sign ? -magnitude : magnitude;
		sum = f(sum + f(values[i]! * values[i]!));
	}
	values[largest] = f(Math.sqrt(f(1 - Math.min(sum, 1))));
	const steps = reader.read(TIME_BITS);

	return { time: f(steps / TIME_STEPS_PER_SECOND), translation, rotation: Quaternion.fromArray(values) };
}

// ---------------------------------------------------------------- encoding

/** Encode one keyframe. Lossy: rotations keep 11 bits per component, times snap to 1/30 s. */
export function encodeKeyframe(
	keyframe: { time: number; translation: Vector3 | null; rotation: Quaternion },
	flags: TrackFlags,
	isFirst: boolean
): number[] {
	const out: number[] = [];

	if (translationWritten(flags, isFirst)) {
		const encoding = flags.highRangeRequired ? HIGH_RANGE : LOW_RANGE;
		const writer = new BitWriter();
		const translation = keyframe.translation ?? new Vector3();
		for (const value of translation.toArray()) {
			if (!(Math.abs(value) <= encoding.range)) {
				throw new Cal3DError(`Translation ${value} exceeds the compressible range ±${encoding.range}`);
			}
			writer.write(Math.round((Math.abs(value) / encoding.range) * maxValue(encoding.bits)), encoding.bits);
			writer.write(value < 0 ? 1 : 0, 1);
		}
		writer.write(0, POSITION_PADDING_BITS);
		out.push(...writer.finish());
	}

	const steps = Math.round(keyframe.time * TIME_STEPS_PER_SECOND);
	if (steps < 0 || steps > maxValue(TIME_BITS)) {
		throw new Cal3DError(
			`Keyframe time ${keyframe.time}s is outside the compressible 0–${MAX_COMPRESSED_TIME.toFixed(2)}s`
		);
	}

	// q and −q are the same rotation: flip so the dropped (largest) component is positive.
	let components = normalize(keyframe.rotation.toArray());
	let largest = 0;
	for (let i = 1; i < 4; i++) if (Math.abs(components[i]!) > Math.abs(components[largest]!)) largest = i;
	if (components[largest]! < 0) components = components.map((value) => -value);

	const writer = new BitWriter();
	writer.write(largest, 2);
	for (let i = 0; i < 4; i++) {
		if (i === largest) continue;
		writer.write(components[i]! < 0 ? 1 : 0, 1);
		writer.write(Math.round(Math.min(1, Math.abs(components[i]!)) * maxValue(ROTATION_BITS)), ROTATION_BITS);
	}
	writer.write(steps, TIME_BITS);
	out.push(...writer.finish());
	return out;
}

function normalize(values: number[]): number[] {
	const length = Math.hypot(...values);
	return length > 0 ? values.map((value) => value / length) : [0, 0, 0, 1];
}
