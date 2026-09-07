/**
 * The backrooms maze, as data and as pure functions. NO three.js in this file.
 *
 * Split out of backroomsLevel.js so the layout can be checked without a
 * browser: package.json is "type": "module", so plain `node` can import this and
 * run reportMaze(), which is what makes a 40-corridor hand-authored maze safe to
 * edit at all. backroomsLevel.js keeps everything that touches the renderer.
 *
 * WHAT A LEG IS. A corridor is declared by its CENTRE-LINE, not by two corners:
 *
 *   { axis, at, from, to, w, parent }
 *
 *   axis 'z' -- the corridor RUNS along z, and `at` is its x centre-line
 *   axis 'x' -- it runs along x, and `at` is its z centre-line
 *   from/to  -- absolute span along its own axis. Absolute rather than a length,
 *               because a length chain propagates one typo down every
 *               descendant, and the rules below are direct comparisons on
 *               absolute coordinates.
 *   w        -- width across the corridor
 *   parent   -- the leg it hangs off. THE TREE IS THE DATA.
 *
 * WHY PARENT POINTERS. The old file kept 14 rectangles and an assertion that
 * counted junctions and checked `count === n - 1`. That cannot say WHICH pair is
 * at fault, and a disconnected component plus a loop cancel out and pass it. At
 * 40 corridors neither is acceptable. Declaring the parent makes the tree a
 * property of the data, and the validator's job becomes checking that the
 * GEOMETRY agrees with the declared tree -- which it can report by name.
 *
 * THE TWO ADJACENCY RULES, which make overlaps correct by construction instead
 * of by hand-tuning. For a leg L with parent P (axes must be perpendicular):
 *
 *   R1 REACH:  P.at lies within [L.from, L.to]      -- L reaches P's centre-line
 *   R2 INSET:  L.at lies within [P.from + L.w/2, P.to - L.w/2]
 *
 * From those the overlap is derived rather than tuned: across L it is exactly
 * L.w, and along L it is at least P.w/2. Both are comfortably over the player's
 * 0.7 m diameter, so a junction is walkable by arithmetic.
 *
 * R1 is deliberately unmargined, because that single rule expresses BOTH
 * junction shapes: P.at at L's end is a T-arm dead-ending into the parent, and
 * P.at in L's interior is this level's signature move -- the route turns and the
 * corridor you were already in carries on without you, as the mistake.
 */

// The only import: the same two numbers PointerLockPlayer and CreatureAI read,
// so the walk/sprint timings this file reports cannot drift from the game.
import { WALK_SPEED, SPRINT_SPEED } from "../core/MoveSpeeds.js";

/** 2.2 m of walkable width after the player's 0.35 m body radius. */
export const CORRIDOR_W = 3.2;
/** Collider slab thickness, straddling the wall plane. */
export const T = 0.30;
/** Duplicated from PointerLockPlayer for the walkability proof below. */
export const BODY_R = 0.35;

/**
 * Minimum solid rock between two corridors that are NOT joined.
 *
 * Not cosmetic. The fluorescents do not cast shadows, so a lamp's pool passes
 * straight through a wall; at 1.4 m a lit route corridor visibly bleeds into an
 * unlit decoy beside it, which destroys the one in-world tell the level has left
 * now that the arrows are gone. See the reduced `distance` on the fixtures.
 */
export const MIN_WALL = 1.6;

