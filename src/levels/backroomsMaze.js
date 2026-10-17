/**
 * The backrooms maze, as data and as pure functions. NO three.js in this file.
 *
 * Split out of backroomsLevel.js so the layout can be checked without a
 * browser: package.json is "type": "module", so plain `node` can import this and
 * run reportMaze() (`npm run check:maze`), which is what makes the maze safe to
 * edit at all. backroomsLevel.js keeps everything that touches the renderer.
 *
 * ------------------------------------------------------------------ THE GRID
 *
 * THE LAYOUT IS A DRAWING, AND THE DRAWING IS THE DATA. The maze used to be 48
 * hand-placed corridor rectangles. It is now the team's own 10 x 10 grid maze,
 * transcribed wall by wall into GRID below -- so changing the maze means
 * changing the drawing, a wall at a time, rather than re-deriving coordinates.
 *
 * Cells are (c, r): c = 0 is the drawing's left edge, r = 0 its TOP edge. In
 * the world a cell's centre is (c * PITCH, r * PITCH), so the top of the
 * drawing is -Z -- the way a player faces at yaw 0.
 *
 *   hWalls[k]  the columns walled on horizontal grid line k, which runs between
 *              row k-1 and row k (line 0 is the top edge, line 10 the bottom)
 *   vWalls[k]  the rows walled on vertical grid line k, between column k-1 and
 *              column k (line 0 is the left edge, line 10 the right)
 *
 * The black boxes on the drawing are ROOMS -- larger than a corridor -- and the
 * two inside the maze have exactly two doorways each: in one side, out another.
 *
 * ------------------------------------------------------------------ THE LEGS
 *
 * Everything downstream -- the wall builder, the colliders, the minimap, the
 * hunter's pathfinding, the lamps and decals -- reads LEGS: axis-aligned
 * rectangles declared by their centre-line,
 *
 *   { axis, at, from, to, w, parent, links, kind }
 *
 *   axis 'z' -- the leg RUNS along z, and `at` is its x centre-line
 *   axis 'x' -- it runs along x, and `at` is its z centre-line
 *   from/to  -- absolute span along its own axis
 *   w        -- width across it
 *   parent   -- the leg it was reached from (a spanning tree over the maze,
 *               grown from the first crossing's way in)
 *   links    -- the other legs it joins: every LOOP in the drawing is one
 *   kind     -- 'route' | 'decoy' | 'room' | 'neck' | 'mouth'
 *
 * They are GENERATED from the grid by buildMaze(): each straight run of open
 * cells becomes one corridor leg, each room one room leg, each doorway a neck
 * (a 1.4 m leg that pierces the wall, which is what makes a doorway a doorway
 * rather than a missing wall), and each way in or out a mouth -- a short leg
 * running out past the edge of the grid to the sealed door or the exit.
 *
 * The geometry rules are the same as they always were, and they are what
 * validateMaze() checks: every pair of legs that touch must be a declared join
 * at least a body wide, and every pair that do not must have MIN_WALL of solid
 * wall between them so lamp light cannot bleed through.
 *
 * ---------------------------------------------------------------- CROSSINGS
 *
 * The maze is walked twice, from two different ways in to two different ways
 * out (CROSSINGS): down the upstairs hallway's stairs, in at the bottom of the
 * drawing and out through Door 1 at the top to Level 2; then from Level 2, in
 * through the right-hand wall near the bottom and out through Door 2, which stands inside the central
 * room, to Level 3.
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
 * Minimum solid wall between two legs that are NOT joined.
 *
 * Not cosmetic. The fluorescents do not cast shadows, so a lamp's pool passes
 * straight through a wall; at 1.4 m a lit corridor visibly bleeds into the one
 * beside it.
 */
export const MIN_WALL = 1.6;

/**
 * Metres between neighbouring cell centres.
 *
 * DERIVED FROM WHAT A ROOM NEEDS. A corridor is 3.2 m, and a room has to be
 * wider than one -- "the black boxes are larger rooms". A room grows past its
 * cells into the wall band on every side, until only MIN_WALL is left before
 * the next corridor over, so it grows PITCH - CORRIDOR_W - MIN_WALL a side
 * (ROOM_GROW). At 4.8 m, the old maze's grid, that is nothing: a room would be
 * a corridor. At 6.4 m it is 1.6 m a side, so a one-cell-wide room is 6.4 m
 * across, the size the old maze's three rooms were. The price is thicker
 * walls between plain corridors: 3.2 m rather than 1.6.
 */
