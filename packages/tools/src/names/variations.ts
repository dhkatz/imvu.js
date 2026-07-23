/**
 * Visual look-alike (homoglyph) variations of a name.
 *
 * IMVU usernames are unique case-insensitively, but a capital `I` and a
 * lowercase `l` are different letters — so `biII` is a distinct, registerable
 * name that reads like `bill`. Given a name, this generates the look-alike
 * candidates by swapping each character for members of its homoglyph group.
 *
 * Only variations whose case-insensitive form differs from the original are
 * returned (a same-name swap like `o`→`O` is useless), deduped by that form so
 * we don't spend two lookups on names that resolve identically.
 */

/** Mutually-confusable character groups (mixed case + digits). */
const HOMOGLYPH_GROUPS: readonly string[][] = [
	['l', 'I', '1', 'i'],
	['o', 'O', '0'],
	['s', 'S', '5'],
	['b', 'B', '8'],
	['g', 'q', '9'],
	['z', 'Z', '2'],
];

/** Options for one character: itself first, then its look-alikes. */
function glyphsFor(ch: string): string[] {
	const group = HOMOGLYPH_GROUPS.find((g) => g.some((c) => c.toLowerCase() === ch.toLowerCase()));
	if (!group) {
		return [ch];
	}
	return [ch, ...group.filter((c) => c !== ch)];
}

export interface VariationOptions {
	/** Cap on how many variations to return (default 128). */
	limit?: number;
}

/**
 * Generate look-alike variations of `name` (excluding names that resolve to the
 * same case-insensitive username). Ordered closest-to-original first.
 */
export function variations(name: string, { limit = 128 }: VariationOptions = {}): string[] {
	const original = name.toLowerCase();
	const positions = name.split('').map(glyphsFor);

	const seen = new Set<string>([original]);
	const results: string[] = [];

	let combos: string[] = [''];
	for (const options of positions) {
		combos = combos.flatMap((prefix) => options.map((ch) => prefix + ch));
	}

	for (const combo of combos) {
		const key = combo.toLowerCase();
		if (seen.has(key)) {
			continue; // original, or a case-insensitive duplicate we've already kept
		}
		seen.add(key);
		results.push(combo);
		if (results.length >= limit) {
			break;
		}
	}

	return results;
}
