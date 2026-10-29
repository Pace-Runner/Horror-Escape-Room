import * as THREE from 'three';
import { createRainGlassMaterial } from '../world/RainGlassMaterial.js';

/**
 * The study's windows: three tall casements in the left (west) wall, high enough
 * to clear the bookcases, the family portrait and the longcase clock below them.
 *
 * Real openings, not pictures. The wall is built in panels around them (each one
 * a subdivided plane, so the wall's baked wear and shading still work -- see
 * studySurfaces.alignSurfaces), and the house's outer siding has matching holes
 * (studyExterior.js reads the same layout), so what shows through is the yard,
 * the woods and the night sky that were already built for the porch.
 *
 * No light is added: every light is part of every shader in the room. The
 * windows are lit by what is already there, which is the point of the dark.
 */
export const STUDY_WINDOWS = Object.freeze({
  /** The wall they are cut into. */
  wallX: -8,
  bottom: 2.8,
  top: 5.4,
  halfWidth: 0.65,
  /** Centres along the wall (world z). Clear of the clock at z 4.35 and the portrait at z 1. */
  zs: Object.freeze([0.9, 3.1, 5.3])
});

/** Thickness of the outer siding beyond the plaster, matching OUT in studyExterior.js. */
const WALL_DEPTH = 0.22;

/**
 * @param {object} deps
 * @param {number} deps.roomD
 * @param {number} deps.roomH
 * @param {THREE.Material} deps.wallMat    the room's wallpaper material
 * @param {(w: number, h: number) => THREE.BufferGeometry} deps.wallGeometry
 * @param {THREE.Material} deps.trimMat    the frames' wood
 * @returns {THREE.Group} the whole left wall, openings and frames included. Its
 *   userData.glassMaterial is the panes' (world/RainGlassMaterial.js): the level
 *   moves its rain on (uTime) and flashes it with each strike (uFlash).
 */
export function createLeftWallWithWindows({ roomD, roomH, wallMat, wallGeometry, trimMat }) {
  const { wallX, bottom, top, halfWidth, zs } = STUDY_WINDOWS;
  const group = new THREE.Group();
  group.name = 'StudyLeftWall';

  /** A wallpapered panel on the wall, covering world z in [z0, z1] and y in [y0, y1]. */
  const panel = (z0, z1, y0, y1) => {
    const mesh = new THREE.Mesh(wallGeometry(z1 - z0, y1 - y0), wallMat);
    mesh.position.set(wallX, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.rotation.y = Math.PI / 2;
    group.add(mesh);
  };

  const half = roomD / 2;
  panel(-half, half, 0, bottom);
  panel(-half, half, top, roomH);
  const edges = [-half, ...zs.flatMap((z) => [z - halfWidth, z + halfWidth]), half];
  for (let i = 0; i < edges.length; i += 2) panel(edges[i], edges[i + 1], bottom, top);

  // x is the wall's depth, so a box is (depth, height, width along the wall).
  const box = (depth, h, w, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(depth, h, w), trimMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  const height = top - bottom;
  // Rain on the glass, as on the house's other windows; nearly clear, and no
  // painted sky, because the real one is out there (studyExterior.js).
  const glassMat = createRainGlassMaterial({
    tint: new THREE.Color(0x9fb2c9).multiplyScalar(0.06),
    size: [halfWidth * 2, height],
    opacity: 0.07,
    sky: false
  });
  group.userData.glassMaterial = glassMat;

  const midY = (top + bottom) / 2;
  const lining = 0.07;
  const reveal = wallX - WALL_DEPTH / 2;
  for (const zc of zs) {
    // The reveal through the wall's thickness.
    for (const side of [-1, 1]) box(WALL_DEPTH, height, lining, reveal, midY, zc + side * (halfWidth - lining / 2));
    box(WALL_DEPTH, lining, halfWidth * 2, reveal, top - lining / 2, zc);
    box(WALL_DEPTH, lining, halfWidth * 2, reveal, bottom + lining / 2, zc);

    // The casing round the opening on the room side, and a projecting sill.
    const casing = 0.11;
    for (const side of [-1, 1]) box(0.04, height + casing * 2, casing, wallX + 0.02, midY, zc + side * (halfWidth + casing / 2));
    box(0.05, casing, halfWidth * 2 + casing * 2, wallX + 0.025, top + casing / 2, zc);
    box(0.16, 0.05, halfWidth * 2 + casing * 2 + 0.1, wallX + 0.08, bottom - 0.025, zc);

    // The sash bars: one upright, two cross-bars, and the glass behind them.
    const sashX = wallX - 0.08;
    box(0.04, height, 0.045, sashX, midY, zc);
    for (const t of [0.34, 0.68]) box(0.04, 0.045, halfWidth * 2, sashX, bottom + height * t, zc);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, height), glassMat);
    glass.position.set(sashX - 0.02, midY, zc);
    glass.rotation.y = Math.PI / 2;
    glass.renderOrder = 2;
    group.add(glass);
  }
  return group;
}
