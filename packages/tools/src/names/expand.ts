/**
 * Username pattern expansion.
 *
 * A pattern is a string of positions; each position contributes a set of
 * candidate characters, and expansion is their cartesian product. Tokens:
 *
 *   - a literal alphanumeric char → itself (lowercased; lookups are case-insensitive)
 *   - `*` → any alphanumeric (a-z 0-9)
 *   - `@` → any letter (a-z)
 *   - `#` → any digit (0-9)
 *   - `[...]` → an explicit set, with ranges: `[abc]`, `[a-f]`, `[a-f0-9]`
 *
 * So `@@@` is every 3-letter name, `***` every 3-char name, `b@b` is bab…bzb,
 * and `[bc]a#` is ba0…ba9, ca0…ca9.
 */

const DIGITS = '0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ALNUM = DIGITS + LETTERS;

const isAlnum = (ch: string): boolean => /^[a-z0-9]$/i.test(ch);

/** Parse a `[...]` class body (already stripped of the brackets) into its character set. */
function parseClass(body: string, pattern: string): string[] {
	if (body.length === 0) {
		throw new Error(`Empty character class '[]' in pattern "${pattern}"`);
	}

	const chars = new Set<string>();
	let i = 0;
	while (i < body.length) {
		const ch = body[i]!;
		if (body[i + 1] === '-' && i + 2 < body.length) {
			const start = ch.toLowerCase();
			const end = body[i + 2]!.toLowerCase();
			if (!isAlnum(start) || !isAlnum(end) || start.charCodeAt(0) > end.charCodeAt(0)) {
				throw new Error(`Invalid range '${ch}-${body[i + 2]}' in pattern "${pattern}"`);
			}
			for (let c = start.charCodeAt(0); c <= end.charCodeAt(0); c++) {
				chars.add(String.fromCharCode(c));
			}
			i += 3;
		} else {
			if (!isAlnum(ch)) {
				throw new Error(`Invalid character '${ch}' in class of pattern "${pattern}" (alphanumeric only)`);
			}
			chars.add(ch.toLowerCase());
			i += 1;
		}
	}
	return [...chars];
}

/** Break a pattern into per-position character-option lists. */
function parsePositions(pattern: string): string[][] {
	const positions: string[][] = [];
	let i = 0;
	while (i < pattern.length) {
		const ch = pattern[i]!;
		if (ch === '*') {
			positions.push(ALNUM.split(''));
			i += 1;
		} else if (ch === '@') {
			positions.push(LETTERS.split(''));
			i += 1;
		} else if (ch === '#') {
			positions.push(DIGITS.split(''));
			i += 1;
		} else if (ch === '[') {
			const end = pattern.indexOf(']', i);
			if (end === -1) {
				throw new Error(`Unclosed '[' in pattern "${pattern}"`);
			}
			positions.push(parseClass(pattern.slice(i + 1, end), pattern));
			i = end + 1;
		} else if (isAlnum(ch)) {
			positions.push([ch.toLowerCase()]);
			i += 1;
		} else {
			throw new Error(`Invalid character '${ch}' in pattern "${pattern}" (alphanumeric and * @ # [ ] only)`);
		}
	}

	if (positions.length === 0) {
		throw new Error('Empty pattern');
	}
	return positions;
}

/** Number of names a pattern expands to, without materializing them. */
export function countPattern(pattern: string): number {
	return parsePositions(pattern).reduce((total, options) => total * options.length, 1);
}

/** Expand a pattern into every matching (lowercased) name. */
export function expandPattern(pattern: string): string[] {
	return parsePositions(pattern).reduce<string[]>(
		(names, options) => names.flatMap((prefix) => options.map((ch) => prefix + ch)),
		['']
	);
}

/** True when a pattern uses any wildcard/class token (vs. being a plain literal name). */
export function isPattern(input: string): boolean {
	return /[*@#[\]]/.test(input);
}
