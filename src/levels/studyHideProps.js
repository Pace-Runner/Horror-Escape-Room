import * as THREE from 'three';
import { hingeMotion } from './studyPuzzlePresentation.js';
import { STUDY_RUG } from './studyHeroPresentation.js';
import { line } from '../dialogue/index.js';
import chesterfieldUrl from '../assets/models/study/study_chesterfield.glb?url';
import wardrobeUrl from '../assets/models/study/study_wardrobe.glb?url';
import screenUrl from '../assets/models/study/study_folding_screen.glb?url';
import curtainUrl from '../assets/models/study/study_curtain.glb?url';
import sheetsUrl from '../assets/models/study/study_dust_sheets.glb?url';
import booksUrl from '../assets/models/study/study_books.glb?url';
import bottleUrl from '../assets/models/study/study_bottle.glb?url';

/**
 * WHERE MARK HIDES: the study's cover and hide spots for the hide-and-seek.
 *
 * Two kinds of thing:
 *
 *   COVER     something to put between you and her. `height` is what it
 *             hides: StudySeeker tests it against the point of you she would
 *             see -- about your eyes -- so LOW cover (the Chesterfield, the
 *             sheeted armchair and sofa) only hides you crouched, and TALL
 *             cover (the folding screen, the sheeted cabinet) hides you
 *             standing.
 *   HIDE SPOT somewhere to be INSIDE: the wardrobe (E in, E out, a peek
 *             through the gap between its doors) and behind the two curtains
 *             at the window wall. She cannot see into one -- but she may come
 *             and look, and if she looks where you are she finds you.
 *
 * THE MODELS are blender/study/build_*.py (docs/LEVEL3_HIDE_AND_SEEK.md): the
 * wardrobe, the folding screen, the curtains and the dust sheets -- and
 * import_chesterfield.py, Poly Haven's "Sofa 02" made into a Chesterfield. Their sizes
 * were built to the boxes below, which are the CONTRACT -- the colliders,
 * cover heights and hide-spot volumes are what the seeker and
 * scripts/check-study-seeker.mjs reason about, so a model never moves them.
 * Each model loads once and every placement is a clone that shares its
 * geometry and materials.
 *
 * TWO THINGS MOVE, both on `spot.disturb(strength)` (main.js calls it):
 *   the wardrobe's doors swing open and shut -- Mark getting in or out, or
 *     her opening it to look; and
 *   a curtain's four strips sway out and settle -- Mark stepping behind it,
 *     or her pulling it back.
 *
 * Coordinates are the room's (the level sits at the world origin): x -8..8,
 * z -6.5..6.5, the loft floor at loftY over z < -0.7.
 */

/** How far the wardrobe's doors swing (radians), and how long they take. */
const DOOR_SWING = 1.75;
const DOOR_SECONDS = 0.32;
/** A curtain strip's largest sway, radians: at 5.7 m long this is about 13 cm at the hem. */
const CURTAIN_SWAY = 0.022;
/** Outer strips move less than the middle ones, so no gap opens between them. */
const STRIP_WEIGHT = [0.7, 1, 1, 0.7];

/**
 * @param {object} deps
 * @param {THREE.Group} deps.group
 * @param {object[]} deps.colliders - the study's, by reference
 * @param {object[]} deps.interactables - the study's, by reference
 * @param {number} deps.loftY
 * @param {(url: string) => Promise<THREE.Object3D>} [deps.loadModel] - the study's loader (harmonised)
 * @param {(spot: object) => void} [deps.onEnterHideSpot] - E on the wardrobe
 */
