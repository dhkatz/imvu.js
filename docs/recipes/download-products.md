# Download products

IMVU products are served as **CFL** archives from IMVU's productdata CDN. `@imvu/chkn`
loads a product with everything it inherits, and can save it as a **CHKN** file that
IMVU's create mode opens.

## The whole flow

<<< ../../examples/product-download.ts

```sh
node --env-file=.env examples/product-download.ts 53938393 --flatten
# PrvRmDrkC v02 Furniture: Room
# Derives from: 512
# Files: 13
# Wrote 53938393-flat.chkn
```

The rest of this page explains each step.

## 1. Find the current revisions

A product's CFL URL contains its **revision** (`…/productdata/{productId}/{revision}`),
and the REST API doesn't expose it. Revision numbers also have gaps, so you can't
just count up. The reliable source is the XML-RPC gateway, which returns the product
**and every product it derives from**:

```ts
const auths = await client.xmlrpc.authorizeProducts([productId]);
// [{ productId: 53938393, parentProductId: 512, cflUrl: '…/53938393/3', cflChecksum: '…' },
//  { productId: 512, parentProductId: 0, cflUrl: '…/512/11', … }]

const revisions = new Map(auths.map((a) => [a.productId, Number(a.cflUrl.split('/').pop())]));
```

`client.xmlrpc` logs into the gateway on first use (see
[Authentication](/guide/authentication#the-xml-rpc-session)). You can also use
`XmlRpcGateway` from `@imvu/xmlrpc` on its own.

::: tip No login? Probe instead
Without `revisions`, `CdnProductSource` finds each product's latest revision with HEAD
requests. It works, but it's slow (often dozens of requests per product), and the
result is a guess. Use it for one-off scripts, not for anything you run often.

```ts
const product = await Product.load(productId, new CdnProductSource());
```
:::

## 2. Load the product

```ts
import { CdnProductSource, Product } from '@imvu/chkn';

const product = await Product.load(productId, new CdnProductSource({ revisions }));
```

This downloads the product's CFL, reads its `index.xml`, and does the same for every
parent it imports, recursively. When loading many products, share a cache, since
parents such as base rooms and avatars are shared:

```ts
const cache = new Map();
const products = await Promise.all(ids.map((id) => Product.load(id, source, { cache })));
```

## 3. Look inside

```ts
product.ancestors.map((p) => p.id); // parents, nearest first
product.assetNames; // every file reachable through the chain

const def = product.definition; // the template with inheritance applied
def.name;
def.productType; // e.g. 'Room'
def.meshes; // Map of mesh slot → { asset: 'Room.MESH.xmf', … }
def.actions; // poses and interactions

const xml = product.archive.text('index.xml'); // the product's own raw template
```

Reading files:

```ts
product.getFile('Room.MESH.xmf'); // bytes, from this product or the nearest ancestor that has it
await product.fetchAsset('Room_dark_diffuse.png'); // prefers the full-size CDN copy of textures
```

::: warning Textures inside CFLs are placeholders
The texture files stored *inside* a CFL are tiny 16×16 stand-ins. Always use
`fetchAsset()` for images: it downloads the full-size original listed in the
product's `_contents.json`.
:::

## 4. Save it

```ts
await writeFile('product.chkn', await product.toChkn());
await writeFile('product-flat.chkn', await product.toChkn({ flatten: true }));
```

|                        | `toChkn()`                         | `toChkn({ flatten: true })`                     |
| ---------------------- | ---------------------------------- | ----------------------------------------------- |
| Contains               | This product's own files           | Every file in the whole chain                   |
| `index.xml`            | Still imports its parent           | Fully expanded: no imports                      |
| Opens without the parent | No                               | Yes                                             |
| Textures               | Full-size                          | Full-size                                       |

To work with the files yourself instead, `product.flattenedFiles()` returns the
flattened set as a `Map<name, bytes>`.

## Your own product source

`CdnProductSource` is one implementation of `ProductSource`. Implement it yourself
to read from disk, a cache or a proxy:

```ts
import type { ProductSource } from '@imvu/chkn';

const cachedSource: ProductSource = {
  async fetchCfl(productId) {
    const url = `https://my-cache.example/cfl/${productId}`;
    return { url, bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()) };
  },
  async fetchUrl(url) {
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  },
};
```

`fetchCfl` returns the archive and its URL: textures listed in `_contents.json` are
resolved relative to that URL and fetched through `fetchUrl`.

## Lower level

- `CflArchive.parse(bytes)` reads a CFL directly: `names`, `get(name)`, `text(name)`.
- `CflArchive.create(files)` writes one.
- `cflToChkn(cflBytes)` converts a CFL to CHKN byte for byte, without the texture swap.
- `await readChkn(bytes)` gives a CHKN's files as a `Map`, and `writeChkn(files)` builds one.
- `parseTemplate` / `expandTemplate` work on `index.xml` templates directly.