export const LEGS = {
  // ---- the route ---------------------------------------------------------
  // Legs alternating axis, so every leg is a turn. Every turn is a T where
  // carrying straight on is the mistake, and the part of each leg past its turn
  // IS that mistake: the decoys are not separate geometry, they are the
  // corridor you were already in, continuing without you.
  NS1: { axis: 'z', at: 0, from: 0.0, to: 6.4, w: 3.2, parent: null, kind: 'route' },
  EW1: { axis: 'x', at: 4.8, from: -12.0, to: 7.0, w: 3.2, parent: 'NS1', kind: 'route' },
  NS2: { axis: 'z', at: -10.4, from: 3.2, to: 13.6, w: 3.2, parent: 'EW1', kind: 'route' },
  EW2: { axis: 'x', at: 10.4, from: -15.0, to: 1.0, w: 3.2, parent: 'NS2', kind: 'route' },
  NS3: { axis: 'z', at: -3.6, from: 8.8, to: 19.0, w: 3.2, parent: 'EW2', kind: 'route' },
  EW3: { axis: 'x', at: 16.0, from: -14.0, to: 1.0, w: 3.2, parent: 'NS3', kind: 'route' },
  NS4: { axis: 'z', at: -12.4, from: 14.4, to: 25.0, w: 3.2, parent: 'EW3', kind: 'route' },
  EW4: { axis: 'x', at: 21.4, from: -14.0, to: 2.0, w: 3.2, parent: 'NS4', kind: 'route', exit: true },

  // ---- forks, hanging off DECOYS rather than off the route ----------------
  // so a wrong turn can present a choice of its own. fA2 is two wrong turns
  // deep. These are what stop the maze reading as one spine with stubs on it.
  fA: { axis: 'z', at: 4.6, from: 5.4, to: 10.5, w: 3.2, parent: 'EW1', kind: 'decoy' },
  fA2: { axis: 'x', at: 8.8, from: 5.2, to: 9.0, w: 2.4, parent: 'fA', kind: 'decoy' },
  fB: { axis: 'z', at: 0.5, from: 14.4, to: 18.5, w: 3.0, parent: 'EW3', kind: 'decoy' },
  fC: { axis: 'x', at: 24.75, from: -17.0, to: -12.5, w: 2.5, parent: 'NS4', kind: 'decoy' },

  // ---- plain stubs, visibly dead from the mouth ---------------------------
  sA: { axis: 'x', at: 1.55, from: 0.6, to: 4.4, w: 2.1, parent: 'NS1', kind: 'decoy' },
  sD: { axis: 'z', at: -7.05, from: 18.0, to: 21.0, w: 2.9, parent: 'EW4', kind: 'decoy' }
};

/** [x0, x1, z0, z1] -- the walkable interior, derived from a leg. */
export function legRect(leg) {
  const h = leg.w / 2;
  return leg.axis === 'z'
    ? [leg.at - h, leg.at + h, leg.from, leg.to]
    : [leg.from, leg.to, leg.at - h, leg.at + h];
}

/** name -> rect. The shape everything downstream consumes. */
export function buildCorridors(legs = LEGS) {
  const out = {};
  for (const name of Object.keys(legs)) out[name] = legRect(legs[name]);
  return out;
}

export const CORRIDORS = buildCorridors();

/**
 * The corridors the correct route passes through, in order.
 *
 * DERIVED, by walking parent pointers back from the leg marked `exit`. It used
 * to be a hand-typed array that nothing in the project ever read -- documentation
 * wearing data's clothes. The lamps, the door and the validator all read this
 * one, so it cannot drift from the layout it describes.
 */
export function buildRoute(legs = LEGS) {
  const exit = Object.keys(legs).find((n) => legs[n].exit);
  if (!exit) return [];
  const chain = [];
  for (let n = exit; n; n = legs[n].parent) chain.push(n);
  return chain.reverse();
}

export const ROUTE = buildRoute();

/**
 * Every wall in the level, as the boundary of the corridor union.
 *
 * PAINTS each rect into the grid rather than testing every cell against every
 * rect. The old version was O(box area x rects): about 1.0M point-in-rect tests
 * at 14 corridors, run synchronously at module import, so tripling the maze
 * would have taken it past 10M on the boot critical path. Painting is O(total
 * corridor area) -- roughly 100k writes however many rects that area is divided
 * into -- and the boundary sweep after it was already O(cells) with no per-rect
 * factor, so nothing else needed touching.
 *
 * The output is IDENTICAL, not merely similar, and that is provable rather than
 * hoped: cell centres land on odd multiples of G/2 = 0.05 while every rect edge
 * is a multiple of 0.1, so no centre can tie with an edge, and the strict
 * comparisons of the old test agree with the half-open fill everywhere.
 * validateMaze() asserts the 0.1 rule, which is what keeps that true.
 *
 * Runs are padded by T/2 at BOTH ends so corners always overlap. That padding is
 * load-bearing: the collision resolver tests each AABB independently so overlap
 * costs nothing, and a 1 cm seam is not a black void -- it is the lit carpeted
 * room next door, which the player can walk into and then off the edge of the
 * world.
 */
