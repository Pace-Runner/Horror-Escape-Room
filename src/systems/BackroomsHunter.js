import { resolveCircle, segmentBlocked } from '../core/collision.js';
import { WALK_SPEED, SPRINT_SPEED } from '../core/MoveSpeeds.js';
import { LEGS, CORRIDORS, neighbours, crossPoint, legMid } from '../levels/backroomsMaze.js';

/**
 * The thing that hunts you in the corridor.
 *
 * WHY THIS IS NOT IN CreatureAI.js. That file opens with "READ THIS BEFORE
 * CHANGING ANY OF IT. Every instinct for a horror-game AI is wrong here,
 * because this one is not hunting the player" -- it is Annabelle, she is hiding
 * FROM you, and the two drives are KEEP AWAY and KEEP YOU IN. This module is
 * the opposite thing: it looks for you and it runs at you. Folding a hunter
 * into that file would quietly break the promise its header makes, and the next
 * person to read it would believe the wrong thing about both.
 *
 * The house and the corridor are not the same place. The backrooms is the space
 * BETWEEN levels, and what is in here does not have to obey what Annabelle is
 * doing in the house.
 *
 * IT STILL MAY NOT KILL YOU. That rule is the one thing this shares with
 * CreatureAI, and for the same reason: being caught is being STOPPED. It
 * reaches you, the screen goes, and you wake at the mouth of the maze having
 * lost the crossing. See main.js's onCaught.
 *
 * ------------------------------------------------------------------ hearing
 *
 * IT DOES NOT KNOW WHERE YOU ARE. The only thing that tells it is NOISE, and
 * the only thing that makes noise is SPRINTING:
 *
 *   sprinting          -> it learns where you are, right now, and runs there
 *   walking / crouched -> it learns nothing new
 *
 * Losing the noise does NOT teleport its knowledge away: it keeps going to the
 * last place it heard you, arrives, finds nothing, and goes back to searching.
 * That is what makes stopping work as a tactic -- you are not switching it off,
 * you are letting it commit to somewhere you no longer are.
 *
 * SIGHT OVERRIDES HEARING. If there is nothing between you, it does not care
 * whether you are sprinting; it comes straight at you and it keeps coming.
 *
 * ------------------------------------------------------------------- speed
 *
 * The chase speed is defined as a RELATION, not a number:
 *
 *     CHASE_SPEED = SPRINT_SPEED / 1.5
 *
 * so a sprinting player is always exactly 1.5x faster and can always break
 * away. That is the whole tension, and it is circular on purpose -- sprinting
 * is the only thing that outruns it AND the only thing that tells it where you
 * are. Stamina (6.5 s, regenerating at 0.55/s in PointerLockPlayer) is what
 * stops that being a free answer.
 *
 * Note what this implies and do not "fix" it: at 2.35 m/s it is FASTER than
 * your walk of 2.015. Once it can see you, walking is not an escape. Only
 * sprinting is, and sprinting is how it found you.
 *
 * ---------------------------------------------------------------- pathing
 *
 * THE MAZE IS A GRAPH, NOT A TREE ANY MORE. It used to be one, and this file
 * used to exploit that: with exactly one route between any two corridors,
 * pathing was not a search at all, just a walk up the parent pointers from both
 * ends until they met. The loops that gave the player more than one way to the
 * exit took that away -- parent-walking still returns a VALID path, because the
 * parent pointers are still a spanning tree, but it is no longer the SHORTEST
 * one. Left alone, the hunter would have trudged the long way round a shortcut
 * the player had just used to get away from it, which is the sort of bug that
 * reads as the monster being stupid rather than as a pathing error.
 *
 * So it is a breadth-first search now, over backroomsMaze's neighbours(). Still
 * no navmesh, no A*, no heuristics and no open list to get wrong: 42 nodes and
 * an average degree under 3, run only when the target moves to a new corridor.
 * BFS on an unweighted graph IS the shortest path, so there is nothing to tune.
 *
 * What has NOT changed is why any of this exists: the waypoints mean the
 * straight-line steering never has to solve a corner, which is what would
 * happen if it pursued you by pointing itself at you and walking.
 */

/** Matches the player's bodyRadius so neither can go where the other cannot. */
const BODY_RADIUS = 0.35;

/**
 * 2.353 m/s. Derived, never typed: the spec is the RATIO.
 */
