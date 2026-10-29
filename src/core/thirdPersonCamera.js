/** Pull the camera boom in before any wall, prop, floor or stair slab.
 * Heightless movement colliders represent full-height walls. */
export function constrainThirdPersonCamera(eye, desired, boxes, out, margin = 0.10) {
  let fraction = 1;
  const delta = { x: desired.x - eye.x, y: desired.y - eye.y, z: desired.z - eye.z };
  for (const box of boxes) {
    let enter = 0, leave = 1;
    for (const [axis, min, max] of [['x', 'minX', 'maxX'], ['y', 'minY', 'maxY'], ['z', 'minZ', 'maxZ']]) {
      const low = (box[min] ?? -Infinity) - margin, high = (box[max] ?? Infinity) + margin;
      if (Math.abs(delta[axis]) < 1e-9) {
        if (eye[axis] < low || eye[axis] > high) { enter = Infinity; break; }
      } else {
        const a = (low - eye[axis]) / delta[axis], b = (high - eye[axis]) / delta[axis];
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
        if (enter > leave) break;
      }
    }
    if (enter <= leave && leave >= 0) fraction = Math.min(fraction, Math.max(0, enter - 0.001));
  }
  return out.copy(eye).addScaledVector(delta, fraction);
}
