/**
 * IMVU product templates (`index.xml`) as the classic client models them
 * (`imvu/product/template.py`): an XML document becomes a nested dictionary, and a
 * `<__DATAIMPORT>product://{pid}/index.xml</__DATAIMPORT>` element makes the
 * template inherit from another product's.
 *
 * XML → dictionary:
 * - an element with child elements becomes a dictionary keyed by child tag
 *   (case-sensitive; a repeated tag keeps the last);
 * - an element without children becomes its text (whitespace-only text becomes `''`);
 * - an element with a `delete` attribute becomes a deletion marker (`null`), which
 *   removes the key inherited from the parent.
 *
 * Inheritance: wherever `__DATAIMPORT` appears, it is removed and the imported
 * template's `Template` dictionary is merged *under* that dictionary — keys the child
 * lacks are copied from the parent, dictionaries present on both sides merge
 * recursively, and the child's value wins everywhere else. Deletion markers are then
 * pruned.
 */
import { ChknError } from './errors.js';
import { escapeXml, readXml } from './xml.js';

/** A template value: text, a nested dictionary, or (in delta form only) a deletion marker. */
export type TemplateValue = string | TemplateDict | null;
export interface TemplateDict {
	[key: string]: TemplateValue;
}

export const DATA_IMPORT = '__DATAIMPORT';

const isDict = (value: TemplateValue | undefined): value is TemplateDict => typeof value === 'object' && value !== null;

/** A fresh dictionary without a prototype, so keys like `constructor` are plain data. */
export const createDict = (): TemplateDict => Object.create(null) as TemplateDict;

/**
 * Parse template XML into its delta form: the document's root element is the single
 * top-level key (normally `Template`), and deletion markers are kept as `null`.
 */
export function parseTemplate(xml: string): TemplateDict {
	const DELETE = Symbol('delete');
	interface Frame {
		dict: TemplateDict;
		text: string | typeof DELETE;
		hasChildren: boolean;
	}
	const root: Frame = { dict: createDict(), text: '', hasChildren: false };
	const stack: Frame[] = [root];

	readXml(xml, {
		start(_name, attributes) {
			stack.at(-1)!.hasChildren = true;
			stack.push({ dict: createDict(), text: attributes.has('delete') ? DELETE : '', hasChildren: false });
		},
		end(name) {
			const frame = stack.pop()!;
			const parent = stack.at(-1);
			if (!parent) throw new ChknError('Invalid template XML');
			let value: TemplateValue;
			if (frame.hasChildren) value = frame.dict;
			else if (frame.text === DELETE) value = null;
			else value = frame.text.trim() ? frame.text : '';
			parent.dict[name] = value;
		},
		text(text) {
			const frame = stack.at(-1)!;
			if (frame.text !== DELETE) frame.text += text;
		},
	});

	overrideZeroMutation(root.dict);
	return root.dict;
}

/**
 * The client drops `Overridable` = `'0'` from material slots of templates made with
 * IMVU's creator tools (those that record a `CreatorVersion`).
 */
function overrideZeroMutation(document: TemplateDict): void {
	const template = document.Template;
	// Python's `str(template.get('CreatorVersion', ''))` is empty only when the key is absent or empty.
	if (!isDict(template) || template.CreatorVersion === undefined || template.CreatorVersion === '') return;
	const materials = template.Material;
	if (!isDict(materials)) return;
	for (const slot of Object.values(materials)) {
		if (isDict(slot) && slot.Overridable === '0') delete slot.Overridable;
	}
}

/** Every `__DATAIMPORT` URL in a template, in document order. */
export function findImports(dict: TemplateDict): string[] {
	const urls: string[] = [];
	const walk = (node: TemplateDict) => {
		for (const [key, value] of Object.entries(node)) {
			if (key === DATA_IMPORT && typeof value === 'string') urls.push(value.trim());
			else if (isDict(value)) walk(value);
		}
	};
	walk(dict);
	return urls;
}

/** Copy into `child` every key of `parent` it lacks, recursing where both hold dictionaries. */
export function mergeParent(child: TemplateDict, parent: TemplateDict): TemplateDict {
	for (const [key, value] of Object.entries(parent)) {
		if (!(key in child)) {
			child[key] = clone(value);
		} else {
			const own = child[key];
			if (isDict(value) && isDict(own)) mergeParent(own, value);
		}
	}
	return child;
}

/**
 * Expand a delta-form template: replace each `__DATAIMPORT` with the imported
 * template (looked up by URL in `imports`, already expanded) and prune deletion markers.
 * Returns a new dictionary; the input is not modified.
 */
export function expandTemplate(delta: TemplateDict, imports: ReadonlyMap<string, TemplateDict | null>): TemplateDict {
	const expanded = clone(delta) as TemplateDict;
	const resolve = (node: TemplateDict) => {
		for (const [key, value] of Object.entries(node)) {
			if (key === DATA_IMPORT) {
				delete node[key];
				const url = typeof value === 'string' ? value.trim() : '';
				if (!imports.has(url)) throw new ChknError(`Template import ${JSON.stringify(url)} was not loaded`);
				const imported = imports.get(url);
				// Like the client, an empty (or missing) imported template contributes nothing.
				if (imported && Object.keys(imported).length > 0) {
					const body = imported.Template;
					if (!isDict(body)) throw new ChknError(`Imported template ${url} has no <Template> root`);
					mergeParent(node, body);
				}
				resolve(node);
			} else if (isDict(value)) {
				resolve(value);
			}
		}
	};
	resolve(expanded);
	pruneDeletions(expanded);
	return expanded;
}

/** Remove deletion markers (`null` values), recursively. */
export function pruneDeletions(dict: TemplateDict): void {
	for (const [key, value] of Object.entries(dict)) {
		if (isDict(value)) pruneDeletions(value);
		if (value === null) delete dict[key];
	}
}

/**
 * Serialize a template dictionary the way the client does (`createXmlDataFromDict`):
 * `__DATAIMPORT` first, other keys sorted, deletion markers as `<Key delete="true"/>`.
 */
export function writeTemplate(dict: TemplateDict): string {
	const out: string[] = ['<?xml version="1.0" encoding="utf-8"?>\n'];
	const write = (node: TemplateDict) => {
		const imported = node[DATA_IMPORT];
		if (typeof imported === 'string') out.push(`<${DATA_IMPORT}>${escapeXml(imported)}</${DATA_IMPORT}>`);
		for (const key of Object.keys(node).sort(compareKeys)) {
			if (key === DATA_IMPORT) continue;
			const value = node[key]!;
			if (value === null) {
				out.push(`<${key} delete="true"></${key}>\n`);
			} else if (isDict(value)) {
				out.push(`<${key}>\n`);
				write(value);
				out.push(`</${key}>\n`);
			} else {
				out.push(`<${key}>${escapeXml(value)}</${key}>\n`);
			}
		}
	};
	write(dict);
	return out.join('');
}

/** Python's default string ordering: by code unit, not locale. */
const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function clone(value: TemplateValue): TemplateValue {
	if (!isDict(value)) return value;
	const copy = createDict();
	for (const [key, child] of Object.entries(value)) copy[key] = clone(child);
	return copy;
}

const PRODUCT_URL = /^product:\/\/(-?\d+)\/.+?$/;

/** The product id of a `product://{pid}/…` URL, or `null`. */
export function productIdFromUrl(url: string): number | null {
	const match = PRODUCT_URL.exec(url.trim());
	return match ? Number(match[1]) : null;
}