export const PITCH = 6.4;
/**
 * How far a room reaches past its cells' corridor width on every side: the most
 * that still leaves MIN_WALL to the next corridor (PITCH - CORRIDOR_W - MIN_WALL).
 * A one-cell-wide room is therefore 6.4 m across -- the size the old maze's
 * three rooms were.
 */
export const ROOM_GROW = PITCH - CORRIDOR_W - MIN_WALL;
/** A doorway: narrower than a corridor, so its mouth reads as a door. door.glb's frame is 1.4 m. */
export const NECK_W = 1.4;
/** How far a doorway's neck runs on into its room, so the join is wider than a body. */
export const NECK_INTO = 1.2;
/** How far a way in or out runs past the edge of the grid. */
export const MOUTH_LEN = 3.2;
/** Edge rooms, off the outside of the grid: [across the doorway, along the wall]. */
export const EDGE_ROOM = [8.0, 9.6];

export const DIMS = { PITCH, CORRIDOR_W, ROOM_GROW, NECK_W, MOUTH_LEN, EDGE_ROOM };

/**
 * The drawing. See the header for what hWalls/vWalls mean.
 *
 * Transcribed from the team's maze image on 2026-10-17 and checked by
 * rendering it back as ASCII against the picture. One cell, (2, 7), is walled
 * in on three sides by the drawing and on the fourth by the bottom-left room's
 * box; it cannot be reached and is left solid (validateMaze warns about it).
 */
export const GRID = {
  size: 10,
  hWalls: {
    0: [1, 2, 3, 4, 6, 7, 8, 9],           // top edge: open at 0 (in, 2nd time) and 5 (Door 1)
    1: [0, 1, 7, 8],
    2: [2, 4, 5, 6, 7, 9],
    3: [1, 5, 6, 7, 8],
    4: [0, 5, 6, 8],
    5: [4, 7],
    6: [3, 4, 5, 6, 8, 9],
    7: [2, 4, 7, 8],
    8: [5, 7, 8],
    9: [2, 3, 4, 7, 8, 9],
    10: [0, 1, 2, 3, 4, 6, 7, 8, 9]        // bottom edge: open at 5 (in, 1st time)
  },
  vWalls: {
    0: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    1: [1, 4, 5, 6, 7, 8],
    2: [2, 3, 4, 5, 6, 7],
    3: [0, 5, 7, 8],
    4: [1, 2, 3, 4, 7, 8],
    5: [0, 3],
    6: [1, 4, 7, 8, 9],
    7: [5, 6],
    8: [1, 4],
    9: [2, 4, 7],
    10: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  },
  /**
   * The black boxes. `doors` are the corridor cells a doorway opens onto; a
   * room's box is solid wall everywhere else. `grow` lets an edge room reach
   * out past the grid; `beside`/`side` places a room entirely outside it.
   */
  rooms: {
    // On the top edge; the drawing leaves both its ends open.
    TR: { cells: [[7, 0], [8, 0]], doors: [[6, 0], [9, 0]], grow: { north: 3.2 } },
    // Door 2, to Level 3, stands inside this one. In at the top, out at the bottom.
    C: { cells: [[3, 3], [3, 4]], doors: [[3, 2], [3, 5]] },
    // Inside the maze: in from above, out below.
    BL: { cells: [[1, 8], [2, 8]], doors: [[1, 7], [1, 9]] },
    // Off the outside of the left and right edges, one doorway each.
    L: { beside: [0, 2], side: 'west', doors: [[0, 2]] },
    R: { beside: [9, 6], side: 'east', doors: [[9, 6]] }
  },
  crossings: {
    // Down the upstairs hallway's stairs: in at the bottom, out of Door 1 at the top.
    first: { from: 'upstairsHallway', enter: { cell: [5, 9], side: 'south' }, exit: { cell: [5, 0], side: 'north' } },
    // From Level 2: in through the right-hand wall low down (the red X on the
    // drawing), out of Door 2 in the central room.
    second: { from: 'hallwayBasement', enter: { cell: [9, 8], side: 'east' }, exit: { room: 'C', wall: 'west' } }
  }
};

const SIDES = {
  north: { dc: 0, dr: -1 }, south: { dc: 0, dr: 1 },
  west: { dc: -1, dr: 0 }, east: { dc: 1, dr: 0 }
};
const cellKey = (c, r) => `${c},${r}`;
/** Tenths, so float noise in the generated numbers can never break the 0.1 rule. */
const tidy = (v) => Math.round(v * 10) / 10;

/** [x0, x1, z0, z1] -- the walkable interior, derived from a leg. */
export function legRect(leg) {
  const h = leg.w / 2;
  return leg.axis === 'z'
    ? [leg.at - h, leg.at + h, leg.from, leg.to]
    : [leg.from, leg.to, leg.at - h, leg.at + h];
}

