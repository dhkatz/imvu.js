# @imvu/chkn

Read IMVU products: their **CFL** archives, their **`index.xml`** templates (with
inheritance from parent products resolved the way the classic client does), and the
**Cal3D** models they assemble (via [`@imvu/cal3d`](https://github.com/dhkatz/imvu.js/tree/master/packages/cal3d)). Also converts to and
from **CHKN**, the ZIP format IMVU's create mode opens.

No dependencies beyond `@imvu/cal3d` and no Node-only APIs (its own LZMA decoder,
`fetch`, `DecompressionStream`), so it runs in Node ≥ 22 and in browsers.

```ts
import { CdnProductSource, Product } from '@imvu/chkn';

const source = new CdnProductSource({ revisions: { 53938393: 3, 512: 11 } });
const product = await Product.load(53938393, source);

product.ancestors.map((p) => p.id); // [512] — it derives from a base room
product.definition.productType; // 'Room'
product.definition.meshes; // Map { 0 => { asset: 'Room.MESH.xmf', … } }

const { skeleton, parts } = product.loadModel(); // @imvu/cal3d objects
for (const part of parts) {
  for (const submesh of part.mesh?.submeshes ?? []) {
    const { spec, material } = part.materials.get(submesh.materialId)!;
    spec.raw.TwoSided; // IMVU render settings for this slot
    const texture = await product.fetchAsset(material!.diffuseMap!.filename); // full-size, from the CDN
  }
}

const chkn = await product.toChkn(); // open in IMVU's create mode
const flat = await product.toChkn({ flatten: true }); // the whole ancestor chain in one file
```

## How products fit together

- **CFL** (`productdata/{pid}/{revision}`): an archive of the product's files. Entries
  are LZMA-compressed. `CflArchive.parse(bytes)` reads it, and `CflArchive.create(files)`
  writes one (entries are stored uncompressed, which the client also accepts).
- **`index.xml`**: the product template. It names the skeleton, the mesh per body part,
  the material per mesh slot (`TextureMapN`, matched to `Submesh.materialId` by `Index`),
  actions, render settings, and so on. `<__DATAIMPORT>product://{pid}/index.xml</__DATAIMPORT>`
  makes it inherit from another product: the parent's settings fill in whatever the child
  doesn't set, and `<Key delete="true"/>` removes an inherited key. `parseTemplate` and
  `expandTemplate` follow the client's `imvu/product/template.py` exactly.
- **Assets**: a file name resolves in the product itself (its CFL entries and its
  `_contents.json` names), and failing that in its parent, and so on up the chain.
  `product.getFile(name)` reads from the CFLs, while `product.fetchAsset(name)` prefers the
  CDN for textures. **Textures inside CFLs are 16×16 placeholders**; the full-size file is
  the one `_contents.json` tags `original`, served at `{cflUrl}/{url}`.
- **CHKN**: a ZIP of a product's files. `cflToChkn(cfl)` repackages a CFL byte for byte,
  as the old `cfl-converter` did, while `product.toChkn()` also swaps in full-size textures.
  `toChkn({ flatten: true })` rolls up the whole chain: the expanded template as `index.xml`
  (no `__DATAIMPORT`), every file reachable through the chain (the nearest product's copy
  wins on a name clash), and no `_contents.json`, whose CDN references no longer apply.

## Revisions

A CFL URL needs the product's current revision, and parents are referenced without one.
No REST field has it. Revisions are also **not contiguous**: product 512 has 5 and 8–11,
but not 6–7. So:

- **Best:** give `CdnProductSource` real revisions. `@imvu/xmlrpc`'s
  `authorizeProducts([pid])` returns the product _and every ancestor_ with its CFL URL:
  ```ts
  const auths = await gateway.authorizeProducts([productId]);
  const revisions = new Map(auths.map((a) => [a.productId, Number(a.cflUrl.split('/').pop())]));
  const product = await Product.load(productId, new CdnProductSource({ revisions }));
  ```
- **Fallback:** products without a known revision are probed with
  `probeLatestRevision` (HEAD requests: doubling, then a binary search, then a look past
  short gaps). It's a heuristic, and slow for deep chains with large revision numbers
  (tens of requests per product).

Or implement `ProductSource` yourself (e.g. to read CFLs from disk or a cache).

## Not covered yet

Particle systems (`ParticleSystems`, `default.particles.json`), sounds, and the
product-type predicates beyond `productType` are reachable through `definition.template`
but have no typed accessors.
