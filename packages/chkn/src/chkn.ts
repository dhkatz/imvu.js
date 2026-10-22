import { CflArchive } from './Cfl.js';
import { readZip, writeZip } from './zip.js';

/** Read a `.chkn` (a ZIP of product files) into its files by name. */
export function readChkn(input: Uint8Array | ArrayBuffer): Promise<Map<string, Uint8Array>> {
	return readZip(input instanceof Uint8Array ? input : new Uint8Array(input));
}

/** Write product files as a `.chkn`. */
export function writeChkn(files: Iterable<[string, Uint8Array]> | Record<string, Uint8Array>): Uint8Array {
	return writeZip(Symbol.iterator in files ? files : Object.entries(files));
}

/**
 * Repackage a CFL as a `.chkn`, byte for byte — what cfl-converter did. Note that a
 * CFL's textures are 16×16 placeholders; {@link Product.toChkn} swaps in the
 * full-size originals from the CDN.
 */
export function cflToChkn(cfl: Uint8Array | ArrayBuffer): Uint8Array {
	return writeZip(CflArchive.parse(cfl).files());
}