/** A leg from a rectangle: it runs along the longer side. */
function legFromRect([x0, x1, z0, z1], extra) {
  const along = x1 - x0 >= z1 - z0 ? 'x' : 'z';
  return along === 'x'
    ? { axis: 'x', at: tidy((z0 + z1) / 2), from: tidy(x0), to: tidy(x1), w: tidy(z1 - z0), ...extra }
    : { axis: 'z', at: tidy((x0 + x1) / 2), from: tidy(z0), to: tidy(z1), w: tidy(x1 - x0), ...extra };
}

/**
 * Turn the drawing into legs. Pure: the same grid and dimensions always give
 * the same maze, which is what lets the validator's self-tests break a copy.
 *
 * @returns {{ legs, joins, rooms, doorways, crossings, cellLegs, dropped }}
 */
export function buildMaze(grid = GRID, dims = DIMS) {
  const { PITCH: P, CORRIDOR_W: W, ROOM_GROW: G, NECK_W: NW, MOUTH_LEN: ML, EDGE_ROOM: ER } = dims;
  const N = grid.size;
  const cx = (c) => tidy(c * P);
  const cz = (r) => tidy(r * P);

  // ---- which cell belongs to which room, and which edges are open ---------
  const roomOf = new Map();
  for (const [name, room] of Object.entries(grid.rooms)) {
    for (const cell of room.cells ?? []) roomOf.set(cellKey(...cell), name);
  }
  const open = (a, b) => {
    // a and b are orthogonal neighbours inside the grid
    const [ac, ar] = a, [bc, br] = b;
    if (ar === br) return !(grid.vWalls[Math.max(ac, bc)] ?? []).includes(ar);
    return !(grid.hWalls[Math.max(ar, br)] ?? []).includes(ac);
  };

  // Corridor-to-corridor adjacency (room cells take part only through doors).
  const corridorCells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!roomOf.has(cellKey(c, r))) corridorCells.push([c, r]);
  const isCorridor = (c, r) => c >= 0 && r >= 0 && c < N && r < N && !roomOf.has(cellKey(c, r));
  const linked = (a, b) => isCorridor(...a) && isCorridor(...b) && open(a, b);

  // ---- reachability, so a walled-in pocket is left solid -------------------
  const doorCells = new Map();                   // cell key -> [room names]
  for (const [name, room] of Object.entries(grid.rooms)) {
    for (const d of room.doors ?? []) {
      const k = cellKey(...d);
      if (!doorCells.has(k)) doorCells.set(k, []);
      doorCells.get(k).push(name);
    }
  }
  const nodeAdj = new Map();
  const addEdge = (a, b) => {
    if (!nodeAdj.has(a)) nodeAdj.set(a, new Set());
    if (!nodeAdj.has(b)) nodeAdj.set(b, new Set());
    nodeAdj.get(a).add(b); nodeAdj.get(b).add(a);
  };
  for (const [c, r] of corridorCells) {
    if (!nodeAdj.has(cellKey(c, r))) nodeAdj.set(cellKey(c, r), new Set());
    if (linked([c, r], [c + 1, r])) addEdge(cellKey(c, r), cellKey(c + 1, r));
    if (linked([c, r], [c, r + 1])) addEdge(cellKey(c, r), cellKey(c, r + 1));
  }
  for (const [k, rooms] of doorCells) for (const name of rooms) addEdge(k, `room:${name}`);
  const starts = Object.values(grid.crossings).map((x) => cellKey(...x.enter.cell));
  const reached = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    const n = queue.shift();
    for (const m of nodeAdj.get(n) ?? []) if (!reached.has(m)) { reached.add(m); queue.push(m); }
  }
  const dropped = corridorCells.filter(([c, r]) => !reached.has(cellKey(c, r))).map(([c, r]) => [c, r]);
  const live = (c, r) => isCorridor(c, r) && reached.has(cellKey(c, r));

  // ---- corridor legs: one per straight run of linked cells ---------------
  const legs = {};
  const cellLegs = new Map();                    // cell key -> leg names covering it
  const cover = (name, c, r) => {
    const k = cellKey(c, r);
    if (!cellLegs.has(k)) cellLegs.set(k, []);
    cellLegs.get(k).push(name);
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!live(c, r) || (c > 0 && live(c - 1, r) && linked([c - 1, r], [c, r]))) continue;
      let e = c;
      while (e + 1 < N && live(e + 1, r) && linked([e, r], [e + 1, r])) e++;
      if (e === c) continue;
      const name = `H${r}_${c}-${e}`;
      legs[name] = { axis: 'x', at: cz(r), from: tidy(cx(c) - W / 2), to: tidy(cx(e) + W / 2), w: W };
      for (let k = c; k <= e; k++) cover(name, k, r);
    }
  }
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      if (!live(c, r) || (r > 0 && live(c, r - 1) && linked([c, r - 1], [c, r]))) continue;
      let e = r;
      while (e + 1 < N && live(c, e + 1) && linked([c, e], [c, e + 1])) e++;
      if (e === r) continue;
      const name = `V${c}_${r}-${e}`;
      legs[name] = { axis: 'z', at: cx(c), from: tidy(cz(r) - W / 2), to: tidy(cz(e) + W / 2), w: W };
      for (let k = r; k <= e; k++) cover(name, c, k);
    }
  }
  // A cell no run covers opens only onto a room or the outside: a square of its own.
  for (const [c, r] of corridorCells) {
    if (!live(c, r) || cellLegs.has(cellKey(c, r))) continue;
    const name = `S${c}_${r}`;
    legs[name] = { axis: 'z', at: cx(c), from: tidy(cz(r) - W / 2), to: tidy(cz(r) + W / 2), w: W };
    cover(name, c, r);
  }

  const joins = new Set();
  const join = (a, b) => joins.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  // Two runs that share a cell cross there.
  for (const names of cellLegs.values()) {
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) join(names[i], names[j]);
  }

  // ---- rooms ---------------------------------------------------------------
  const rooms = {};
  for (const [name, room] of Object.entries(grid.rooms)) {
    let rect;
    if (room.cells) {
      const xs = room.cells.map(([c]) => cx(c));
      const zs = room.cells.map(([, r]) => cz(r));
      const half = W / 2 + G;
      rect = [Math.min(...xs) - half, Math.max(...xs) + half, Math.min(...zs) - half, Math.max(...zs) + half];
      if (room.grow?.north) rect[2] -= room.grow.north;
      if (room.grow?.south) rect[3] += room.grow.south;
      if (room.grow?.west) rect[0] -= room.grow.west;
      if (room.grow?.east) rect[1] += room.grow.east;
    } else {
      // Entirely outside the grid, MIN_WALL past the cell it opens off.
      const [c, r] = room.beside;
      const s = SIDES[room.side];
      const [deep, wide] = ER;
      const near = W / 2 + MIN_WALL;
      if (s.dc) {
        const x = cx(c) + s.dc * near;
        rect = s.dc < 0 ? [x - deep, x, cz(r) - wide / 2, cz(r) + wide / 2] : [x, x + deep, cz(r) - wide / 2, cz(r) + wide / 2];
      } else {
        const z = cz(r) + s.dr * near;
        rect = s.dr < 0 ? [cx(c) - wide / 2, cx(c) + wide / 2, z - deep, z] : [cx(c) - wide / 2, cx(c) + wide / 2, z, z + deep];
      }
    }
    rect = rect.map(tidy);
    const legName = `room_${name}`;
    legs[legName] = legFromRect(rect, { kind: 'room' });
    rooms[name] = { leg: legName, rect, interior: !!room.cells && !room.grow && !room.beside, doorCount: 0 };
  }

  // ---- doorways: a neck from the corridor cell into the room --------------
  const doorways = [];
  for (const [name, room] of Object.entries(grid.rooms)) {
    const rect = rooms[name].rect;
    for (const [dc, dr] of room.doors ?? []) {
      const x = cx(dc), z = cz(dr);
      // Which way the room is from this cell: the side its rect lies on.
      let dir = null;
      if (rect[0] > x + W / 2 - 1e-6 && z > rect[2] && z < rect[3]) dir = 'east';
      else if (rect[1] < x - W / 2 + 1e-6 && z > rect[2] && z < rect[3]) dir = 'west';
      else if (rect[2] > z + W / 2 - 1e-6 && x > rect[0] && x < rect[1]) dir = 'south';
      else if (rect[3] < z - W / 2 + 1e-6 && x > rect[0] && x < rect[1]) dir = 'north';
      const neckName = `neck_${name}_${dc}_${dr}`;
      if (!dir) {
        // Reported by validateMaze, not thrown: a typo in a door costs a line.
        doorways.push({ neck: neckName, room: name, cell: [dc, dr], error: 'does not touch' });
        continue;
      }
      const s = SIDES[dir];
      // From the cell centre, through the wall, NECK_INTO the room -- deep
      // enough that the join is wider than the player, which 0.8 m was not.
      let leg;
      if (s.dc) {
        const edge = s.dc > 0 ? rect[0] : rect[1];
        const inside = edge + s.dc * NECK_INTO;
        leg = { axis: 'x', at: z, from: tidy(Math.min(x, inside)), to: tidy(Math.max(x, inside)), w: NW, kind: 'neck' };
      } else {
        const edge = s.dr > 0 ? rect[2] : rect[3];
        const inside = edge + s.dr * NECK_INTO;
        leg = { axis: 'z', at: x, from: tidy(Math.min(z, inside)), to: tidy(Math.max(z, inside)), w: NW, kind: 'neck' };
      }
      legs[neckName] = { ...leg, room: rooms[name].leg };
      rooms[name].doorCount++;
      for (const n of cellLegs.get(cellKey(dc, dr)) ?? []) join(neckName, n);
      join(neckName, rooms[name].leg);
      // The doorway proper: where the neck leaves the corridor (its frame
      // stands there, facing the corridor) and where it enters the room.
      const corridorFace = s.dc ? x + s.dc * W / 2 : z + s.dr * W / 2;
      const roomFace = s.dc ? (s.dc > 0 ? rect[0] : rect[1]) : (s.dr > 0 ? rect[2] : rect[3]);
      doorways.push({
        neck: neckName, room: name, cell: [dc, dr],
        // the frame's position and the way it faces (back toward the corridor)
        x: tidy(s.dc ? corridorFace : x), z: tidy(s.dc ? z : corridorFace), nx: -s.dc, nz: -s.dr,
        axis: s.dc ? 'x' : 'z',
        tunnel: [tidy(Math.min(corridorFace, roomFace)), tidy(Math.max(corridorFace, roomFace))]
      });
    }
  }

  // ---- mouths: the ways in and out past the edge of the grid ---------------
  const crossings = {};
  const mouth = (label, [c, r], side) => {
    const s = SIDES[side];
    const name = `mouth_${label}`;
    const x = cx(c), z = cz(r);
    const far = W / 2 + ML;
    legs[name] = s.dc
      ? { axis: 'x', at: z, from: tidy(Math.min(x, x + s.dc * far)), to: tidy(Math.max(x, x + s.dc * far)), w: W, kind: 'mouth' }
      : { axis: 'z', at: x, from: tidy(Math.min(z, z + s.dr * far)), to: tidy(Math.max(z, z + s.dr * far)), w: W, kind: 'mouth' };
    for (const n of cellLegs.get(cellKey(c, r)) ?? []) join(name, n);
    // The end of it: where the sealed door or the exit stands, facing back in.
    const end = { x: tidy(s.dc ? x + s.dc * far : x), z: tidy(s.dr ? z + s.dr * far : z), nx: -s.dc, nz: -s.dr, axis: legs[name].axis };
    return { name, end };
  };
  for (const [key, x] of Object.entries(grid.crossings)) {
    const enter = mouth(`in_${key}`, x.enter.cell, x.enter.side);
    let exit;
    if (x.exit.room) {
      const rect = rooms[x.exit.room]?.rect;
      const wall = x.exit.wall;
      // On the middle of that wall, facing into the room.
      const at = rect && {
        west: { x: rect[0], z: tidy((rect[2] + rect[3]) / 2), nx: 1, nz: 0, axis: 'x' },
        east: { x: rect[1], z: tidy((rect[2] + rect[3]) / 2), nx: -1, nz: 0, axis: 'x' },
        north: { x: tidy((rect[0] + rect[1]) / 2), z: rect[2], nx: 0, nz: 1, axis: 'z' },
        south: { x: tidy((rect[0] + rect[1]) / 2), z: rect[3], nx: 0, nz: -1, axis: 'z' }
      }[wall];
      exit = { leg: rooms[x.exit.room]?.leg, end: at };
    } else {
      const m = mouth(`out_${key}`, x.exit.cell, x.exit.side);
      exit = { leg: m.name, end: m.end };
    }
    crossings[key] = { from: x.from, enter: enter.name, spawnEnd: enter.end, exit: exit.leg, exitEnd: exit.end };
  }

  // ---- the tree, the loops, and which legs are on a route -----------------
  const adj = {};
  for (const n of Object.keys(legs)) adj[n] = [];
  for (const j of joins) {
    const [a, b] = j.split('|');
    if (legs[a] && legs[b]) { adj[a].push(b); adj[b].push(a); }
  }
  const bfs = (from) => {
    const prev = { [from]: null };
    const q = [from];
    while (q.length) {
      const n = q.shift();
      for (const m of adj[n]) if (!(m in prev)) { prev[m] = n; q.push(m); }
    }
    return prev;
  };
  const rootName = crossings.first?.enter;
  const tree = rootName ? bfs(rootName) : {};
  for (const n of Object.keys(legs)) legs[n].parent = tree[n] ?? null;
  for (const j of joins) {
    const [a, b] = j.split('|');
    if (!legs[a] || !legs[b] || legs[a].parent === b || legs[b].parent === a) continue;
    (legs[a].links ??= []).push(b);
  }
  const routes = {};
  for (const [key, x] of Object.entries(crossings)) {
    const prev = bfs(x.enter);
    const path = [];
    if (x.exit && x.exit in prev) for (let n = x.exit; n; n = prev[n]) path.push(n);
    routes[key] = path.reverse();
  }
  const onRoute = new Set(Object.values(routes).flat());
  for (const [n, L] of Object.entries(legs)) {
    if (!L.kind) L.kind = onRoute.has(n) ? 'route' : 'decoy';
  }

  return { legs, joins, rooms, doorways, crossings, routes, cellLegs, dropped, adj };
}

