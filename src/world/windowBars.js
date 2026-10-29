import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * WINDOW BARS. The house is a containment, and whatever it keeps is not
 * meant to get out of a window: every window you can look out of is barred
 * from the outside, round steel bars through flat steel straps, in the same
 * dark steel as the study door's containment bolts (studyLevel.js).
 *
 * One merged mesh a window (or a row of windows): one draw, as the study's
 * mirror re-renders the room. Built in the window's own plane: x across it,
 * y up it, the bars' axis at z = 0. The caller puts it just outside the
 * glass. It casts, so a lightning flash throws the bars across the floor.
 */

let steel = null;
/** The bars' steel, shared by every window. */
export function windowBarsMaterial() {
  steel ??= new THREE.MeshStandardMaterial({ name: 'Window bars steel', color: 0x3a3f43, metalness: 0.72, roughness: 0.5 });
  return steel;
}

/**
 * The bars for one opening, as a geometry in the window's plane.
 *
 * @param {object} options
 * @param {number} options.width - across the opening, metres; the bars sit inside it.
 * @param {number} options.height - the bars' length: the opening's height and a little into the wall above and below.
 * @param {number[]} [options.straps] - heights of the flat straps, metres from the middle.
 * @param {number} [options.spacing] - roughly the gap, centre to centre: under a head's width.
 * @param {number} [options.radius] - a bar's radius.
 * @returns {THREE.BufferGeometry}
 */
export function windowBarsGeometry({ width, height, straps = [-0.4, 0.4], spacing = 0.13, radius = 0.011 }) {
  const parts = [];
  const count = Math.max(2, Math.round(width / spacing));
  const step = width / count;
  for (let i = 0; i < count; i++) {
    const bar = new THREE.CylinderGeometry(radius, radius, height, 10);
    bar.translate(-width / 2 + step * (i + 0.5), 0, 0);
    parts.push(bar);
  }
  // The straps are thinner than the bars, so the bars run through them.
  for (const y of straps) {
    const strap = new THREE.BoxGeometry(width, 0.045, radius * 1.1);
    strap.translate(0, y, 0);
    parts.push(strap);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

/** The bars for one opening, as a mesh (see windowBarsGeometry), casting and receiving. */
export function createWindowBars(options) {
  const mesh = new THREE.Mesh(windowBarsGeometry(options), windowBarsMaterial());
  mesh.name = 'WindowBars';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
