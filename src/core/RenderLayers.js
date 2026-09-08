/**
 * Shared THREE.Object3D layer numbers, so the minimap's second camera and any
 * level that needs to hide something from it (or show it something the main
 * camera should not) agree on the same bits. See the MINIMAP_LAYER note in
 * main.js for why lights and geometry can be scoped to one camera and not the
 * other at all -- this file exists only so two modules don't invent two
 * different numbers for the same idea.
 */

/**
 * Built purely for the top-down map: the map's own light, and any geometry
 * shaped to how a level actually reads from directly above rather than how it
 * reads at eye level. Enabled on the minimap camera, never the main one.
 */
export const MINIMAP_ONLY = 4;

/**
 * Real geometry that is correct for the player at eye level but would read
 * wrong on the map -- an oversized floor slab, a light fixture's housing.
 * Enabled on the main camera, never the minimap one.
 */
export const MAIN_ONLY = 5;