export const MAZE = buildMaze();
export const LEGS = MAZE.legs;
export const CROSSINGS = MAZE.crossings;
/** The legs each crossing's shortest way through passes, in order. */
export const ROUTES = MAZE.routes;
/** Every leg on either crossing's route -- what the lamps treat as "the route". */
export const ROUTE = [...new Set(Object.values(ROUTES).flat())];
export const DOORWAYS = MAZE.doorways.filter((d) => !d.error);

/** name -> rect. The shape everything downstream consumes. */
export function buildCorridors(legs = LEGS) {
  const out = {};
  for (const name of Object.keys(legs)) out[name] = legRect(legs[name]);
  return out;
}

export const CORRIDORS = buildCorridors();

/** Which crossing a route from main.js is: by the level it came from. */
export function crossingFor(route) {
  return Object.keys(CROSSINGS).find((k) => CROSSINGS[k].from === route?.from) ?? 'first';
}

/**
 * Every wall in the level, as the boundary of the corridor union.
 *
 * PAINTS each rect into a 0.1 m grid and sweeps the boundary, so it costs the
 * same however many rectangles the floor is divided into. Cell centres land on
 * odd multiples of 0.05 while every rect edge is a multiple of 0.1, so no centre
 * can tie with an edge; validateMaze() asserts the 0.1 rule that keeps it so.
 *
 * Runs are padded by T/2 at BOTH ends so corners always overlap: a 1 cm seam is
 * not a black void, it is the lit carpeted corridor next door, which the player
 * can walk into and then off the edge of the world.
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
 * The 0.6 m rule is CONGRUENCE, NOT DIVISIBILITY: the ceiling texture is a grid
 * of 0.6 m tiles whose UV origin is anchored at (BOX.minX, BOX.minZ), so the
 * minimums may only move in whole multiples of 0.6 from these anchors.
 */
