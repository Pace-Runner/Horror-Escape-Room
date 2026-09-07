/**
 * The speeds the player can move at, in one place both owners can read.
 *
 * This file exists for the same reason `RenderLayers.js` does, and the same
 * reason `AudioEngine` exports `BREATH_BASE_LEVEL`: two modules must not invent
 * two numbers for one idea. Here the idea is a RELATION rather than a value --
 * systems/CreatureAI.js's whole design rests on how its speeds compare to the
 * player's. Patrol must be slower than a walk, flee must be faster than a
 * sprint, and blocking must be able to beat the player to a door.
 *
 * Until now that relation lived in a comment. A comment cannot fail a build;
 * the assertions at the bottom of CreatureAI.js can. That matters more than
 * usual here because `creatureAI.start()` is not yet called from anywhere in
 * the game, so a broken relation is invisible to playing it.
 *
 * Deliberately NOT exported from PointerLockPlayer: an AI module should not
 * have to import a class that drags in PointerLockControls to learn a number.
 */

/**
 * 3.1 originally. 0.65 of that: the rooms are small and the original pace
 * crossed them fast enough to undercut the tension. That judgement still holds
 * for the rooms, which is why sprint below is an opt-in burst rather than a new
 * default -- the walk keeps the pace the levels were tuned to.
 */
export const WALK_SPEED = 2.015;

/**
 * CEILING, documented so it is not discovered by accident: the collision
 * resolver takes ONE un-substepped displacement per frame (see
 * PointerLockPlayer's #resolveCollision) with dt clamped to 0.05 s in main.js,
 * and the backrooms wall slabs are T = 0.30 m thick. A step longer than the
 * slab can pass clean through a wall, which caps the scale at
 * 0.30 / (0.05 * 2.015) = 2.98. At 1.75 the step is 0.176 m -- inside both the
 * 0.35 m body radius and the 0.30 m slab, with margin to spare. Anything above
 * about 2.5 needs substepping first.
 */
export const SPRINT_SCALE = 1.75;

/** 3.53 m/s. */
export const SPRINT_SPEED = WALK_SPEED * SPRINT_SCALE;
