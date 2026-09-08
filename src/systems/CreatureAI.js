import { resolveCircle, segmentBlocked } from '../core/collision.js';

/**
 * What the thing in the house is actually doing.
 *
 * READ THIS BEFORE CHANGING ANY OF IT. Every instinct for a horror-game AI is
 * wrong here, because this one is not hunting the player. The ending is that it
 * was never hunting: it is Annabelle, she is hiding FROM you, and everything
 * she does is an attempt to keep you inside the house. The storyline is
 * explicit -- "Every time it ran away, hid behind things, or interfered with
 * you trying to escape wasn't because it was trying to kill you, it was trying
 * to stop you from escaping."
 *
 * So the behaviour is built out of two drives that have nothing to do with
 * aggression:
 *
 *   KEEP AWAY   - it does not want to be seen and does not want to be near you.
 *                 Look at it and it breaks and runs. This is what reads as
 *                 stalking on a first playthrough and as terror on a second.
 *   KEEP YOU IN - it moves to stand between you and the way out. That is the
 *                 only thing it ever moves TOWARD you to do, and even then it
 *                 is heading for the door, not for you.
 *
 * Being caught is being STOPPED, not killed. She intercepts you, the screen
 * goes, and you come to further back in the house having lost time. That is a
 * real fail state with real stakes, and on a second playthrough it is exactly
 * what Mark's letter predicts: "I'll think I'm trapped. I'll search for keys.
 * I'll break the locks."
 *
 * A kill would break the story. Nothing in here may kill the player.
 */

/** Metres. Matches the player's bodyRadius so neither can go where the other cannot. */
const BODY_RADIUS = 0.35;

/** How close it will let the player get before it breaks away, in metres. */
const PERSONAL_SPACE = 3.4;
/** Below this it has failed to keep away and will push past -- the intercept. */
const CONTACT_RANGE = 0.85;

/** Field of view for "the player can see me", radians, half-angle. */
const PLAYER_FOV = 0.62;

const SPEED = {
  /** Slower than the player's 2.015: it should never simply outrun you. */
  patrol: 0.85,
  /** Faster, briefly. Fleeing is the only time it moves quickly. */
  flee: 2.35,
  /** Moving to block a door. Urgent but not a charge. */
  block: 1.95
};

/** Seconds it holds still and watches before moving on. */
const WATCH_TIME = 2.6;
/** Seconds of cooldown after a catch, during which it will not intercept again. */
const CATCH_COOLDOWN = 6.0;
/**
 * Seconds it spends visibly backing away immediately after a catch.
 *
 * Without this it re-evaluates on the very next frame, decides the player is
 * still near the door, and walks straight back at them -- which reads as being
 * mauled repeatedly. It has to be SEEN to withdraw, or "caught means stopped,
 * not killed" is a claim the player never observes.
 */
const RETREAT_TIME = 1.8;
/**
 * Once it is standing in a doorway it holds its ground until the player is
 * closer than this. Being looked at from across a room is not enough to move
 * it: standing in the doorway staring is the single image the entire first
 * playthrough is built on, and an AI that bolts the moment you glance at it can
 * never produce that image. Walk right up to it and it still breaks -- which is
 * what the storyline describes ("as you approach it runs away").
 */
const BLOCK_HOLD_RANGE = 1.9;

/**
 * Breathing intensity by distance. The audio engine's dial is the game's menace
 * meter and main.js already uses it that way; this makes it mean something
 * continuous instead of a handful of scripted set-pieces.
 */
const BREATH_NEAR = 3.0;
const BREATH_FAR = 12.0;
const BREATH_MIN = 0.10;
const BREATH_MAX = 0.85;

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * @param creature   from createCreature()
 * @param getPlayer  () => ({ x, z, yaw }) -- the player's position and facing
 * @param colliders  the active level's collider list
 * @param waypoints  [[x, z], ...] it walks between when it has nothing else to do
 * @param guardPoints [[x, z], ...] the ways out. It moves to stand on the one
 *                   the player is closest to. Empty means nothing to guard.
 * @param onCaught   called when it reaches the player. The caller decides where
 *                   they wake up -- this module never moves the player itself.
 * @param onBreathing called every frame with 0..1
 */
