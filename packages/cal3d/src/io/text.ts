const utf8 = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1');
const encoder = new TextEncoder();

/**
 * Decode file text. Cal3D strings carry no declared encoding; tools wrote both
 * UTF-8 and Latin-1 over the years, so try UTF-8 and fall back to Latin-1 —
 * the same rule IMVU's loader applies to morph names.
 */
export function decodeText(bytes: Uint8Array): string {
	try {
		return utf8.decode(bytes);
	} catch {
		return latin1.decode(bytes);
	}
}

export function encodeText(text: string): Uint8Array {
	return encoder.encode(text);
}

/**
 * Format a 32-bit float with the fewest significant digits that still parse back
 * to the same float, so XML output is short (`0.1`, not `0.10000000149011612`)
 * yet loses nothing.
 */
export function formatFloat(value: number): string {
	if (!Number.isFinite(value)) return '0';
	const target = Math.fround(value);
	if (target === 0) return '0';
	for (let precision = 1; precision < 9; precision++) {
		const text = target.toPrecision(precision);
		if (Math.fround(Number(text)) === target) return trimNumber(text);
	}
	return trimNumber(target.toPrecision(9));
}

/** `1.500` → `1.5`, `2.0e+2` → `200`; leaves exponents when JS needs them. */
function trimNumber(text: string): string {
	return String(Number(text));
}
