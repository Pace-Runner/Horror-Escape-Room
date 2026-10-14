/**
 * The world's collision primitives, shared.
 *
 * A collider is `{ minX, maxX, minZ, maxZ }` in world space -- a wall, a
 * furniture footprint. Two dimensions only, because nothing in this game
 * changes height: the player's eye is pinned at a constant Y, which is also why
 * there are no staircases anywhere in it.
 *
 * This lived inside PointerLockPlayer as a private method until the creature
 * needed to walk. Two copies of a push-out would have been two things to keep
 * in step, and the failure mode is subtle and awful: a creature that resolves
 * collisions even slightly differently from the player can stand inside
 * geometry the player cannot reach, or squeeze through a gap the player is
 * blocked by. Both read as the AI cheating.
 */

/**
 * Push a circle out of every box it overlaps, in place.
 *
 * Iterating the whole list once, rather than until nothing overlaps, is
 * deliberate and is what the player has always done: in a corner, resolving one
 * box can push the circle into the next, and the second pass of the same loop
 * catches that. A full relaxation loop would be more correct and would also let
 * a body oscillate between two boxes forever.
 *
 * PUSHABLE BOXES. A box may carry a `push(dx, dz)` method -- something on
 * castors. When a `pusher` is passed, such a box gets first go at the overlap:
 * it is asked to slide away from the circle by the full amount, moves as far as
 * it can (walls and furniture are its business), and returns how far it went.
 * Only what it could not take is pushed back onto the circle, so walking into a
 * free trolley shoves it, and walking into one jammed against a wall is the
 * same as walking into the wall. Without a `pusher` -- the creature, anything
 * that should not be shoving furniture about -- a pushable box is as solid as
 * any other.
 *
 * @param {{x:number,z:number}} pos mutated
 * @param {number} radius
 * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number,push?:Function}>} colliders
 * @param {{pushed:boolean}|null} [pusher] given to let the circle push; its
 *   `pushed` is set true if any pushable box actually moved
 * @returns {boolean} true if anything actually pushed
 */
export function resolveCircle(pos, radius, colliders, pusher = null) {
  let hit = false;
  for (const box of colliders) {
    const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      // A centre inside an AABB has no closest-point direction. Resolve it
      // through the nearest face instead; the old tiny-distance fallback kept
      // dx/dz at zero, so a player could walk through any solid footprint.
      if (distSq === 0) {
        const distanceToLeft = pos.x - box.minX;
        const distanceToRight = box.maxX - pos.x;
        const distanceToBack = pos.z - box.minZ;
        const distanceToFront = box.maxZ - pos.z;
        const nearestFaceDistance = Math.min(distanceToLeft, distanceToRight, distanceToBack, distanceToFront);

        if (nearestFaceDistance === distanceToLeft) pos.x = box.minX - radius;
        else if (nearestFaceDistance === distanceToRight) pos.x = box.maxX + radius;
        else if (nearestFaceDistance === distanceToBack) pos.z = box.minZ - radius;
        else pos.z = box.maxZ + radius;

        hit = true;
        continue;
      }

      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      let pushX = (dx / dist) * push;
      let pushZ = (dz / dist) * push;
      if (pusher && box.push) {
        // The box moves the opposite way to the circle; whatever it managed is
        // overlap the circle no longer has to give back.
        const moved = box.push(-pushX, -pushZ);
        pushX += moved.x;
        pushZ += moved.z;
        if (moved.x !== 0 || moved.z !== 0) pusher.pushed = true;
      }
      pos.x += pushX;
      pos.z += pushZ;
      hit = true;
    }
  }
  return hit;
}

/** True if the point is inside the box, ignoring any radius. */
export function pointInBox(x, z, box) {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}

/**
 * Does the segment (x0,z0)->(x1,z1) cross any collider?
 *
 * This is the sightline test. Slab method per box, which is exact for an
 * axis-aligned box and costs four divides -- cheap enough to run every frame
 * against a level's whole collider list without a broadphase.
 *
 * `ignore` skips specific boxes, for the case where the looker is standing
 * inside one (a doorway volume, a prop it is hiding behind).
 */
export function segmentBlocked(x0, z0, x1, z1, colliders, ignore = null) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  for (const box of colliders) {
    if (ignore && ignore.has(box)) continue;

    // A degenerate ray on an axis: it can only miss if it starts outside the
    // slab, since it never moves across it.
    let tMin = 0;
    let tMax = 1;

    if (Math.abs(dx) < 1e-9) {
      if (x0 < box.minX || x0 > box.maxX) continue;
    } else {
      let t1 = (box.minX - x0) / dx;
      let t2 = (box.maxX - x0) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }

    if (Math.abs(dz) < 1e-9) {
      if (z0 < box.minZ || z0 > box.maxZ) continue;
    } else {
      let t1 = (box.minZ - z0) / dz;
      let t2 = (box.maxZ - z0) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }

    return true;
  }
  return false;
}
