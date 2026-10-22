import { countPattern, expandPattern, isPattern } from '../src/names/expand.js';
import { variations } from '../src/names/variations.js';

describe('expandPattern', () => {
	it('returns a single literal name, lowercased', () => {
		expect(expandPattern('Bob')).toEqual(['bob']);
	});

	it('expands @ to every letter', () => {
		const result = expandPattern('b@b');
		expect(result).toHaveLength(26);
		expect(result).toContain('bab');
		expect(result).toContain('bzb');
		expect(result.every((name) => /^b[a-z]b$/.test(name))).toBe(true);
	});

	it('expands # to every digit', () => {
		expect(expandPattern('#')).toEqual('0123456789'.split(''));
	});

	it('expands * to every alphanumeric', () => {
		expect(expandPattern('*')).toHaveLength(36);
	});

	it('@@@ is every 3-letter name; *** is every 3-char name', () => {
		expect(countPattern('@@@')).toBe(26 ** 3);
		expect(expandPattern('@@@')).toHaveLength(26 ** 3);
		expect(countPattern('***')).toBe(36 ** 3);
	});

	it('parses explicit classes and ranges', () => {
		expect(expandPattern('[bc]a').sort()).toEqual(['ba', 'ca']);
		expect(expandPattern('[a-c]')).toEqual(['a', 'b', 'c']);
		expect(expandPattern('[a-c0-1]').sort()).toEqual(['0', '1', 'a', 'b', 'c']);
	});

	it('countPattern matches the expansion size', () => {
		expect(countPattern('b@#')).toBe(26 * 10);
	});

	it('rejects special characters and malformed classes', () => {
		expect(() => expandPattern('b-b')).toThrow(/alphanumeric/);
		expect(() => expandPattern('a[b')).toThrow(/Unclosed/);
		expect(() => expandPattern('[]')).toThrow(/Empty character class/);
		expect(() => expandPattern('[z-a]')).toThrow(/Invalid range/);
	});
});

describe('isPattern', () => {
	it('detects wildcard/class tokens', () => {
		expect(isPattern('bob')).toBe(false);
		expect(isPattern('b*b')).toBe(true);
		expect(isPattern('b@b')).toBe(true);
		expect(isPattern('b#b')).toBe(true);
		expect(isPattern('[ab]c')).toBe(true);
	});
});

describe('variations', () => {
	it('generates the capital-I-for-l look-alike', () => {
		expect(variations('bill')).toContain('biII');
	});

	it('never includes the original (case-insensitively) and stays alphanumeric', () => {
		const result = variations('bill');
		expect(result.some((v) => v.toLowerCase() === 'bill')).toBe(false);
		expect(result.every((v) => /^[a-z0-9]+$/i.test(v))).toBe(true);
	});

	it('dedupes by case-insensitive form', () => {
		// o's group is [o, O, 0]; only distinct-lowercase forms survive.
		expect(variations('oo')).toEqual(['o0', '0o', '00']);
	});

	it('returns nothing when no character has a look-alike', () => {
		expect(variations('xyw')).toEqual([]);
	});

	it('respects the limit', () => {
		expect(variations('bill', { limit: 3 })).toHaveLength(3);
	});
});
