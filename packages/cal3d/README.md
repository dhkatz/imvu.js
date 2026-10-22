# @imvu/cal3d

Read and write the [Cal3D](https://github.com/imvu/cal3d) model files IMVU products are
built from, as plain objects you can inspect, edit and save again.

| Kind            | Class            | Binary | XML    |
| --------------- | ---------------- | ------ | ------ |
| Skeleton        | `Skeleton`       | `.csf` | `.xsf` |
| Mesh            | `Mesh`           | `.cmf` | `.xmf` |
| Material        | `Material`       | `.crf` | `.xrf` |
| Animation       | `Animation`      | `.caf` | `.xaf` |
| Morph animation | `MorphAnimation` | `.cpf` | `.xpf` |

No dependencies and no Node-only APIs (`DataView`, `TextDecoder`, its own small XML
parser), so it runs in Node ≥ 22 and in browsers. Reading follows IMVU's own loader
(`src/cal3d/loader.cpp` and `xmlformat.cpp` in its fork), quirks included, for every
file version it accepts (699–919).

```ts
import { Mesh, Skeleton, load } from '@imvu/cal3d';

const skeleton = Skeleton.parse(await (await fetch(skeletonUrl)).arrayBuffer());
for (const { bone, depth } of skeleton.walk()) console.log('  '.repeat(depth) + bone.name);

const mesh = Mesh.parse(meshBytes); // binary or XML: the contents decide
for (const submesh of mesh.submeshes) {
  submesh.materialId; // which material slot it is drawn with
  submesh.vertices[0].influences; // [{ boneId, weight }, …]
  submesh.morphTargets.map((morph) => morph.name);
  const { positions, normals, texCoords, indices, skinIndices, skinWeights } = submesh.toBuffers();
}

// Don't know what a file is? load() sniffs it.
const file = load(bytes);
if (file.kind === 'material') file.value.diffuseMap?.filename;

// Edit and save, in either flavor.
skeleton.getBone('Head')!.translation.z += 1;
const binary: Uint8Array = skeleton.toBinary();
const xml: string = skeleton.toXml();
```

## IMVU products

A product's files live on the productdata CDN:
`https://userimages-akm.imvu.com/productdata/{productId}/{revision}/_contents.json` lists
them as `{ name, url }`, and each is served at `…/{revision}/{url ?? name}`. The
`index.xml` there (not a Cal3D file) says which mesh, material and skeleton files make up
the product. Note that **the CDN serves binary files under the XML extensions** — a
`.xmf` there is usually a `CMF` binary — so never pick a parser by extension; `parse()`
and `load()` look at the contents.

Materials do not embed images: a `TextureMap`'s `filename` names a texture shipped with
the product (or inherited from the product it derives from).

## Notes

- **Quaternions are the file's values.** IMVU's runtime negates `w` when loading
  (and back when saving); this library does not, matching upstream Cal3D.
- **Compressed animations.** Binary animations of versions 913–918, and 919 files with
  the compression flag set, store keyframes as packed bits (11-bit rotations, 1/30 s
  times). Both are read; `animation.toBinary({ compress: true })` writes them.
  Uncompressed (the default) is lossless.
- **What's dropped.** Like IMVU's loader, parsing discards Cal3D features IMVU never
  used: progressive-mesh LOD data, cloth springs, and the redundant child-id lists of
  skeletons (children are derived from `parentId`). Everything else round-trips:
  `X.parse(x.toBinary())` and `X.parse(x.toXml())` give back an equal object.
- **XML** is matched case-insensitively and may have two top-level elements
  (`<HEADER/>` then the body), as IMVU's files do. An `.xmf` holding only a header is an
  empty mesh (creators use it to remove an inherited mesh).
