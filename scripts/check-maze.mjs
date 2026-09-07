/**
 * Validate the backrooms maze without a browser.  `npm run check:maze`
 *
 * This exists because the maze is ~40 hand-authored corridors and the only
 * thing that used to check them was a boot-time assertion that counted
 * junctions -- it could tell you the count was wrong but not which pair was at
 * fault, and a disconnected corridor plus an accidental loop cancelled out and
 * passed it silently.
 *
 * It runs in plain node because src/levels/backroomsMaze.js imports nothing
 * from three. That is the whole reason the maze data was split out of the level:
 * a layout mistake should fail a command, not a playthrough.
 *
 * Exit code is the number of errors, so it can gate a build.
 */
import { reportMaze } from '../src/levels/backroomsMaze.js';

process.exit(reportMaze());
