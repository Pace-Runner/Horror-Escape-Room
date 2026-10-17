import { LEGS, legRect } from '../levels/backroomsMaze.js';
import { segmentBlocked } from '../core/collision.js';
import { linePicker } from '../dialogue/index.js';

/**
 * The player talking to themselves in the backrooms.
 *
 * Three kinds of line, each tied to something the player has just done rather
 * than to a timer, so it reads as a reaction:
 *
 *   wandering   ten seconds of walking in, once a run: the place is familiar
 *   seeing it   the first three times the thing in here is in view, in order
 *   dead ends   reaching the blind end of a corridor, one of three at random
 *
 * Being caught and coming round are not here -- main.js's onHunterCaught()
 * owns that sequence and picks its own lines.
 *
 * None of these may cut into a story line: a line is only said when nothing
 * else is captioning, and a reaction that cannot be said within a moment of
 * its cause is dropped rather than queued (a "dead end" said ten metres later
 * is about the wrong corridor).
 */

/** Seconds of actual walking before the place starts to feel familiar. */
const ROAM_SECONDS = 10;

/**
 * "In view": in front of the player within this half-angle, nothing between,
 * and near enough to make out through the fog (FogExp2 0.075 is ~70 % by 16 m).
 */
const SIGHT_HALF_ANGLE = (28 * Math.PI) / 180;
const SIGHT_RANGE = 16;
/** It has to be in view this long -- a frame of it at the edge is not a look. */
const SIGHT_HOLD = 0.35;
/** A new sighting needs this long out of view first, and this long since the last line about it. */
const SIGHT_GONE_FOR = 5;
const SIGHT_SPACING = 20;

/** Within this of a blind end, inside its corridor, counts as reaching it. */
const DEAD_END_REACH = 3.2;
/**
 * A blind end has to be at least this much corridor past the last opening. A
 * corridor that runs a body-width past a T is a notch, not a dead end, and
 * calling it one every time the player turned at the T was what a first pass
 * of this did.
 */
const DEAD_END_MIN_STUB = 3.0;
/** Walk this far back from it before the same end can be remarked on again. */
const DEAD_END_REARM = 8;
const DEAD_END_SPACING = 20;

/** How long a reaction waits for the caption box to be free before it is dropped. */
const PATIENCE = 1.5;

/**
 * Every blind corridor end in the maze: each end of each leg's centre-line that
 * does not open into another leg. This includes the overshoot past every turn,
 * which is the maze's main way of being wrong ("most decoys are not separate
 * geometry, they are the corridor you were already in, continuing without
 * you"), as well as the decoy branches, the closets and the far wall of each
 * room. The two ends that are not dead -- the sealed way in and the exit -- are
 * left out.
 */
function findDeadEnds() {
  // Doorways and the ways in and out are never dead ends, and a room is only
  // one if it has a single doorway -- the rooms inside the maze are passed
  // through, in one side and out the other.
  const doorsInto = (room) => Object.values(LEGS).filter((l) => l.kind === 'neck' && l.room === room).length;
  const names = Object.keys(LEGS).filter((n) => {
    const kind = LEGS[n].kind;
    if (kind === 'neck' || kind === 'mouth') return false;
    return kind !== 'room' || doorsInto(n) === 1;
  });
  const all = Object.keys(LEGS);
  const rects = Object.fromEntries(all.map((n) => [n, legRect(LEGS[n])]));
  const inside = (x, z, [x0, x1, z0, z1], pad = 0.05) => x >= x0 - pad && x <= x1 + pad && z >= z0 - pad && z <= z1 + pad;
  const ends = [];
  for (const name of names) {
    const leg = LEGS[name];
    for (const along of [leg.from, leg.to]) {
      const x = leg.axis === 'z' ? leg.at : along;
      const z = leg.axis === 'z' ? along : leg.at;
      const opensInto = (px, pz) => all.some((m) => m !== name && inside(px, pz, rects[m]));
      if (opensInto(x, z)) continue;
      // How far back from the end before the corridor opens into another.
      const inward = along === leg.from ? 1 : -1;
      let stub = 0;
      while (stub < leg.to - leg.from) {
        const a = along + inward * stub;
        if (opensInto(leg.axis === 'z' ? leg.at : a, leg.axis === 'z' ? a : leg.at)) break;
        stub += 0.1;
      }
      if (stub < DEAD_END_MIN_STUB) continue;
      ends.push({ name, x, z, rect: rects[name], stub: +stub.toFixed(1), armed: true, opensInto });
    }
  }
  return ends;
}