export const CHASE_SPEED = SPRINT_SPEED / 1.5;

/**
 * Searching is slower than your walk, so a player who stays quiet can always
 * open distance. If this matched the chase speed the quiet option would not be
 * an option -- it would just be a slower way to be caught.
 */
const SEARCH_SPEED = WALK_SPEED * 0.72;

/** Unobstructed distance at which it sees you. Corridors run much longer than this. */
const SIGHT_RANGE = 13.0;

/**
 * How far to the side to look for a sightline the creature has not got, in
 * metres.
 *
 * NOT THE LEAN DISTANCE, and the difference is worth stating because the
 * honest version of this did not work. OkabeCreature.setPeek(1) moves the head
 * 217 mm, and testing the sightline at exactly 217 mm is the geometrically
 * pure condition -- lean only when leaning genuinely earns the view. Measured
 * over 90 simulated seconds it fired for 0.0 of them: a 217 mm offset only
 * clears a corner within 217 mm of its edge, and nothing ever stands there.
 *
 * So this asks a looser question -- "is the player just round this corner?" --
 * at about a shoulder's width and a half. The lean is still 217 mm; it is a
 * body craning toward a view it cannot quite get, which is what peering round
 * a corner actually is.
 */
const PEEK_PROBE = 0.85;

/**
 * When it stops to look round a corner, and for how long.
 *
 * PEEK_RANGE is deliberately much shorter than SIGHT_RANGE's 13 m. The whole
 * value of this is the near miss -- a thing leaning out at you from two rooms
 * away is scenery, one leaning out from the next corner is a problem -- and
 * keeping it close also means the player can actually see the lean through
 * the fog, which at 13 m they cannot.
 *
 * The hold is long enough to read as deliberate and short enough that it is
 * not standing there while you walk away. The cooldown stops it peering round
 * every corner of the same wall on the way past.
 */
const PEEK_RANGE = 7.5;
const PEEK_HOLD_MIN = 1.4;
const PEEK_HOLD_MAX = 2.6;
const PEEK_COOLDOWN = 9.0;
/** Once it has seen you it keeps coming for this long after losing sight. */
const SIGHT_MEMORY = 2.5;

/** How close counts as reaching you. Same as CreatureAI's CONTACT_RANGE. */
const CONTACT_RANGE = 0.85;
/** After a catch, it cannot catch again for this long. */
const CATCH_COOLDOWN = 5.0;

/** Within this of a waypoint, take the next one. */
const WAYPOINT_REACHED = 0.55;
/** Within this of the last place it heard you, give up and search again. */
const SEARCH_ARRIVED = 1.2;

// ------------------------------------------------------------------- steering
//
// IT HAS A BODY NOW, and everything below exists because the first version did
// not. That one set `yaw` straight from the direction to the next waypoint and
// moved at full speed from the first frame, which meant it PIVOTED ON THE SPOT
// at every junction and started and stopped instantly. Those are the two things
// that read as "a sprite being moved" rather than "something running at you",
// and no amount of model work fixes them.
//
// The rules are: turn at a bounded rate, accelerate at a bounded rate, move
// along the direction it is FACING rather than the direction it wants, and slow
// down in proportion to how far off it is. The last two are what make a corner
// an arc instead of a corner.

/** Radians/second. ~200 deg/s hunting, ~125 searching -- urgency is legible. */
const TURN_RATE_CHASE = 3.5;
const TURN_RATE_SEARCH = 2.2;

/**
 * Speed floor while turning, as a fraction of the speed it wants.
 *
 * Speed scales with cos(heading error), so a body at right angles to where it
 * wants to go would stop dead at every junction -- which looks as mechanical as
 * pivoting did, just differently. The floor keeps it moving through the corner.
 *
 * IT ALSO GUARANTEES IT CANNOT ORBIT A WAYPOINT, which is the failure mode of
 * every "steer toward a target" agent: the turning circle v/omega has to be
 * smaller than the radius at which a waypoint counts as reached, or it circles
 * forever a little way outside it. The assertion at the bottom of this file
 * checks that against the numbers actually in use rather than leaving it as an
 * argument in a comment.
 */
const TURN_SLOW_FLOOR = 0.35;

/** Metres per second squared. Stopping is quicker than starting, as bodies are. */
const ACCEL = 6.0;
const DECEL = 9.0;

