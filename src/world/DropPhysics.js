import * as THREE from 'three';

/**
 * Dropped items FALL: gravity, bounces that lose energy, and a tumble that
 * settles into the item's resting pose.
 *
 * The resting spot is not ours to choose. main.js's placeDroppedItem() already
 * picks it carefully -- clear of colliders, reachable, on whatever surface is
 * under it -- because a drop must never be able to softlock a run. So this is
 * the inverse problem: given where the item leaves the hand and where it must
 * end up, find the throw that gets it there under real physics.
 *
 * THE MODEL, per item:
 *
 *   Vertical: projectile motion, y(t) = y0 + vy t - g t^2 / 2. When it reaches
 *     the rest height it bounces, its vertical speed reversed and scaled by the
 *     coefficient of restitution e (0 = clay, 1 = a perfect superball), until
 *     the bounce is too small to see.
 *   Horizontal: constant velocity in flight; each impact keeps a fraction
 *     (1 - friction) of it.
 *   Solving for the throw: every flight time is known in closed form (the first
 *     from the quadratic above, then 2 v_k / g with v_k = e^k v_impact), and so
 *     is every bounce's share of the horizontal speed ((1 - friction)^k). The
 *     total horizontal distance is therefore the launch speed times a number
 *     we can compute, so the launch speed is just distance / that number, and
 *     the item comes to rest EXACTLY on the chosen spot.
 *   Rotation: it leaves the hand tilted and spinning, and slerps (spherical
 *     interpolation between quaternions) into its resting orientation as its
 *     energy goes, so the last bounce lands flat.
 *
 * Stepped on the frame clock with the analytic solution rather than integrated,
 * so 30 Hz and 144 Hz land identically.
 */

/** m/s^2. */
const GRAVITY_IN_METRES_PER_SECOND_SQUARED = 9.81;
/** Bounciness of a small hard object on a floor. */
const RESTITUTION = 0.32;
/** Share of horizontal speed lost at each impact. */
const IMPACT_FRICTION = 0.45;
/** Below this vertical speed a bounce is not worth showing: the item has landed. */
const MIN_BOUNCE_SPEED_IN_METRES_PER_SECOND = 0.35;
/** The little upward lift of letting go: a toss, not a dead drop. */
const RELEASE_LIFT_IN_METRES_PER_SECOND = 0.9;
/** Never more bounces than this, whatever the numbers say. */
const MAX_BOUNCES = 4;
/** How tilted (radians) and how fast spinning (rad/s) it leaves the hand. */
const RELEASE_TILT_IN_RADIANS = 0.9;
const RELEASE_SPIN_IN_RADIANS_PER_SECOND = 7;

const _restQuaternion = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/**
 * Plans one fall: every flight's duration and vertical launch speed, and the
 * horizontal speed that makes the whole sequence end on the target.
 *
 * @param {number} dropHeightInMetres - release height above the rest height. Negative
 *   for a throw UP onto something higher than the hand (the study's loft).
 * @param {number} horizontalDistanceInMetres - from release to rest, across the floor.
 * @param {number} [liftInMetresPerSecond] - the release's upward speed: a toss
 *   by default, more for a throw. Raised if it could not reach a higher rest.
 * @returns {{ flights: { seconds: number, launchSpeed: number, horizontalShare: number }[], horizontalSpeed: number }}
 */
function planFall(dropHeightInMetres, horizontalDistanceInMetres, liftInMetresPerSecond = RELEASE_LIFT_IN_METRES_PER_SECOND) {
  const g = GRAVITY_IN_METRES_PER_SECOND_SQUARED;
  const climb = Math.max(0, -dropHeightInMetres);
  const lift = Math.max(liftInMetresPerSecond, climb > 0 ? Math.sqrt(2 * g * climb) + 0.6 : 0);
  // First flight: solve y0 + lift t - g t^2 / 2 = 0 for the later (falling) root.
  const firstSeconds = (lift + Math.sqrt(lift * lift + 2 * g * dropHeightInMetres)) / g;
  const flights = [{ seconds: firstSeconds, launchSpeed: lift, horizontalShare: 1 }];
  let impactSpeed = g * firstSeconds - lift;
  let share = 1;
  for (let bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    const reboundSpeed = impactSpeed * RESTITUTION;
    if (reboundSpeed < MIN_BOUNCE_SPEED_IN_METRES_PER_SECOND) break;
    share *= 1 - IMPACT_FRICTION;
    flights.push({ seconds: (2 * reboundSpeed) / g, launchSpeed: reboundSpeed, horizontalShare: share });
    impactSpeed = reboundSpeed;
  }
  // Distance = speed * sum(seconds * share): solve for speed.
  const weightedSeconds = flights.reduce((sum, flight) => sum + flight.seconds * flight.horizontalShare, 0);
  return { flights, horizontalSpeed: horizontalDistanceInMetres / weightedSeconds };
}

/**
 * @param {object} [options]
 * @param {(impactSpeedInMetresPerSecond: number, holder: THREE.Object3D, impactIndex: number) => void} [options.onImpact]
 *   - each time it hits the floor; `impactIndex` 0 is the landing, then each bounce.
 * @returns {{
 *   drop: (holder: THREE.Object3D, releaseWorldPosition: THREE.Vector3, options?: { lift?: number }) => void,
 *   update: (dtInSeconds: number) => void,
 *   isFalling: (holder: THREE.Object3D) => boolean,
 *   clear: () => void
 * }}
 */