export function buildWallRuns(corridors = CORRIDORS) {
  const G = 0.10;
  const rects = Object.values(corridors);
  const minX = Math.min(...rects.map((r) => r[0])) - 1;
  const maxX = Math.max(...rects.map((r) => r[1])) + 1;
  const minZ = Math.min(...rects.map((r) => r[2])) - 1;
  const maxZ = Math.max(...rects.map((r) => r[3])) + 1;
  const nx = Math.round((maxX - minX) / G);
  const nz = Math.round((maxZ - minZ) / G);

  const inside = new Uint8Array(nx * nz);
  for (const [x0, x1, z0, z1] of rects) {
    // Cell i is inside when its CENTRE, minX + (i + 0.5) * G, is strictly
    // within the rect -- i.e. i > (x0 - minX)/G - 0.5. Edges are multiples of
    // 0.1 and centres odd multiples of 0.05, so that bound never lands on an
    // integer and ceil/floor are exact with no tie to break.
    const i0 = Math.max(0, Math.ceil((x0 - minX) / G - 0.5));
    const i1 = Math.min(nx - 1, Math.floor((x1 - minX) / G - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - minZ) / G - 0.5));
    const j1 = Math.min(nz - 1, Math.floor((z1 - minZ) / G - 0.5));
    for (let j = j0; j <= j1; j++) {
      const row = j * nx;
      inside.fill(1, row + i0, row + i1 + 1);
    }
  }

  const snap = (v) => Math.round(v * 100) / 100;
  const runs = [];
  // walls standing at constant x, on the boundary between columns i-1 and i
  for (let i = 1; i < nx; i++) {
    let start = null;
    for (let j = 0; j <= nz; j++) {
      const edge = j < nz && (inside[j * nx + i - 1] ^ inside[j * nx + i]);
      if (edge && start === null) start = j;
      else if (!edge && start !== null) {
        runs.push({ axis: 'x', at: snap(minX + i * G), from: snap(minZ + start * G - T / 2), to: snap(minZ + j * G + T / 2) });
        start = null;
      }
    }
  }
  // walls standing at constant z, on the boundary between rows j-1 and j
  for (let j = 1; j < nz; j++) {
    let start = null;
    for (let i = 0; i <= nx; i++) {
      const edge = i < nx && (inside[(j - 1) * nx + i] ^ inside[j * nx + i]);
      if (edge && start === null) start = i;
      else if (!edge && start !== null) {
        runs.push({ axis: 'z', at: snap(minZ + j * G), from: snap(minX + start * G - T / 2), to: snap(minX + i * G + T / 2) });
        start = null;
      }
    }
  }
  return runs;
}

/** The AABB a wall run becomes, so walls and colliders cannot drift. */
export function runCollider({ axis, at, from, to }) {
  return axis === 'x'
    ? { minX: at - T / 2, maxX: at + T / 2, minZ: from, maxZ: to }
    : { minX: from, maxX: to, minZ: at - T / 2, maxZ: at + T / 2 };
}

/**
 * The floor and ceiling box.
 *
 * DERIVED, but the 0.6 m rule is CONGRUENCE, NOT DIVISIBILITY, and getting that
 * wrong is invisible in a diff. The ceiling texture is a 4x4 grid of 0.6 m tiles
 * whose UV origin is anchored at (BOX.minX, BOX.minZ), so the minimums may only
 * move in whole multiples of 0.6 FROM WHERE THEY WERE. They are not themselves
 * multiples of 0.6 -- -18.7 / 0.6 = -31.17 -- so rounding a derived minimum to a
 * multiple of 0.6 would slide the entire T-bar grid by up to half a tile.
 *
 * The maximums are free: both textures wrap, so growing north or east only
 * changes a repeat count.
 *
 * Beyond the box there is no floor at all, and since nothing sets
 * scene.background the fog does not fade the void -- an overrun reads as a
 * hard-edged black pit.
 */
