import { resolveCircle, segmentBlocked } from '../core/collision.js';
import { WALK_SPEED, SPRINT_SPEED } from '../core/MoveSpeeds.js';

/**
 * WHAT LOOKS FOR MARK IN THE DARK STUDY.
 *
 * WHY THIS IS NOT IN CreatureAI.js. That file's rule is that the thing in the
 * house is not hunting the player: it is Annabelle, hiding FROM you, and
 * everything she does is to keep you inside. This module LOOKS for you, which
 * reads like the opposite -- so it lives apart, as BackroomsHunter.js does, and
 * this header says how it keeps the same promise.
 *
 * IT IS STILL ANNABELLE, AND SHE IS STILL KEEPING YOU IN. The storm takes the
 * study's power, twice (levels/studyBlackout.js), and she uses the dark. Mark
 * has reached the archive -- the records, the visor, the truth about Project
 * HOLLOW -- and she promised him that if he became dangerous she would keep
 * him contained. So in the dark she comes to find him and SEDATE him. Through
 * his broken eyes she is the monster; through the visor she flickers back to
 * herself (main.js). On a first playthrough this is a monster hunting you. On a
 * second it is a sister trying to keep a promise, which is the whole game.
 *
 * BEING CAUGHT IS BEING SEDATED. Never a kill. She reaches you, the screen
 * goes (one of three scares, core/jumpScares/), and you come round slumped in
 * her chair's corner, still in the dark, with everything you had done still
 * done. See main.js's onStudyCaught.
 *
 * ---------------------------------------------------------------- senses
 *
 * HEARING, as in the backrooms (BackroomsHunter.js) -- with one change Kiran
 * asked for: crouch-walking is SILENT, at any range.
 *
 *   sprinting           heard far, and on the other floor
 *   walking             heard close
 *   crouched            never
 *   a thrown thing      heard where it LANDS, as far as its own `radius`:
 *                       a book is a short, soft lure, glass a loud one
 *
 * Hearing tells her WHERE, not WHO: she goes to the place, finds nothing,
 * and searches round it. That is what makes a throw work.
 *
 * SIGHT needs three things: you are in front of her, nothing is between you,
 * and you are close enough FOR THE LIGHT YOU ARE IN. In the dark she sees a
 * few metres; lit -- by one of the two candles the storm missed, by a flash of
 * lightning, by your own torch -- she sees across the room. Point the torch
 * AT her and she sees it whichever way she faces.
 *
 *   cover    a box between you, tall enough to cover the point of you she
 *            would see (your eyes). Low cover hides you crouched, not standing.
 *   a floor  the loft floor hides you, except where the well is open: the
 *            front of the loft by the rail, the open stair, the front of the
 *            room below.
 *   a spot   inside the wardrobe or behind a curtain she cannot see you at
 *            all -- but when she searches she may look there, and if you are
 *            in the one she opens, she has you.
 *
 * ----------------------------------------------------------------- speed
 *
 * While she can SEE you, or is running to a thrown book or bottle, she is
 * 15% FASTER THAN YOUR SPRINT (SPEED.alerted): you cannot outrun her in the
 * open, only break her line of sight. Once she has lost sight of you, the
 * chase she keeps up is slower than your sprint again (SPEED.chaseCap), so
 * getting out of view is always enough. The difficulty moves her hearing,
 * her other speeds, how long she keeps looking and how often she opens a
 * hide spot.
 *
 * ---------------------------------------------------------------- floors
 *
 * The study has two: the ground and the loft (loftY), joined by one open
 * stair. She walks a fixed graph of points across both (STUDY_NAV) and
 * straight lines where nothing is in the way; her height is the level's own
 * groundAt(), the same one the player stands on.
 */

/** Metres. The player's bodyRadius, so neither can go where the other cannot. */
const BODY_RADIUS = 0.35;
/** Close enough to take hold of him. */
const CATCH_RANGE = 0.85;
/** Inside this she feels you there, whichever way she faces and however dark. */
const TOUCH_RANGE = 1.15;
/** Half-angle of what she sees, radians. */
const FOV = 1.05;
/** How close to the torch's axis she has to be to see the beam pointed at her. */
const TORCH_CONE = 0.32;
const TORCH_REACH = 14;
/** Her eyes, above the floor she stands on. */
const EYE_HEIGHT = 2.0;
/** The point of the player she sees: this far under their eye. */
const SEEN_BELOW_EYE = 0.2;
/** Seconds out of sight in a chase before she goes to where she last saw you. */
const LOSE_SIGHT_AFTER = 1.1;
/** How fast she turns toward where she is walking (per second, toward the error). */
const TURN_RATE = 9;
/** Facing further off the path than this (a cosine, ~75 degrees) she turns on the spot first. */
const TURN_IN_PLACE = 0.25;
/**
 * After a chase, how long hearing him again counts as finding him again
 * rather than a fresh sound to go and look at.
 */