export function createStudyHideProps({
  group, colliders, interactables, loftY,
  loadModel = () => new Promise(() => {}), onEnterHideSpot = () => {}
}) {
  const root = new THREE.Group();
  root.name = 'Study_Hide_Props';
  group.add(root);

  const cover = [];
  const hideSpots = [];
  const motions = [];
  const resets = [];
  const loads = new Map();

  /** A collider and a cover box, on one footprint. */
  function solid(name, minX, maxX, minZ, maxZ, floorY, height, { blocksSight = true } = {}) {
    colliders.push({ minX, maxX, minZ, maxZ, minY: floorY, maxY: floorY + height });
    if (blocksSight) cover.push({ name, minX, maxX, minZ, maxZ, floorY, height });
  }

  /** One load per model; `pick` takes the part wanted (a node by name, or the whole scene). */
  function place(url, name, x, y, z, yaw, { pick = null, onModel = null } = {}) {
    const holder = new THREE.Group();
    holder.name = name;
    holder.position.set(x, y, z);
    holder.rotation.y = yaw;
    root.add(holder);
    if (!loads.has(url)) loads.set(url, loadModel(url));
    loads.get(url).then((model) => {
      const source = pick ? model.getObjectByName(pick) : model;
      if (!source) throw new Error(`${pick} is not in ${url}`);
      const copy = source.clone(true);
      copy.position.set(0, 0, 0);
      holder.add(copy);
      onModel?.(copy);
    }).catch((error) => console.warn(`Study hide prop ${name} could not load:`, error));
    return holder;
  }

  // ------------------------------------------------------ the Chesterfield
  // Low cover in the open front half, its back to the crest: crouch behind it.
  // Poly Haven's "Sofa 02", scaled to 0.9 m tall so that it hides the point
  // of a crouching Mark she would see (import_chesterfield.py); this box is
  // the model's own footprint. It faces -Z as it comes: into the room here.
  {
    const cx = -3.0, cz = 3.7, w = 2.292, d = 1.037, h = 0.9;
    place(chesterfieldUrl, 'Study_Chesterfield', cx, 0, cz, 0);
    solid('chesterfield', cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, 0, h);
  }

  // ---------------------------------------------------- the folding screen
  // Tall cover on the rug, toward its corner nearest the fireplace: halfway
  // from the rug's middle to that corner, turned 45 degrees so its face looks
  // diagonally into the room (Kiran, 2026-10-28). Not by the stair: the mirror
  // reveal's camera walks that way (studyMirrorRoute). The model runs along X,
  // so a turn of PI/4 runs it along (1, -1) and faces it to (+x, +z); its two
  // faces are alike. A diagonal in a world of upright boxes: it is collided,
  // and hides, as a chain of small boxes along it, overlapping far enough
  // that she cannot see through the joins.
  {
    const cornerX = STUDY_RUG.x - STUDY_RUG.width / 2;
    const cornerZ = STUDY_RUG.z - STUDY_RUG.depth / 2;
    const cx = (STUDY_RUG.x + cornerX) / 2, cz = (STUDY_RUG.z + cornerZ) / 2;
    place(screenUrl, 'Study_Folding_Screen', cx, 0, cz, Math.PI / 4);
    for (const along of [-0.68, -0.23, 0.23, 0.68]) {
      const x = cx + along * Math.SQRT1_2, z = cz - along * Math.SQRT1_2;
      solid('screen', x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0, 1.78);
    }
  }

  // ------------------------------------------------------- the wardrobe
  // Against the back wall under the loft, between the shelves and the mirror's
  // left-hand sconce, its back 5 mm off the wall and its crest under the loft.
  // NOT the front wall: the Project HOLLOW map hangs there (x 2.6 to 6.8).
  // The model faces -Z as it comes; half a turn faces it into the room.
  {
    const cx = 2.85, w = 1.2, d = 0.6, h = 2.1;
    const backZ = -6.495;
    const cz = backZ + d / 2;
    let doors = null;
    let openFor = 0;
    const wardrobe = {
      id: 'wardrobe', kind: 'wardrobe', floorY: 0,
      /** Where she stands to open it, and where Mark steps out. */
      checkPoint: [cx, cz + d / 2 + 0.7],
      exitAt: [cx, cz + d / 2 + 0.6],
      exitYaw: Math.PI,
      /**
       * Mark's eye inside, looking out through the slit: the doors face +Z,
       * which is yaw PI. 15 cm behind the doors, so the slit is about 15
       * degrees of the room, swept by the look bounds (main.js).
       */
      eye: [cx, 0, cz + 0.12],
      yaw: Math.PI,
      collider: { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: 0, maxY: h + 0.09 },
      /** The doors open, stay open a moment longer the harder it is, and swing shut. */
      disturb(strength = 1) { openFor = Math.max(openFor, 0.35 + 0.6 * strength); },
      /** Held open (a catch inside: she has flung them wide), or let go. */
      holdOpen(on) { openFor = on ? Infinity : 0; }
    };
    place(wardrobeUrl, 'Study_Wardrobe', cx, 0, cz, Math.PI, {
      onModel: (model) => {
        const left = model.getObjectByName('Door_L');
        const right = model.getObjectByName('Door_R');
        if (left && right) doors = hingeMotion([[left, 1], [right, -1]], 'y', DOOR_SWING, DOOR_SECONDS);
      }
    });
    motions.push((dt) => {
      if (!doors) return;
      doors.update(dt, openFor > 0);
      openFor = Math.max(0, openFor - dt);
    });
    resets.push(() => { openFor = 0; doors?.reset(); });
    colliders.push(wardrobe.collider);
    cover.push({ name: 'wardrobe', minX: wardrobe.collider.minX, maxX: wardrobe.collider.maxX,
      minZ: wardrobe.collider.minZ, maxZ: wardrobe.collider.maxZ, floorY: 0, height: h });
    hideSpots.push(wardrobe);

    const hit = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.2, 0.2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.set(cx, h / 2, cz + d / 2 + 0.1);
    hit.userData.hintKey = 'l3_hide';
    hit.userData.interact = { label: 'Hide in the wardrobe', onInteract: () => onEnterHideSpot(wardrobe) };
    root.add(hit);
    interactables.push(hit);
    wardrobe.hit = hit;
  }

  // ------------------------------------------------------- the curtains
  // Floor-length, hung beside the two front casements (the third, at z 0.9,
  // would cover the portrait). Stand between one and the wall and the room
  // cannot see you; she can still pull it back.
  {
    const curtainX = -7.32;
    const rodY = 5.75;
    for (const [index, zc] of [3.1, 5.3].entries()) {
      const z0 = zc - 0.95, z1 = zc - 0.05;
      let strips = [];
      let energy = 0;
      let time = index * 1.7;
      // The model hangs along X; a quarter turn hangs it along the wall.
      place(curtainUrl, `Study_Curtain_${index}`, curtainX, 0, (z0 + z1) / 2, Math.PI / 2, {
        onModel: (model) => {
          strips = [0, 1, 2, 3].map((i) => model.getObjectByName(`Strip_${i}`)).filter(Boolean);
        }
      });
      motions.push((dt) => {
        if (energy <= 1e-4) return;
        time += dt;
        energy *= Math.exp(-dt * 1.4);
        strips.forEach((strip, i) => {
          strip.rotation.x = CURTAIN_SWAY * energy * STRIP_WEIGHT[i] * Math.sin(time * 2.4 + i * 0.3);
        });
      });
      resets.push(() => { energy = 0; for (const strip of strips) strip.rotation.x = 0; });
      // Cloth hides you but does not stop you: no collider, only sight.
      cover.push({ name: `curtain${index}`, minX: curtainX - 0.04, maxX: curtainX + 0.04, minZ: z0, maxZ: z1, floorY: 0, height: rodY });
      hideSpots.push({
        id: `curtain${index}`, kind: 'curtain', floorY: 0,
        checkPoint: [curtainX + 0.75, (z0 + z1) / 2],
        contains: (x, z, groundY) => groundY < 0.5 && x < curtainX - 0.04 && z > z0 + 0.05 && z < z1 - 0.05,
        disturb(strength = 1) { energy = Math.min(1, energy + strength); }
      });
    }
  }

  // ------------------------------------------------- dust-sheeted furniture
  // Cloth simulated over the furniture shapes (build_dust_sheets.py). Two
  // low, one tall; two of them on the loft, where the second hunt begins.
  // Each faces into the room. The pooled hems are drawn, not collided with.
  function sheeted(name, cx, cz, floorY, w, d, h) {
    place(sheetsUrl, `Study_${name}`, cx, floorY, cz, Math.PI, { pick: name });
    const hw = w * 0.56, hd = d * 0.56;
    solid(name, cx - hw, cx + hw, cz - hd, cz + hd, floorY, h);
  }
  sheeted('Sheet_Armchair', 2.6, -3.2, 0, 0.9, 0.9, 1.0);
  sheeted('Sheet_Sofa', -2.4, -4.7, loftY, 1.9, 0.85, 0.9);
  sheeted('Sheet_Cabinet', 2.6, -1.6, loftY, 0.9, 0.6, 1.8);

  return {
    root,
    cover,
    hideSpots,
    wardrobe: hideSpots.find((spot) => spot.kind === 'wardrobe'),
    update(dt) {
      const step = Math.max(0, Math.min(dt, 0.1));
      for (const motion of motions) motion(step);
    },
    reset() {
      for (const reset of resets) reset();
    }
  };
}