const ANCHOR_X = -18.7;   // the historical minimum: -11.5 -> -15.1 -> -18.7
const ANCHOR_Z = -1.4;    // was -0.2, moved by 1.2 = 2 x 0.6
const BOX_PAD = 1.0;      // matches buildWallRuns' own bounds padding

export function buildBox(corridors = CORRIDORS) {
  const rects = Object.values(corridors);
  const D = (v) => Math.round(v * 10);            // integer tenths, so 0.6 never drifts
  const stepDown = (want, anchor) => {
    const k = Math.floor((D(want) - D(anchor)) / 6);
    return (D(anchor) + 6 * k) / 10;
  };
  return {
    minX: stepDown(Math.min(...rects.map((r) => r[0])) - BOX_PAD, ANCHOR_X),
    maxX: Math.round((Math.max(...rects.map((r) => r[1])) + BOX_PAD) * 10) / 10,
    minZ: stepDown(Math.min(...rects.map((r) => r[2])) - BOX_PAD, ANCHOR_Z),
    maxZ: Math.round((Math.max(...rects.map((r) => r[3])) + BOX_PAD) * 10) / 10
  };
}

export const BOX = buildBox();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isTenth = (v) => Math.abs(Math.round(v * 10) - v * 10) < 1e-9;

/** Overlap of two rects on each axis. A negative value is a gap of that size. */
function overlap(a, b) {
  return {
    x: Math.min(a[1], b[1]) - Math.max(a[0], b[0]),
    z: Math.min(a[3], b[3]) - Math.max(a[2], b[2])
  };
}

/**
 * Every problem with the maze, collected rather than thrown one at a time.
 *
 * At forty corridors you want the whole list in one pass. The thing this
 * replaces counted junctions and checked `count === n - 1`: it could tell you
 * the total was wrong but never which pair was at fault, and a detached
 * corridor plus an accidental loop cancelled out and passed it in silence.
 *
 * ERRORS are things that make the level wrong -- an unreachable corridor, a loop
 * (which turns a guaranteed dead end into a shortcut and breaks the one promise
 * the level makes), a junction too narrow to walk through, or a wall too thin to
 * stop lamp light. WARNINGS are worth knowing and do not break anything.
 */