const RECENT_CHASE = 8;
/** Metres: how near a thing must be to the last clue to be searched. */
const SEARCH_RADIUS = 6;
/** Seconds she stands at a hide spot she is opening, before she knows. */
const CHECK_SECONDS = 0.9;
/** A whisper every this many seconds while she looks (drawn uniformly). */
const WHISPER_GAP = [9, 16];

export const SPEED = Object.freeze({
  patrol: WALK_SPEED * 0.55,
  investigate: WALK_SPEED * 0.85,
  /** Her chase, before the difficulty: the hunter's relation, sprint / 1.3. */
  chase: SPRINT_SPEED / 1.3,
  /** Whatever the difficulty says, never this close to your sprint. */
  chaseCap: SPRINT_SPEED * 0.9,
  /**
   * Alerted: while she can SEE him, and running to a thrown book or bottle,
   * she is 15% faster than his sprint, on every difficulty. Outrunning her in
   * the open does not work; breaking her line of sight does. (Kiran's call,
   * 2026-10-29: the old "always slower than a sprint" rule now holds only for
   * the chase she keeps up after losing sight of him.)
   */
  alerted: SPRINT_SPEED * 1.15
});

/**
 * Where a sedated Mark comes round (main.js's onStudyCaught): slumped by her
 * chair on the ground floor, facing out into the room, under the mantel candle
 * the storm missed (`lamp`).
 */
export const STUDY_CATCH_RESPAWN = Object.freeze({
  x: -5.9, z: -3.9, yaw: Math.atan2(-(0 + 5.9), -(2 + 3.9)), lamp: Object.freeze([-6.1, 1.7, -6.2])
});

/**
 * Per difficulty (core/Difficulty.js keys). Ranges in metres, times in
 * seconds; `speed` scales every pace; `checkChance` is how likely she is to
 * open a hide spot she passes while searching.
 */
export const STUDY_SEEKER_TUNING = Object.freeze({
  easy: { hearSprint: 7, hearWalk: 2.2, sightDark: 2.6, sightLit: 10, speed: 0.92, giveUp: 22, checkChance: 0.35 },
  medium: { hearSprint: 9, hearWalk: 3.2, sightDark: 3.2, sightLit: 12, speed: 1.0, giveUp: 32, checkChance: 0.6 },
  hard: { hearSprint: 12, hearWalk: 4.2, sightDark: 3.8, sightLit: 14, speed: 1.08, giveUp: 45, checkChance: 0.85 }
});
/** The first blackout is a lesson: she sees less, moves slower and gives up sooner. */
const TEASER = { sightDark: 0.7, speed: 0.85, giveUp: 0.45, checkChance: 0.35 };
/**
 * The second blackout is the real one: she moves faster, hears further, keeps
 * looking longer, opens more hide spots, and goes for a thrown lure at a run
 * from further away. Seeing him and running to a lure are SPEED.alerted in both modes.
 */
const HUNT = { sightDark: 1.25, sightLit: 1.15, speed: 1.18, hear: 1.3, giveUp: 1.4, checkChance: 1.35, noiseRadius: 1.6 };

/**
 * Where she can walk. `f` is the floor: g ground, l loft, s the stair. Edges
 * were laid against the room's colliders and the hide props
 * (levels/studyHideProps.js) with a body's width to spare; the check script
 * (scripts/check-study-seeker.mjs) walks every one of them to prove it.
 */
