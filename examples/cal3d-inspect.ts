/**
 * @imvu/cal3d — summarize any Cal3D file, and optionally convert it between
 * the binary and XML flavors. No login, no network.
 *
 *   node examples/cal3d-inspect.ts <file> [out]
 *
 * The file's kind and flavor come from its contents, never its extension
 * (IMVU's CDN serves binary files under XML extensions). When `out` ends in
 * `.x?f` the file is written as XML, otherwise as binary.
 */
import { readFile, writeFile } from 'node:fs/promises';

import { load } from '@imvu/cal3d';

const [input, output] = process.argv.slice(2);

if (!input) {
  console.error('Usage: cal3d-inspect.ts <file> [out]');
  process.exit(1);
}

const file = load(await readFile(input));

switch (file.kind) {
  case 'skeleton':
    console.log(`Skeleton: ${file.value.bones.length} bones`);
    for (const { bone, depth } of file.value.walk()) console.log(`${'  '.repeat(depth + 1)}${bone.name}`);
    break;
  case 'mesh':
    console.log(`Mesh: ${file.value.vertexCount} vertices, ${file.value.faceCount} faces`);
    for (const [index, submesh] of file.value.submeshes.entries()) {
      console.log(`  submesh ${index}: material ${submesh.materialId}, ${submesh.vertices.length} vertices`);
    }
    if (file.value.morphNames.length) console.log(`  morphs: ${file.value.morphNames.join(', ')}`);
    break;
  case 'material':
    console.log('Material');
    for (const map of file.value.maps) console.log(`  ${map.type}: ${map.filename}`);
    break;
  case 'animation':
    console.log(`Animation: ${file.value.duration}s, ${file.value.tracks.length} bone tracks`);
    break;
  case 'morphAnimation':
    console.log(`Morph animation: ${file.value.duration}s`);
    for (const track of file.value.tracks) console.log(`  ${track.morphName}: ${track.keyframes.length} keyframes`);
    break;
}

if (output) {
  const asXml = /\.x[a-z]f$/i.test(output);
  await writeFile(output, asXml ? file.value.toXml() : file.value.toBinary());
  console.log(`Wrote ${output} (${asXml ? 'XML' : 'binary'})`);
}
