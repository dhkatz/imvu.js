import { Cal3DError } from '../errors.js';
import { Quaternion, Vector3 } from '../math.js';
import type { BinaryReader } from './BinaryReader.js';
import type { BinaryWriter } from './BinaryWriter.js';
import { formatFloat } from './text.js';
import type { XmlElement } from './xml.js';

export function readVector(reader: BinaryReader): Vector3 {
	return new Vector3(reader.float32(), reader.float32(), reader.float32());
}

export function readQuaternion(reader: BinaryReader): Quaternion {
	return new Quaternion(reader.float32(), reader.float32(), reader.float32(), reader.float32());
}

export function writeVector(out: BinaryWriter, vector: Vector3): void {
	out.float32(vector.x).float32(vector.y).float32(vector.z);
}

export function writeQuaternion(out: BinaryWriter, quaternion: Quaternion): void {
	out.float32(quaternion.x).float32(quaternion.y).float32(quaternion.z).float32(quaternion.w);
}

/** Space-separated float text for XML. */
export function floats(...values: number[]): string {
	return values.map(formatFloat).join(' ');
}

export function expectTag(element: XmlElement | undefined, name: string): asserts element is XmlElement {
	if (!element || !element.is(name)) {
		throw new Cal3DError(`Expected <${name}>${element ? `, got <${element.name}>` : ''}`);
	}
}