export const STUDY_NAV = Object.freeze({
  nodes: {
    g_entry: [7.0, 4.8, 'g'], g_door: [5.4, 4.9, 'g'], g_screenE: [6.0, 3.35, 'g'], g_stairfoot: [7.25, 3.2, 'g'],
    g_frontR: [2.0, 4.6, 'g'], g_front: [-0.8, 4.9, 'g'], g_crest: [-3.6, 5.4, 'g'], g_winF: [-6.4, 5.2, 'g'],
    g_winM: [-6.4, 2.6, 'g'], g_portrait: [-6.2, 0.6, 'g'], g_midL: [-3.6, 1.6, 'g'], g_center: [0.0, -0.4, 'g'],
    g_midR: [2.4, 1.2, 'g'], g_right: [5.6, 1.6, 'g'], g_backR: [5.0, -1.8, 'g'], g_clock: [6.6, -4.4, 'g'],
    g_backRC: [4.0, -4.4, 'g'], g_backC: [0.4, -4.4, 'g'], g_backL: [-3.2, -3.8, 'g'], g_hearth: [-5.2, -4.9, 'g'],
    g_underL: [-5.6, -1.6, 'g'],
    s_mid: [7.25, 0.4, 's'],
    l_stairhead: [7.2, -2.5, 'l'], l_breaker: [6.15, -5.5, 'l'], l_R: [4.6, -3.4, 'l'], l_C: [0.6, -3.3, 'l'],
    l_back: [0.4, -5.3, 'l'], l_L: [-3.8, -3.0, 'l'], l_archive: [-5.4, -5.2, 'l'], l_front: [-1.5, -1.5, 'l'],
    l_frontL: [-6.2, -1.5, 'l']
  },
  edges: [
    ['g_entry', 'g_door'], ['g_entry', 'g_stairfoot'], ['g_door', 'g_stairfoot'], ['g_door', 'g_frontR'],
    ['g_door', 'g_screenE'], ['g_screenE', 'g_stairfoot'], ['g_screenE', 'g_right'],
    ['g_frontR', 'g_front'], ['g_frontR', 'g_midR'], ['g_front', 'g_crest'], ['g_crest', 'g_winF'],
    ['g_winF', 'g_winM'], ['g_winM', 'g_portrait'], ['g_winM', 'g_midL'], ['g_portrait', 'g_midL'],
    ['g_portrait', 'g_underL'], ['g_midL', 'g_center'], ['g_midL', 'g_underL'], ['g_center', 'g_midR'],
    ['g_center', 'g_backC'], ['g_center', 'g_backR'], ['g_midR', 'g_right'], ['g_right', 'g_backR'],
    ['g_backR', 'g_clock'], ['g_backR', 'g_backRC'], ['g_clock', 'g_backRC'], ['g_backRC', 'g_backC'],
    ['g_backC', 'g_backL'], ['g_backL', 'g_hearth'], ['g_backL', 'g_underL'], ['g_hearth', 'g_underL'],
    ['g_stairfoot', 's_mid'], ['s_mid', 'l_stairhead'],
    ['l_stairhead', 'l_R'], ['l_stairhead', 'l_breaker'], ['l_R', 'l_breaker'], ['l_R', 'l_C'],
    ['l_C', 'l_back'], ['l_C', 'l_L'], ['l_C', 'l_front'], ['l_back', 'l_R'], ['l_L', 'l_archive'],
    ['l_L', 'l_frontL'], ['l_front', 'l_frontL']
  ]
});

/**
 * The teaser's beat: in at the entry door, along the front toward the crest
 * Mark has just solved, round the window wall and the back of the room, and
 * on round the ground floor until the power comes back.
 */
export const TEASER_ROUTE = Object.freeze([
  'g_door', 'g_frontR', 'g_front', 'g_crest', 'g_winF', 'g_winM', 'g_portrait', 'g_underL',
  'g_backL', 'g_backC', 'g_center', 'g_midR', 'g_right', 'g_screenE'
]);

/**
 * @param {object} deps
 * @param {object} deps.creature - systems/OkabeCreature.js (setPosition/setYaw/setSpeed/update/group/visible)
 * @param {() => object} deps.getPlayer - { x, z, groundY, eyeY, crouching, sprinting, walking, torchOn, lookX, lookZ, hiddenIn }
 * @param {object[]} deps.colliders - the study's (including the hide props')
 * @param {object[]} [deps.sightOnly] - cover with no collider (the curtains)
 * @param {object[]} [deps.hideSpots] - levels/studyHideProps.js hideSpots
 * @param {(x:number, z:number, currentY:number|null) => number} deps.groundAt
 * @param {number} deps.loftY
 * @param {(x:number, y:number, z:number) => boolean} [deps.isLit]
 * @param {() => string} [deps.difficulty] - 'easy' | 'medium' | 'hard'
 * @param {(context: object) => void} [deps.onCaught]
 * @param {(kind: 'search'|'chase'|'found-nothing') => void} [deps.onWhisper]
 * @param {(level: number) => void} [deps.onBreathing]
 * @param {(state: string) => void} [deps.onState]
 * @param {(spot: object) => void} [deps.onCheckSpot] - she has reached a hide spot and opens it
 * @param {() => number} [deps.random]
 */
