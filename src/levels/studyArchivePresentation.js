import * as THREE from 'three';

// Decorative only: original record targets and moving panels remain their parents.
export function createArchivePresentation(wood, brass) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const recess = new THREE.MeshStandardMaterial({ color: 0x201b16, roughness: 1 });
  function timber(parent, x, y, z, w, h, d, material = wood) {
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function frame(parent, x, y, z, w, h, thickness, depth) {
    for (const side of [-1, 1]) {
      timber(parent, x + side * (w - thickness) / 2, y, z, thickness, h, depth);
      timber(parent, x, y + side * (h - thickness) / 2, z, w - thickness * 2, thickness, depth);
    }
  }
  return {
    records(parent, faceZ, height) {
      const fixture = new THREE.Group();
      fixture.name = 'RecessedArchiveRecordMounts';
      parent.add(fixture);
      // Three individual pockets, returned cheeks and an overhanging cornice.
      for (const x of [-0.46, 0, 0.46]) {
        timber(fixture, x, 1.3, faceZ - 0.052, 0.45, height + 0.055, 0.07, recess);
        frame(fixture, x, 1.3, faceZ - 0.025, 0.454, height + 0.06, 0.012, 0.035);
        timber(fixture, x, 1.3 + height / 2 + 0.012, faceZ - 0.006, 0.07, 0.014, 0.012, brass);
      }
      for (const x of [-0.72, 0.72]) timber(fixture, x, 1.3, faceZ - 0.16, 0.055, height + 0.18, 0.28);
      timber(fixture, 0, 1.3 + height / 2 + 0.075, faceZ - 0.105, 1.52, 0.055, 0.24);
      timber(fixture, 0, 1.3 - height / 2 - 0.065, faceZ - 0.105, 1.49, 0.045, 0.24);
    },
    door(panel, height) {
      // Raised joinery follows the existing sliding mesh, including reset/open state.
      frame(panel, 0, 0, 0.031, 1.28, height - 0.12, 0.032, 0.016);
      timber(panel, 0, -0.18, 0.031, 1.22, 0.035, 0.016);
      frame(panel, 0, (height / 2 - 0.21) / 2, 0.027, 1.10, height / 2 - 0.19, 0.014, 0.01);
    },
    marker(marker) {
      // Back fixed to the wall; stepped walnut molding surrounds the original plaque.
      timber(marker, 0, 0, -0.055, 0.75, 0.71, 0.075);
      frame(marker, 0, 0, 0.009, 0.73, 0.69, 0.035, 0.065);
      timber(marker, 0, 0.365, -0.025, 0.79, 0.035, 0.12);
      for (const x of [-0.337, 0.337]) timber(marker, x, -0.29, 0.049, 0.012, 0.012, 0.008, brass);
    }
  };
}
