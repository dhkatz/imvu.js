import type { XmlRpcValue } from './codec.js';

/**
 * The gateway's compact table encoding: a header row of column names followed by
 * value rows — `[['userId', 'productId'], [1, 2], [1, 3]]`.
 */
export type Table = XmlRpcValue[][];

/** Rows (objects sharing the first row's keys) → table. */
export function flattenTable(rows: readonly Record<string, XmlRpcValue>[]): Table {
	if (rows.length === 0) throw new RangeError('flattenTable() requires at least one row');
	const header = Object.keys(rows[0]);
	return [header, ...rows.map((row) => header.map((column) => row[column]))];
}

/** Table → rows. An empty or missing table yields no rows. */
export function unflattenTable<T = Record<string, XmlRpcValue>>(table: XmlRpcValue): T[] {
	if (!Array.isArray(table) || table.length === 0) return [];
	const [header, ...rows] = table as XmlRpcValue[][];
	const columns = header.map((column) => {
		if (typeof column !== 'string') throw new TypeError('Table header columns must be strings');
		return column;
	});
	return rows.map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i]])) as T);
}