/**
 * Searching, it arrives somewhere, STOPS, and looks around before choosing
 * again. A thing that walks a continuous unbroken loop reads as patrolling
 * furniture; a thing that stops and turns reads as looking for you. It is also
 * the only window in which a player who is holding still can get past it.
 */
const SCAN_MIN = 0.9;
const SCAN_MAX = 2.4;
const SCAN_TURN = 1.1;

/**
 * Stall guard. resolveCircle() pushes it out of walls AFTER it has moved, so a
 * body pressed into a corner can burn its whole step against the wall and stay
 * put. Left alone that is a monster vibrating in a corner for the rest of the
 * crossing. If it covers less than STALL_DIST in STALL_TIME while it still has
 * somewhere to be, the path is thrown away and replanned.
 */
const STALL_TIME = 1.2;
const STALL_DIST = 0.25;

/** To (-pi, pi]. Turning through the wrap point is the classic 350-degree spin. */
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Breathing gets louder as it closes. Same dial AudioEngine takes for the study. */
const BREATH_NEAR = 3.0;
const BREATH_FAR = 14.0;
const BREATH_MIN = 0.10;
const BREATH_MAX = 0.90;

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** Built once. The maze is static data; nothing at runtime can add a corridor. */
const ADJACENT = neighbours(LEGS);

/**
 * The corridor a point is standing in, or null.
 *
 * A point inside a junction is inside TWO rectangles, which is fine -- either
 * answer paths correctly, because the junction is on the route between them by
 * definition.
 */
function legAt(x, z) {
  for (const name of Object.keys(CORRIDORS)) {
    const [x0, x1, z0, z1] = CORRIDORS[name];
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return name;
  }
  return null;
}

/**
 * Waypoints from one point to another, through the corridors.
 *
 * Breadth-first over the corridor graph, then one waypoint per crossing. Each
 * crossing is the centre of the floor two adjacent legs share, so consecutive
 * waypoints always have a straight walkable line between them -- which is the
 * property the steering depends on and the reason it never has to solve a
 * corner.
 *
 * Fails SOFT, to `to` alone, if either end is outside every corridor or no path
 * exists. A hunter that walks a straight line at you for a few frames is a
 * worse hunter; a hunter that throws is a crashed game.
 */
function pathBetween(from, to) {
  const a = legAt(from.x, from.z);
  const b = legAt(to.x, to.z);
  if (!a || !b || a === b) return [to];

  const prev = { [a]: null };
  const queue = [a];
  while (queue.length) {
    const n = queue.shift();
    if (n === b) break;
    for (const m of ADJACENT[n]) {
      if (!(m in prev)) { prev[m] = n; queue.push(m); }
    }
  }
  if (!(b in prev)) return [to];

  const legPath = [];
  for (let n = b; n; n = prev[n]) legPath.push(n);
  legPath.reverse();

  const points = [];
  for (let i = 0; i < legPath.length - 1; i++) {
    points.push(crossPoint(legPath[i], legPath[i + 1]));
  }
  points.push(to);
  return points.filter(Boolean);
}

// ---------------------------------------------------------------------------

