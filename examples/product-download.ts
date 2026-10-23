/**
 * @imvu/client + @imvu/chkn — download a product as a CHKN file that IMVU's
 * create mode can open. The XML-RPC gateway supplies the current revision of
 * the product and every product it derives from.
 *
 *   node --env-file=.env examples/product-download.ts <productId> [--flatten]
 *
 * `--flatten` rolls the whole ancestor chain into one self-contained file.
 */
import { writeFile } from 'node:fs/promises';

import { Client } from '@imvu/client';
import { CdnProductSource, Product } from '@imvu/chkn';

const username = process.env.IMVU_USERNAME;
const password = process.env.IMVU_PASSWORD ?? '';
const productId = Number(process.argv[2]);
const flatten = process.argv.includes('--flatten');

if (!username) {
  console.error('Set IMVU_USERNAME (and IMVU_PASSWORD) — see examples/README.md');
  process.exit(1);
}
if (!Number.isInteger(productId) || productId <= 0) {
  console.error('Usage: product-download.ts <productId> [--flatten]');
  process.exit(1);
}

const client = new Client();
await client.login(username, password);

// One row per product in the chain, each with its current CFL URL
// (`…/productdata/{productId}/{revision}`).
const auths = await client.xmlrpc.authorizeProducts([productId]);
const revisions = new Map(auths.map((auth) => [auth.productId, Number(auth.cflUrl.split('/').pop())]));

const product = await Product.load(productId, new CdnProductSource({ revisions }));
const { definition } = product;
console.log(`${definition.name || productId}: ${definition.productType}`);
console.log(`Derives from: ${product.ancestors.map((p) => p.id).join(' → ') || 'nothing'}`);
console.log(`Files: ${[...product.assetNames].length}`);

const file = `${productId}${flatten ? '-flat' : ''}.chkn`;
await writeFile(file, await product.toChkn({ flatten }));
console.log(`Wrote ${file}`);