export function createCreatureAI({
  creature,
  getPlayer,
  colliders = [],
  waypoints = [],
  guardPoints = [],
  onCaught = () => {},
  onBreathing = () => {}
} = {}) {
  /** 'idle' | 'patrol' | 'watch' | 'flee' | 'block' | 'stopped' */
  let state = 'idle';
  let waypointIndex = 0;
  let timer = 0;
  let cooldown = 0;
  let enabled = false;
  const pos = { x: 0, z: 0 };

  /** Where it is heading right now. */
  const target = { x: 0, z: 0 };

  function setState(next) {
    if (state === next) return;
    state = next;
    timer = 0;
  }

  /** Can the PLAYER see the creature? Facing and line of sight, both required. */
  function seenByPlayer(player) {
    if (segmentBlocked(player.x, player.z, pos.x, pos.z, colliders)) return false;
    // The player's yaw convention: 0 looks down -Z, increasing turns left.
    const toX = pos.x - player.x;
    const toZ = pos.z - player.z;
    const len = Math.hypot(toX, toZ) || 1e-6;
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const dot = (toX / len) * forwardX + (toZ / len) * forwardZ;
    return dot > Math.cos(PLAYER_FOV);
  }

  /** The exit the player is heading for, or null if there is nothing to guard. */
  function threatenedGuardPoint(player) {
    if (!guardPoints.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const [gx, gz] of guardPoints) {
      const d = dist2(player.x, player.z, gx, gz);
      if (d < bestD) { bestD = d; best = [gx, gz]; }
    }
    // Only worth blocking if the player is actually closing on it. 8 m is far
    // enough to get there first at block speed without teleporting.
    return bestD < 8 * 8 ? best : null;
  }

  /**
   * Move toward `target`, sliding along whatever it hits. No pathfinding: the
   * levels are single rooms and short corridors, and a creature that solves a
   * maze perfectly reads as a machine. Getting stuck on a corner for a moment
   * and shuffling free is better horror than a flawless A*.
   */
  function steer(speed, dt) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return 0;
    const step = Math.min(speed * dt, len);
    pos.x += (dx / len) * step;
    pos.z += (dz / len) * step;
    resolveCircle(pos, BODY_RADIUS, colliders);
    return len;
  }

  function facePoint(x, z) {
    // Same convention as the player: yaw 0 faces -Z.
    creature.setYaw(Math.atan2(-(x - pos.x), -(z - pos.z)));
  }

  return {
    /** Level scripts call this when the creature should start behaving. */
    start(x, z) {
      pos.x = x;
      pos.z = z;
      creature.setPosition(x, z);
      creature.visible = true;
      enabled = true;
      waypointIndex = 0;
      cooldown = 0;
      setState(waypoints.length ? 'patrol' : 'idle');
    },

    /** Off, hidden, and no longer breathing down anyone's neck. */
    stop() {
      enabled = false;
      creature.visible = false;
      creature.setSpeed(0);
      setState('stopped');
      onBreathing(BREATH_MIN);
    },

    /** Teleport it somewhere without changing what it is doing. */
    place(x, z) {
      pos.x = x;
      pos.z = z;
      creature.setPosition(x, z);
    },

    setColliders(boxes) {
      colliders = boxes;
    },

    setWaypoints(points) {
      waypoints = points;
      waypointIndex = 0;
    },

    setGuardPoints(points) {
      guardPoints = points;
    },

    get state() {
      return state;
    },

    get position() {
      return { x: pos.x, z: pos.z };
    },

    reset() {
      enabled = false;
      state = 'idle';
      timer = 0;
      cooldown = 0;
      waypointIndex = 0;
      creature.reset();
      creature.visible = false;
    },

    update(dt) {
      if (!enabled) return;
      const player = getPlayer();
      const d = Math.sqrt(dist2(pos.x, pos.z, player.x, player.z));
      timer += dt;
      cooldown = Math.max(0, cooldown - dt);

      // Breathing first, so it is driven by simple proximity regardless of what
      // the state machine decides -- the player should feel it getting closer
      // even when it is behind them and doing nothing at all.
      const t = 1 - Math.min(1, Math.max(0, (d - BREATH_NEAR) / (BREATH_FAR - BREATH_NEAR)));
      onBreathing(BREATH_MIN + (BREATH_MAX - BREATH_MIN) * t);

      const seen = seenByPlayer(player);
      const guard = threatenedGuardPoint(player);
      const retreating = cooldown > CATCH_COOLDOWN - RETREAT_TIME;

      // --- transitions -----------------------------------------------------
      // Order is the design. Read it top to bottom as a list of what outranks
      // what, not as a pile of conditions.
      if (d < CONTACT_RANGE && cooldown <= 0) {
        // It has run out of room. This is the fail state, and it is being
        // stopped rather than killed -- see the note at the top of the file.
        cooldown = CATCH_COOLDOWN;
        setState('flee');
        onCaught();
      } else if (retreating) {
        // Withdrawing after a catch. Outranks everything, so the player
        // actually watches it leave instead of it turning round immediately.
        setState('flee');
      } else if (state === 'block' && guard && d > BLOCK_HOLD_RANGE) {
        // Committed to the door. Holds this state both on the way there and
        // once standing in it, and does NOT abandon the trip merely for being
        // seen -- requiring it to break off whenever the player looked its way
        // meant it could never get past a player who was facing the exit, which
        // is the only time it ever needs to. Measured: it stalled 1.3 m short of
        // the door forever, oscillating between block and flee.
        //
        // It still breaks when the player is within BLOCK_HOLD_RANGE, so
        // walking up to it always drives it off.
      } else if (seen && d < PERSONAL_SPACE) {
        // Looked at, and too close. Break away.
        setState('flee');
      } else if (guard) {
        // Get between them and the way out. It will do this while visible --
        // being seen at a distance is not what it minds; being reached is.
        setState('block');
      } else if (state === 'flee' && (d > PERSONAL_SPACE * 1.6 || !seen)) {
        setState('watch');
      } else if (state === 'watch' && timer > WATCH_TIME) {
        setState(waypoints.length ? 'patrol' : 'idle');
      }

      // --- behaviour --------------------------------------------------------
      let speed = 0;
      if (state === 'flee') {
        // Directly away from the player, projected far enough that steer() has
        // somewhere to aim even when it is against a wall.
        const ax = pos.x - player.x;
        const az = pos.z - player.z;
        const len = Math.hypot(ax, az) || 1e-6;
        target.x = pos.x + (ax / len) * 6;
        target.z = pos.z + (az / len) * 6;
        speed = SPEED.flee;
        steer(speed, dt);
        facePoint(target.x, target.z);
      } else if (state === 'block' && guard) {
        target.x = guard[0];
        target.z = guard[1];
        speed = SPEED.block;
        const remaining = steer(speed, dt);
        // Arrived: turn and face the player, standing in the doorway. This is
        // the image the whole first playthrough is built on.
        if (remaining < 0.4) {
          speed = 0;
          facePoint(player.x, player.z);
        } else {
          facePoint(target.x, target.z);
        }
      } else if (state === 'patrol' && waypoints.length) {
        const [wx, wz] = waypoints[waypointIndex % waypoints.length];
        target.x = wx;
        target.z = wz;
        speed = SPEED.patrol;
        const remaining = steer(speed, dt);
        facePoint(target.x, target.z);
        if (remaining < 0.35) {
          waypointIndex = (waypointIndex + 1) % waypoints.length;
          setState('watch');
        }
      } else {
        // idle / watch: hold position and look at the player. Not a freeze --
        // the creature's own idle animation keeps it breathing.
        facePoint(player.x, player.z);
      }

      creature.setPosition(pos.x, pos.z);
      creature.setSpeed(speed);
      creature.update(dt);
    }
  };
}