export function createDropPhysics({ onImpact = () => {} } = {}) {
  /** Items in the air: one record each. */
  const falling = [];

  /** Where the record's item is, `elapsed` seconds into its current flight. */
  function applyFlight(record) {
    const flight = record.plan.flights[record.flightIndex];
    const t = Math.min(record.elapsed, flight.seconds);
    const g = GRAVITY_IN_METRES_PER_SECOND_SQUARED;
    const height = (record.flightIndex === 0 ? record.dropHeight : 0) + flight.launchSpeed * t - 0.5 * g * t * t;
    const travelled = record.travelledBefore + record.plan.horizontalSpeed * flight.horizontalShare * t;
    const along = record.distance > 0 ? travelled / record.distance : 1;
    record.holder.position.set(
      record.start.x + (record.rest.x - record.start.x) * along,
      // A throw up to a higher floor starts BELOW its rest: only the bounces clamp.
      record.rest.y + (record.flightIndex === 0 ? height : Math.max(0, height)),
      record.start.z + (record.rest.z - record.start.z) * along
    );
    // Energy left, 1 at release to 0 on the last landing: how far from rest the pose still is.
    const totalSeconds = record.plan.flights.reduce((sum, f) => sum + f.seconds, 0);
    const progress = Math.min(1, (record.secondsBefore + t) / totalSeconds);
    const unsettled = 1 - progress * progress * (3 - 2 * progress);
    _axis.copy(record.tiltAxis);
    _tilt.setFromAxisAngle(_axis, RELEASE_TILT_IN_RADIANS * unsettled
      + RELEASE_SPIN_IN_RADIANS_PER_SECOND * unsettled * (record.secondsBefore + t) * 0.15);
    record.holder.quaternion.copy(record.restQuaternion).premultiply(_tilt);
  }

  return {
    /**
     * Starts `holder` falling from `releaseWorldPosition` to where it already
     * is. Call AFTER the caller has placed it at its resting spot. `lift` is
     * the release's upward speed: leave it for a drop, raise it for a throw.
     */
    drop(holder, releaseWorldPosition, { lift = RELEASE_LIFT_IN_METRES_PER_SECOND } = {}) {
      const rest = holder.position.clone();
      const start = releaseWorldPosition.clone();
      if (holder.parent) holder.parent.worldToLocal(start);
      const distance = Math.hypot(rest.x - start.x, rest.z - start.z);
      // Signed, for a throw up onto a higher floor; a drop is always >= 0 here.
      const dropHeight = lift > RELEASE_LIFT_IN_METRES_PER_SECOND ? start.y - rest.y : Math.max(0, start.y - rest.y);
      _restQuaternion.copy(holder.quaternion);
      // A random tumble axis, roughly horizontal, so it rolls rather than twirls.
      const tiltAxis = new THREE.Vector3(Math.random() - 0.5, 0.2, Math.random() - 0.5).normalize();
      falling.push({
        holder, start, rest, distance, dropHeight, tiltAxis,
        restQuaternion: _restQuaternion.clone(),
        plan: planFall(dropHeight, distance, lift),
        flightIndex: 0, elapsed: 0, travelledBefore: 0, secondsBefore: 0
      });
      applyFlight(falling[falling.length - 1]);
    },

    /** Advances every falling item; lands, bounces and finishes them. */
    update(dtInSeconds) {
      for (let i = falling.length - 1; i >= 0; i--) {
        const record = falling[i];
        // Picked up, or cleared by a restart, mid-air: forget it.
        if (!record.holder.parent) { falling.splice(i, 1); continue; }
        record.elapsed += dtInSeconds;
        let flight = record.plan.flights[record.flightIndex];
        while (record.elapsed >= flight.seconds) {
          const g = GRAVITY_IN_METRES_PER_SECOND_SQUARED;
          const impactSpeed = g * flight.seconds - flight.launchSpeed;
          onImpact(impactSpeed, record.holder, record.flightIndex);
          record.elapsed -= flight.seconds;
          record.secondsBefore += flight.seconds;
          record.travelledBefore += record.plan.horizontalSpeed * flight.horizontalShare * flight.seconds;
          record.flightIndex++;
          if (record.flightIndex >= record.plan.flights.length) break;
          flight = record.plan.flights[record.flightIndex];
        }
        if (record.flightIndex >= record.plan.flights.length) {
          // Exactly where placeDroppedItem() put it, exactly as it put it.
          record.holder.position.copy(record.rest);
          record.holder.quaternion.copy(record.restQuaternion);
          falling.splice(i, 1);
          continue;
        }
        applyFlight(record);
      }
    },

    isFalling(holder) {
      return falling.some((record) => record.holder === holder);
    },

    /** Lands everything instantly: for a restart or a level change. */
    clear() {
      for (const record of falling) {
        record.holder.position.copy(record.rest);
        record.holder.quaternion.copy(record.restQuaternion);
      }
      falling.length = 0;
    }
  };
}
