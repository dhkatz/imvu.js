# Render with three.js

`@imvu/chkn` assembles a product's Cal3D meshes and materials, and `@imvu/cal3d`
turns each submesh into typed arrays. That's everything a WebGL engine needs. This
page draws a product's static (bind-pose) geometry with
[three.js](https://threejs.org/).

```sh
npm install @imvu/chkn three
```

## Load the product

```ts
import { CdnProductSource, Product } from '@imvu/chkn';

// Revisions from the XML-RPC gateway, resolved server-side (see Download products).
const source = new CdnProductSource({ revisions });
const product = await Product.load(productId, source);
const { parts } = product.loadModel();
```

`loadModel()` returns one **part** per mesh slot in the product's template. Each part
has the parsed `mesh` and a map from material slot to its parsed `material`. A
submesh's `materialId` picks its slot.

If this runs in a browser, read [Running in the browser](/guide/browser) first: the
API and CDN may need a proxy.

## Build three.js meshes

```ts
import * as THREE from 'three';
import type { Material as Cal3DMaterial } from '@imvu/cal3d';

const group = new THREE.Group();

for (const part of parts) {
  for (const submesh of part.mesh?.submeshes ?? []) {
    const buffers = submesh.toBuffers();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
    if (buffers.texCoords[0]) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.texCoords[0], 2));
    }
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));

    const slot = part.materials.get(submesh.materialId);
    group.add(new THREE.Mesh(geometry, await toThreeMaterial(slot?.material ?? null)));
  }
}

scene.add(group);
```

## Textures

Materials name their textures. `product.fetchAsset()` finds each one in the product
or its parents and downloads the full-size version:

```ts
const textures = new Map<string, Promise<THREE.Texture>>();

function loadTexture(filename: string): Promise<THREE.Texture> {
  let texture = textures.get(filename);
  if (!texture) {
    texture = product.fetchAsset(filename).then(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const result = new THREE.Texture(bitmap);
      result.colorSpace = THREE.SRGBColorSpace;
      result.needsUpdate = true;
      return result;
    });
    textures.set(filename, texture);
  }
  return texture;
}

async function toThreeMaterial(material: Cal3DMaterial | null): Promise<THREE.Material> {
  const diffuse = material?.diffuseMap?.filename;
  const opacity = material?.opacityMap?.filename;

  return new THREE.MeshStandardMaterial({
    map: diffuse ? await loadTexture(diffuse) : null,
    alphaMap: opacity ? await loadTexture(opacity) : null,
    transparent: Boolean(opacity),
  });
}
```

Textures are shared between submeshes, so cache them by name as shown.

## Things to adjust

- **Image formats.** `createImageBitmap` decodes PNG, JPEG, BMP and the like, but
  some products ship **`.tga`** textures, which browsers can't decode. Use a TGA
  decoder for those, such as three's `TGALoader`.
- **Orientation.** If the model lies on its side or its textures appear upside down,
  rotate the group (for example `group.rotation.x = -Math.PI / 2`) or flip the `v`
  texture coordinate (`1 - v`).
- **Render settings.** Each material slot's `spec.raw` holds IMVU's settings for it
  (two-sided, blend mode, and so on) if you want to match IMVU's look more closely.
- **Animation.** `buffers.skinIndices` and `buffers.skinWeights` carry up to four
  bone influences per vertex by default (`toBuffers({ maxInfluences })`). Combined with `product.loadModel().skeleton` and an
  `Animation`, that's enough to build a `THREE.SkinnedMesh`, but bone and quaternion
  conventions need care (see [Cal3D notes](/recipes/cal3d#things-to-know)).