export function createStudySeeker({
  creature, getPlayer, colliders, sightOnly = [], hideSpots = [], groundAt, loftY,
  isLit = () => false, difficulty = () => 'medium',
  onCaught = () => {}, onWhisper = () => {}, onBreathing = () => {}, onState = () => {},
  onCheckSpot = () => {}, random = Math.random
}) {
  // ------------------------------------------------------------- the graph
  const nodes = new Map();
  for (const [id, [x, z, f]] of Object.entries(STUDY_NAV.nodes)) {
    const y = f === 'g' ? 0 : f === 'l' ? loftY : groundAt(x, z, loftY / 2);
    nodes.set(id, { id, x, z, y, f, links: [] });
  }
  for (const [a, b] of STUDY_NAV.edges) {
    const na = nodes.get(a), nb = nodes.get(b);
    const cost = Math.hypot(na.x - nb.x, na.z - nb.z, na.y - nb.y);
    na.links.push({ to: nb, cost });
    nb.links.push({ to: na, cost });
  }

  const floorOf = (y) => (y > loftY - 0.6 ? 'l' : y < 0.6 ? 'g' : 's');

  /** The colliders a body standing at height `y` collides with -- PointerLockPlayer's filter. */
  function walkBoxes(y) {
    return colliders.filter((box) => (box.minY === undefined || y + 1.6 > box.minY)
      && (box.maxY === undefined || y < box.maxY));
  }

  /** Is a straight walk clear, a body's width either side? Same floor only. */
  function walkClear(x0, z0, x1, z1, y) {
    const boxes = walkBoxes(y);
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const ox = (-dz / len) * BODY_RADIUS, oz = (dx / len) * BODY_RADIUS;
    return [0, 1, -1].every((side) => !segmentBlocked(x0 + ox * side, z0 + oz * side, x1 + ox * side, z1 + oz * side, boxes));
  }

  function nearestNode(x, z, y) {
    const f = floorOf(y);
    let best = null, bestD = Infinity;
    for (const node of nodes.values()) {
      // A stair node is only a start or a goal FROM the stair. From the floor
      // beside it, the stair's side is a wall, and choosing s_mid there sent
      // her straight into it until the stuck timer gave up.
      const sameFloor = f === 's' || node.f === f;
      if (!sameFloor) continue;
      const d = Math.hypot(node.x - x, node.z - z, (node.y - y) * 2);
      if (d >= bestD) continue;
      if (node.f === f && f !== 's' && !walkClear(x, z, node.x, node.z, y)) continue;
      best = node; bestD = d;
    }
    if (best) return best;
    for (const node of nodes.values()) {
      const d = Math.hypot(node.x - x, node.z - z, (node.y - y) * 2);
      if (d < bestD) { best = node; bestD = d; }
    }
    return best;
  }

  /** Dijkstra over the graph. A list of nodes from `from` to `to`, both included. */
  function route(from, to) {
    if (from === to) return [from];
    const dist = new Map([[from, 0]]);
    const prev = new Map();
    const open = new Set([from]);
    while (open.size) {
      let current = null, currentD = Infinity;
      for (const n of open) { const d = dist.get(n); if (d < currentD) { current = n; currentD = d; } }
      open.delete(current);
      if (current === to) break;
      for (const { to: next, cost } of current.links) {
        const d = currentD + cost;
        if (d < (dist.get(next) ?? Infinity)) { dist.set(next, d); prev.set(next, current); open.add(next); }
      }
    }
    if (!prev.has(to)) return [from];
    const path = [to];
    while (path[0] !== from) path.unshift(prev.get(path[0]));
    return path;
  }

  /** The points to walk from where she is to (x, z) at height y. */
  function planTo(x, z, y) {
    const here = creature.position;
    const hy = currentY;
    if (floorOf(hy) === floorOf(y) && floorOf(y) !== 's' && walkClear(here.x, here.z, x, z, hy)) {
      return [{ x, z, y }];
    }
    const start = nearestNode(here.x, here.z, hy);
    const goal = nearestNode(x, z, y);
    const points = route(start, goal).map((n) => ({ x: n.x, z: n.z, y: n.y, node: n }));
    // Skip the first node when it is behind her and the second is in reach.
    if (points.length > 1 && floorOf(hy) === points[1].node.f
      && walkClear(here.x, here.z, points[1].x, points[1].z, hy)) points.shift();
    points.push({ x, z, y });
    return points;
  }

  // ------------------------------------------------------------- her state
  let state = 'stopped';
  let mode = 'hunt';
  let currentY = 0;
  let path = [];
  let pace = 0;
  let stateTime = 0;
  let lastKnown = null;
  /** Where a chase lost sight of him, so the search opens the spot beside it. */
  let lostHimAt = null;
  let outOfSight = 0;
  /** She is walking to a thrown lure, not to anything of his. */
  let chasingLure = false;
  /** stateTime-free clock of when she last had him in a chase. */
  let clock = 0;
  let lastChaseAt = -Infinity;
  let searchQueue = [];
  let searchTime = 0;
  let checking = null;
  let checkTime = 0;
  let pauseTime = 0;
  let routeIndex = 0;
  let lastPatrolNode = null;
  let whisperIn = Infinity;
  let stuckTime = 0;
  let lastPos = { x: 0, z: 0 };
  let withdrawLeft = 0;
  let caught = false;

  function tuning() {
    const base = STUDY_SEEKER_TUNING[difficulty()] ?? STUDY_SEEKER_TUNING.medium;
    if (mode === 'hunt') {
      return {
        ...base,
        hearSprint: base.hearSprint * HUNT.hear,
        hearWalk: base.hearWalk * HUNT.hear,
        sightDark: base.sightDark * HUNT.sightDark,
        sightLit: base.sightLit * HUNT.sightLit,
        speed: base.speed * HUNT.speed,
        giveUp: base.giveUp * HUNT.giveUp,
        checkChance: Math.min(0.95, base.checkChance * HUNT.checkChance)
      };
    }
    if (mode !== 'teaser') return base;
    return {
      ...base,
      sightDark: base.sightDark * TEASER.sightDark,
      sightLit: base.sightLit * 0.8,
      speed: base.speed * TEASER.speed,
      giveUp: base.giveUp * TEASER.giveUp,
      checkChance: base.checkChance * TEASER.checkChance
    };
  }

  function setState(next) {
    if (state === next) return;
    state = next;
    stateTime = 0;
    onState(next);
  }

  function place(x, z, y) {
    creature.setPosition(x, z);
    currentY = y;
    creature.group.position.y = y;
  }

  function faceToward(x, z, dt, rate = 6) {
    const here = creature.position;
    const dx = x - here.x, dz = z - here.z;
    if (dx * dx + dz * dz < 1e-4) return;
    const want = Math.atan2(-dx, -dz);
    let delta = want - creature.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    creature.setYaw(creature.yaw + delta * Math.min(1, dt * rate));
  }

  /** Walks the path. True once it is walked. */
  function walk(dt) {
    if (path.length === 0) { creature.setSpeed(0); return true; }
    const target = path[0];
    const here = creature.position;
    const dx = target.x - here.x, dz = target.z - here.z;
    const d = Math.hypot(dx, dz);
    const sameFloor = floorOf(currentY) === floorOf(target.y) || target.node?.f === 's' || floorOf(currentY) === 's';
    if (d < 0.3 && (sameFloor || Math.abs(target.y - currentY) < 0.4)) {
      path.shift();
      return path.length === 0;
    }
    // Turn first, then walk the way she faces. She used to slide along the
    // path at full pace while the body was still turning, so a path that
    // doubled back had her walking backwards for half a second.
    faceToward(target.x, target.z, dt, TURN_RATE);
    const fx = -Math.sin(creature.yaw), fz = -Math.cos(creature.yaw);
    const facing = (fx * dx + fz * dz) / d;
    const ease = facing <= TURN_IN_PLACE ? 0 : Math.min(1, (facing - TURN_IN_PLACE) / (1 - TURN_IN_PLACE));
    const step = Math.min(d, pace * ease * dt);
    const next = { x: here.x + (dx / d) * step, z: here.z + (dz / d) * step };
    resolveCircle(next, BODY_RADIUS, walkBoxes(currentY));
    const y = groundAt(next.x, next.z, currentY);
    place(next.x, next.z, y);
    creature.setSpeed(pace * ease);
    // Stuck on a corner the graph did not foresee: skip to the next point.
    // Turning on the spot is not stuck.
    stuckTime = ease > 0.5 && Math.hypot(next.x - lastPos.x, next.z - lastPos.z) < pace * dt * 0.25 ? stuckTime + dt : 0;
    lastPos = { x: next.x, z: next.z };
    if (stuckTime > 1.2) { stuckTime = 0; path.shift(); }
    return false;
  }

  function goTo(x, z, y, speed) {
    path = planTo(x, z, y);
    pace = speed;
  }

  // ------------------------------------------------------------- perception
  /** The spot the player is in, or null: the wardrobe (main.js says) or a curtain (where they stand). */
  function spotOf(player) {
    if (player.hiddenIn) return player.hiddenIn;
    for (const spot of hideSpots) if (spot.contains?.(player.x, player.z, player.groundY)) return spot;
    return null;
  }

  /** The blockers for a sightline at `height` (absolute) on one floor. */
  function sightBlocked(x0, z0, x1, z1, floorY, seenHeight, crossFloor) {
    const at = floorY + seenHeight;
    const boxes = [];
    for (const box of colliders) {
      if (crossFloor) { if (box.minY === undefined && box.maxY === undefined) boxes.push(box); continue; }
      if ((box.minY === undefined || box.minY <= at) && (box.maxY === undefined || box.maxY >= at)) boxes.push(box);
    }
    if (!crossFloor) {
      for (const box of sightOnly) {
        if (Math.abs(box.floorY - floorY) < 0.5 && box.floorY + box.height >= at) boxes.push(box);
      }
    }
    return segmentBlocked(x0, z0, x1, z1, boxes);
  }

  /** Can the floors see each other here? Only across the open well at the front. */
  function wellOpen(f, x, z) {
    if (f === 's') return true;
    if (f === 'g') return z > -0.4;
    return z > -2.2;
  }

  function canSee(player, t) {
    const spot = spotOf(player);
    if (spot) return false;
    const here = creature.position;
    const dx = player.x - here.x, dz = player.z - here.z;
    const flat = Math.hypot(dx, dz);
    const dy = player.groundY - currentY;
    const d = Math.hypot(flat, dy);
    const myFloor = floorOf(currentY), theirFloor = floorOf(player.groundY);
    const crossFloor = myFloor !== theirFloor && myFloor !== 's' && theirFloor !== 's';
    if (crossFloor && !(wellOpen(myFloor, here.x, here.z) && wellOpen(theirFloor, player.x, player.z))) return false;
    const seenHeight = (player.eyeY - player.groundY) - SEEN_BELOW_EYE;
    if (d < TOUCH_RANGE && !crossFloor) {
      return !sightBlocked(here.x, here.z, player.x, player.z, player.groundY, seenHeight, false);
    }
    // The torch pointed at her: she sees the light, whichever way she faces.
    let torchOnHer = false;
    if (player.torchOn && d < TORCH_REACH) {
      const lx = player.lookX, lz = player.lookZ;
      const ll = Math.hypot(lx, lz) || 1;
      const cos = (-dx * lx - dz * lz) / (flat * ll || 1);
      torchOnHer = Math.acos(Math.max(-1, Math.min(1, cos))) < TORCH_CONE;
    }
    if (!torchOnHer) {
      const range = player.torchOn || isLit(player.x, player.groundY, player.z) ? t.sightLit : t.sightDark;
      if (d > range) return false;
      const fx = -Math.sin(creature.yaw), fz = -Math.cos(creature.yaw);
      const cos = (fx * dx + fz * dz) / (flat || 1);
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > FOV) return false;
    }
    return !sightBlocked(here.x, here.z, player.x, player.z, player.groundY, seenHeight, crossFloor);
  }

  /** What she hears of the player this frame: a position, or null. */
  function hear(player, t) {
    if (player.crouching) return null;
    const radius = player.sprinting ? t.hearSprint : player.walking ? t.hearWalk : 0;
    if (radius <= 0) return null;
    const here = creature.position;
    const otherFloor = floorOf(currentY) !== floorOf(player.groundY);
    const d = Math.hypot(player.x - here.x, player.z - here.z, (player.groundY - currentY) * 0.5);
    if (d > radius * (otherFloor ? 0.7 : 1)) return null;
    return { x: player.x, z: player.z, y: player.groundY };
  }

  // ------------------------------------------------------------- behaviour
  function startInvestigating(point, { urgent = false, sawHim = false, lure = false } = {}) {
    chasingLure = lure;
    lastKnown = point;
    lostHimAt = sawHim ? point : null;
    searchQueue = [];
    checking = null;
    const t = tuning();
    goTo(point.x, point.z, point.y, lure ? SPEED.alerted
      : (urgent ? SPEED.investigate * 1.15 : SPEED.investigate) * t.speed);
    setState('investigate');
  }

  function startSearching() {
    const t = tuning();
    const near = [];
    const center = lastKnown ?? { x: creature.position.x, z: creature.position.z, y: currentY };
    for (const spot of hideSpots) {
      const [cx, cz] = spot.checkPoint;
      if (Math.abs(spot.floorY - center.y) > 1 || Math.hypot(cx - center.x, cz - center.z) > SEARCH_RADIUS) continue;
      // She lost him in a chase right beside it: she saw where he went.
      const certain = !!lostHimAt && Math.hypot(cx - lostHimAt.x, cz - lostHimAt.z) < 1.8;
      near.push({ kind: 'spot', spot, x: cx, z: cz, y: spot.floorY, certain });
    }
    // A couple of graph points round the clue, so she looks about as well.
    const around = [...nodes.values()]
      .filter((n) => n.f === floorOf(center.y) && Math.hypot(n.x - center.x, n.z - center.z) < SEARCH_RADIUS)
      .sort(() => random() - 0.5)
      .slice(0, 2)
      .map((n) => ({ kind: 'look', x: n.x, z: n.z, y: n.y }));
    searchQueue = [...near, ...around].sort(() => random() - 0.5)
      .sort((a, b) => (b.certain ? 1 : 0) - (a.certain ? 1 : 0));
    searchTime = 0;
    checking = null;
    pace = SPEED.investigate * t.speed * 0.9;
    nextSearchStep();
    setState('search');
  }

  function nextSearchStep() {
    const t = tuning();
    while (searchQueue.length) {
      const step = searchQueue.shift();
      if (step.kind === 'spot' && !step.certain && random() > t.checkChance) continue;
      checking = step.kind === 'spot' ? step.spot : null;
      goTo(step.x, step.z, step.y, pace);
      return true;
    }
    return false;
  }

  function startPatrol() {
    path = [];
    pauseTime = 0;
    setState('patrol');
    nextPatrolLeg();
  }

  function nextPatrolLeg() {
    const t = tuning();
    pace = SPEED.patrol * t.speed;
    if (mode === 'teaser') {
      const id = TEASER_ROUTE[routeIndex % TEASER_ROUTE.length];
      routeIndex++;
      const n = nodes.get(id);
      goTo(n.x, n.z, n.y, pace);
      return;
    }
    // Anywhere on the graph, preferring somewhere she has not just been.
    const here = nearestNode(creature.position.x, creature.position.z, currentY);
    const options = [...nodes.values()].filter((n) => n !== here && n !== lastPatrolNode
      && Math.hypot(n.x - here.x, n.z - here.z, n.y - here.y) > 3);
    const pick = options[Math.floor(random() * options.length)] ?? here;
    lastPatrolNode = here;
    goTo(pick.x, pick.z, pick.y, pace);
  }

  function catchPlayer(context) {
    if (caught) return;
    caught = true;
    path = [];
    creature.setSpeed(0);
    setState('caught');
    onCaught({ ...context, at: { x: creature.position.x, z: creature.position.z, y: currentY } });
  }

  function scheduleWhisper() {
    whisperIn = WHISPER_GAP[0] + random() * (WHISPER_GAP[1] - WHISPER_GAP[0]);
  }

  // ------------------------------------------------------------- the API
  return {
    get state() { return state; },
    get mode() { return mode; },
    get position() { return { x: creature.position.x, y: currentY, z: creature.position.z }; },
    get lastKnown() { return lastKnown; },
    get checking() { return checking; },
    get pathLength() { return path.length; },
    nodes,
    floorOf,
    walkClear,

    /**
     * Starts her looking. `mode` 'teaser' walks TEASER_ROUTE with the teaser's
     * softer senses; 'hunt' is the full thing. `at` is where she appears;
     * `investigate` is where she goes first, as if she heard it.
     */
    start({ mode: nextMode = 'hunt', at = 'g_entry', investigate = null } = {}) {
      mode = nextMode;
      caught = false;
      routeIndex = 0;
      lastPatrolNode = null;
      lastKnown = null;
      chasingLure = false;
      lastChaseAt = -Infinity;
      searchQueue = [];
      checking = null;
      outOfSight = 0;
      const n = typeof at === 'string' ? nodes.get(at) : { x: at[0], z: at[1], y: groundAt(at[0], at[1], at[2] ?? 0) };
      place(n.x, n.z, n.y);
      lastPos = { x: n.x, z: n.z };
      creature.reset?.();
      creature.setCorrection?.(0);
      creature.visible = true;
      scheduleWhisper();
      if (investigate) startInvestigating(investigate);
      else startPatrol();
    },

    /** The power is back: she leaves the way she came, into the dark that is left, and is gone. */
    withdraw() {
      if (state === 'stopped' || state === 'withdraw') return;
      const here = creature.position;
      const exits = ['g_entry', 'g_hearth'].map((id) => nodes.get(id));
      const exit = exits.sort((a, b) => Math.hypot(a.x - here.x, a.z - here.z, a.y - currentY)
        - Math.hypot(b.x - here.x, b.z - here.z, b.y - currentY))[0];
      goTo(exit.x, exit.z, exit.y, SPEED.investigate * 1.2);
      // Not long in the light: a few steps toward the dark, and she is gone.
      withdrawLeft = 4;
      setState('withdraw');
    },

    /** A catch the caller could not take (a cutscene had the camera): she looks on. */
    release() {
      if (state !== 'caught') return;
      caught = false;
      startPatrol();
    },

    stop() {
      path = [];
      creature.setSpeed(0);
      onBreathing(0);
      setState('stopped');
    },

    /** Gone at once: hidden and stopped. */
    vanish() {
      path = [];
      creature.setSpeed(0);
      creature.visible = false;
      onBreathing(0);
      setState('stopped');
    },

    /**
     * Something made a sound at (x, y, z), heard within `radius`. A thrown
     * book or glass landing; the crest's latch; the archive's compartment.
     */
    noise({ x, y = 0, z, radius = 6 }) {
      if (state === 'stopped' || state === 'withdraw' || state === 'caught' || state === 'chase') return false;
      // Him first, always: a lure never pulls her off a player she can see,
      // or one she can hear walking.
      const player = getPlayer();
      const t = tuning();
      if (canSee(player, t) || hear(player, t)) return false;
      const here = creature.position;
      const d = Math.hypot(x - here.x, z - here.z, (y - currentY) * 0.5);
      // In the hunt she hears a lure from further off and always runs to it.
      const hunting = mode === 'hunt';
      if (d > radius * (hunting ? HUNT.noiseRadius : 1)) return false;
      startInvestigating({ x, z, y: groundAt(x, z, y) }, { urgent: hunting || radius > 9, lure: true });
      return true;
    },

    reset() {
      path = [];
      caught = false;
      state = 'stopped';
      checking = null;
      searchQueue = [];
      lastKnown = null;
      chasingLure = false;
      lastChaseAt = -Infinity;
      onBreathing(0);
    },

    update(dt) {
      if (state === 'stopped' || state === 'caught' || dt <= 0) return;
      stateTime += dt;
      clock += dt;
      const t = tuning();
      const player = getPlayer();
      const here = creature.position;
      const distance = Math.hypot(player.x - here.x, player.z - here.z, player.groundY - currentY);
      onBreathing(state === 'withdraw' ? 0 : Math.max(0, 1 - distance / 9));

      if (state === 'withdraw') {
        withdrawLeft -= dt;
        if (walk(dt) || withdrawLeft <= 0) this.vanish();
        creature.update(dt);
        return;
      }

      // Whispers, while she looks rather than runs.
      whisperIn -= dt;
      if (whisperIn <= 0) {
        if (state !== 'chase') onWhisper('search');
        scheduleWhisper();
      }

      // ---- the hide spot she is opening (unless she sees him: that comes first)
      if (checking && path.length === 0 && state === 'search' && !canSee(player, t)) {
        // The wardrobe's doors open, the curtain is pulled back.
        if (checkTime === 0) onCheckSpot(checking);
        checkTime += dt;
        creature.setSpeed(0);
        const [cx, cz] = checking.checkPoint;
        faceToward(cx + (checking.kind === 'wardrobe' ? 0 : -1), cz + (checking.kind === 'wardrobe' ? 1 : 0), dt);
        if (checkTime >= CHECK_SECONDS) {
          const found = spotOf(player) === checking;
          const spot = checking;
          checking = null;
          checkTime = 0;
          if (found) { catchPlayer({ spot, how: 'found' }); creature.update(dt); return; }
          if (!nextSearchStep()) { onWhisper('found-nothing'); startPatrol(); }
        }
        creature.update(dt);
        return;
      }
      checkTime = 0;

      // ---- senses
      const sees = canSee(player, t);
      if (sees) {
        lastKnown = { x: player.x, z: player.z, y: player.groundY };
        outOfSight = 0;
        chasingLure = false;
        checking = null;
        if (state !== 'chase') { setState('chase'); onWhisper('chase'); }
      } else if (state === 'chase') {
        outOfSight += dt;
      }
      if (state === 'chase') lastChaseAt = clock;
      const heard = sees ? null : hear(player, t);
      // His footsteps outrank everything else. Off after a lure, or so soon
      // after a chase that it is the same chase, hearing him walk or run is
      // finding him again: straight back to the chase, at him.
      if (heard && state !== 'chase' && (chasingLure || clock - lastChaseAt < RECENT_CHASE)) {
        chasingLure = false;
        checking = null;
        lastKnown = heard;
        outOfSight = 0;
        path = [];
        setState('chase');
        onWhisper('chase');
      } else if (heard && state !== 'chase') {
        // A fresh sound she is not already walking to.
        const far = !lastKnown || Math.hypot(heard.x - lastKnown.x, heard.z - lastKnown.z) > 1.2;
        if (far || state === 'patrol') startInvestigating(heard, { urgent: player.sprinting });
      } else if (heard && state === 'chase') {
        lastKnown = heard;
        outOfSight = Math.min(outOfSight, LOSE_SIGHT_AFTER * 0.5);
      }

      // ---- catch
      const sameFloor = Math.abs(player.groundY - currentY) < 0.6;
      if (sameFloor && Math.hypot(player.x - here.x, player.z - here.z) < CATCH_RANGE && (sees || state === 'chase')) {
        catchPlayer({ how: 'reached' });
        creature.update(dt);
        return;
      }

      // ---- move
      if (state === 'chase') {
        pace = sees ? SPEED.alerted : Math.min(SPEED.chase * t.speed, SPEED.chaseCap);
        if (outOfSight > LOSE_SIGHT_AFTER) {
          startInvestigating(lastKnown, { urgent: true, sawHim: true });
        } else if (lastKnown) {
          // Re-plan a few times a second, not every frame.
          if (path.length === 0 || stateTime % 0.25 < dt) path = planTo(lastKnown.x, lastKnown.z, lastKnown.y);
          walk(dt);
        }
      } else if (state === 'investigate') {
        if (walk(dt)) startSearching();
      } else if (state === 'search') {
        searchTime += dt;
        if (searchTime > t.giveUp) { onWhisper('found-nothing'); startPatrol(); }
        else if (walk(dt) && !checking) {
          if (!nextSearchStep()) { onWhisper('found-nothing'); startPatrol(); }
        }
      } else if (state === 'patrol') {
        if (pauseTime > 0) {
          pauseTime -= dt;
          creature.setSpeed(0);
          // Listening: a slow look one way and the other.
          creature.setYaw(creature.yaw + Math.sin(stateTime * 1.3) * dt * 0.9);
        } else if (walk(dt)) {
          if (random() < 0.4) pauseTime = 1.2 + random() * 1.3;
          nextPatrolLeg();
        }
      }
      creature.update(dt);
    }
  };
}
