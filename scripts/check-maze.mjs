/**
 * Validate the backrooms maze without a browser.  `npm run check:maze`
 *
 * This exists because the maze is 42 hand-authored corridors and the only thing
 * that used to check them was a boot-time assertion that counted junctions --
 * it could tell you the count was wrong but not which pair was at fault, and a
 * disconnected corridor plus an accidental loop cancelled out and passed it
 * silently.
 *
 * It runs in plain node because src/levels/backroomsMaze.js imports nothing
 * from three. That is the whole reason the maze data was split out of the
 * level: a layout mistake should fail a command, not a playthrough.
 *
 * Exit code is non-zero on any fault, so it gates the build in CI.
 */
import { LEGS, validateMaze, reportMaze } from '../src/levels/backroomsMaze.js';

const errors = reportMaze();

/**
 * SELF-TEST: prove the validator can still say no.
 *
 * A green check is worth nothing unless it is capable of going red, and every
 * rule below is one somebody could quietly break while editing the layout. Each
 * case breaks the maze in one specific way and asserts the report NAMES it --
 * matching on the message, because being told which pair of corridors is at
 * fault is the entire point of this file over the assertion it replaced.
 *
 * Costs about a millisecond, so it runs every time rather than behind a flag.
 */
const CASES = [
  {
    name: 'an accidental loop (a dead end that rejoins the route)',
    // Slide a deep decoy onto the route corridor it runs parallel to. This is
    // the failure that matters most: it turns a guaranteed dead end into a
    // shortcut and breaks the one promise the level makes.
    break: (L) => { L.d4a = { ...L.d4a, at: 33.6, from: -22.4, to: 1.6 }; },
    expect: /overlap .* without being joined/
  },
  {
    name: 'a detached corridor',
    break: (L) => { L.d2c = { ...L.d2c, parent: 'd2c' }; },
    expect: /loops back through|unreachable from/
  },
  {
    name: 'a corridor that no longer reaches its parent (R1)',
    break: (L) => { L.d1a = { ...L.d1a, from: L.d1a.from + 2.4 }; },
    expect: /R1: d1a never reaches EW1's centre-line/
  },
  {
    name: 'a corridor hanging off the end of its parent (R2)',
    break: (L) => { L.sA = { ...L.sA, at: L.NS1.to + 4.0 }; },
    expect: /R2: sA hangs .* off the end of NS1/
  },
  {
    name: 'a wall too thin to stop lamp light (MIN_WALL)',
    break: (L) => { L.d3a = { ...L.d3a, at: L.d3a.at - 0.8 }; },
    expect: /apart, under MIN_WALL/
  },
  {
    name: 'a rect edge off the 0.1 grid, which breaks the wall-run proof',
    break: (L) => { L.EW1 = { ...L.EW1, w: 3.25 }; },
    expect: /not a multiple of 0.1/
  },
  {
    name: 'a route annotation that disagrees with the derived route',
    break: (L) => { L.sF = { ...L.sF, kind: 'route' }; },
    expect: /annotated kind:'route' but is not on the derived route/
  }
];

let broken = 0;
console.log('\n--- validator self-test ------------------------------------------');
for (const c of CASES) {
  const legs = { ...LEGS };
  c.break(legs);
  const { errors: got } = validateMaze(legs);
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
console.log(broken
  ? `\n${broken} rule(s) the validator claims to check but does not.`
  : `all ${CASES.length} faults are caught and named.`);

process.exit(errors + broken);
