import * as THREE from 'three';

// Small shared transfer masks: full sole, broken sole, toe-only and dragged heel.
function transferTexture(variant) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(256, 256);
  const noise = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + variant * 71.3) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = x / 255, v = y / 255;
    const toe = 1 - Math.hypot((u - 0.47) / 0.30, (v - 0.28) / 0.21);
    const heel = 1 - Math.hypot((u - 0.52) / 0.22, (v - 0.79) / 0.15);
    const arch = 1 - Math.hypot((u - 0.37) / 0.17, (v - 0.52) / 0.24);
    const edge = Math.max(toe, heel, arch) + (noise(x >> 2, y >> 2) - 0.5) * 0.12;
    let alpha = Math.min(1, Math.max(0, edge * 24)) * (0.45 + noise(x, y) * 0.5);
    // Interrupted tread grooves and granular missing transfer, rather than solid blobs.
    if (Math.sin(v * 95 + u * 8) > 0.8 && noise(x >> 3, y >> 3) > 0.22) alpha *= 0.12;
    if (noise(x, y) > 0.87 || noise(x >> 2, y >> 2) > 0.92) alpha *= 0.05;
    if (variant === 1 && ((v > 0.4 && v < 0.63) || noise(x >> 4, y >> 4) > 0.75)) alpha *= 0.08;
    if (variant === 2 && v > 0.47) alpha = 0;
    if (variant === 3) alpha *= v > 0.64 ? 0.9 : 0.12;
    const i = (y * 256 + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    pixels.data[i + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function addStudyFootprints({ distortedTrail, bloodTrail, visorOnly, stairX, stairBottomZ, stairCount, stairDepth, stairRise, loftY }) {
  const prints = [], pacing = [];
  let serial = 0;
  const jitter = (n) => Math.sin(n * 23.17 + 7.3) * 0.5 + 0.5;
  function route(points, y, destination) {
    for (let segment = 1; segment < points.length; segment++) {
      const [ax, az] = points[segment - 1], [bx, bz] = points[segment];
      const length = Math.hypot(bx - ax, bz - az);
      for (let distance = 0.19; distance < length - 0.09;) {
        const index = serial++, side = index % 2 ? -1 : 1;
        const t = distance / length, offset = side * (0.075 + jitter(index) * 0.035);
        destination.push({ x: ax + (bx - ax) * t + (bz - az) / length * offset,
          z: az + (bz - az) * t - (bx - ax) / length * offset, y: y + 0.006,
          angle: Math.atan2(ax - bx, az - bz) + (jitter(index + 2) - 0.5) * 0.24,
          index, stair: false });
        distance += 0.40 + jitter(index + 4) * 0.20;
      }
    }
  }
  route([[-1.8, 2.25], [1.9, 2.8], [4.9, 3.25], [stairX, stairBottomZ + 0.17]], 0, prints);
  // Each print lies flat on one real tread, including the 15mm tread nosing offset.
  for (let step = 0; step < stairCount; step++) {
    const index = serial++;
    prints.push({ x: stairX + (index % 2 ? -0.10 : 0.10),
      z: stairBottomZ - stairDepth * (step + 0.5) + 0.015 + (jitter(index) - 0.5) * 0.016,
      y: stairRise * (step + 1) + 0.0555 + 0.003,
      angle: (jitter(index + 2) - 0.5) * 0.12, index, stair: true });
  }
  const topZ = stairBottomZ - stairCount * stairDepth;
  route([[stairX, topZ - 0.15], [6.1, -3.3], [6.1, -4.5], [4.4, -4.95]], loftY, prints);
  // Preserve the existing visor-only pacing path using the same transfer assets.
  route([[2.2, 2.7], [-2.4, -2.3]], 0, pacing);
  const geometries = [new THREE.PlaneGeometry(0.16, 0.29), new THREE.PlaneGeometry(0.16, 0.29)];
  const uv = geometries[1].attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  const textures = Array.from({ length: 4 }, (_, i) => transferTexture(i));
  const dummy = new THREE.Object3D();
  function batches(parent, placements, blood) {
    for (let variant = 0; variant < 4; variant++) for (let side = 0; side < 2; side++) {
      const selected = placements.filter(p => p.index % 2 === side &&
        (p.index % 11 === 5 ? 2 : p.index % 9 === 6 ? 3 : p.index % 5 === 3 ? 1 : 0) === variant);
      if (!selected.length) continue;
      const mat = new THREE.MeshBasicMaterial({ color: blood ? 0x502b22 : 0x171318,
        map: textures[variant], transparent: true, opacity: [0.82, 0.56, 0.65, 0.50][variant], depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const mesh = new THREE.InstancedMesh(geometries[side], mat, selected.length);
      mesh.name = `ArchiveFootprints_${blood ? 'blood' : 'distorted'}_${variant}_${side}`;
      selected.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(-Math.PI / 2, 0, p.angle);
        const size = 0.91 + jitter(p.index + 1) * 0.16;
        dummy.scale.set(size, p.stair ? size * 0.82 : size, 1);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, new THREE.Color().setScalar(0.48 + jitter(p.index + 3) * 0.52));
      });
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
  }
  batches(distortedTrail, prints, false);
  batches(bloodTrail, prints, true);
  batches(visorOnly, pacing, true);
  bloodTrail.userData.footprintPlacements = prints;
  bloodTrail.userData.footprintVariants = 4;
}