export function createBackroomsBarks({
  /** Plays a dialogue key if the caption box is free; returns whether it did. */
  say,
  /** () => { x, z, forwardX, forwardZ, moving } */
  getPlayer,
  hunter,
  /**
   * () => {x, z} of the figure the player could be looking at, or null: the
   * hunter while it runs, or the first crossing's trailing shadow while it is
   * drawn -- the one the "it just disappears" lines were written for.
   */
  getFigure,
  colliders,
  /** () => true while a catch, a transition or a pause owns the moment */
  isBusy
}) {
  const deadEnds = findDeadEnds();
  const pickDeadEnd = linePicker(['dialog_dead_end_1', 'dialog_dead_end_2', 'dialog_dead_end_3']);
  const LOOKS = ['dialog_look_at_monster_1', 'dialog_look_at_monster_2', 'dialog_look_at_monster_3'];

  // Per run: these are "the first time" beats, so a second crossing after a
  // restart gets them again, but a catch and respawn does not.
  let roamed = 0;
  let roamSaid = false;
  let looksSaid = 0;
  // Per moment.
  let inView = 0;
  let outOfView = Infinity;
  let goneBefore = Infinity;
  let remarked = false;
  let sinceLook = Infinity;
  let sinceDeadEnd = Infinity;
  let pending = null;          // { key, waited, onSaid }

  function want(key, onSaid) {
    if (!pending) pending = { key, waited: 0, onSaid };
  }

  function seesFigure(p) {
    const h = getFigure();
    if (!h) return false;
    const dx = h.x - p.x;
    const dz = h.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > SIGHT_RANGE || d < 1e-3) return false;
    const fl = Math.hypot(p.forwardX, p.forwardZ) || 1;
    const cos = (dx * p.forwardX + dz * p.forwardZ) / (d * fl);
    if (cos < Math.cos(SIGHT_HALF_ANGLE)) return false;
    return !segmentBlocked(p.x, p.z, h.x, h.z, colliders);
  }

  return {
    /** Once a frame while the backrooms are the active level. */
    update(dt) {
      if (isBusy()) { pending = null; return; }
      const p = getPlayer();
      sinceLook += dt;
      sinceDeadEnd += dt;

      // ---- wandering ----
      if (!roamSaid && p.moving > 0.3) {
        roamed += dt;
        if (roamed >= ROAM_SECONDS) want('dialog_backrooms_roam', () => { roamSaid = true; });
      }

      // ---- seeing it ----
      if (seesFigure(p)) {
        // How long it had been gone is read once, as the sighting begins.
        if (inView === 0) goneBefore = outOfView;
        inView += dt;
        outOfView = 0;
        if (!remarked && looksSaid < LOOKS.length && inView >= SIGHT_HOLD
          && goneBefore >= SIGHT_GONE_FOR && sinceLook >= SIGHT_SPACING) {
          // A sighting beats any other reaction waiting for the box.
          if (pending?.key !== LOOKS[looksSaid]) pending = null;
          want(LOOKS[looksSaid], () => { looksSaid++; sinceLook = 0; remarked = true; });
        }
      } else {
        inView = 0;
        outOfView += dt;
        // One line per sighting: it has to go out of view to earn another.
        remarked = false;
      }

      // ---- dead ends ----
      for (const end of deadEnds) {
        const d = Math.hypot(p.x - end.x, p.z - end.z);
        const [x0, x1, z0, z1] = end.rect;
        // In the blind part itself: inside this corridor and no other, so
        // standing in the crossing that leads to it does not count.
        const inLeg = p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1 && !end.opensInto(p.x, p.z);
        if (end.armed && inLeg && d <= DEAD_END_REACH) {
          end.armed = false;
          // Not while it is chasing: the player has better things to say.
          if (sinceDeadEnd >= DEAD_END_SPACING && hunter.state !== 'chase') {
            want(pickDeadEnd(), () => { sinceDeadEnd = 0; });
          }
        } else if (!end.armed && d > DEAD_END_REARM) {
          end.armed = true;
        }
      }

      // ---- say it, or let it go ----
      if (pending) {
        if (say(pending.key)) {
          pending.onSaid?.();
          pending = null;
        } else if ((pending.waited += dt) > PATIENCE) {
          pending = null;
        }
      }
    },

    /** A fresh run: every "first time" is a first time again. */
    reset() {
      roamed = 0;
      roamSaid = false;
      looksSaid = 0;
      inView = 0;
      outOfView = Infinity;
      goneBefore = Infinity;
      remarked = false;
      sinceLook = Infinity;
      sinceDeadEnd = Infinity;
      pending = null;
      pickDeadEnd.reset();
      for (const end of deadEnds) end.armed = true;
    },

    /** DEV: the blind ends found, and the state of each beat. */
    get debug() {
      return {
        deadEnds: deadEnds.map(({ name, x, z, stub, armed }) => ({ name, x, z, stub, armed })),
        roamed: +roamed.toFixed(1), roamSaid, looksSaid, pending: pending?.key ?? null
      };
    }
  };
}