const ANCHOR_X = -18.7;
const ANCHOR_Z = -1.4;
const BOX_PAD = 1.0;

export function buildBox(corridors = CORRIDORS) {
  const rects = Object.values(corridors);
  const D = (v) => Math.round(v * 10);
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

/**
 * The centre of the floor two ADJACENT legs share, or null if they share none.
 * Works for crossing legs, a corridor running on through a doorway, and a mouth
 * running on out of the grid alike.
 */
export function crossPoint(a, b, legs = LEGS) {
  const [ax0, ax1, az0, az1] = legRect(legs[a]);
  const [bx0, bx1, bz0, bz1] = legRect(legs[b]);
  const x0 = Math.max(ax0, bx0), x1 = Math.min(ax1, bx1);
  const z0 = Math.max(az0, bz0), z1 = Math.min(az1, bz1);
  if (x1 < x0 || z1 < z0) return null;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
}

/** Where a leg joins the leg it was reached from. */
export function junctionPoint(name, legs = LEGS) {
  const L = legs[name];
  return L.parent ? crossPoint(name, L.parent, legs) : null;
}

/** name -> [names], the full walkable adjacency: tree edges plus loops. */
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
 * Every corridor junction, for the lamps: where a corridor leg meets the one it
 * was reached from. Necks, rooms and mouths are left out -- a lamp in a doorway
 * or out past the grid is not a junction lamp.
 */
export function junctions(legs = LEGS) {
  const onRoute = new Set(ROUTE);
  const corridor = (n) => ['route', 'decoy'].includes(legs[n]?.kind);
  return Object.keys(legs)
    .filter((n) => corridor(n) && corridor(legs[n].parent))
    .map((n) => ({
      name: n,
      parent: legs[n].parent,
      axis: legs[n].axis,
      onRoute: onRoute.has(n) && onRoute.has(legs[n].parent),
      ...junctionPoint(n, legs)
    }));
}

/**
 * The end of a leg away from where it was reached -- where it stops.
 *
 * `nx`/`nz` point back down the leg, so anything placed on that end wall faces
 * whoever walked up to it.
 */
export function deadEnd(name, legs = LEGS) {
  const L = legs[name];
  const j = L.parent ? crossPoint(name, L.parent, legs) : null;
  const origin = j ? (L.axis === 'z' ? j.z : j.x) : L.from;
  const atTo = Math.abs(L.to - origin) >= Math.abs(origin - L.from);
  const far = atTo ? L.to : L.from;
  const n = atTo ? -1 : 1;
  return L.axis === 'z'
    ? { x: L.at, z: far, nx: 0, nz: n, axis: 'z' }
    : { x: far, z: L.at, nx: n, nz: 0, axis: 'x' };
}

/** A point on a leg's side wall, `back` metres in from its dead end. */
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

/**
 * Where the player arrives on a crossing, and the yaw that faces them into the
 * maze -- 1.4 m in from the sealed door, with their back to it.
 */
export function spawnPoint(crossing = 'first') {
  const e = CROSSINGS[crossing].spawnEnd;
  // yaw 0 looks down -Z; facing along (nx, nz) is atan2(-nx, -nz).
  return { x: tidy(e.x + e.nx * 1.4), z: tidy(e.z + e.nz * 1.4), yaw: Math.atan2(-e.nx, -e.nz), door: e };
}

/** Where a crossing's exit door stands, facing back the way the player comes. */
export function exitPoint(crossing = 'first') {
  return CROSSINGS[crossing].exitEnd;
}

/**
 * A stable 0..1 from a corridor's name: the level varies its lamps and dressing
 * without looking authored, and the same name gets the same number forever.
 */
export function nameNoise(name, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EPS = 1e-9;   // walls land ON the 1.6 m minimum by design; exactly is not under
const isTenth = (v) => Math.abs(Math.round(v * 10) - v * 10) < 1e-6;

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
 * ERRORS make the level wrong: a crossing that cannot reach its exit, two legs
 * that touch without being a join (a stray shortcut through a wall), a join too
 * narrow to walk through, a wall too thin to stop lamp light, a room that is no
 * bigger than a corridor, a doorway that is not narrower than one, or an
 * interior room without exactly two doorways. WARNINGS are worth knowing.
 */
export function validateMaze(maze = MAZE) {
  const errors = [];
  const warnings = [];
  const { legs, joins, rooms, crossings, routes } = maze;
  const names = Object.keys(legs);
  const rects = buildCorridors(legs);

  for (const d of maze.doorways) {
    if (d.error) errors.push(`doorway ${d.neck}: cell (${d.cell}) ${d.error} room ${d.room}`);
  }
  for (const [c, r] of maze.dropped) {
    warnings.push(`cell (${c},${r}) cannot be reached from either way in -- left solid`);
  }
  for (const n of names) {
    const L = legs[n];
    if (L.to <= L.from) errors.push(`${n}: to (${L.to}) must be greater than from (${L.from})`);
    if (L.w < 2 * BODY_R + 0.6) errors.push(`${n}: width ${L.w} leaves too little room -- the player is ${(2 * BODY_R).toFixed(2)} m across`);
    legRect(L).forEach((v, i) => {
      if (!isTenth(v)) errors.push(`${n}: ${['x0', 'x1', 'z0', 'z1'][i]} edge lands at ${v}, not a multiple of 0.1 -- wall runs would stop being exact`);
    });
  }
  if (errors.length) return { errors, warnings };

  // --- every crossing gets from its way in to its way out -----------------
  for (const [key, x] of Object.entries(crossings)) {
    if (!x.exit || !legs[x.exit]) { errors.push(`${key} crossing has no exit leg`); continue; }
    if (!routes[key]?.length) errors.push(`${key} crossing cannot reach its exit -- ${x.enter} never connects to ${x.exit}`);
  }

  // --- joins touch, everything else is walled off ---------------------------
  const joined = (a, b) => joins.has(a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const o = overlap(rects[a], rects[b]);
      if (joined(a, b)) {
        const tight = Math.min(o.x, o.z);
        if (tight <= 2 * BODY_R + 0.3) {
          errors.push(`${a}-${b} join is ${tight.toFixed(2)} m at its narrowest -- the player is ${(2 * BODY_R).toFixed(2)} m across`);
        }
        continue;
      }
      if (o.x > 0 && o.z > 0) {
        errors.push(`${a} and ${b} overlap (${o.x.toFixed(2)} x ${o.z.toFixed(2)}) without being joined -- a way through a wall the drawing does not have`);
      } else {
        const gap = Math.max(-o.x, -o.z);
        if (gap < MIN_WALL - EPS) {
          errors.push(`${a} and ${b} are ${gap.toFixed(2)} m apart, under MIN_WALL ${MIN_WALL} -- lamp light will bleed through the wall between them`);
        }
      }
    }
  }

  // --- rooms and their doorways --------------------------------------------
  for (const [name, room] of Object.entries(rooms)) {
    const L = legs[room.leg];
    if (L.w <= CORRIDOR_W) errors.push(`${room.leg} is a room but is ${L.w} m across, no wider than a corridor (${CORRIDOR_W}) -- rooms are supposed to open out`);
    if (room.interior && room.doorCount !== 2) {
      errors.push(`room ${name} is inside the maze but has ${room.doorCount} doorway(s) -- it needs exactly two, one in and one out`);
    }
    if (!room.interior && room.doorCount < 1) errors.push(`room ${name} has no doorway at all`);
  }
  for (const n of names) {
    if (legs[n].kind === 'neck' && legs[n].w >= CORRIDOR_W) {
      errors.push(`${n} is a neck but is ${legs[n].w} m across, as wide as a corridor -- then its mouth is an opening, not a doorway`);
    }
  }

  // --- walkability, through the shipped collision semantics ----------------
  // A body-sized circle walked down every centre-line must never be inside a
  // wall collider -- the proof that every corridor, doorway and dead end can
  // actually be walked, corners and run padding included.
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
        if (dx * dx + dz * dz < (BODY_R - 1e-6) ** 2) {
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

  return { errors, warnings, routes };
}

/** Walking distance of a crossing's route, in metres, junction to junction. */
export function routeLength(crossing = 'first', maze = MAZE) {
  const route = maze.routes[crossing] ?? [];
  const x = maze.crossings[crossing];
  const pts = [maze.crossings[crossing].spawnEnd];
  for (let i = 1; i < route.length; i++) pts.push(crossPoint(route[i - 1], route[i], maze.legs));
  if (x.exitEnd) pts.push(x.exitEnd);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].z - pts[i - 1].z);
  return total;
}

