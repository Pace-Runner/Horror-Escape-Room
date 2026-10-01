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
 *   { axis, at, from, to, w, parent, links }
 *
 *   axis 'z' -- the corridor RUNS along z, and `at` is its x centre-line
 *   axis 'x' -- it runs along x, and `at` is its z centre-line
 *   from/to  -- absolute span along its own axis. Absolute rather than a length,
 *               because a length chain propagates one typo down every
 *               descendant, and the rules below are direct comparisons on
 *               absolute coordinates.
 *   w        -- width across the corridor
 *   parent   -- the leg it hangs off. THE SPANNING TREE IS THE DATA.
 *   links    -- OTHER legs this one also joins. Optional, and each one is a
 *               deliberate LOOP. See below.
 *
 * WHY PARENT POINTERS. The old file kept 14 rectangles and an assertion that
 * counted junctions and checked `count === n - 1`. That cannot say WHICH pair is
 * at fault, and a disconnected component plus a loop cancel out and pass it. At
 * 42 corridors neither is acceptable. Declaring the parent makes the tree a
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
 *
 * ---------------------------------------------------------------- LOOPS
 *
 * THE MAZE IS NO LONGER A TREE, AND THAT IS THE POINT. There is still exactly
 * one EXIT, but there is more than one way to reach it. `links` declares the
 * extra joins.
 *
 * The validator used to reject every loop outright, and the message it used is
 * worth keeping in mind because the concern was real: "that is a loop, so a
 * wrong turn becomes a shortcut". What has changed is that this is now the
 * design rather than an accident. An UNDECLARED overlap is still exactly as
 * wrong as it ever was -- two corridors that touch because somebody mistyped a
 * coordinate -- so the rule did not go away, it acquired an exception that has
 * to be written down in the data before it applies.
 *
 * The parent pointers are still a spanning tree over every leg, and everything
 * that walks them (buildRoute, the reachability check, junctionPoint) still
 * works unchanged. `links` are extra EDGES on top of that tree, not extra
 * parents, which is what keeps the two concerns separate: the tree says how the
 * maze was built, the full edge set says how you can walk it.
 *
 * ROUTE still means THE PRIMARY ROUTE -- the one the lamps light. The loops are
 * unlit, so following the lights still works and finding a shortcut is still a
 * discovery. The validator reports which route legs are BYPASSABLE, which is
 * the property that actually matters and the one that goes red if a link is
 * broken or removed.
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

/**
 * How many legs of the primary route must be skippable via a loop.
 *
 * The brief was more than one way to reach the exit, not more than one exit.
 * This is that, as a number a check can compare against.
 */
export const MIN_BYPASSABLE = 3;

