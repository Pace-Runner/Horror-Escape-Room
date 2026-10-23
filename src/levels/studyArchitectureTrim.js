import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// One cheap decorative mesh. Openings, floor heights and collision stay authored.
export function addStudyArchitectureTrim(group, material, { width, depth, height, loftY, loftFrontZ, stairTopZ, entryZ, entryWidth, exitWidth }) {
  const parts = [];
  function run(start, end, fixed, y, h, d, alongX) {
    if (end <= start) return;
    const geometry = new THREE.BoxGeometry(end - start, h, d);
    const uv = geometry.attributes.uv, position = geometry.attributes.position, normal = geometry.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const side = Math.abs(normal.getX(i)) > 0.7;
      uv.setXY(i, (side ? position.getY(i) : position.getX(i)) / 0.85,
        (side || Math.abs(normal.getY(i)) > 0.7 ? position.getZ(i) : position.getY(i)) / 0.25);
    }
    if (!alongX) geometry.rotateY(Math.PI / 2);
    geometry.translate(alongX ? (start + end) / 2 : fixed, y, alongX ? fixed : (start + end) / 2);
    parts.push(geometry);
  }
  const halfW = width / 2, halfD = depth / 2;
  // A consistent skirting profile: solid board, small cap, then floor shoe.
  for (const [centerY, h, d] of [[0.07, 0.14, 0.03], [0.137, 0.018, 0.042], [0.017, 0.034, 0.044]]) {
    run(-halfW, halfW, -halfD + d / 2, centerY, h, d, true);
    run(-halfW, -exitWidth / 2, halfD - d / 2, centerY, h, d, true);
    run(exitWidth / 2, halfW, halfD - d / 2, centerY, h, d, true);
    run(-halfD + d, halfD - d, -halfW + d / 2, centerY, h, d, false);
    run(-halfD + d, entryZ - entryWidth / 2, halfW - d / 2, centerY, h, d, false);
    run(entryZ + entryWidth / 2, halfD - d, halfW - d / 2, centerY, h, d, false);
    run(-halfW, halfW, -halfD + d / 2, loftY + centerY, h, d, true);
    run(-halfD + d, loftFrontZ, -halfW + d / 2, loftY + centerY, h, d, false);
    run(-halfD + d, stairTopZ, halfW - d / 2, loftY + centerY, h, d, false);
  }
  // Three small stepped bands form a restrained crown; butt joints avoid coplanar corners.
  for (const [drop, h, d] of [[0.11, 0.12, 0.045], [0.045, 0.045, 0.080], [0.012, 0.024, 0.110]]) {
    run(-halfW, halfW, -halfD + d / 2, height - drop, h, d, true);
    run(-halfW, halfW, halfD - d / 2, height - drop, h, d, true);
    run(-halfD + d, halfD - d, -halfW + d / 2, height - drop, h, d, false);
    run(-halfD + d, halfD - d, halfW - d / 2, height - drop, h, d, false);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  mesh.name = 'StudyArchitecturalTrim';
  mesh.receiveShadow = true;
  group.add(mesh);
  parts.forEach(geometry => geometry.dispose());
  return mesh;
}
