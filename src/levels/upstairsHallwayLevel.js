import * as THREE from 'three';
import { loadModel } from '../world/modelLoader.js';
import { createRainGlassMaterial } from '../world/RainGlassMaterial.js';
import { takeWindowShadows } from '../world/windowLight.js';
import { Rain } from '../world/Rain.js';
import {
  createClippingArt,
  createBlueprintArt,
  createHallNoteArt,
  createHeightMarksArt,
  HEIGHT_MARKS_SIZE,
  createShatteredMirrorArt,
  createPaleMarksArt,
  createFrameBackArt,
  createPlaqueArt,
  composeHeightMarksImage
} from '../world/hallwayArt.js';
import { HALLWAY } from '../story/hallway.js';
import { line } from '../dialogue/index.js';

import doorModelUrl from '../assets/models/door.glb?url';
import pendantModelUrl from '../assets/models/ceiling_pendant.glb?url';
import tableModelUrl from '../assets/models/bedside_table.glb?url';
import lampModelUrl from '../assets/models/bedside_lamp.glb?url';
import windowFrameModelUrl from '../assets/models/level1_window_frame_remodel.glb?url';
import radiatorModelUrl from '../assets/models/level1_radiator_remodel.glb?url';
import chairModelUrl from '../assets/models/level1_chair_remodel.glb?url';
import rugModelUrl from '../assets/models/rug/level1_victorian_rug.glb?url';
import paperBallModelUrl from '../assets/models/level1_crumpled_paper_ball.glb?url';
import wallpaperUrl from '../assets/textures/bedroom/distressed_victorian_damask_wallpaper.webp?url';
import floorUrl from '../assets/textures/bedroom/weathered_dark_wooden_floorboards.webp?url';
import ceilingUrl from '../assets/textures/bedroom/grimy_cracked_plaster_texture.webp?url';
import clawRipUrl from '../assets/textures/bedroom/ripped_victorian_wallpaper_claw_marks.webp?url';
import houseSepiaUrl from '../assets/textures/bedroom/haunted_victorian_mansion_sepia.webp?url';
import woodNormalUrl from '../assets/textures/door/door_wood_normal_1k.webp?url';
// The basement's own concrete, already in the build: the passage at the foot
// of the stairs is where the house starts turning into the laboratory.
import concreteUrl from '../assets/textures/lab/concrete030_color.jpg?url';

/**
 * The upstairs hallway, between the bedroom and the basement stairs.
 *
 * The storyline's "dark hallway ... a staircase going down", built from the
 * bedroom's own materials -- the same damask paper, floorboards, plaster, rug,
 * door and furniture -- so it is unmistakably the same house. It replaces the
 * backrooms crossing on this one route: Level 1's door opens straight onto it,
 * and the stairs at the far end lead down into Level 2.
 *
 * WHAT IT IS FOR. The bedroom is a cell; the basement is a laboratory. This is
 * the one place the player sees that a family lived here: a clipping about a
 * boy who wanted to stop the body giving up, his and his sister's heights up
 * the wall, the conversion drawings with three rooms ringed, a note begging
 * whoever is reading it to go back in. Every piece is optional and none of it
 * is a puzzle -- the hallway is a walk with things worth stopping for. The
 * words are in story/hallway.js; the drawings in world/hallwayArt.js.
 *
 * LAYOUT. Level space is world space, the same rule the backrooms use: the
 * hall runs from the bedroom door at z = 0 down +Z to the top of the stairs at
 * z = HALL_LEN, and the staircase drops beyond it between the same two walls --
 * a straight enclosed stair, as in a terraced Victorian house, so there is no
 * balustrade for the player to walk round. The player cannot climb, so the top
 * step is a collider and the stairs themselves are the exit's interaction.
 */

const HALL_W = 2.4;
const HALL_H = 2.9;
const HALL_LEN = 11;
const STEP_COUNT = 10;
const STEP_RISE = 0.19;
const STEP_RUN = 0.27;
const STAIR_END_Z = HALL_LEN + STEP_COUNT * STEP_RUN;
const STAIR_BOTTOM_Y = -STEP_COUNT * STEP_RISE;
const WELL_END_Z = STAIR_END_Z + 1.5;
const LEFT_X = -HALL_W / 2;
const RIGHT_X = HALL_W / 2;

/** One repeat of the damask, in metres -- the bedroom's own density. */
const WALLPAPER_SPAN_METRES = 2.68;
/** Height of the dado rail; panelling below it, paper above. */
const DADO_HEIGHT = 0.92;
/** The picture rail the frames hang from on cords. */
const PICTURE_RAIL_HEIGHT = 2.38;
const SKIRTING_HEIGHT = 0.16;

/** Where things stand along the hall, so the wall builder can leave room for them. */
const WINDOW = { z: 6.0, y: 1.72, w: 1.3, h: 1.5 };
/** The window's light between strikes: moonlight through the glass. */
const MOONLIGHT = 0.5;
/**
 * The turn at the foot of the stairs: a doorway in the right-hand wall of the
 * landing, through to a passage that runs on toward the basement. Without it
 * the stairs ended at a lit wall, which from the top read as a dead end.
 */
const TURN = {
  z: (STAIR_END_Z + WELL_END_Z) / 2,
  w: WELL_END_Z - STAIR_END_Z - 0.16,
  y: STAIR_BOTTOM_Y + 1.05,
  h: 2.1
};
/** How far the passage runs before it is lost in the dark. */
const PASSAGE_LEN = 3.4;
/** Level with the top of the doorway, so the two meet with no step. */
const PASSAGE_H = 2.1;
const NURSERY_DOOR_Z = 4.2;
const BATHROOM_DOOR_Z = 9.55;
/** A door.glb frame is 1.4 m wide; panelling and skirting stop short of it. */
const DOOR_CLEARANCE = 0.74;

/**
 * How far short of the top step the stairs scare is triggered, in metres: a
 * stride before the first tread, as they reach the stairs and before they
 * start down them.
 */
const STAIRS_TRIGGER_DISTANCE = 0.9;

