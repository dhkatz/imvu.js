/** A 3-component vector (positions, normals, translations). */
export class Vector3 {
	public constructor(
		public x = 0,
		public y = 0,
		public z = 0
	) {}

	public static fromArray(values: ArrayLike<number>): Vector3 {
		return new Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0);
	}

	public get length(): number {
		return Math.hypot(this.x, this.y, this.z);
	}

	public add(other: Vector3): Vector3 {
		return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
	}

	public subtract(other: Vector3): Vector3 {
		return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
	}

	public equals(other: Vector3): boolean {
		return this.x === other.x && this.y === other.y && this.z === other.z;
	}

	public clone(): Vector3 {
		return new Vector3(this.x, this.y, this.z);
	}

	public toArray(): [number, number, number] {
		return [this.x, this.y, this.z];
	}
}

/**
 * A rotation quaternion, exactly as stored in the file.
 *
 * IMVU's runtime negates `w` on load and negates it back on save (an in-memory
 * convention of its fork). This library keeps the file's values untouched, which
 * is also what upstream Cal3D does.
 */
export class Quaternion {
	public constructor(
		public x = 0,
		public y = 0,
		public z = 0,
		public w = 1
	) {}

	public static fromArray(values: ArrayLike<number>): Quaternion {
		return new Quaternion(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1);
	}

	public equals(other: Quaternion): boolean {
		return this.x === other.x && this.y === other.y && this.z === other.z && this.w === other.w;
	}

	public clone(): Quaternion {
		return new Quaternion(this.x, this.y, this.z, this.w);
	}

	public toArray(): [number, number, number, number] {
		return [this.x, this.y, this.z, this.w];
	}
}

/**
 * An RGBA color. The range depends on where it appears: material colors are bytes
 * (0–255); vertex, light and ambient colors are floats (nominally 0–1).
 */
export class Color {
	public constructor(
		public r = 0,
		public g = 0,
		public b = 0,
		public a = 0
	) {}

	public equals(other: Color): boolean {
		return this.r === other.r && this.g === other.g && this.b === other.b && this.a === other.a;
	}

	public clone(): Color {
		return new Color(this.r, this.g, this.b, this.a);
	}

	public toArray(): [number, number, number, number] {
		return [this.r, this.g, this.b, this.a];
	}
}
