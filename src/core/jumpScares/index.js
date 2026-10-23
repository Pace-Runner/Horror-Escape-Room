/**
 * Every jump scare, by name. Each is a plain object core/JumpScare.js plays:
 *
 *   name          its key here, and what JumpScare.lastKind reports
 *   seconds       how long it runs; it ends on black
 *   room          metres of clear floor it needs in front of the lens
 *   needsCeiling  only played where the caller passes a ceiling height
 *   start(rig)    once, on the black first frame (optional)
 *   frame(rig, t, dt)  every frame: pose it, place it, aim, light
 *   end(rig)      once, as it is handed back -- undo anything done to the
 *                 figure's root, which update() never resets (optional)
 */
import { lunge } from './lunge.js';
import { knockedDown } from './knockedDown.js';
import { ceilingDrop } from './ceilingDrop.js';
import { alreadyThere } from './alreadyThere.js';

export const JUMP_SCARES = { lunge, knockedDown, ceilingDrop, alreadyThere };
