# Read and edit Cal3D files

IMVU products are built from [Cal3D](https://github.com/imvu/cal3d) files: skeletons,
meshes, materials and animations. `@imvu/cal3d` reads each kind into a plain object
you can inspect, change and save again, in either the binary or the XML flavor.

| Kind            | Class            | Binary | XML    |
| --------------- | ---------------- | ------ | ------ |
| Skeleton        | `Skeleton`       | `.csf` | `.xsf` |
| Mesh            | `Mesh`           | `.cmf` | `.xmf` |
| Material        | `Material`       | `.crf` | `.xrf` |
| Animation       | `Animation`      | `.caf` | `.xaf` |
| Morph animation | `MorphAnimation` | `.cpf` | `.xpf` |

## Inspect any file

This example identifies a file, prints a summary, and optionally converts it:

<<< ../../examples/cal3d-inspect.ts

```sh
node examples/cal3d-inspect.ts Room.MESH.xmf
# Mesh: 937 vertices, 814 faces
#   submesh 0: material 0, 937 vertices

node examples/cal3d-inspect.ts RootNode_skeleton.Room.xsf
# Skeleton: 47 bones
#   skeleton.Room
#     Room.MESH
#     Seat01.Standing
#     …
```

::: warning Don't trust the extension
IMVU's CDN serves binary files under XML extensions: a `.xmf` is usually a binary
mesh. `load()` and every `X.parse()` decide from the contents, so pass bytes and let
them work it out.
:::

## When you know the kind

```ts
import { Mesh, Skeleton } from '@imvu/cal3d';

const skeleton = Skeleton.parse(bytes);
skeleton.getBone('Head'); // by name or id
skeleton.roots;
for (const { bone, depth } of skeleton.walk()) console.log('  '.repeat(depth) + bone.name);

const mesh = Mesh.parse(bytes);
for (const submesh of mesh.submeshes) {
  submesh.materialId; // which material slot it uses
  submesh.vertices[0].influences; // [{ boneId, weight }, …]
  submesh.morphTargets.map((morph) => morph.name);
}
```

## Edit and save

Objects are mutable. Change them, then write either flavor:

```ts
const skeleton = Skeleton.parse(bytes);
skeleton.getBone('Head')!.translation.z += 1;

const binary: Uint8Array = skeleton.toBinary();
const xml: string = skeleton.toXml();
```

Everything IMVU uses survives a round trip: `Mesh.parse(mesh.toBinary())` and
`Mesh.parse(mesh.toXml())` both equal the original. The exceptions are Cal3D features
IMVU never used (progressive-mesh LOD, cloth springs), which are dropped on read, as
IMVU's own loader does.

Animations can be written compressed, as IMVU's newer files are:

```ts
animation.toBinary({ compress: true }); // smaller, lossy
animation.toBinary(); // lossless
```

## Get render-ready buffers

`submesh.toBuffers()` produces typed arrays ready for WebGL or any engine:

```ts
const { positions, normals, texCoords, indices, skinIndices, skinWeights } = submesh.toBuffers();
```

See [Render with three.js](/recipes/rendering) for a full example.

## Things to know

- **Quaternions are stored as in the file.** IMVU's runtime negates `w` when it
  loads them; this library doesn't, matching upstream Cal3D. Negate `w` yourself if
  you compare against IMVU's runtime values.
- **Materials don't contain images.** A `TextureMap` names a texture file
  (`material.diffuseMap?.filename`) that ships with the product or one of its
  parents. Fetch it with `product.fetchAsset(name)` from `@imvu/chkn`.
- **A header-only `.xmf` is an empty mesh.** Creators ship these to remove a mesh
  inherited from a parent product.
