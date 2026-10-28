/**
 * Every jump scare, by name. Each is a plain object core/JumpScare.js plays:
 *
 *   name          its key here, and what JumpScare.lastKind reports
 *   seconds       how long it runs; it ends on black
 *   room          metres of clear floor it needs in front of the lens
 *   needsCeiling  only played where the caller passes a ceiling height
 *   start(rig)    once, on the black first frame (optional)
 *   pool          optional: the place it belongs to -- see below
 *   frame(rig, t, dt)  every frame: pose it, place it, aim, light
 *   end(rig)      once, as it is handed back -- undo anything done to the
 *                 figure's root, which update() never resets (optional)
 */
import { lunge } from './lunge.js';
import { knockedDown } from './knockedDown.js';
import { ceilingDrop } from './ceilingDrop.js';
import { alreadyThere } from './alreadyThere.js';
import { sedate } from './sedate.js';
import { lightningFace } from './lightningFace.js';
import { dragged } from './dragged.js';
import { thrash } from './thrash.js';
import { hauled } from './hauled.js';

/**
 * `pool` (optional) keeps a scare to one place: run({ kind: 'random', pool })
 * draws from that pool only, and a plain 'random' only from the scares with
 * none. The study's three are a sedation, not a mauling -- see
 * systems/StudySeeker.js -- so they are pool 'study'. The thrash is the stairs
 * scare's own (pool 'stairs'), asked for by name, and so are the kept
 * ending's haul shots (pool 'kept').
 */
export const JUMP_SCARES = { lunge, knockedDown, ceilingDrop, alreadyThere, sedate, lightningFace, dragged, thrash, hauled };

/** The study catch's scares, by name. */
export const STUDY_CATCH_SCARES = Object.freeze(['sedate', 'lightningFace', 'dragged']);