/**
 * WHAT MARK THROWS: piles of hardbacks and a couple of glass bottles, where a
 * hand can find them in the dark. Pick one up (one book and one bottle at a
 * time) and left click throws it where you aim; she goes to where it LANDS.
 * main.js does the throw and the noise; this is only where they lie.
 *
 * The books are blender/study/build_books.py's four covers; the piles take
 * them in turn; the bottle is import_bottle.py's (Poly Haven's Bordeaux).
 * `bookTemplate` and `glassTemplate` are one of each, for world/itemMeshes.js,
 * so the thing in the hand and the thing on the floor are the same model. Each
 * pile's items are empty groups until the models are in, so taking one works
 * the same either way.
 *
 * Piles rather than books pulled from the shelves: the shelf dressing is
 * generated per bay (studyDecor.js), and a loose pile can sit anywhere without
 * having to agree with it.
 */
export function createStudyThrowables({ group, interactables, loftY,
  loadModel = () => new Promise(() => {}), canTake = () => true, onTake = () => {}, showCaption = () => {} }) {
  const root = new THREE.Group();
  root.name = 'Study_Throwables';
  group.add(root);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const piles = [];
  const books = loadModel(booksUrl).then((model) => [0, 1, 2, 3].map((k) => {
    const book = model.getObjectByName(`Book_${k}`);
    if (!book) throw new Error(`Book_${k} is not in ${booksUrl}`);
    return book;
  }));
  books.catch((error) => console.warn('Study books could not load:', error));
  const bottle = loadModel(bottleUrl).then((model) => {
    const node = model.getObjectByName('Bottle');
    if (!node) throw new Error(`Bottle is not in ${bottleUrl}`);
    return node;
  });
  bottle.catch((error) => console.warn('Study bottle could not load:', error));

  function pile(kind, x, y, z, count, yaw = 0) {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.rotation.y = yaw;
    root.add(holder);
    const items = [];
    for (let i = 0; i < count; i++) {
      const item = new THREE.Group();
      if (kind === 'book') {
        // Lying flat, each one turned a little on the one under it. Laid on
        // its side the book runs from its foot back along -X; this centres it
        // on the pile, after the turn.
        const turn = i * 0.4 - 0.2;
        const cover = (i + Math.round(Math.abs(x) * 3)) % 4;
        item.rotation.set(0, turn, Math.PI / 2);
        item.position.set(0.1175 * Math.cos(turn), 0.0225 + i * 0.047, -0.1175 * Math.sin(turn));
        books.then((templates) => item.add(templates[cover].clone(true))).catch(() => {});
      } else {
        // Standing: the model's origin is at its neck, the node lifted to stand it on the boards.
        item.position.set(i * 0.12, 0, 0);
        bottle.then((template) => item.add(template.clone(true))).catch(() => {});
      }
      holder.add(item);
      items.push(item);
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), hitMat);
    hit.position.set(x, y + 0.2, z);
    hit.userData.hintKey = 'l3_throw';
    const id = kind === 'book' ? 'studyBook' : 'studyGlass';
    const entry = { kind, id, holder, items, hit, count };
    hit.userData.interact = {
      label: kind === 'book' ? 'Take a book' : 'Take the bottle',
      onInteract: () => {
        const left = entry.items.filter((item) => item.visible);
        if (left.length === 0) return;
        // Three books (GameState STACKS), one bottle.
        if (!canTake(id)) {
          showCaption(line(kind === 'book' ? 'dialog_study_books_full' : 'dialog_study_bottle_carried'));
          return;
        }
        left[left.length - 1].visible = false;
        if (left.length === 1) {
          const index = interactables.indexOf(hit);
          if (index >= 0) interactables.splice(index, 1);
        }
        onTake(id);
      }
    };
    root.add(hit);
    interactables.push(hit);
    piles.push(entry);
    return entry;
  }

  // Ground floor: by the Chesterfield, by Annabelle's chair (where a sedated
  // Mark comes round), and under the loft on the right. The loft: by the
  // archive, where the second hunt begins, and by the breaker.
  pile('book', -1.6, 0, 3.9, 2, 0.3);
  pile('book', -4.9, 0, -3.3, 2, -0.5);
  pile('book', 5.2, 0, 0.6, 1, 1.1);
  pile('book', -4.15, loftY, -5.7, 2, 0.2);
  pile('book', 3.4, loftY, -4.6, 1, -0.8);
  pile('glass', -6.9, 0, 1.6, 1);
  pile('glass', 5.0, loftY, -2.2, 1);

  return {
    root,
    piles,
    /** The first cover, once loaded: the template for the book in the hand. */
    bookTemplate: books.then((templates) => templates[0]),
    /** The bottle, once loaded: the template for the one in the hand. */
    glassTemplate: bottle,
    reset() {
      for (const entry of piles) {
        for (const item of entry.items) item.visible = true;
        if (!interactables.includes(entry.hit)) interactables.push(entry.hit);
      }
    }
  };
}