/** The invisible material every interaction hitbox uses: raycast, never seen. */
const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function loadTexture(url, { srgb = true, wrapS = THREE.RepeatWrapping, wrapT = THREE.RepeatWrapping, anisotropy = 8 } = {}) {
  const texture = new THREE.TextureLoader().load(url);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = wrapS;
  texture.wrapT = wrapT;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Rewrites a mesh's UVs from its world position, so neighbouring pieces of the
 * same surface sample one continuous image instead of each restarting it.
 *
 * @param {THREE.Mesh} mesh - positioned and rotated already.
 * @param {(p: THREE.Vector3) => [number, number]} mapping - world point to uv.
 */
function setWorldUVs(mesh, mapping) {
  mesh.updateMatrix();
  const position = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  const point = new THREE.Vector3();
  for (let i = 0; i < uv.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix);
    const [u, v] = mapping(point);
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/**
 * Builds Level 1.5: the upstairs hallway.
 *
 * @param {object} callbacks
 * @param {(lines: Array<object>) => void} callbacks.showCaption
 * @param {(piece: { title: string, body: string, art?: object }) => void} callbacks.onInspect
 *   hold a framed piece up to read it (main.js opens DocumentUI).
 * @param {() => void} callbacks.onExit - the stairs were taken.
 * @param {() => void} callbacks.onLightning - a flash; main.js plays the thunder.
 * @param {(name: string, opts?: object) => void} callbacks.onSfx - a sound effect by
 *   name (AudioDirector's SFX) with its world `position`; the level has no audio.
 * @param {() => void} callbacks.onReachStairs - the player has walked up to the
 *   top of the stairs. Fires once per run; main.js plays the stairs scare.
 * @param {{x: number, z: number}} origin - where the hall's doorway stands in the
 *   world. The bedroom's door, so the two rooms are one space with no load
 *   between them. Everything below is built about (0, 0) and moved there
 *   once, at the end: the group, and every world-space thing handed out --
 *   colliders, spawn, groundAt, the trigger, refs.farEnd.
 */
export function createUpstairsHallwayLevel({
  showCaption = () => {},
  onInspect = () => {},
  onExit = () => {},
  onLightning = () => {},
  onSfx = () => {},
  onReachStairs = () => {},
  origin = { x: 0, z: 0 }
} = {}) {
  const group = new THREE.Group();
  group.name = 'Level1_5_UpstairsHallway';
  const interactables = [];
  const colliders = [];
  /** The bedroom doorway's collider; out of `colliders` while the door stands open. */
  const doorwayPlug = { minX: -0.5, maxX: 0.5, minZ: -0.2, maxZ: 0.12 };
  /** The black card behind the doorway, hidden while the bedroom is really there. */
  let doorwayBehind = null;

  // ---------- the bedroom's own materials ----------------------------------
  const wallpaper = loadTexture(wallpaperUrl, { wrapS: THREE.MirroredRepeatWrapping });
  const wallMat = new THREE.MeshStandardMaterial({ name: 'Hallway_DamaskWallpaper', map: wallpaper, roughness: 0.92 });

  const floorTex = loadTexture(floorUrl, { anisotropy: 8 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78 });

  const ceilingTex = loadTexture(ceilingUrl, { wrapS: THREE.MirroredRepeatWrapping, wrapT: THREE.MirroredRepeatWrapping, anisotropy: 4 });
  const ceilingMat = new THREE.MeshStandardMaterial({ map: ceilingTex, color: 0x7a6b58, roughness: 0.96 });

  /**
   * The panelling and trim. Cut from the same dark floorboard photograph the
   * bedroom's skirting uses -- a warm, distressed wood that already belongs to
   * this house -- with the door's grain normal map for relief.
   */
  const woodNormal = loadTexture(woodNormalUrl, { srgb: false, anisotropy: 4 });
  const woodMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    normalMap: woodNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    color: 0xc79b76,
    emissive: 0x120805,
    emissiveIntensity: 0.22,
    roughness: 0.66
  });
  const trimMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x9a7556, roughness: 0.6 });
  const giltMat = new THREE.MeshStandardMaterial({ color: 0x8c6c34, metalness: 0.55, roughness: 0.38 });
  const blackFrameMat = new THREE.MeshStandardMaterial({ color: 0x15110d, roughness: 0.45 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x9a7a3c, metalness: 0.7, roughness: 0.35 });
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.9 });
  const darkBehindMat = new THREE.MeshBasicMaterial({ color: 0x030302 });

  const wallU = (z) => z / WALLPAPER_SPAN_METRES;
  const wallV = (y) => y / HALL_H;

  // ---------- floors and ceiling -------------------------------------------
  /** Boards run down the hall, as they would in a corridor. */
  const floorUV = (p) => [p.z / 4.1, (p.x + HALL_W / 2) / 3.0];
  const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_LEN), floorMat);
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set(0, 0, HALL_LEN / 2);
  setWorldUVs(hallFloor, floorUV);
  hallFloor.receiveShadow = true;
  group.add(hallFloor);

  const landing = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, WELL_END_Z - STAIR_END_Z), floorMat);
  landing.rotation.x = -Math.PI / 2;
  landing.position.set(0, STAIR_BOTTOM_Y, (STAIR_END_Z + WELL_END_Z) / 2);
  setWorldUVs(landing, floorUV);
  group.add(landing);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, WELL_END_Z), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, HALL_H, WELL_END_Z / 2);
  setWorldUVs(ceiling, (p) => [(p.x + HALL_W / 2) / 2.4, p.z / 3.2]);
  ceiling.receiveShadow = false;
  // It casts, as the bedroom's does: the window light comes in from above.
  ceiling.castShadow = true;
  group.add(ceiling);

  // ---------- walls ----------------------------------------------------------
  /**
   * One side wall, from the bedroom end to the bottom of the stairwell, built
   * round any openings: the window in the hall, and the turn at the foot of
   * the stairs. Pieces share world-space UVs, so the damask runs unbroken
   * across them.
   *
   * @param {'left'|'right'} side
   * @param {Array<{z: number, y: number, w: number, h: number}>} hallGaps
   * @param {Array<{z: number, y: number, w: number, h: number}>} wellGaps
   */
  function addSideWall(side, hallGaps = [], wellGaps = []) {
    const x = side === 'left' ? LEFT_X : RIGHT_X;
    const rotationY = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    const addPiece = (z0, z1, y0, y1) => {
      if (z1 - z0 < 0.001 || y1 - y0 < 0.001) return;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), wallMat);
      mesh.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.rotation.y = rotationY;
      setWorldUVs(mesh, (p) => [wallU(p.z), wallV(p.y)]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    /** One stretch of wall, with rectangular holes cut out of it. */
    const addSection = (start, end, bottom, top, gaps) => {
      let cursor = start;
      for (const gap of [...gaps].sort((a, b) => a.z - b.z)) {
        const z0 = gap.z - gap.w / 2;
        const z1 = gap.z + gap.w / 2;
        addPiece(cursor, z0, bottom, top);
        addPiece(z0, z1, bottom, gap.y - gap.h / 2);
        addPiece(z0, z1, gap.y + gap.h / 2, top);
        cursor = z1;
      }
      addPiece(cursor, end, bottom, top);
    };
    addSection(0, HALL_LEN, 0, HALL_H, hallGaps);
    // The stairwell section runs on down past the hall floor.
    addSection(HALL_LEN, WELL_END_Z, STAIR_BOTTOM_Y - 0.1, HALL_H, wellGaps);
    if (side === 'left') {
      colliders.push({ minX: LEFT_X - 0.2, maxX: LEFT_X + 0.08, minZ: -0.2, maxZ: WELL_END_Z });
    } else {
      // Broken at the turn, so the doorway at the foot of the stairs can be
      // walked through into the passage.
      colliders.push(
        { minX: RIGHT_X - 0.08, maxX: RIGHT_X + 0.2, minZ: -0.2, maxZ: TURN.z - TURN.w / 2 },
        { minX: RIGHT_X - 0.08, maxX: RIGHT_X + 0.2, minZ: TURN.z + TURN.w / 2, maxZ: WELL_END_Z }
      );
    }
  }
  addSideWall('left', [WINDOW]);
  addSideWall('right', [], [TURN]);

  // The bedroom end, with the doorway the player just came through.
  {
    const doorW = 1.0;
    const doorH = 2.0;
    const piece = (w, h, cx, cy) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      mesh.position.set(cx, cy, 0);
      setWorldUVs(mesh, (p) => [(p.x + 7) / WALLPAPER_SPAN_METRES, wallV(p.y)]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    const sideW = (HALL_W - doorW) / 2;
    piece(sideW, HALL_H, LEFT_X + sideW / 2, HALL_H / 2);
    piece(sideW, HALL_H, RIGHT_X - sideW / 2, HALL_H / 2);
    piece(doorW, HALL_H - doorH, 0, doorH + (HALL_H - doorH) / 2);
    const behind = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), darkBehindMat);
    behind.position.set(0, doorH / 2, -0.03);
    group.add(behind);
    doorwayBehind = behind;
    // Either side of the doorway, and the doorway itself as a removable plug
    // (setDoorwayOpen), so the bedroom can be walked into while the door is open.
    colliders.push(
      { minX: LEFT_X, maxX: -doorW / 2, minZ: -0.2, maxZ: 0.12 },
      { minX: doorW / 2, maxX: RIGHT_X, minZ: -0.2, maxZ: 0.12 },
      doorwayPlug
    );
  }

  // The far wall at the foot of the stairs.
  {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_H - STAIR_BOTTOM_Y + 0.1), wallMat);
    mesh.position.set(0, (HALL_H + STAIR_BOTTOM_Y - 0.1) / 2, WELL_END_Z);
    mesh.rotation.y = Math.PI;
    setWorldUVs(mesh, (p) => [(p.x + 3) / WALLPAPER_SPAN_METRES, wallV(p.y)]);
    group.add(mesh);
  }

  /**
   * THE TURN. Through the doorway at the foot of the stairs, a passage runs
   * off to the right toward the basement. It is bare concrete -- the lab's
   * own texture -- so the house is visibly giving way to what is under it,
   * and it fades into black a few metres in, so from the top of the stairs
   * there is no end to see: only a doorway, and cold light coming round it.
   */
  {
    const passageX0 = RIGHT_X;
    const passageX1 = RIGHT_X + PASSAGE_LEN;
    const z0 = TURN.z - TURN.w / 2;
    const z1 = TURN.z + TURN.w / 2;
    const floorY = STAIR_BOTTOM_Y;
    const concrete = loadTexture(concreteUrl, { anisotropy: 4 });
    const concreteMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0x6e6a63, roughness: 0.95 });
    const concreteUV = (u, v) => (p) => [u(p), v(p)];
    const surface = (w, h, position, rotation, uv) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), concreteMat);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      setWorldUVs(mesh, uv);
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    const midX = (passageX0 + passageX1) / 2;
    // floor, ceiling, and the two side walls
    surface(PASSAGE_LEN, TURN.w, [midX, floorY, TURN.z], [-Math.PI / 2, 0, 0], concreteUV((p) => p.x / 2, (p) => p.z / 2));
    surface(PASSAGE_LEN, TURN.w, [midX, floorY + PASSAGE_H, TURN.z], [Math.PI / 2, 0, 0], concreteUV((p) => p.x / 2, (p) => p.z / 2));
    surface(PASSAGE_LEN, PASSAGE_H, [midX, floorY + PASSAGE_H / 2, z0], [0, 0, 0], concreteUV((p) => p.x / 2, (p) => p.y / 2));
    surface(PASSAGE_LEN, PASSAGE_H, [midX, floorY + PASSAGE_H / 2, z1], [0, Math.PI, 0], concreteUV((p) => p.x / 2, (p) => p.y / 2));
    // Where it goes: nowhere the eye can follow. Unlit, unfogged black.
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(TURN.w + 0.02, PASSAGE_H + 0.02), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
    dark.position.set(passageX1, floorY + PASSAGE_H / 2, TURN.z);
    dark.rotation.y = -Math.PI / 2;
    group.add(dark);
    // A soft ramp of darkness down the last two metres, so the concrete
    // fades out rather than meeting a black card.
    const fadeCanvas = document.createElement('canvas');
    fadeCanvas.width = 256;
    fadeCanvas.height = 4;
    const fadeCtx = fadeCanvas.getContext('2d');
    const fade = fadeCtx.createLinearGradient(0, 0, 256, 0);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 1)');
    fadeCtx.fillStyle = fade;
    fadeCtx.fillRect(0, 0, 256, 4);
    const fadeTex = new THREE.CanvasTexture(fadeCanvas);
    const fadeMat = new THREE.MeshBasicMaterial({ map: fadeTex, transparent: true, depthWrite: false, fog: false });
    // The far wall faces the other way, so its local x runs back up the
    // passage: the same ramp, mirrored in the texture rather than the mesh
    // (a negative scale would turn the strip's face away from the player).
    const fadeTexReversed = fadeTex.clone();
    fadeTexReversed.wrapS = THREE.RepeatWrapping;
    fadeTexReversed.repeat.x = -1;
    fadeTexReversed.offset.x = 1;
    const fadeMatReversed = new THREE.MeshBasicMaterial({ map: fadeTexReversed, transparent: true, depthWrite: false, fog: false });
    const fadeLen = 2.2;
    for (const [z, ry, material] of [[z0 + 0.004, 0, fadeMat], [z1 - 0.004, Math.PI, fadeMatReversed]]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(fadeLen, PASSAGE_H), material);
      strip.position.set(passageX1 - fadeLen / 2, floorY + PASSAGE_H / 2, z);
      strip.rotation.y = ry;
      group.add(strip);
    }
    for (const [y, rx] of [[floorY + 0.004, -Math.PI / 2], [floorY + PASSAGE_H - 0.004, Math.PI / 2]]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(fadeLen, TURN.w), fadeMat);
      strip.position.set(passageX1 - fadeLen / 2, y, TURN.z);
      strip.rotation.x = rx;
      group.add(strip);
    }
    // A plain dark casing round the doorway, on the landing side.
    const casingMat = trimMat;
    for (const [w, h, y, z] of [
      [0.08, TURN.h, floorY + TURN.h / 2, z0 - 0.04],
      [0.08, TURN.h, floorY + TURN.h / 2, z1 + 0.04],
      [TURN.w + 0.24, 0.09, floorY + TURN.h + 0.045, TURN.z]
    ]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, w), casingMat);
      piece.position.set(RIGHT_X - 0.015, y, z);
      group.add(piece);
    }
  }

  // ---------- panelling, rails and skirting ---------------------------------
  /** Lengths of hall wall, per side, that have no door in them. */
  function clearRuns(side) {
    const doors = side === 'left' ? [BATHROOM_DOOR_Z] : [NURSERY_DOOR_Z];
    const runs = [];
    let cursor = 0.0;
    for (const dz of doors) {
      runs.push([cursor, dz - DOOR_CLEARANCE]);
      cursor = dz + DOOR_CLEARANCE;
    }
    runs.push([cursor, HALL_LEN]);
    return runs;
  }

  /** A box laid along a side wall, `out` metres proud of it. */
  function alongWall(side, z0, z1, y, height, depth, material, out = 0) {
    const sign = side === 'left' ? 1 : -1;
    const x = (side === 'left' ? LEFT_X : RIGHT_X) + sign * (out + depth / 2);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(depth, height, z1 - z0), material);
    mesh.position.set(x, y, (z0 + z1) / 2);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  for (const side of ['left', 'right']) {
    for (const [z0, z1] of clearRuns(side)) {
      if (z1 - z0 < 0.2) continue;
      // Panelling below the dado: a backing board and raised fielded panels.
      const backing = alongWall(side, z0, z1, (SKIRTING_HEIGHT + DADO_HEIGHT) / 2, DADO_HEIGHT - SKIRTING_HEIGHT, 0.014, woodMat);
      setWorldUVs(backing, (p) => [p.z / 1.4, p.y / 2.2]);
      const panelCount = Math.max(1, Math.round((z1 - z0) / 0.62));
      const pitch = (z1 - z0) / panelCount;
      for (let i = 0; i < panelCount; i++) {
        const pz0 = z0 + i * pitch + 0.06;
        const pz1 = z0 + (i + 1) * pitch - 0.06;
        const panel = alongWall(side, pz0, pz1, (SKIRTING_HEIGHT + DADO_HEIGHT) / 2 + 0.01, DADO_HEIGHT - SKIRTING_HEIGHT - 0.16, 0.012, woodMat, 0.014);
        setWorldUVs(panel, (p) => [p.z / 1.4 + 0.31, p.y / 2.2 + 0.17]);
      }
      alongWall(side, z0, z1, DADO_HEIGHT, 0.05, 0.035, trimMat);
      alongWall(side, z0, z1, SKIRTING_HEIGHT / 2, SKIRTING_HEIGHT, 0.028, trimMat);
      alongWall(side, z0, z1, PICTURE_RAIL_HEIGHT, 0.035, 0.026, trimMat);
    }
    // The cornice runs the whole length, stairwell included.
    alongWall(side, 0, WELL_END_Z, HALL_H - 0.05, 0.1, 0.07, trimMat);
  }

  // ---------- frames ---------------------------------------------------------
  /**
   * A picture frame with a moulded section: one extruded ring with a rounded
   * bevel, a card mount, the picture, and a sheet of glass that catches the
   * torch. Hung from the picture rail on two cords, as a Victorian hall would.
   *
   * @returns {THREE.Group} with +Z facing out of the wall.
   */
  function makeFrame({ innerW, innerH, border = 0.05, depth = 0.025, frameMaterial = giltMat, picture, mount = 0, mountColour = 0xe2d8c2, glass = true }) {
    const frame = new THREE.Group();
    const outerW = innerW + mount * 2 + border * 2;
    const outerH = innerH + mount * 2 + border * 2;
    const shape = new THREE.Shape();
    shape.moveTo(-outerW / 2, -outerH / 2);
    shape.lineTo(outerW / 2, -outerH / 2);
    shape.lineTo(outerW / 2, outerH / 2);
    shape.lineTo(-outerW / 2, outerH / 2);
    shape.closePath();
    const hole = new THREE.Path();
    const hw = outerW / 2 - border;
    const hh = outerH / 2 - border;
    hole.moveTo(-hw, -hh);
    hole.lineTo(-hw, hh);
    hole.lineTo(hw, hh);
    hole.lineTo(hw, -hh);
    hole.closePath();
    shape.holes.push(hole);
    const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: Math.min(0.012, border * 0.3),
      bevelSize: Math.min(0.01, border * 0.25),
      bevelSegments: 3,
      curveSegments: 1
    }), frameMaterial);
    ring.castShadow = true;
    ring.receiveShadow = true;
    frame.add(ring);
    // a thin inner slip, lighter, for a second line in the moulding
    if (frameMaterial === giltMat) {
      const slip = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, hh * 2, 0.004), brassMat);
      slip.position.z = 0.002;
      frame.add(slip);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hh * 2), new THREE.MeshStandardMaterial({ color: mountColour, roughness: 0.95 }));
    back.position.z = 0.005;
    frame.add(back);
    if (picture) {
      const art = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), picture);
      art.position.z = 0.007;
      art.receiveShadow = true;
      frame.add(art);
    }
    if (glass) {
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(hw * 2, hh * 2),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.04, metalness: 0, depthWrite: false })
      );
      pane.position.z = depth * 0.7;
      frame.add(pane);
    }
    frame.userData.outer = { w: outerW, h: outerH, depth };
    return frame;
  }

  /**
   * Hangs a frame on a side wall from the picture rail, with its two cords,
   * and gives it an invisible hitbox for reading it.
   */
  function hangFrame(frame, side, z, centreY, interact) {
    const { w, h } = frame.userData.outer;
    const sign = side === 'left' ? 1 : -1;
    const wallX = side === 'left' ? LEFT_X : RIGHT_X;
    const holder = new THREE.Group();
    holder.position.set(wallX + sign * 0.012, centreY, z);
    holder.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    // A frame hung on cords tilts forward a little at the top.
    frame.rotation.x = -0.035;
    holder.add(frame);
    group.add(holder);
    // Two cords from one hook on the rail to the top corners.
    const hookY = PICTURE_RAIL_HEIGHT - centreY;
    const hook = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), brassMat);
    hook.position.set(0, hookY, 0.03);
    holder.add(hook);
    for (const cx of [-w * 0.32, w * 0.32]) {
      const from = new THREE.Vector3(0, hookY, 0.028);
      const to = new THREE.Vector3(cx, h / 2 - 0.02, 0.02);
      const length = from.distanceTo(to);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, length, 5), cordMat);
      cord.position.copy(from).add(to).multiplyScalar(0.5);
      cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      holder.add(cord);
    }
    if (interact) {
      const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.08), HITBOX_MATERIAL);
      hit.position.z = 0.04;
      hit.userData.interact = interact;
      holder.add(hit);
      interactables.push(hit);
    }
    return holder;
  }

  /** A flat decal on a side wall (claw marks, pencil, picture ghosts). */
  function wallDecal(side, z, y, w, h, material, out = 0.006) {
    const sign = side === 'left' ? 1 : -1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set((side === 'left' ? LEFT_X : RIGHT_X) + sign * out, y, z);
    mesh.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    group.add(mesh);
    return mesh;
  }

  const decalMaterial = (map, extra = {}) => new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    ...extra
  });

  const pictureMat = (map, roughness = 0.9) => new THREE.MeshStandardMaterial({ map, roughness });

  // ---------- the pieces -----------------------------------------------------
  const art = {
    clipping: createClippingArt(HALLWAY.clipping.art),
    blueprint: createBlueprintArt(HALLWAY.blueprint.art),
    note: createHallNoteArt(HALLWAY.note.art),
    heightMarks: createHeightMarksArt(HALLWAY.heightMarks.art),
    mirror: createShatteredMirrorArt(),
    paleMarks: createPaleMarksArt([[0.06, 0.22, 0.34, 0.5], [0.52, 0.12, 0.42, 0.62]]),
    frameBack: createFrameBackArt(HALLWAY.frameBack.art),
    plaque: createPlaqueArt(HALLWAY.house.plaque)
  };

  /** Reading a piece: the story text, and its picture if it has one. */
  const inspect = (piece, pieceArt, fullscreen = false) => {
    const subject = piece.title.replace(/^An? /, 'the ');
    return {
      label: `Look at ${subject.charAt(0).toLowerCase()}${subject.slice(1)}`,
      onInteract: () => onInspect({ title: piece.title, body: piece.body, art: pieceArt, fullscreen })
    };
  };

  // The house, in gilt, over the hall table, with its brass plate.
  const houseTex = loadTexture(houseSepiaUrl, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  houseTex.repeat.set(1, 0.86);
  houseTex.offset.set(0, 0.07);
  const houseFrame = makeFrame({ innerW: 0.58, innerH: 0.5, border: 0.075, depth: 0.035, picture: pictureMat(houseTex, 0.92), mount: 0.05 });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0375), new THREE.MeshStandardMaterial({ map: art.plaque.texture, metalness: 0.6, roughness: 0.35 }));
  plaque.position.set(0, -houseFrame.userData.outer.h / 2 + 0.045, 0.04);
  houseFrame.add(plaque);
  hangFrame(houseFrame, 'left', 1.9, 1.72, inspect(HALLWAY.house, { toImageUrl: async () => houseSepiaUrl }));

  // The clipping, opposite, in a plain black frame.
  hangFrame(
    makeFrame({ innerW: 0.46, innerH: 0.626, border: 0.032, depth: 0.022, frameMaterial: blackFrameMat, picture: pictureMat(art.clipping.texture), glass: true }),
    'right', 2.1, 1.62, inspect(HALLWAY.clipping, art.clipping, true)
  );

  // The mirror: tall, gilt, struck. It sits on the dado rail rather than a cord.
  {
    const mirrorGlass = new THREE.MeshStandardMaterial({
      map: art.mirror.colour.texture,
      roughnessMap: art.mirror.roughness.texture,
      roughness: 1,
      metalness: 0.55
    });
    const mirror = makeFrame({ innerW: 0.6, innerH: 1.28, border: 0.085, depth: 0.04, picture: mirrorGlass, glass: false });
    const holder = new THREE.Group();
    holder.position.set(LEFT_X + 0.03, DADO_HEIGHT + 0.03 + mirror.userData.outer.h / 2, 3.75);
    holder.rotation.y = Math.PI / 2;
    holder.add(mirror);
    group.add(holder);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(mirror.userData.outer.w, mirror.userData.outer.h, 0.1), HITBOX_MATERIAL);
    hit.position.z = 0.05;
    hit.userData.interact = inspect(HALLWAY.mirror, art.mirror.colour);
    holder.add(hit);
    interactables.push(hit);
    // Pieces of it on the floor underneath, where they fell.
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x9aa6a2, metalness: 0.8, roughness: 0.15 });
    const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    for (let i = 0; i < 14; i++) {
      const size = 0.015 + rand() * 0.05;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0, size, 0, size * (rand() - 0.2), size * (rand() - 0.5), 0, size
      ], 3));
      geometry.computeVertexNormals();
      const shard = new THREE.Mesh(geometry, shardMat);
      shard.material.side = THREE.DoubleSide;
      shard.position.set(LEFT_X + 0.08 + rand() * 0.5, 0.004, 3.75 + (rand() - 0.5) * 0.9);
      shard.rotation.y = rand() * Math.PI * 2;
      group.add(shard);
    }
  }

  // The nursery door's frame, and the heights up the wall beside it.
  {
    // On the near side of the door, under the first pendant: pencil on dark
    // damask needs all the light it can get.
    const marks = wallDecal('right', NURSERY_DOOR_Z - 0.97, HEIGHT_MARKS_SIZE.heightMetres / 2,
      HEIGHT_MARKS_SIZE.widthMetres, HEIGHT_MARKS_SIZE.heightMetres, decalMaterial(art.heightMarks.texture), 0.004);
    marks.name = 'HallwayHeightMarks';
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, HEIGHT_MARKS_SIZE.widthMetres), HITBOX_MATERIAL);
    hit.position.set(RIGHT_X - 0.05, 1.55, NURSERY_DOOR_Z - 0.97);
    hit.userData.interact = inspect(HALLWAY.heightMarks, composeHeightMarksImage(HALLWAY.heightMarks.art, wallpaperUrl));
    group.add(hit);
    interactables.push(hit);
  }

  // The blueprint, large, in a narrow oak frame.
  hangFrame(
    makeFrame({ innerW: 1.05, innerH: 0.735, border: 0.035, depth: 0.025, frameMaterial: trimMat, picture: pictureMat(art.blueprint.texture, 0.85), mount: 0.03, mountColour: 0xd9d2bf }),
    'right', 6.95, 1.66, inspect(HALLWAY.blueprint, art.blueprint, true)
  );

  // Where pictures used to hang, and one of them, face down below.
  {
    const ghosts = wallDecal('left', 8.05, 1.62, 1.2, 0.9, decalMaterial(art.paleMarks.texture), 0.004);
    ghosts.name = 'HallwayPaleMarks';
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 1.2), HITBOX_MATERIAL);
    hit.position.set(LEFT_X + 0.05, 1.62, 8.05);
    hit.userData.interact = inspect(HALLWAY.paleMarks, null);
    group.add(hit);
    interactables.push(hit);

    const fallen = makeFrame({ innerW: 0.36, innerH: 0.46, border: 0.05, depth: 0.03, picture: null, glass: false, mountColour: 0x2a2018 });
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.55), new THREE.MeshStandardMaterial({ map: art.frameBack.texture, roughness: 0.95 }));
    backing.rotation.y = Math.PI;
    backing.position.z = -0.002;
    fallen.add(backing);
    const holder = new THREE.Group();
    holder.position.set(LEFT_X + 0.42, 0.012, 7.85);
    // Face down: the back is what faces the ceiling.
    holder.rotation.set(Math.PI / 2, 0, 0.5);
    holder.add(fallen);
    group.add(holder);
    const fallenHit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.7), HITBOX_MATERIAL);
    fallenHit.position.set(LEFT_X + 0.42, 0.06, 7.85);
    fallenHit.userData.interact = inspect(HALLWAY.frameBack, art.frameBack, true);
    group.add(fallenHit);
    interactables.push(fallenHit);
  }

  // Claw gouges by the top of the stairs.
  {
    const clawTex = loadTexture(clawRipUrl, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    const claws = wallDecal('left', 10.35, 1.55, 1.3, 1.3, decalMaterial(clawTex, {
      bumpMap: clawTex, bumpScale: 0.006, color: 0xb9afa3, opacity: 0.95
    }), 0.008);
    claws.userData.interact = { label: 'Examine the wall', onInteract: () => showCaption(line('dialog_hallway_claws')) };
    interactables.push(claws);
  }

  // ---------- doors ----------------------------------------------------------
  /**
   * door.glb is the bedroom's own door: frame and leaf, 1.4 m across the
   * architrave, 2.26 m tall, built out along its local +Z from the wall. One
   * load, cloned per door. A near-black plane sits behind each so its frosted
   * glass shows a dark room instead of the wallpaper it stands against.
   */
  const doorSpots = [
    { name: 'BedroomDoor', position: [0, 0, 0.0], rotationY: 0, line: 'dialog_hallway_bedroom_door', label: 'The bedroom door' },
    { name: 'NurseryDoor', position: [RIGHT_X, 0, NURSERY_DOOR_Z], rotationY: -Math.PI / 2, line: 'dialog_hallway_locked_nursery', label: 'Try the door' },
    { name: 'BathroomDoor', position: [LEFT_X, 0, BATHROOM_DOOR_Z], rotationY: Math.PI / 2, line: 'dialog_hallway_locked_bathroom', label: 'Try the door' }
  ];
  const doorHosts = doorSpots.map((spot) => {
    const host = new THREE.Group();
    host.name = spot.name;
    host.position.set(...spot.position);
    host.rotation.y = spot.rotationY;
    group.add(host);
    if (spot.name !== 'BedroomDoor') {
      const behind = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), darkBehindMat);
      behind.position.set(0, 1.0, 0.004);
      host.add(behind);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.05, 0.25), HITBOX_MATERIAL);
    hit.position.set(0, 1.02, 0.12);
    hit.userData.interact = {
      label: spot.label,
      onInteract: () => {
        rattle(host);
        showCaption(line(spot.line));
      }
    };
    host.add(hit);
    interactables.push(hit);
    return host;
  });
  colliders.push(
    { minX: RIGHT_X - 0.26, maxX: RIGHT_X, minZ: NURSERY_DOOR_Z - 0.72, maxZ: NURSERY_DOOR_Z + 0.72 },
    { minX: LEFT_X, maxX: LEFT_X + 0.26, minZ: BATHROOM_DOOR_Z - 0.72, maxZ: BATHROOM_DOOR_Z + 0.72 }
  );
  loadModel(doorModelUrl).then((model) => {
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    doorHosts.forEach((host, index) => {
      const door = index === 0 ? model : model.clone(true);
      door.userData.leaf = door.getObjectByName('doorLeaf');
      door.userData.leafRestY = door.userData.leaf?.rotation.y ?? 0;
      host.add(door);
      host.userData.door = door;
    });
  }).catch((error) => console.error('Could not load the hallway doors:', error));

  /** A locked door shudders in its frame when tried. */
  const rattles = new Map();
  function rattle(host) {
    rattles.set(host, 0.3);
    const at = host.getWorldPosition(new THREE.Vector3());
    at.y = 1.0;
    // The bathroom door has something pushed up behind it: it gives less, and louder.
    onSfx('door_locked_rattle', { position: at, gainDb: host.name === 'BathroomDoor' ? 2 : 0 });
  }

  // ---------- the window, the storm, the radiator ---------------------------
  const windowGroup = new THREE.Group();
  windowGroup.position.set(LEFT_X, WINDOW.y, WINDOW.z);
  windowGroup.rotation.y = Math.PI / 2;
  group.add(windowGroup);
  const glassMaterial = createRainGlassMaterial();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), glassMaterial);
  glass.position.z = 0.03;
  windowGroup.add(glass);
  loadModel(windowFrameModelUrl).then((frame) => {
    frame.rotation.x = Math.PI / 2;
    frame.position.z = 0.01;
    frame.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    windowGroup.add(frame);
  }).catch((error) => console.error('Could not load the hallway window:', error));
  {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.1), HITBOX_MATERIAL);
    hit.position.z = 0.05;
    hit.userData.interact = { label: 'Look out of the window', onInteract: () => showCaption(line('dialog_hallway_window')) };
    windowGroup.add(hit);
    interactables.push(hit);
  }
  // Night outside, which the lightning lights.
  // Set in update(); linear values, so these are much darker than they read.
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), skyMat);
  sky.position.set(LEFT_X - 2.5, WINDOW.y, WINDOW.z);
  sky.rotation.y = Math.PI / 2;
  group.add(sky);
  // Streaks from just beyond the glass to the sky, the strikes lighting them
  // (world/Rain.js). A little fainter than the bedroom's: the hall is darker.
  const rain = new Rain({
    count: 800,
    origin: new THREE.Vector3(LEFT_X - 0.12, WINDOW.y - 1.9, WINDOW.z),
    out: new THREE.Vector3(-1, 0, 0),
    width: 1.4,
    depth: 2.2,
    height: 4.4,
    wind: [0.12, 0.05],
    brightness: 0.85
  });
  group.add(rain.object);

  const radiatorHost = new THREE.Group();
  radiatorHost.position.set(LEFT_X + 0.13, 0.19, WINDOW.z);
  radiatorHost.rotation.y = Math.PI / 2;
  group.add(radiatorHost);
  loadModel(radiatorModelUrl).then((radiator) => {
    radiator.rotation.x = Math.PI / 2;
    radiator.position.z = 0.06;
    radiator.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    radiatorHost.add(radiator);
  }).catch((error) => console.error('Could not load the hallway radiator:', error));
  colliders.push({ minX: LEFT_X, maxX: LEFT_X + 0.24, minZ: WINDOW.z - 0.4, maxZ: WINDOW.z + 0.4 });

  /**
   * The lightning, through the one window, as the bedroom does it: a casting
   * light whose shadow map is only re-rendered on the frame a flash starts, so
   * the window's cross is thrown across the far wall. A SpotLight far out with
   * its cone on the window and no falloff: a DirectionalLight lit the far ends
   * of the hall through its walls wherever a surface took no shadow.
   *
   * Between strikes it rests at MOONLIGHT, the night coming in through the
   * window, its map rendered once as the hall is built.
   */
  const lightning = new THREE.SpotLight(0xbcd4ff, MOONLIGHT, 0, 0.16, 0.25, 0);
  {
    const through = new THREE.Vector3(LEFT_X, WINDOW.y, WINDOW.z);
    const aim = new THREE.Vector3(HALL_W + 5, -2.8, 1.8).normalize();
    lightning.position.copy(through).addScaledVector(aim, -9);
    lightning.target.position.copy(through).addScaledVector(aim, 2.5);
  }
  lightning.castShadow = true;
  lightning.shadow.mapSize.set(1024, 1024);
  lightning.shadow.camera.near = 7;
  lightning.shadow.camera.far = 15;
  lightning.shadow.bias = -0.0006;
  lightning.shadow.autoUpdate = false;
  lightning.shadow.needsUpdate = true;
  group.add(lightning, lightning.target);

  // ---------- furniture ------------------------------------------------------
  // The hall table: the bedroom's bedside table, a size up, against the wall.
  const TABLE_Z = 1.9;
  const TABLE_SCALE = 1.25;
  const tableHost = new THREE.Group();
  tableHost.position.set(LEFT_X + 0.03 + 0.272 * TABLE_SCALE, 0, TABLE_Z);
  tableHost.rotation.y = Math.PI / 2;
  tableHost.scale.setScalar(TABLE_SCALE);
  group.add(tableHost);
  const TABLE_TOP_Y = 0.546 * TABLE_SCALE;
  loadModel(tableModelUrl).then((table) => {
    table.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    tableHost.add(table);
  }).catch((error) => console.error('Could not load the hall table:', error));
  colliders.push({ minX: LEFT_X, maxX: LEFT_X + 0.03 + 0.55 * TABLE_SCALE, minZ: TABLE_Z - 0.35 * TABLE_SCALE, maxZ: TABLE_Z + 0.35 * TABLE_SCALE });

  // A lamp on it, switched off: the pendant is the hall's one light now.
  const lampHost = new THREE.Group();
  lampHost.position.set(LEFT_X + 0.22, TABLE_TOP_Y, TABLE_Z - 0.18);
  group.add(lampHost);
  loadModel(lampModelUrl).then((lamp) => {
    lamp.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = true;
    });
    lampHost.add(lamp);
  }).catch((error) => console.error('Could not load the hall lamp:', error));
  {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.26), HITBOX_MATERIAL);
    hit.position.set(0, 0.25, 0);
    hit.userData.interact = { label: 'The lamp', onInteract: () => showCaption(line('dialog_hallway_lamp')) };
    lampHost.add(hit);
    interactables.push(hit);
  }

  // The note, on the table in front of the lamp, angled to whoever comes out.
  {
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.2),
      new THREE.MeshStandardMaterial({ map: art.note.texture, roughness: 0.95 })
    );
    note.rotation.set(-Math.PI / 2, 0, 0.35 - Math.PI / 2);
    note.position.set(LEFT_X + 0.3, TABLE_TOP_Y + 0.003, TABLE_Z + 0.12);
    note.receiveShadow = true;
    group.add(note);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.28), HITBOX_MATERIAL);
    hit.position.set(LEFT_X + 0.3, TABLE_TOP_Y + 0.03, TABLE_Z + 0.12);
    hit.userData.interact = { label: 'Read the note', onInteract: () => onInspect({ title: HALLWAY.note.title, body: HALLWAY.note.body, art: art.note }) };
    group.add(hit);
    interactables.push(hit);
  }

  // A chair against the right wall, where someone sat and waited.
  const chairHost = new THREE.Group();
  chairHost.position.set(RIGHT_X - 0.3, 0, 9.4);
  chairHost.rotation.y = -Math.PI / 2;
  group.add(chairHost);
  loadModel(chairModelUrl).then((chair) => {
    chair.rotation.x = Math.PI / 2;
    chair.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    chairHost.add(chair);
    chairHost.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(chairHost);
    chairHost.position.y += -bounds.min.y + 0.002;
  }).catch((error) => console.error('Could not load the hall chair:', error));
  colliders.push({ minX: RIGHT_X - 0.55, maxX: RIGHT_X, minZ: 9.15, maxZ: 9.65 });

  // Two of the bedroom's rugs as runners down the boards.
  for (const [z, angle] of [[2.9, 0.03], [7.4, -0.02]]) {
    const rugHost = new THREE.Group();
    rugHost.position.set(0.05, 0.002, z);
    rugHost.rotation.y = Math.PI / 2 + angle;
    rugHost.scale.setScalar(0.62);
    group.add(rugHost);
    loadModel(rugModelUrl).then((rug) => {
      rug.traverse((child) => { if (child.isMesh) child.receiveShadow = true; });
      rugHost.add(rug);
    }).catch((error) => console.error('Could not load a hallway rug:', error));
  }

  // A balled-up page under the table, from a note that was started again.
  loadModel(paperBallModelUrl).then((ball) => {
    ball.position.set(LEFT_X + 0.62, 0.032, TABLE_Z + 0.42);
    ball.traverse((child) => { if (child.isMesh) child.castShadow = true; });
    group.add(ball);
  }).catch(() => {});

  // ---------- the staircase down ---------------------------------------------
  {
    const treadMat = woodMat;
    const carpetMat = new THREE.MeshStandardMaterial({ color: 0x4a1612, roughness: 0.95 });
    const rodMat = brassMat;
    for (let i = 0; i < STEP_COUNT; i++) {
      const top = -(i + 1) * STEP_RISE;
      const z0 = HALL_LEN + i * STEP_RUN;
      const step = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, STEP_RISE, STEP_RUN), treadMat);
      step.position.set(0, top - STEP_RISE / 2, z0 + STEP_RUN / 2);
      step.receiveShadow = true;
      group.add(step);
      // A worn runner held down by brass stair rods.
      const tread = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.008, STEP_RUN), carpetMat);
      tread.position.set(0, top + 0.004, z0 + STEP_RUN / 2);
      group.add(tread);
      const riser = new THREE.Mesh(new THREE.BoxGeometry(1.1, STEP_RISE, 0.008), carpetMat);
      riser.position.set(0, top + STEP_RISE / 2, z0 - 0.004);
      group.add(riser);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1.2, 8), rodMat);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, top + 0.012, z0 + 0.02);
      group.add(rod);
    }
    // The handrail, on brackets down the right-hand wall.
    const railLength = Math.hypot(STEP_COUNT * STEP_RUN, STEP_COUNT * STEP_RISE) + 0.5;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, railLength, 12), trimMat);
    const slope = Math.atan2(STEP_COUNT * STEP_RISE, STEP_COUNT * STEP_RUN);
    rail.rotation.x = Math.PI / 2 + slope;
    rail.position.set(RIGHT_X - 0.07, 0.9 + STAIR_BOTTOM_Y / 2, HALL_LEN + (STEP_COUNT * STEP_RUN) / 2);
    group.add(rail);
    // The newel post at the top, which the eye catches first.
    const newel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.1, 0.11), trimMat);
    newel.position.set(RIGHT_X - 0.1, 0.55, HALL_LEN - 0.06);
    group.add(newel);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), trimMat);
    cap.position.set(RIGHT_X - 0.1, 1.17, HALL_LEN - 0.06);
    group.add(cap);
    // Walked, not clicked: groundAt() below takes the player down the treads,
    // and stepping through the turn into the passage is the way on (update()).
    // The wall at the far end of the landing stops them walking past the turn.
    colliders.push({ minX: LEFT_X, maxX: RIGHT_X, minZ: WELL_END_Z - 0.08, maxZ: WELL_END_Z + 0.2 });
    // The passage's own two walls, out to where it is lost in the dark.
    colliders.push(
      { minX: RIGHT_X, maxX: RIGHT_X + PASSAGE_LEN + 0.3, minZ: TURN.z - TURN.w / 2 - 0.2, maxZ: TURN.z - TURN.w / 2 + 0.04 },
      { minX: RIGHT_X, maxX: RIGHT_X + PASSAGE_LEN + 0.3, minZ: TURN.z + TURN.w / 2 - 0.04, maxZ: TURN.z + TURN.w / 2 + 0.2 },
      { minX: RIGHT_X + PASSAGE_LEN, maxX: RIGHT_X + PASSAGE_LEN + 0.3, minZ: TURN.z - TURN.w / 2, maxZ: TURN.z + TURN.w / 2 }
    );
  }

  /**
   * The floor under (x, z): the hall at 0, down the stairs as an even ramp
   * (PointerLockPlayer eases the eye onto it, so it still reads as steps), the
   * landing and the passage at the foot.
   */
  function groundAt(wx, wz) {
    const x = wx - origin.x;
    const z = wz - origin.z;
    if (x > RIGHT_X) return STAIR_BOTTOM_Y;
    if (z <= HALL_LEN) return 0;
    if (z >= STAIR_END_Z) return STAIR_BOTTOM_Y;
    return -((z - HALL_LEN) / STEP_RUN) * STEP_RISE;
  }
  /** This far into the passage and the player has gone down to the basement. */
  const PASSAGE_EXIT_X = RIGHT_X + 1.0;

  let stairsReached = false;
  /** Fires onReachStairs the first time the player walks up to the top step, in the hall itself. */
  function checkStairsReached(playerPosition) {
    if (stairsReached || !playerPosition) return;
    const x = playerPosition.x - origin.x;
    const z = playerPosition.z - origin.z;
    if (x < LEFT_X || x > RIGHT_X || z < HALL_LEN - STAIRS_TRIGGER_DISTANCE || z > HALL_LEN) return;
    stairsReached = true;
    onReachStairs();
  }

  let leaving = false;
  function goDown() {
    if (leaving) return;
    leaving = true;
    showCaption(line('dialog_hallway_go_down'));
    onExit();
  }

  // ---------- light ----------------------------------------------------------
  // The bedroom's ambient, so the two rooms sit at the same exposure.
  const ambient = new THREE.AmbientLight(0x2e3342, 0.31);
  group.add(ambient);

  /**
   * One ceiling light, the bedroom's pendant, halfway down the hall. It has to
   * reach both ends on its own, so it throws further than the bedroom's; the
   * table lamp warms the bedroom end and the cold glow from the passage marks
   * the stairs. It casts, and it is failing -- the "unstable electricity" the
   * storyline describes, so the hall dips into the dark now and then.
   */
  const pendants = [
    // Dead centre of the hall, the one hanging light.
    { z: HALL_LEN / 2, intensity: 1.15, casts: true, failing: true, decay: 1.45, distance: 9.5 }
  ].map((spec) => {
    const anchor = new THREE.Group();
    anchor.position.set(0, HALL_H - 0.0225, spec.z);
    group.add(anchor);
    const light = new THREE.PointLight(0xffb347, spec.intensity, spec.distance ?? 7.5, spec.decay ?? 1.6);
    light.position.y = -0.5;
    if (spec.casts) {
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = 0.08;
      light.shadow.camera.far = 10;
      light.shadow.bias = -0.0015;
    }
    anchor.add(light);
    // The glass's own glow, so cutting the light darkens the fitting too.
    const glows = [];
    loadModel(pendantModelUrl).then((model) => {
      const broken = model.getObjectByName('PendantBroken');
      if (broken) broken.visible = false;
      model.traverse((child) => {
        if (!child.isMesh) return;
        const isGlass = /Glass|Bulb/.test(child.material?.name ?? '');
        child.castShadow = !isGlass;
        child.receiveShadow = !isGlass;
        if (isGlass && child.material.emissive) {
          child.material = child.material.clone();
          glows.push({ material: child.material, base: child.material.emissiveIntensity });
        }
      });
      anchor.add(model);
    }).catch((error) => console.error('Could not load a hallway pendant:', error));
    return { light, base: spec.intensity, failing: spec.failing, glows };
  });

  /**
   * The way on has to be readable from the far end of the hall, and it must
   * not look like a dead end. The cold light -- the colour of the lab's strip
   * lights -- is round the corner, inside the passage, so what the player sees
   * from the top is light spilling OUT of a doorway onto the landing, which
   * says "this goes somewhere" far better than a lit wall facing them did.
   */
  // Set well back from the doorway, so the passage wall the player can see
  // falls off toward them instead of being lit flat like a card.
  // Brighter than it would need to be with a light over the stairs: with the
  // hall down to one pendant, this is what shows the way down.
  const BELOW_GLOW = 3.2;
  const belowGlow = new THREE.PointLight(0x7f97a8, BELOW_GLOW, 6.2, 1.7);
  belowGlow.position.set(RIGHT_X + 1.05, STAIR_BOTTOM_Y + 1.7, TURN.z);
  group.add(belowGlow);

  /**
   * Where Annabelle is: down the stairs, round the turn, at the far end of the
   * passage the stairs lead to -- where the player has to go. Nothing is there
   * to see; this is only where the singing comes from (AudioDirector). Below
   * the hall and off to the right of it, so from the top it is plainly coming
   * up the stairs, and it grows the whole way down to her.
   */
  const singingAnchor = new THREE.Object3D();
  singingAnchor.name = 'AnnabelleSinging';
  singingAnchor.position.set(RIGHT_X + PASSAGE_LEN, STAIR_BOTTOM_Y + 1.45, TURN.z);
  group.add(singingAnchor);

  /** The window's pane, where the rain against the glass is heard from (AudioDirector). */
  const windowAnchor = new THREE.Object3D();
  windowAnchor.name = 'RainOnGlass';
  windowAnchor.position.set(LEFT_X, WINDOW.y, WINDOW.z);
  group.add(windowAnchor);

  // ---------- update -----------------------------------------------------------
  let elapsed = 0;
  let nextFlashIn = 4 + Math.random() * 5;
  let flashTime = -1;
  const FLASH_SECONDS = 0.42;
  let flickerTimer = 0;
  let flickerLevel = 1;
  /** Set while the hall's light is cut (main.js's rush): pendant, glow and storm dark. */
  let lightsOut = false;

  // Into place: see `origin`. Every collider is a plain world-space box, so it
  // moves with the group here, once (the doorway plug among them).
  group.position.set(origin.x, 0, origin.z);
  for (const c of colliders) {
    c.minX += origin.x; c.maxX += origin.x;
    c.minZ += origin.z; c.maxZ += origin.z;
  }

  // Everything the window's light reaches takes its shadow (world/windowLight.js).
  takeWindowShadows(group, lightning, { except: [ceiling] });

  return {
    group,
    interactables,
    colliders,
    spawn: [origin.x, origin.z + 0.95],
    // Facing down the hall, +Z, away from the bedroom door.
    spawnYaw: Math.PI,
    refs: {
      lightning, pendants, glassMaterial, singingAnchor, windowAnchor,
      /** Its ambient, which main.js dims while the bedroom is the room being lit. */
      ambient,
      /** Cut the hall's light (true) or give it back (false). */
      setLightsOut(out) { lightsOut = !!out; },
      /** Where something standing at the far end of the hall stands: just short of the stairs. */
      farEnd: { x: origin.x, z: origin.z + HALL_LEN - 0.6 },
      /** The doorway, world space: the bedroom door. */
      doorway: { x: origin.x, z: origin.z },
      /** The yaw that looks straight down the stairs (+Z). */
      stairsYaw: Math.PI,
      /** The hall's side walls, world x, so a scripted figure or lens stays inside them. */
      wallX: { left: origin.x + LEFT_X, right: origin.x + RIGHT_X },
      /**
       * Open (true): the doorway's collider, its black card and the hall's own
       * copy of the bedroom door are taken away, because the real bedroom and its
       * real, open door are on the other side. Closed (false) puts them back.
       */
      setDoorwayOpen(open) {
        const i = colliders.indexOf(doorwayPlug);
        if (open && i >= 0) colliders.splice(i, 1);
        if (!open && i < 0) colliders.push(doorwayPlug);
        if (doorwayBehind) doorwayBehind.visible = !open;
        const bedroomDoor = doorHosts.find((h) => h.name === 'BedroomDoor');
        if (bedroomDoor) bedroomDoor.visible = !open;
      }
    },

    groundAt,

    reset() {
      leaving = false;
      stairsReached = false;
      lightsOut = false;
      rattles.clear();
      flashTime = -1;
      nextFlashIn = 4 + Math.random() * 5;
    },

    update(dt, playerPosition) {
      elapsed += dt;
      if (playerPosition && playerPosition.x - origin.x > PASSAGE_EXIT_X) goDown();
      checkStairsReached(playerPosition);
      rain.update(dt);
      glassMaterial.uniforms.uTime.value = elapsed;

      // Lightning: a double flicker, then dark for a while. Not while the
      // lights are cut: the storm goes too, and the first flash after it waits
      // a couple of seconds, so the light coming back is its own beat.
      nextFlashIn = lightsOut ? Math.max(nextFlashIn - dt, 2) : nextFlashIn - dt;
      if (flashTime < 0 && nextFlashIn <= 0) {
        flashTime = 0;
        lightning.shadow.needsUpdate = true;
        onLightning();
      }
      let flash = 0;
      if (flashTime >= 0) {
        flashTime += dt;
        const t = flashTime / FLASH_SECONDS;
        flash = t < 0.18 ? t / 0.18 : t < 0.32 ? 0.35 : t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55);
        if (flashTime >= FLASH_SECONDS) {
          flashTime = -1;
          flash = 0;
          nextFlashIn = 6 + Math.random() * 9;
        }
      }
      if (lightsOut) flash = 0;   // one already under way when they went
      // The moon goes with the lights, as the storm does: the blackouts are dark.
      lightning.intensity = (lightsOut ? 0 : MOONLIGHT) + flash * 3.0;
      glassMaterial.uniforms.uFlash.value = flash;
      rain.setFlash(flash);
      skyMat.color.setRGB(0.002 + flash * 0.35, 0.003 + flash * 0.4, 0.006 + flash * 0.55);

      // The pendant is failing, but it is the only light: it hums near full
      // and dips now and then, rather than strobing the whole hall.
      flickerTimer -= dt;
      if (flickerTimer <= 0) {
        flickerTimer = 0.06 + Math.random() * 0.25;
        flickerLevel = Math.random() < 0.035 ? 0.3 + Math.random() * 0.3 : 0.9 + Math.random() * 0.1;
      }
      for (const pendant of pendants) {
        pendant.light.intensity = lightsOut ? 0 : pendant.base * (pendant.failing ? flickerLevel : 1);
        for (const g of pendant.glows) g.material.emissiveIntensity = lightsOut ? 0 : g.base;
      }
      belowGlow.intensity = lightsOut ? 0 : BELOW_GLOW;

      // Tried doors shudder and settle.
      for (const [host, remaining] of rattles) {
        const left = remaining - dt;
        const door = host.userData.door;
        const leaf = door?.userData.leaf;
        const restY = door?.userData.leafRestY ?? 0;
        if (left <= 0) {
          rattles.delete(host);
          if (leaf) leaf.rotation.y = restY;
          continue;
        }
        rattles.set(host, left);
        if (leaf) leaf.rotation.y = restY + Math.sin(left * 60) * 0.012 * (left / 0.3);
      }
    }
  };
}