export function createBackroomsHunter({
  creature = null,
  getPlayer = () => ({ x: 0, z: 0, sprinting: false }),
  colliders = [],
  onCaught = () => {},
  onBreathing = () => {}
} = {}) {
  /** 'stopped' | 'search' | 'hunt' | 'chase' */
  let state = 'stopped';
  const pos = { x: 0, z: 0 };
  let waypoints = [];
  /** The last place a sprint was heard. Null once it has been investigated. */
  let heard = null;
  let sawFor = 0;
  let cooldown = 0;
  let yaw = 0;
  /** Actual current speed, not the speed it is aiming for. Drives the gait too. */
  let speedNow = 0;
  /** Seconds left of standing still and looking around. Search state only. */
  let scan = 0;
  let scanDir = 1;
  let ready = false;            // the creature's GLB is in and its shaders built
  let startWanted = false;      // a start() that arrived before it was
  let startArgs = {};
  let peekFor = 0;              // seconds left holding a lean round a corner
  let peekDir = 0;              // which way it is leaning, -1 or +1
  let peekCool = 0;             // so it does not do it at every corner of one wall
  let stallFor = 0;
  const stallFrom = { x: 0, z: 0 };

  function setPath(target) {
    waypoints = pathBetween(pos, target);
  }

  /** A corridor to wander to that is not the one it is already standing in. */
  function pickWanderTarget() {
    const here = legAt(pos.x, pos.z);
    const names = Object.keys(LEGS).filter((n) => n !== here);
    const pick = names[Math.floor(Math.random() * names.length)];
    return legMid(pick);
  }

  function canSee(px, pz) {
    const d = Math.hypot(px - pos.x, pz - pos.z);
    if (d > SIGHT_RANGE) return false;
    // The creature's eyes, not its feet: a sightline taken from the floor
    // finds walls that are not there at head height. This maze has no height
    // variation, so the 2D test is exact rather than an approximation.
    return !segmentBlocked(pos.x, pos.z, px, pz, colliders);
  }

  /**
   * Is there a straight line from here to `p` that a body this wide fits down?
   *
   * segmentBlocked() is a zero-width ray, which says a corner is clear when the
   * SHOULDERS are not -- so this casts the two edges of the body instead of its
   * centreline. Two rays, not a swept circle: the maze is axis-aligned boxes and
   * the difference only shows within a body radius of a corner, where the third
   * clause below (the waypoint tolerance) already covers it.
   */
  /**
   * Which way it would have to lean to see the player, or 0 for no reason to.
   *
   * THE CONDITION IS THE WHOLE IDEA: lean out when the straight line to the
   * player is blocked but a line from PEEK_PROBE to one side is not. That is
   * what being just behind a corner with the player beyond it MEANS, so the
   * creature leans when there is something round the corner to lean at, and
   * never in open corridor, where both lines are clear and the answer is 0.
   *
   * Only while SEARCHING. A thing that has already seen you does not peer
   * round the corner at you, it comes round it.
   *
   * See PEEK_PROBE for why the probe is wider than the lean itself.
   */
  function peekSide(px, pz) {
    const d = Math.hypot(px - pos.x, pz - pos.z);
    if (d > SIGHT_RANGE || d < 1e-6) return 0;
    if (!segmentBlocked(pos.x, pos.z, px, pz, colliders)) return 0;
    // PERPENDICULAR TO THE LINE TO THE PLAYER, not to the creature's facing.
    // Facing was the first attempt and it never fired: the creature can be
    // pointed anywhere while it searches, so the probe went off at an angle
    // to the corner it was meant to look round, and in a corridor barely two
    // metres wide an 0.85 m offset usually landed INSIDE the wall -- where it
    // is blocked from everything and the answer is always no.
    const nx = -(pz - pos.z) / d;
    const nz = (px - pos.x) / d;
    // The creature's own right, in world terms, so the sign that comes back
    // means what setPeek means by it. forward at yaw 0 is -Z, so right is
    // (cos yaw, -sin yaw).
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    for (const s of [1, -1]) {
      const ox = pos.x + nx * s * PEEK_PROBE;
      const oz = pos.z + nz * s * PEEK_PROBE;
      // Somewhere a body could actually lean TO. Without this the probe can
      // sit inside the wall it is supposed to be looking past, and a point
      // inside a wall has a clear line to everything on its far side.
      if (segmentBlocked(pos.x, pos.z, ox, oz, colliders)) continue;
      if (!segmentBlocked(ox, oz, px, pz, colliders)) {
        return (nx * s * rx + nz * s * rz) >= 0 ? 1 : -1;
      }
    }
    return 0;
  }

  function clearTo(p) {
    const dx = p.x - pos.x;
    const dz = p.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return true;
    const nx = (-dz / d) * BODY_RADIUS;
    const nz = (dx / d) * BODY_RADIUS;
    return !segmentBlocked(pos.x + nx, pos.z + nz, p.x + nx, p.z + nz, colliders)
      && !segmentBlocked(pos.x - nx, pos.z - nz, p.x - nx, p.z - nz, colliders);
  }

  /**
   * Advance toward the current waypoint. Returns true when the path runs out.
   *
   * See the steering block at the top of the file for why this turns and
   * accelerates instead of teleporting its facing and moving at full speed.
   */
  function advance(dt, speed, turnRate) {
    while (waypoints.length) {
      // STRING-PULLING. pathBetween() routes through junction CENTRES, because
      // that is the one point guaranteed to be inside both corridors. It is not
      // the point a body would actually walk through: taking every one of them
      // literally walks a dog-leg into the middle of each crossing and back out.
      // If the waypoint after this one is already reachable in a straight line,
      // this one is a detour and gets dropped. The path stays exact -- only
      // waypoints that were provably unnecessary are removed.
      if (waypoints.length > 1 && clearTo(waypoints[1])) {
        waypoints.shift();
        continue;
      }
      const wp = waypoints[0];
      const dx = wp.x - pos.x;
      const dz = wp.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= WAYPOINT_REACHED) {
        waypoints.shift();
        continue;
      }

      const err = wrapAngle(Math.atan2(-dx, -dz) - yaw);   // 0 looks down -Z
      yaw = wrapAngle(yaw + Math.sign(err) * Math.min(Math.abs(err), turnRate * dt));

      // Slow for the corner, in proportion to how badly it is pointed. This is
      // also what stops it orbiting -- see TURN_SLOW_FLOOR.
      const aim = Math.max(0, Math.cos(err));
      const want = speed * (TURN_SLOW_FLOOR + (1 - TURN_SLOW_FLOOR) * aim);
      const rate = want > speedNow ? ACCEL : DECEL;
      speedNow += Math.max(-rate * dt, Math.min(rate * dt, want - speedNow));

      // ALONG THE HEADING, not toward the waypoint. Moving toward the waypoint
      // while the body turns separately is a step sideways -- the feet go one
      // way and the shoulders another, which is uncanny in the wrong register.
      const step = Math.min(speedNow * dt, d);
      pos.x -= Math.sin(yaw) * step;
      pos.z -= Math.cos(yaw) * step;
      resolveCircle(pos, BODY_RADIUS, colliders);
      return false;
    }
    speedNow = Math.max(0, speedNow - DECEL * dt);
    return true;
  }

  return {
    get state() {
      return state;
    },
    get position() {
      return { x: pos.x, z: pos.z };
    },

    setColliders(boxes) {
      colliders = boxes || [];
    },

    /**
     * Drop it somewhere random and start hunting.
     *
     * `minFromPlayer` keeps it from materialising on top of you at the mouth of
     * the maze, which would read as a bug rather than as bad luck.
     */
    /**
     * Arm or disarm the hunter, independently of whether anything wants it.
     *
     * The loading screen calls this once the creature's GLB is in AND its
     * shaders are built. Until then a start() is REMEMBERED rather than
     * refused, because the thing asking is a scripted beat that fires once and
     * has no way to ask again -- a plain refusal would mean the maze simply
     * never spawns a monster on a slow connection.
     */
    setReady(v) {
      ready = !!v;
      if (ready && startWanted) {
        startWanted = false;
        this.start(startArgs);
      }
    },

    start({ minFromPlayer = 18 } = {}) {
      // The one stall a fade cannot hide: the first frame the creature is
      // drawn compiles its shaders, and that lands exactly when it steps into
      // the corridor. Hold it until the loading screen says it is built.
      if (!ready) {
        startWanted = true;
        startArgs = { minFromPlayer };
        return;
      }
      const player = getPlayer();
      const names = Object.keys(LEGS);
      let best = null;
      let bestD = -Infinity;
      // Ten draws, keep the furthest: cheaper and more predictable than
      // rejection-sampling until something passes, which can spin on a small
      // maze or a player standing in the middle of a big one.
      for (let i = 0; i < 10; i++) {
        const p = legMid(names[Math.floor(Math.random() * names.length)]);
        const d = Math.hypot(p.x - player.x, p.z - player.z);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
        if (d >= minFromPlayer) break;
      }
      pos.x = best.x;
      pos.z = best.z;
      stallFrom.x = best.x;
      stallFrom.z = best.z;
      stallFor = 0;
      waypoints = [];
      heard = null;
      sawFor = 0;
      cooldown = 0;
      speedNow = 0;
      scan = 0;
      // Facing somewhere arbitrary, not always down -Z. It spawns out of sight
      // and the first thing it does is turn, so the direction is free variety.
      yaw = Math.random() * Math.PI * 2;
      state = 'search';
      if (creature) {
        creature.reset();
        // Fully Hollow. In here it is also setSilhouette(true), so this changes
        // the SHAPE -- long arms, the hunch -- without spending the lit reveal
        // that Level 3 is saving.
        creature.setCorrection(0);
        creature.setSilhouette(true);
        creature.setPosition(pos.x, pos.z);
        creature.setSpeed(0);
        creature.visible = true;
      }
    },

    stop() {
      state = 'stopped';
      waypoints = [];
      heard = null;
      speedNow = 0;
      scan = 0;
      // A start() that was waiting on the loading screen is cancelled by a
      // stop, not banked. Otherwise leaving the maze before the creature
      // finished loading spawns it into a level the player is no longer in.
      startWanted = false;
      if (creature) {
        creature.visible = false;
        creature.setSpeed(0);
      }
      onBreathing(0);
    },

    reset() {
      this.stop();
      pos.x = 0;
      pos.z = 0;
      cooldown = 0;
      sawFor = 0;
      peekFor = 0;
      peekDir = 0;
      peekCool = 0;
    },

    update(dt) {
      if (state === 'stopped') return;
      if (cooldown > 0) cooldown -= dt;

      const player = getPlayer();
      const dist = Math.hypot(player.x - pos.x, player.z - pos.z);
      const seen = canSee(player.x, player.z);

      // --- what it knows ---------------------------------------------------
      if (seen) {
        sawFor = SIGHT_MEMORY;
      } else if (sawFor > 0) {
        sawFor -= dt;
      }
      if (player.sprinting) {
        // Noise. It does not matter whether it can see you.
        heard = { x: player.x, z: player.z };
      }

      // --- what it does ----------------------------------------------------
      const wasState = state;
      if (sawFor > 0) {
        state = 'chase';
      } else if (heard) {
        state = 'hunt';
      } else {
        state = 'search';
      }

      if (state !== 'search') scan = 0;      // being found ends the standing about
      if (state !== 'search') { peekFor = 0; peekDir = 0; }

      // --- peering round the corner ----------------------------------------
      // THE PEEK HAS TO CAUSE THE PAUSE, not wait for one. The first version
      // only leaned while the creature happened to be standing still to scan,
      // and measured over 120 simulated seconds that never once coincided with
      // the player being in range: it scans 3% of the time and is within sight
      // range 14% of the time, and the overlap was 0.0%. When it is near you
      // it is chasing, and when it scans it is somewhere else.
      //
      // So this is its own small behaviour. If the player is close and just
      // the other side of something, it stops, leans out and looks, then goes
      // back to searching. The cooldown stops it doing this at every corner of
      // the same wall.
      if (peekCool > 0) peekCool -= dt;
      if (state === 'search') {
        if (peekFor > 0) {
          peekFor -= dt;
          if (peekFor <= 0) {
            peekDir = 0;
            peekCool = PEEK_COOLDOWN;
          }
        } else if (peekCool <= 0 && dist <= PEEK_RANGE) {
          const s = peekSide(player.x, player.z);
          if (s) {
            peekDir = s;
            peekFor = PEEK_HOLD_MIN + Math.random() * (PEEK_HOLD_MAX - PEEK_HOLD_MIN);
            waypoints = [];           // stop walking; it has something to look at
            scan = 0;                 // and stop turning on the spot
          }
        }
      }

      if (peekFor > 0 && state === 'search') {
        // Holding still and leaning. Deliberately does NOT turn to face you --
        // a body that swings round to point at you has found you, and this one
        // is still only looking.
        speedNow = Math.max(0, speedNow - DECEL * dt);
      } else if (state === 'chase') {
        // Re-path every frame while it can see you: you are moving, and in a
        // corridor the straight line to you IS the route.
        setPath({ x: player.x, z: player.z });
        advance(dt, CHASE_SPEED, TURN_RATE_CHASE);
      } else if (state === 'hunt') {
        if (wasState !== 'hunt' || !waypoints.length) setPath(heard);
        const arrived = advance(dt, CHASE_SPEED, TURN_RATE_CHASE);
        if (arrived || Math.hypot(heard.x - pos.x, heard.z - pos.z) < SEARCH_ARRIVED) {
          // It got where it last heard you and you are not there. This is the
          // moment walking away pays off.
          heard = null;
          waypoints = [];
          state = 'search';
        }
      } else if (scan > 0) {
        // Standing still and turning on the spot. See SCAN_MIN.
        scan -= dt;
        yaw = wrapAngle(yaw + scanDir * SCAN_TURN * dt);
        speedNow = Math.max(0, speedNow - DECEL * dt);
      } else {
        if (!waypoints.length) setPath(pickWanderTarget());
        if (advance(dt, SEARCH_SPEED, TURN_RATE_SEARCH)) {
          waypoints = [];
          scan = SCAN_MIN + Math.random() * (SCAN_MAX - SCAN_MIN);
          scanDir = Math.random() < 0.5 ? -1 : 1;
        }
      }

      // --- stall guard -----------------------------------------------------
      // See STALL_TIME. Only armed while it has somewhere to be, so standing
      // still to scan is not mistaken for being wedged.
      if (waypoints.length) {
        stallFor += dt;
        if (stallFor >= STALL_TIME) {
          if (Math.hypot(pos.x - stallFrom.x, pos.z - stallFrom.z) < STALL_DIST) {
            waypoints = [];
            heard = null;
          }
          stallFor = 0;
          stallFrom.x = pos.x;
          stallFrom.z = pos.z;
        }
      } else {
        stallFor = 0;
        stallFrom.x = pos.x;
        stallFrom.z = pos.z;
      }

      // --- the rig ---------------------------------------------------------
      if (creature) {
        creature.setPosition(pos.x, pos.z);
        creature.setYaw(yaw);
        // The ACTUAL speed, not the one it is aiming for. Feeding the gait a
        // constant while the body accelerates is what foot-sliding is.
        creature.setSpeed(speedNow);
        // Lean out from behind a corner, but only while standing still to
        // scan: peeking is something a body does INSTEAD of walking, and a
        // figure leaning 22 degrees out of true while striding down a corridor
        // reads as a limp rather than as a look.
        // setPeek smooths the lean itself -- slowly out, quickly back -- so
        // this just states the target and lets the rig carry the timing.
        if (creature.setPeek) creature.setPeek(peekDir);
        creature.update(dt);
      }

      const t = 1 - Math.min(1, Math.max(0, (dist - BREATH_NEAR) / (BREATH_FAR - BREATH_NEAR)));
      onBreathing(BREATH_MIN + (BREATH_MAX - BREATH_MIN) * t);

      if (dist < CONTACT_RANGE && cooldown <= 0) {
        cooldown = CATCH_COOLDOWN;
        onCaught();
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Boot-time assertions
// ---------------------------------------------------------------------------
//
// Warn, do not throw -- the same rule CreatureAI.js uses at the bottom of its
// file. A bad number should cost a console line, not the whole app.

if (Math.abs(SPRINT_SPEED / CHASE_SPEED - 1.5) > 1e-6) {
  console.error('BackroomsHunter: the sprint/chase ratio is no longer 1.5 '
    + `(${(SPRINT_SPEED / CHASE_SPEED).toFixed(3)}). A sprinting player must always `
    + 'be able to break away, or the only counter-play is gone.');
}
if (CHASE_SPEED <= WALK_SPEED) {
  console.error('BackroomsHunter: chase speed has fallen to or below WALK_SPEED, '
    + 'so walking now escapes a monster that can see you. That removes the '
    + 'reason sprinting is a gamble.');
}
// The turning circle at the slowest the steering ever goes must be TIGHTER than
// the radius at which a waypoint counts as reached. If it is not, the hunter
// arcs past every corner just outside the tolerance and circles it forever --
// the classic steering-agent failure, and one that looks like a pathing bug
// rather than a numbers bug, so it is worth catching here.
{
  const slowest = CHASE_SPEED * TURN_SLOW_FLOOR;
  const radius = slowest / TURN_RATE_CHASE;
  if (radius >= WAYPOINT_REACHED) {
    console.error(`BackroomsHunter: at ${slowest.toFixed(2)} m/s and `
      + `${TURN_RATE_CHASE} rad/s the turning circle is ${radius.toFixed(2)} m, which `
      + `is not inside the ${WAYPOINT_REACHED} m waypoint tolerance. It will orbit `
      + 'corners instead of taking them. Lower TURN_SLOW_FLOOR or raise the turn rate.');
  }
}

// The collision resolver takes ONE un-substepped displacement per frame, dt is
// clamped to 0.05 s in main.js, and the maze wall slabs are T = 0.30 m thick.
// A step longer than a slab can pass clean through it. See MoveSpeeds.js.
if (CHASE_SPEED * 0.05 >= 0.30) {
  console.error(`BackroomsHunter: at ${CHASE_SPEED.toFixed(2)} m/s a single frame `
    + `moves ${(CHASE_SPEED * 0.05).toFixed(3)} m, which is not shorter than the `
    + '0.30 m wall slabs. It will tunnel. Substep before raising this.');
}