export function validateMaze(legs = LEGS) {
  const errors = [];
  const warnings = [];
  const names = Object.keys(legs);
  const rects = buildCorridors(legs);

  // --- well-formedness, before anything downstream trusts the data ---------
  const roots = names.filter((n) => legs[n].parent === null);
  if (roots.length !== 1) errors.push(`expected exactly one root leg, found ${roots.length}${roots.length ? ': ' + roots.join(', ') : ''}`);
  const exits = names.filter((n) => legs[n].exit);
  if (exits.length !== 1) errors.push(`expected exactly one leg marked exit, found ${exits.length}${exits.length ? ': ' + exits.join(', ') : ''}`);

  for (const n of names) {
    const L = legs[n];
    if (L.parent !== null && !legs[L.parent]) errors.push(`${n}: parent "${L.parent}" does not exist`);
    if (L.axis !== 'x' && L.axis !== 'z') errors.push(`${n}: axis must be 'x' or 'z', got ${JSON.stringify(L.axis)}`);
    if (L.to <= L.from) errors.push(`${n}: to (${L.to}) must be greater than from (${L.from})`);
    if (L.w < 2 * BODY_R + 0.6) errors.push(`${n}: width ${L.w} leaves too little room -- the player is ${(2 * BODY_R).toFixed(2)} m across`);
    // The 0.1 rule is what makes buildWallRuns' painting provably identical to
    // the per-cell test it replaced. See the note there.
    const r = legRect(L);
    for (const [i, edge] of [[0, 'x0'], [1, 'x1'], [2, 'z0'], [3, 'z1']]) {
      if (!isTenth(r[i])) errors.push(`${n}: ${edge} edge lands at ${r[i]}, not a multiple of 0.1 -- wall runs would stop being exact`);
    }
  }
  if (errors.length) return { errors, warnings };   // everything below assumes well-formed

  // --- cycles in the declaration, then reachability from the root ----------
  for (const n of names) {
    const seen = new Set([n]);
    for (let p = legs[n].parent; p; p = legs[p].parent) {
      if (seen.has(p)) { errors.push(`${n}: its parent chain loops back through ${p}`); break; }
      seen.add(p);
    }
  }
  if (errors.length) return { errors, warnings };   // a cycle would hang the walks below

  const root = roots[0];
  const reached = new Set([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const n of names) if (!reached.has(n) && reached.has(legs[n].parent)) { reached.add(n); grew = true; }
  }
  const orphans = names.filter((n) => !reached.has(n));
  if (orphans.length) errors.push(`unreachable from ${root}: ${orphans.join(', ')}`);

  // --- R1 and R2, named and measured --------------------------------------
  // R1: a child must cross its parent's centre-line, so the junction is at
  // least half the parent wide. R2: the child must sit far enough along the
  // parent that the parent is still there on both sides of it.
  for (const n of names) {
    const L = legs[n];
    if (!L.parent) continue;
    const P = legs[L.parent];
    if (P.axis === L.axis) {
      errors.push(`${n} and its parent ${L.parent} both run along ${L.axis} -- a junction needs perpendicular legs`);
      continue;
    }
    if (P.at < L.from || P.at > L.to) {
      const miss = P.at < L.from ? L.from - P.at : P.at - L.to;
      errors.push(`R1: ${n} never reaches ${L.parent}'s centre-line -- ${L.parent} is at ${P.at}, ${n} spans ${L.from}..${L.to}, short by ${miss.toFixed(2)} m`);
    }
    const lo = P.from + L.w / 2;
    const hi = P.to - L.w / 2;
    if (L.at < lo || L.at > hi) {
      const miss = L.at < lo ? lo - L.at : L.at - hi;
      errors.push(`R2: ${n} hangs ${miss.toFixed(2)} m off the end of ${L.parent} -- centre-line ${L.at} is outside ${lo.toFixed(2)}..${hi.toFixed(2)}`);
    }
  }

  // --- separation: anything NOT a declared junction must be properly apart --
  const joined = (a, b) => legs[a].parent === b || legs[b].parent === a;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const o = overlap(rects[a], rects[b]);
      if (joined(a, b)) {
        const tight = Math.min(o.x, o.z);
        if (tight <= 2 * BODY_R + 0.3) {
          errors.push(`${a}-${b} junction is ${tight.toFixed(2)} m at its narrowest -- the player is ${(2 * BODY_R).toFixed(2)} m across`);
        }
        continue;
      }
      if (o.x > 0 && o.z > 0) {
        errors.push(`${a} and ${b} overlap (${o.x.toFixed(2)} x ${o.z.toFixed(2)}) without being joined -- that is a loop, so a wrong turn becomes a shortcut`);
      } else {
        const gap = Math.max(-o.x, -o.z);
        if (gap < MIN_WALL) {
          errors.push(`${a} and ${b} are ${gap.toFixed(2)} m apart, under MIN_WALL ${MIN_WALL} -- lamp light will bleed through the wall between them`);
        }
      }
    }
  }

  // --- the annotation must agree with the derived route --------------------
  const route = buildRoute(legs);
  const onRoute = new Set(route);
  for (const n of names) {
    if ((legs[n].kind === 'route') !== onRoute.has(n)) {
      errors.push(`${n} is annotated kind:'${legs[n].kind}' but is ${onRoute.has(n) ? '' : 'not '}on the derived route -- mislabelled, or hung off the wrong parent`);
    }
  }

  // --- shape of the wrong routes ------------------------------------------
  const depthOf = (n) => {
    let d = 0;
    for (let c = n; c; c = legs[c].parent) { if (onRoute.has(c)) return d; d++; }
    return d;
  };
  const decoys = names.filter((n) => !onRoute.has(n));
  const maxDepth = decoys.length ? Math.max(...decoys.map(depthOf)) : 0;
  if (decoys.length && maxDepth < 3) {
    warnings.push(`deepest wrong route is ${maxDepth} turn(s) off the route -- shallow for a maze meant to be explored`);
  }

  // --- walkability, through the shipped collision semantics ----------------
  // Sample every centre-line and check a body-sized circle is not overlapping a
  // wall collider. This proves the route AND every dead end can actually be
  // walked, including the corners where the T/2 run padding intrudes. The 0.5 m
  // inset is BODY_R plus the half-slab a run sticks out by at a capped end.
  const colliders = buildWallRuns(rects).map(runCollider);
  const inset = BODY_R + T / 2;
  let stuck = null;
  outer:
  for (const n of names) {
    const L = legs[n];
    for (let s = L.from + inset; s <= L.to - inset + 1e-9; s += 0.25) {
      const x = L.axis === 'z' ? L.at : s;
      const z = L.axis === 'z' ? s : L.at;
      for (const b of colliders) {
        const dx = x - Math.max(b.minX, Math.min(x, b.maxX));
        const dz = z - Math.max(b.minZ, Math.min(z, b.maxZ));
        if (dx * dx + dz * dz < (BODY_R - 1e-6) ** 2) {   // touching a wall is not being in one
          stuck = `${n} is not walkable: a body-sized circle at (${x.toFixed(2)}, ${z.toFixed(2)}) on its centre-line is inside a wall`;
          break outer;
        }
      }
    }
  }
  if (stuck) errors.push(stuck);

  // --- the box must contain the level --------------------------------------
  const box = buildBox(rects);
  for (const n of names) {
    const r = rects[n];
    if (r[0] < box.minX || r[1] > box.maxX || r[2] < box.minZ || r[3] > box.maxZ) {
      errors.push(`${n} pokes outside the room box -- the player would walk off the edge of the world`);
    }
  }
  const D = (v) => Math.round(v * 10);
  if ((D(box.minX) - D(-18.7)) % 6 !== 0) errors.push(`box minX ${box.minX} is off the 0.6 m ceiling grid -- the whole T-bar pattern would slide`);
  if ((D(box.minZ) - D(-1.4)) % 6 !== 0) errors.push(`box minZ ${box.minZ} is off the 0.6 m ceiling grid -- the whole T-bar pattern would slide`);

  return { errors, warnings, maxDepth, decoys: decoys.length, route };
}