export const LEGS = {
  // ---- THE ROUTE: eleven legs, alternating axis, so TEN turns ------------
  // Every turn is a T where carrying straight on is the mistake, and the part
  // of each leg past its turn IS that mistake -- most decoys are not separate
  // geometry, they are the corridor you were already in, continuing without
  // you. 72 m end to end: ~36 s walking, ~20 s sprinting.
  //
  // Route length is the floor EVERY player pays, twice per playthrough, and the
  // corridor is identical both times. So the maze grew in AREA and in wrong
  // turns, not in route: three times the floor space and three times the
  // corridors, for eleven seconds more walking.
  NS1: { axis: 'z', at:   0.0, from:   0.0, to:  11.2, w: 3.2, parent: null,  kind: 'route' },
  EW1: { axis: 'x', at:   4.8, from: -14.4, to:  14.4, w: 3.2, parent: 'NS1', kind: 'route' },
  NS2: { axis: 'z', at:  -9.6, from:   1.6, to:  16.8, w: 3.2, parent: 'EW1', kind: 'route' },
  EW2: { axis: 'x', at:  14.4, from: -27.2, to:  -6.4, w: 3.2, parent: 'NS2', kind: 'route' },
  NS3: { axis: 'z', at: -14.4, from:  11.2, to:  28.8, w: 3.2, parent: 'EW2', kind: 'route' },
  EW3: { axis: 'x', at:  24.0, from: -22.4, to:  -3.2, w: 3.2, parent: 'NS3', kind: 'route' },
  NS4: { axis: 'z', at:  -9.6, from:  20.8, to:  35.2, w: 3.2, parent: 'EW3', kind: 'route' },
  EW4: { axis: 'x', at:  28.8, from: -11.2, to:   8.0, w: 3.2, parent: 'NS4', kind: 'route' },
  NS5: { axis: 'z', at:   0.0, from:  25.6, to:  38.4, w: 3.2, parent: 'EW4', kind: 'route' },
  EW5: { axis: 'x', at:  33.6, from:  -6.4, to:   1.6, w: 3.2, parent: 'NS5', kind: 'route' },
  NS6: { axis: 'z', at:  -4.8, from:  32.0, to:  38.4, w: 3.2, parent: 'EW5', kind: 'route', exit: true },

  // ---- D1, off EW1 heading east: three turns deep ------------------------
  // The first branch you can reach, and the biggest. d1d is the mercy: a closet
  // you can dismiss from its mouth, so the d1a fork is never two long unknowns.
  d1a: { axis: 'z', at:  11.2, from:   4.8, to:  24.0, w: 3.2, parent: 'EW1', kind: 'decoy' },
  d1b: { axis: 'x', at:  19.2, from:   4.8, to:  17.6, w: 3.2, parent: 'd1a', kind: 'decoy' },
  d1c: { axis: 'z', at:   6.4, from:  19.2, to:  25.6, w: 3.2, parent: 'd1b', kind: 'decoy' },
  d1d: { axis: 'x', at:  14.4, from:  11.2, to:  14.4, w: 2.4, parent: 'd1a', kind: 'decoy' },
  d1e: { axis: 'z', at:  16.0, from:  19.2, to:  24.0, w: 2.4, parent: 'd1b', kind: 'decoy' },
  d1f: { axis: 'x', at:   9.6, from:  11.2, to:  14.4, w: 2.4, parent: 'd1a', kind: 'decoy' },

  // ---- D2, off EW2 heading west: the deepest, and the longest walk back --
  // Everything here is full width, deliberately: a narrow corridor reads as a
  // dead end from its mouth, so a NARROW deep branch tells on itself and wastes
  // the walk. Width is the tell, which is why only the closets are narrow.
  d2a: { axis: 'z', at: -19.2, from:  14.4, to:  20.8, w: 3.2, parent: 'EW2', kind: 'decoy' },
  d2b: { axis: 'x', at:  19.2, from: -30.4, to: -17.6, w: 3.2, parent: 'd2a', kind: 'decoy' },
  // Runs 4.8 m further north than it used to, far enough to cross d4a. That
  // turns the deepest, most punishing branch in the maze into the third way
  // through -- the longest walk back becomes the biggest payoff.
  d2c: { axis: 'z', at: -28.8, from:  19.2, to:  33.6, w: 3.2, parent: 'd2b', kind: 'decoy', links: ['d4a'] },
  d2d: { axis: 'x', at:  27.6, from: -28.8, to: -25.6, w: 2.4, parent: 'd2c', kind: 'decoy' },
  d2e: { axis: 'x', at:  23.6, from: -32.0, to: -28.8, w: 2.4, parent: 'd2c', kind: 'decoy' },
  d2f: { axis: 'z', at: -24.0, from:   8.0, to:  14.4, w: 3.2, parent: 'EW2', kind: 'decoy' },

  // ---- D3, off EW3 heading back east: it aims at the route and misses ----
  // d3c runs at x = 0, collinear with BOTH NS1 and NS5 and walled off from
  // each, so the map you are drawing in your head insists it must join up.
  d3a: { axis: 'z', at:  -4.8, from:  17.6, to:  24.0, w: 3.2, parent: 'EW3', kind: 'decoy' },
  d3b: { axis: 'x', at:  19.2, from:  -6.4, to:   3.2, w: 3.2, parent: 'd3a', kind: 'decoy' },
  d3c: { axis: 'z', at:   0.0, from:  19.2, to:  24.0, w: 3.2, parent: 'd3b', kind: 'decoy' },

  // ---- D4, off NS4 carrying on north: the far corner ---------------------
  // d4a sits at z = 33.6, exactly collinear with EW5 on the route and 1.6 m of
  // solid wall away from it. The longest backtrack in the maze is from d4c,
  // and it is 19.2 m -- under the 20 m ceiling the fairness rules set.
  // THE LEG THAT CARRIES BOTH LOOPS, and it is the tease the level already set
  // up: the comment above used to end "exactly collinear with EW5 on the route
  // and 1.6 m of solid wall away from it". It now runs the last 3.2 m and joins
  // it. A player who took this branch, saw it pointing straight at the route and
  // felt sure it had to connect was RIGHT, which is a far better payoff than
  // being taunted -- and the 1.6 m wall is still there everywhere else, so the
  // tease still works the first time.
  d4a: { axis: 'x', at:  33.6, from: -28.8, to:  -4.8, w: 3.2, parent: 'NS4', kind: 'decoy', links: ['EW5', 'NS6'] },
  d4b: { axis: 'z', at: -19.2, from:  33.6, to:  44.8, w: 3.2, parent: 'd4a', kind: 'decoy' },
  d4c: { axis: 'x', at:  43.2, from: -19.2, to:  -8.0, w: 3.2, parent: 'd4b', kind: 'decoy' },
  d4d: { axis: 'x', at:  38.4, from: -19.2, to: -14.4, w: 2.4, parent: 'd4b', kind: 'decoy' },
  d4e: { axis: 'z', at:  -9.6, from:  38.4, to:  43.2, w: 3.2, parent: 'd4c', kind: 'decoy' },

  // ---- D5, off EW4 heading east: the one that parallels the exit ---------
  d5a: { axis: 'z', at:   4.8, from:  28.8, to:  41.6, w: 3.2, parent: 'EW4', kind: 'decoy' },
  d5b: { axis: 'x', at:  38.4, from:   3.2, to:  12.8, w: 3.2, parent: 'd5a', kind: 'decoy' },
  d5c: { axis: 'z', at:  11.2, from:  28.8, to:  38.4, w: 3.2, parent: 'd5b', kind: 'decoy' },
  d5d: { axis: 'x', at:  33.6, from:   4.8, to:   8.0, w: 2.4, parent: 'd5a', kind: 'decoy' },
  d5e: { axis: 'x', at:  31.2, from:  11.2, to:  15.2, w: 2.4, parent: 'd5c', kind: 'decoy' },

  // ---- closets: 2.4 m wide, and dead from the mouth ----------------------
  // These cost nothing to check and are the reason the deep branches are fair:
  // a player who has learned that narrow means nothing spends their patience on
  // the wide ones, which is where the maze actually is.
  sA: { axis: 'x', at:   9.6, from:   0.0, to:   3.2, w: 2.4, parent: 'NS1', kind: 'decoy' },
  sB: { axis: 'z', at:  -4.8, from:   4.8, to:   7.2, w: 2.4, parent: 'EW1', kind: 'decoy' },
  sC: { axis: 'z', at:   4.8, from:   1.6, to:   4.8, w: 2.4, parent: 'EW1', kind: 'decoy' },
  sD: { axis: 'x', at:  10.0, from:  -9.6, to:  -6.4, w: 2.4, parent: 'NS2', kind: 'decoy' },
  sE: { axis: 'z', at: -19.2, from:  24.0, to:  30.4, w: 3.2, parent: 'EW3', kind: 'decoy' },
  sF: { axis: 'z', at: -14.4, from:  43.2, to:  46.4, w: 2.4, parent: 'd4c', kind: 'decoy' },

  // ---- rooms: 6.4 x 8.0, entered through a 1.4 m neck --------------------
  // Empty on purpose. No door, no pickup, no beat -- a room you walk into,
  // stand in, and walk out of. What they are FOR is scale: every other space in
  // here is 3.2 m across and lit end to end, so the first time the walls stop
  // being an arm's length away is an event on its own, and it is the only place
  // in the maze where the hunter can be somewhere other than in front of you or
  // behind you.
  //
  // THE NECK IS WHAT MAKES THE ENTRANCE A DOORWAY. Hung straight off a corridor
  // a room's whole near side is the opening, because the wall builder walls the
  // boundary of the corridor UNION and there is no boundary where two rects
  // overlap. The neck is a 1.4 m leg that pierces the 1.6 m wall between them,
  // so the gap left in that wall is 1.4 m wide -- and backroomsLevel drops a
  // lintel over it to give the shape its top edge.
  //
  // THESE THREE POSITIONS ARE THE ONLY ONES THAT FIT, which is not a figure of
  // speech: the placement was searched rather than eyeballed, over every leg,
  // both sides, every 0.8 m, sliding the room along its corridor, and validated
  // at each step. At 6.4 x 8.0 exactly three sites clear MIN_WALL on all four
  // sides. Moving one is therefore not a matter of taste -- re-run the search.
  nA: { axis: 'z', at: -13.6, from:   0.2, to:   4.8, w: 1.4, parent: 'EW1', kind: 'neck' },
  RA: { axis: 'x', at:  -1.6, from: -20.8, to: -12.8, w: 6.4, parent: 'nA',  kind: 'room' },

  nB: { axis: 'x', at:   8.8, from: -28.6, to: -24.0, w: 1.4, parent: 'd2f', kind: 'neck' },
  RB: { axis: 'z', at: -30.4, from:   2.4, to:  10.4, w: 6.4, parent: 'nB',  kind: 'room' },

  // Off the loop corridor, so it is only found by a player who took the
  // shortcut -- and it is the far corner of the maze, 40 m from the entrance.
  nC: { axis: 'z', at: -24.8, from:  33.6, to:  38.2, w: 1.4, parent: 'd4a', kind: 'neck' },
  RC: { axis: 'x', at:  40.0, from: -31.2, to: -23.2, w: 6.4, parent: 'nC',  kind: 'room' }
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
 * at 14 corridors, run synchronously at module import, and tripling the maze
 * took it to 149 ms -- on the boot critical path, for a level that is built
 * whether or not you can see it. Painting is O(total corridor area), so it costs
 * the same however many rectangles that area is divided into: measured on the
 * same data, 15.02 ms -> 0.95 ms at 14 rects and 149.00 ms -> 2.86 ms at 42.
 * The boundary sweep after it was already O(cells) with no per-rect factor, so
 * nothing else needed touching.
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
// Placement
// ---------------------------------------------------------------------------
//
// Everything the level dresses -- fixtures, cobwebs, puddles, peeling flaps,
// the door -- used to be hand-typed world coordinates. Forty-five of them, of
// which thirty-eight failed SILENTLY when a rectangle moved: a decal inside a
// wall simply is not drawn, and the wall material is DoubleSide so there is not
// even a backwards-plane tell. Deriving them means moving a corridor moves its
// dressing, and the maze can be edited without a scavenger hunt afterwards.

/** Where a leg crosses its parent: the centre of the junction they make. */
export function junctionPoint(name, legs = LEGS) {
  const L = legs[name];
  const P = legs[L.parent];
  if (!P) return null;
  return L.axis === 'z' ? { x: L.at, z: P.at } : { x: P.at, z: L.at };
}

/**
 * name -> [names], the FULL walkable adjacency: parent edges plus `links`.
 *
 * Exported because the parent pointers alone stopped being the whole picture
 * when the loops landed. Anything that needs to know how the maze can be WALKED
 * -- BackroomsHunter's pathfinding, the bypass check below -- has to read this
 * and not the tree, or it will confidently route around a shortcut that is
 * right there.
 */
export function neighbours(legs = LEGS) {
  const out = {};
  for (const n of Object.keys(legs)) out[n] = [];
  const add = (a, b) => {
    if (!out[a].includes(b)) out[a].push(b);
    if (!out[b].includes(a)) out[b].push(a);
  };
  for (const n of Object.keys(legs)) {
    if (legs[n].parent) add(n, legs[n].parent);
    for (const m of legs[n].links || []) if (legs[m]) add(n, m);
  }
  return out;
}

/**
 * Route legs that can be MISSED OUT and still leave the exit reachable.
 *
 * This is the property "there is more than one way through" stated so that it
 * can fail. Counting loops cannot fail usefully -- every declared link adds one
 * by construction, whether or not it goes anywhere near the exit. Deleting a
 * leg and asking whether the exit is still reachable is the actual question.
 */
export function bypassable(legs = LEGS) {
  const adj = neighbours(legs);
  const root = Object.keys(legs).find((n) => legs[n].parent === null);
  const exit = Object.keys(legs).find((n) => legs[n].exit);
  const route = buildRoute(legs);
  const reaches = (banned) => {
    if (banned === root || banned === exit) return false;
    const seen = new Set([root]);
    const queue = [root];
    while (queue.length) {
      const n = queue.shift();
      if (n === exit) return true;
      for (const m of adj[n]) if (m !== banned && !seen.has(m)) { seen.add(m); queue.push(m); }
    }
    return false;
  };
  return route.filter(reaches);
}

/**
 * The centre of the floor two ADJACENT legs share, or null if they share none.
 *
 * junctionPoint() answers the same question for a parent edge by construction
 * -- a child crosses its parent's centre-line, so the crossing is (L.at, P.at).
 * That formula says nothing about a `links` edge, where neither leg is the
 * other's parent and the legs may even be parallel. Taking the centre of the
 * overlap RECTANGLE works for both, needs no case analysis, and is the point a
 * body would actually walk through rather than a corner of it.
 */
export function crossPoint(a, b, legs = LEGS) {
  const [ax0, ax1, az0, az1] = legRect(legs[a]);
  const [bx0, bx1, bz0, bz1] = legRect(legs[b]);
  const x0 = Math.max(ax0, bx0), x1 = Math.min(ax1, bx1);
  const z0 = Math.max(az0, bz0), z1 = Math.min(az1, bz1);
  if (x1 < x0 || z1 < z0) return null;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
}

/** Every junction in the maze, each tagged with whether it is on the route. */
export function junctions(legs = LEGS) {
  const onRoute = new Set(buildRoute(legs));
  return Object.keys(legs)
    .filter((n) => legs[n].parent)
    .map((n) => ({
      name: n,
      parent: legs[n].parent,
      axis: legs[n].axis,
      onRoute: onRoute.has(n) && onRoute.has(legs[n].parent),
      ...junctionPoint(n, legs)
    }));
}

/**
 * The end of a leg away from its parent -- where it stops.
 *
 * `nx`/`nz` point back down the corridor, so anything placed on that end wall
 * faces whoever walked up to it. For the root this is its mouth, and for the
 * exit leg it is where the door goes.
 */
export function deadEnd(name, legs = LEGS) {
  const L = legs[name];
  const P = legs[L.parent];
  const origin = P ? P.at : L.from;
  const atTo = Math.abs(L.to - origin) >= Math.abs(origin - L.from);
  const far = atTo ? L.to : L.from;
  const n = atTo ? -1 : 1;
  return L.axis === 'z'
    ? { x: L.at, z: far, nx: 0, nz: n, axis: 'z' }
    : { x: far, z: L.at, nx: n, nz: 0, axis: 'x' };
}

/**
 * A point on a leg's side wall, `back` metres in from its dead end.
 *
 * Dead ends are the one stretch of a corridor guaranteed to have unbroken side
 * walls -- nothing branches off past the last junction, by definition -- so a
 * decal placed here cannot land in a branch mouth. `rotY` is the wall's inward
 * normal, which is the angle the level's decal helpers take.
 */
export function sideWall(name, { back = 1.2, side = 1, legs = LEGS } = {}) {
  const L = legs[name];
  const e = deadEnd(name, legs);
  const h = L.w / 2;
  return L.axis === 'z'
    ? { x: L.at + side * h, z: e.z + e.nz * back, rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2 }
    : { x: e.x + e.nx * back, z: L.at + side * h, rotY: side > 0 ? Math.PI : 0 };
}

/** Centre of a leg's rectangle. */
export function legMid(name, legs = LEGS) {
  const L = legs[name];
  const m = (L.from + L.to) / 2;
  return L.axis === 'z' ? { x: L.at, z: m } : { x: m, z: L.at };
}

/** Where the player arrives, and which way they face. */
export function spawnPoint(legs = LEGS) {
  const root = Object.keys(legs).find((n) => legs[n].parent === null);
  const L = legs[root];
  return { x: L.at, z: L.from + 1.4 };
}

/** Where the exit door stands, in the end wall of the leg marked `exit`. */
export function exitPoint(legs = LEGS) {
  return deadEnd(Object.keys(legs).find((n) => legs[n].exit), legs);
}

/**
 * A stable 0..1 from a corridor's name.
 *
 * The level needs to vary its lamps and dressing without looking authored, but
 * Math.random() at build time would deal a different maze every boot and make
 * "the fixture by the third turn is dead" untestable. Same name, same number,
 * forever.
 */
export function nameNoise(name, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EPS = 1e-9;   // walls land ON the 1.6m minimum by design; exactly is not under
const isTenth = (v) => Math.abs(Math.round(v * 10) - v * 10) < EPS;

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
 * At forty-two corridors you want the whole list in one pass. The thing this
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
  // --- links: each one is a deliberate loop, so each one must be deliberate --
  for (const n of names) {
    const L = legs[n];
    if (L.links === undefined) continue;
    if (!Array.isArray(L.links)) { errors.push(`${n}: links must be an array of leg names`); continue; }
    for (const m of L.links) {
      if (!legs[m]) errors.push(`${n}: links names "${m}", which does not exist`);
      else if (m === n) errors.push(`${n}: links to itself`);
      else if (L.parent === m || legs[m].parent === n) {
        errors.push(`${n} links to ${m}, but ${m} is already its parent or its child -- that is the junction it has, not a loop`);
      } else if ((legs[m].links || []).includes(n)) {
        errors.push(`${n} and ${m} both declare the link -- declare it once, it is undirected`);
      }
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
    if (P.at < L.from - EPS || P.at > L.to + EPS) {
      const miss = P.at < L.from ? L.from - P.at : P.at - L.to;
      errors.push(`R1: ${n} never reaches ${L.parent}'s centre-line -- ${L.parent} is at ${P.at}, ${n} spans ${L.from}..${L.to}, short by ${miss.toFixed(2)} m`);
    }
    // R2 IS A RULE ABOUT CORRIDOR T-JUNCTIONS, and a room is not one. It says
    // the parent must still be there on BOTH sides of the child, which is what
    // makes a T walkable in three directions. A room hangs off the END of its
    // neck and the neck is not supposed to continue past it -- that is what a
    // room is. Applying R2 anyway is not conservative, it is impossible: a 6.8 m
    // room off a 6.2 m neck needs the neck to extend 3.4 m beyond the room's
    // centre-line in both directions, so the valid band is empty for EVERY room
    // narrower than its own neck. R1 still applies and still means something --
    // the room must reach across the neck's centre-line, or the doorway opens
    // onto the room's corner.
    if (L.kind === 'room') continue;
    const lo = P.from + L.w / 2;
    const hi = P.to - L.w / 2;
    if (L.at < lo - EPS || L.at > hi + EPS) {
      const miss = L.at < lo ? lo - L.at : L.at - hi;
      errors.push(`R2: ${n} hangs ${miss.toFixed(2)} m off the end of ${L.parent} -- centre-line ${L.at} is outside ${lo.toFixed(2)}..${hi.toFixed(2)}`);
    }
  }

  // --- separation: anything NOT a declared junction must be properly apart --
  // A junction is declared either by a parent pointer or by a `links` entry.
  // Everything else touching is still an error -- see the LOOPS note up top.
  const joined = (a, b) => legs[a].parent === b || legs[b].parent === a
    || (legs[a].links || []).includes(b) || (legs[b].links || []).includes(a);
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
        if (gap < MIN_WALL - EPS) {
          errors.push(`${a} and ${b} are ${gap.toFixed(2)} m apart, under MIN_WALL ${MIN_WALL} -- lamp light will bleed through the wall between them`);
        }
      }
    }
  }

  // --- rooms and the necks that let you in ---------------------------------
  // The brief: larger than a corridor, empty, no door, just an entrance shaped
  // like one. The SHAPE of that entrance is geometry, not dressing -- it is the
  // gap the wall builder leaves where the neck's mouth punches through the
  // corridor wall. So the neck being narrow is a structural requirement and is
  // checked here; the renderer only adds the lintel that turns a narrow
  // full-height slot into a doorway.
  for (const n of names) {
    const L = legs[n];
    if (L.kind === 'room') {
      if (L.w <= CORRIDOR_W) errors.push(`${n} is a room but is ${L.w} m across, no wider than a corridor (${CORRIDOR_W}) -- rooms are supposed to open out`);
      if (Math.abs(L.to - L.from) <= CORRIDOR_W) errors.push(`${n} is a room but is only ${Math.abs(L.to - L.from)} m deep -- that is a wide corridor, not a room`);
      if (!L.parent || legs[L.parent].kind !== 'neck') errors.push(`${n} is a room but hangs off ${L.parent}, which is not a neck -- without a neck the whole side of the room is the doorway`);
      if (names.some((m) => legs[m].parent === n)) errors.push(`${n} is a room but something hangs off it -- rooms are dead ends, not junctions`);
    }
    if (L.kind === 'neck') {
      if (L.w >= CORRIDOR_W) errors.push(`${n} is a neck but is ${L.w} m across, as wide as a corridor -- then its mouth is an opening, not a doorway`);
      const kids = names.filter((m) => legs[m].parent === n);
      if (kids.length !== 1 || legs[kids[0]].kind !== 'room') {
        errors.push(`${n} is a neck but leads to ${kids.length === 1 ? kids[0] : kids.length + ' legs'} rather than exactly one room`);
      }
    }
  }

  // --- more than one way through -------------------------------------------
  // THE POINT OF THE LOOPS, stated so it can fail. If a link is broken, moved
  // or deleted the corridors still validate perfectly -- they are simply a tree
  // again, which every other rule in this file is happy with. Only this one
  // notices that the maze quietly went back to having a single forced path.
  const bypasses = bypassable(legs);
  if (bypasses.length < MIN_BYPASSABLE) {
    errors.push(`only ${bypasses.length} route leg(s) can be missed out and still `
      + `reach the exit (${bypasses.join(', ') || 'none'}), under MIN_BYPASSABLE `
      + `${MIN_BYPASSABLE} -- the maze has gone back to one forced path. A link is `
      + 'broken or missing.');
  }

  // --- the annotation must agree with the derived route --------------------
  const route = buildRoute(legs);
  const onRoute = new Set(route);
  for (const n of names) {
    if (!['route', 'decoy', 'neck', 'room'].includes(legs[n].kind)) {
      errors.push(`${n}: kind ${JSON.stringify(legs[n].kind)} is not one of route, decoy, neck, room`);
    }
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
  const kinds = (k) => names.filter((n) => LEGS[n].kind === k).length;
  console.log(`corridors    ${names.length}   route ${v.route ? v.route.length : '?'}, `
    + `decoy ${kinds('decoy')}, neck ${kinds('neck')}, room ${kinds('room')}`);
  if (v.route) console.log(`route        ${v.route.join(' -> ')}`);
  // The loops, reported as what they buy rather than as how many there are.
  const skip = bypassable();
  console.log(`bypassable   ${skip.length} route leg(s) can be missed out: ${skip.join(', ') || 'none'}`);
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
