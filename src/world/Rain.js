import * as THREE from 'three';

// A small GPU-friendly particle system: vertical rain streaks confined to
// a box just outside a window, recycled as they fall past the sill.
export class Rain {
  constructor({ count = 500, width = 3.2, height = 3.4, depth = 0.6, origin = new THREE.Vector3() } = {}) {
    this.height = height;
    this.origin = origin;

    const positions = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = origin.x + (Math.random() - 0.5) * width;
      positions[i * 3 + 1] = origin.y + Math.random() * height;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * depth;
      this.speeds[i] = 2.4 + Math.random() * 1.8;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry = geometry;
    this.width = width;
    this.depth = depth;

    const material = new THREE.PointsMaterial({
      color: 0x9fb3c8,
      size: 0.03,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });

    this.points = new THREE.Points(geometry, material);
  }

  update(dt) {
    const pos = this.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - this.speeds[i] * dt;
      if (y < this.origin.y - 0.05) {
        y = this.origin.y + this.height;
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
}