/**
 * Walking distance along the route, in metres.
 *
 * Each leg is entered where the previous one crossed it and left where the next
 * one does; the last leg runs to whichever end is further from where you came
 * in, which is where a door can go.
 */
export function routeLength(legs = LEGS) {
  const route = buildRoute(legs);
  let total = 0;
  for (let i = 0; i < route.length; i++) {
    const L = legs[route[i]];
    const enter = i > 0 ? legs[route[i - 1]].at : L.from;
    const leave = i < route.length - 1
      ? legs[route[i + 1]].at
      : (Math.abs(L.to - enter) > Math.abs(enter - L.from) ? L.to : L.from);
    total += Math.abs(leave - enter);
  }
  return total;
}

/**
 * Print everything worth knowing and return the error count.
 *
 * Used by scripts/check-maze.mjs, so the exit code gates a build.
 */
export function reportMaze(legs = LEGS) {
  const v = validateMaze(legs);
  const runs = buildWallRuns(buildCorridors(legs));
  const names = Object.keys(legs);
  const len = routeLength(legs);

  console.log('--- backrooms maze --------------------------------------------');
  console.log(`corridors    ${names.length}   route ${v.route ? v.route.length : '?'}, decoy ${v.decoys ?? '?'}`);
  if (v.route) console.log(`route        ${v.route.join(' -> ')}`);
  console.log(`route length ${len.toFixed(1)} m   ${(len / WALK_SPEED).toFixed(0)}s walking, ${(len / SPRINT_SPEED).toFixed(0)}s sprinting`);
  console.log(`turns        ${v.route ? v.route.length - 1 : '?'}`);
  console.log(`deepest wrong route  ${v.maxDepth ?? '?'} turn(s) off the route`);
  console.log(`wall runs    ${runs.length}`);
  console.log(`room box     x ${BOX.minX}..${BOX.maxX}   z ${BOX.minZ}..${BOX.maxZ}`);
  console.log('');

  for (const w of v.warnings) console.log(`  warn   ${w}`);
  for (const e of v.errors) console.log(`  ERROR  ${e}`);
  console.log(v.errors.length ? `\n${v.errors.length} error(s).` : 'ok.');
  return v.errors.length;
}
