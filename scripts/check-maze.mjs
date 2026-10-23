/**
 * Validate the backrooms maze without a browser.  `npm run check:maze`
 *
 * The maze is the team's drawing, transcribed wall by wall into GRID in
 * src/levels/backroomsMaze.js and turned into corridor rectangles by
 * buildMaze(). This checks the result can actually be played: both crossings
 * reach their exits, nothing touches that the drawing keeps apart, every wall
 * is thick enough to stop lamp light, every room is a room and every interior
 * room has its two doorways.
 *
 * It runs in plain node because backroomsMaze.js imports nothing from three.
 * Exit code is non-zero on any fault, so it gates the build in CI.
 */
import { GRID, DIMS, EXIT_SPOTS, buildMaze, validateMaze, validateCrossingSpots, reportMaze } from '../src/levels/backroomsMaze.js';

const errors = reportMaze();

/**
 * SELF-TEST: prove the validator can still say no.
 *
 * A green check is worth nothing unless it can go red. Each case breaks a COPY
 * of the maze in one specific way -- the drawing, the dimensions, or the
 * generated legs -- and asserts the report NAMES the fault.
 */
const clone = (v) => JSON.parse(JSON.stringify(v));
const CASES = [
  {
    name: 'the first crossing walled off from Door 1',
    grid: (g) => { g.vWalls[6].push(0); g.hWalls[1].push(5); },
    expect: /first crossing cannot reach its exit/
  },
  {
    name: 'an interior room given a third doorway',
    grid: (g) => { g.rooms.C.doors.push([2, 3]); },
    expect: /room C is inside the maze but has 3 doorway/
  },
  {
    name: 'an interior room left with only one doorway',
    grid: (g) => { g.rooms.BL.doors.pop(); },
    expect: /room BL is inside the maze but has 1 doorway/
  },
  {
    name: 'a doorway onto a cell its room does not touch',
    grid: (g) => { g.rooms.C.doors.push([0, 9]); },
    expect: /cell \(0,9\) does not touch room C/
  },
  {
    name: 'walls too thin to stop lamp light (MIN_WALL)',
    dims: (d) => ({ ...d, PITCH: 4.6, ROOM_GROW: 0 }),
    expect: /apart, under MIN_WALL/
  },
  {
    name: 'a room shrunk to corridor width',
    dims: (d) => ({ ...d, ROOM_GROW: 0 }),
    expect: /is a room but is 3.2 m across, no wider than a corridor/
  },
  {
    name: 'a doorway widened to a corridor, so it stops being a doorway',
    dims: (d) => ({ ...d, NECK_W: 3.2 }),
    expect: /is a neck but is 3.2 m across/
  },
  {
    name: 'a rect edge off the 0.1 grid, which breaks the wall-run proof',
    maze: (m) => { m.legs.offgrid = { ...Object.values(m.legs)[0], w: 3.25 }; },
    expect: /not a multiple of 0.1/
  },
  {
    name: 'two corridors touching where the drawing has a wall',
    // A stray corridor laid across two that the drawing keeps apart.
    maze: (m) => { m.legs.stray = { axis: 'z', at: 4.8, from: -1.6, to: 8.0, w: 3.2, kind: 'decoy', parent: null }; },
    expect: /overlap .* without being joined/
  }
];

let broken = 0;
console.log('\n--- validator self-test ------------------------------------------');
for (const c of CASES) {
  const grid = clone(GRID);
  c.grid?.(grid);
  const dims = c.dims ? c.dims({ ...DIMS }) : DIMS;
  const maze = buildMaze(grid, dims);
  if (c.maze) {
    maze.legs = { ...maze.legs };
    c.maze(maze);
  }
  const { errors: got } = validateMaze(maze);
  const hit = got.find((e) => c.expect.test(e));
  if (hit) {
    console.log(`  caught   ${c.name}`);
  } else {
    broken++;
    console.log(`  MISSED   ${c.name}`);
    console.log(`           expected /${c.expect.source}/`);
    console.log(`           got ${got.length ? got.slice(0, 3).map((e) => '\n             - ' + e).join('') : '(no errors at all)'}`);
  }
}
/** The random crossings' spots, broken one way each. */
const SPOT_CASES = [
  {
    name: 'an exit spot moved across a doorway',
    exits: (e) => [...e, { room: 'C', x: 19.2, z: 16.0, nx: 0, nz: 1, axis: 'z' }],
    expect: /stands across a doorway/
  },
  {
    name: 'an exit spot off its room\'s wall',
    exits: (e) => [...e, { room: 'C', x: 17.0, z: 22.4, nx: 1, nz: 0, axis: 'x' }],
    expect: /is not on the room's wall/
  },
  {
    name: 'a spawn with its only exit a few steps away',
    exits: () => [EXIT_SPOTS[0]],
    spawns: [{ leg: 'room_C', x: 19.2, z: 22.4 }],
    expect: /has no exit spot \d+ m away/
  }
];
for (const c of SPOT_CASES) {
  const got = validateCrossingSpots({ exits: c.exits(EXIT_SPOTS), ...(c.spawns ? { spawns: c.spawns } : {}) });
  if (got.find((e) => c.expect.test(e))) {
    console.log(`  caught   ${c.name}`);
  } else {
    broken++;
    console.log(`  MISSED   ${c.name}`);
    console.log(`           got ${got.length ? got.slice(0, 3).join('; ') : '(no errors at all)'}`);
  }
}

console.log(broken
  ? `\n${broken} rule(s) the validator claims to check but does not.`
  : `all ${CASES.length + SPOT_CASES.length} faults are caught and named.`);

process.exit(errors + broken);