/**
 * Print everything worth knowing and return the error count.
 * Used by scripts/check-maze.mjs, so the exit code gates a build.
 */
export function reportMaze(maze = MAZE) {
  const v = validateMaze(maze);
  const names = Object.keys(maze.legs);
  const runs = buildWallRuns(buildCorridors(maze.legs));
  const kinds = (k) => names.filter((n) => maze.legs[n].kind === k).length;
  const loops = maze.joins.size - (names.length - 1);
  const box = buildBox(buildCorridors(maze.legs));

  console.log('--- backrooms maze --------------------------------------------');
  console.log(`grid         ${GRID.size} x ${GRID.size} cells at ${PITCH} m`);
  console.log(`legs         ${names.length}   corridor ${kinds('route') + kinds('decoy')}, room ${kinds('room')}, doorway ${kinds('neck')}, way in/out ${kinds('mouth')}`);
  console.log(`loops        ${loops}`);
  for (const key of Object.keys(maze.crossings)) {
    const len = routeLength(key, maze);
    console.log(`${(key + ' crossing').padEnd(13)}${(maze.routes[key] ?? []).length} legs, ${len.toFixed(1)} m   `
      + `${(len / WALK_SPEED).toFixed(0)}s walking, ${(len / SPRINT_SPEED).toFixed(0)}s sprinting`);
  }
  for (const [name, room] of Object.entries(maze.rooms)) {
    const L = maze.legs[room.leg];
    console.log(`room ${name.padEnd(8)}${(L.to - L.from).toFixed(1)} x ${L.w} m, ${room.doorCount} doorway(s)${room.interior ? ' (inside the maze)' : ''}`);
  }
  console.log(`wall runs    ${runs.length}`);
  console.log(`room box     x ${box.minX}..${box.maxX}   z ${box.minZ}..${box.maxZ}`);
  console.log('');

  for (const w of v.warnings) console.log(`  warn   ${w}`);
  for (const e of v.errors) console.log(`  ERROR  ${e}`);
  console.log(v.errors.length ? `\n${v.errors.length} error(s).` : 'ok.');
  return v.errors.length;
}
