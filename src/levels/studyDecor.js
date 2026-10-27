import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createArchivePaperMaterial } from './studyArchivePresentation.js';
import { createWallSconceKit, SCONCE_WALL_OFFSET } from '../world/wallSconce.js';

/** Static, non-interactive dressing. Repeated parts are instanced after placement. */
export function createStudyDecor({ woodMaterial, brassMaterial, candles = null }) {
  const meshes = [];
  let propCount = 0;
  const boxGeometry = new RoundedBoxGeometry(1, 1, 1, 1, 0.015);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  const shadeGeometry = new THREE.CylinderGeometry(0.65, 1, 1, 16, 1, true);
  const domeGeometry = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const legGeometry = new THREE.LatheGeometry([
    [0.035, 0], [0.04, 0.025], [0.025, 0.075], [0.022, 0.43],
    [0.038, 0.49], [0.045, 0.55], [0.045, 0.57]
  ].map(([radius, height]) => new THREE.Vector2(radius, height)), 8);
  const paper = createArchivePaperMaterial();
  const wax = new THREE.MeshStandardMaterial({ color: 0xafa183, roughness: 0.98 });
  const card = new THREE.MeshStandardMaterial({ color: 0x75664e, roughness: 0.94 });
  const linen = new THREE.MeshStandardMaterial({ color: 0x96896f, roughness: 0.97, side: THREE.DoubleSide });
  const green = new THREE.MeshStandardMaterial({ color: 0x29382f, roughness: 0.82 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0x716a59, roughness: 0.68 });
  const wick = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 1 });
  const covers = [0x303729, 0x433126, 0x402a2d, 0x333c41, 0x6b604a]
    .map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.89 }));

  function prop(name) {
    const object = new THREE.Group();
    object.name = name;
    propCount++;
    return object;
  }
  function mesh(parent, geometry, material, size, position) {
    const object = new THREE.Mesh(geometry, material);
    object.scale.set(...size);
    object.position.set(...position);
    object.castShadow = false;
    object.receiveShadow = true;
    parent.add(object);
    meshes.push(object);
    return object;
  }
  const box = (parent, material, size, position) => mesh(parent, boxGeometry, material, size, position);
  const cylinder = (parent, material, radius, height, position) =>
    mesh(parent, cylinderGeometry, material, [radius, height, radius], position);
  function place(parent, object, x, y, z, yaw = 0) {
    object.position.set(x, y, z);
    object.rotation.y = yaw;
    parent.add(object);
    return object;
  }
  function book(index, flat = false, height = 0.24, thickness = 0.035) {
    const object = prop('Decor_Book');
    const body = new THREE.Group();
    body.position.y = flat ? thickness / 2 : height / 2;
    if (flat) body.rotation.z = Math.PI / 2;
    object.add(body);
    box(body, paper, [thickness - 0.007, height - 0.012, 0.153], [0, 0, -0.003]);
    for (const side of [-1, 1]) {
      box(body, covers[index % covers.length], [0.004, height, 0.17], [side * (thickness / 2 - 0.002), 0, 0]);
    }
    box(body, covers[index % covers.length], [thickness, height, 0.009], [0, 0, 0.081]);
    for (const y of [-height * 0.32, height * 0.32]) {
      box(body, card, [thickness * 0.8, 0.004, 0.001], [0, y, 0.086]);
    }
    return object;
  }
  function bundle(folder = false) {
    const object = prop(folder ? 'Decor_Unlabelled_Folder' : 'Decor_Tied_Papers');
    box(object, paper, [0.205, folder ? 0.006 : 0.027, 0.27], [0, folder ? 0.004 : 0.014, 0]);
    if (folder) {
      box(object, card, [0.22, 0.003, 0.285], [0, 0.009, -0.004]);
      box(object, card, [0.065, 0.003, 0.018], [-0.06, 0.009, -0.153]);
    } else {
      box(object, card, [0.007, 0.030, 0.274], [0.032, 0.015, 0]);
      box(object, card, [0.21, 0.030, 0.006], [0, 0.015, -0.04]);
    }
    return object;
  }
  function archiveBox() {
    const object = prop('Decor_Unlabelled_Archive_Box');
    box(object, card, [0.31, 0.20, 0.25], [0, 0.10, 0]);
    box(object, card, [0.323, 0.026, 0.263], [0, 0.20, 0]);
    box(object, paper, [0.10, 0.045, 0.001], [0, 0.12, 0.126]);
    box(object, brassMaterial, [0.055, 0.012, 0.005], [0, 0.157, 0.129]);
    return object;
  }
  function lamp(banker = false) {
    const object = prop(banker ? 'Decor_Unlit_Banker_Lamp' : 'Decor_Unlit_Desk_Lamp');
    cylinder(object, brassMaterial, 0.058, 0.018, [0, 0.009, 0]);
    cylinder(object, brassMaterial, 0.009, 0.26, [0, 0.145, 0]);
    if (banker) {
      mesh(object, domeGeometry, green, [0.14, 0.075, 0.085], [0, 0.28, 0]);
    } else {
      mesh(object, shadeGeometry, linen, [0.115, 0.14, 0.115], [0, 0.30, 0]);
    }
    return object;
  }
  /** @param {{ light?: boolean|object }} [flame] passed on to CandleFlames.add() */
  function candle(flame = {}) {
    const object = prop('Decor_Candlestick');
    cylinder(object, brassMaterial, 0.043, 0.012, [0, 0.006, 0]);
    cylinder(object, brassMaterial, 0.010, 0.14, [0, 0.08, 0]);
    cylinder(object, brassMaterial, 0.031, 0.012, [0, 0.155, 0]);
    cylinder(object, wax, 0.012, 0.11, [0, 0.215, 0]);
    cylinder(object, wick, 0.0012, 0.012, [0, 0.276, 0]);
    // The live flame stands on the wick; CandleFlames draws it.
    const wickTip = new THREE.Object3D();
    wickTip.name = 'Decor_Candle_Wick_Tip';
    wickTip.position.y = 0.272;
    object.add(wickTip);
    candles?.add(wickTip, flame);
    return object;
  }
  // world/wallSconce.js: the plate, swan-neck arm, drip pan and taper. Its
  // parts go into `meshes` like every other prop here, so the batch at the end
  // of dressRoom draws all seventeen sconces in a handful of instanced calls.
  const sconceKit = createWallSconceKit({ metal: brassMaterial, wax, wick, candles, meshes });
  /** @param {object} [light] overrides for this sconce's pool light (world/wallSconce.js SCONCE_LIGHT) */
  function wallSconce(light = {}) {
    const object = sconceKit.build({ light });
    object.name = 'Decor_Brass_Candle_Sconce';
    propCount++;
    return object;
  }
  function sideTable() {
    const object = prop('Decor_Chair_Side_Table');
    box(object, woodMaterial, [0.43, 0.04, 0.41], [0, 0.59, 0]);
    box(object, woodMaterial, [0.36, 0.075, 0.34], [0, 0.535, 0]);
    for (const x of [-0.16, 0.16]) for (const z of [-0.15, 0.15]) {
      mesh(object, legGeometry, woodMaterial, [1, 1, 1], [x, 0, z]);
    }
    return object;
  }

  // Mantel garniture: a pair of baluster vases and a bell jar of dead roses.
  // Not a clock (it would look like part of the clock puzzle), not a mirror
  // (the study's mirror is meant to be the only one not broken), and not
  // another photo (the portrait carries that reveal).
  const vaseGeometry = new THREE.LatheGeometry([
    [0.03, 0], [0.05, 0.03], [0.065, 0.09], [0.045, 0.16], [0.028, 0.20], [0.04, 0.24], [0.036, 0.245]
  ].map(([radius, height]) => new THREE.Vector2(radius, height)), 12);
  const glaze = new THREE.MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.45 });
  const stem = new THREE.MeshStandardMaterial({ color: 0x4f4232, roughness: 0.9 });
  const deadRose = new THREE.MeshStandardMaterial({ color: 0x5e3434, roughness: 0.85 });
  const jarGlass = new THREE.MeshStandardMaterial({
    color: 0xc8d2cf, transparent: true, opacity: 0.16, roughness: 0.08, depthWrite: false
  });
  const jarSideGeometry = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  const roseGeometry = new THREE.SphereGeometry(1, 8, 6);
  function vase() {
    const object = prop('Decor_Baluster_Vase');
    mesh(object, vaseGeometry, glaze, [1, 1, 1], [0, 0, 0]);
    for (const [x, z, lean] of [[-0.008, 0, -0.12], [0.009, 0.006, 0.1], [0, -0.008, 0.02]]) {
      const twig = cylinder(object, stem, 0.0025, 0.14, [x, 0.30, z]);
      twig.rotation.z = lean;
    }
    return object;
  }
  function bellJar() {
    const object = prop('Decor_Bell_Jar_Dead_Roses');
    cylinder(object, woodMaterial, 0.085, 0.03, [0, 0.015, 0]);
    for (const [x, z, h] of [[-0.02, 0.01, 0.13], [0.018, -0.006, 0.15], [0, 0.02, 0.11]]) {
      cylinder(object, stem, 0.0028, h, [x, 0.03 + h / 2, z]);
      mesh(object, roseGeometry, deadRose, [0.017, 0.014, 0.017], [x, 0.03 + h, z]);
    }
    // The glass last, and not in the instanced batches: drawn after the roses.
    const side = new THREE.Mesh(jarSideGeometry, jarGlass);
    side.scale.set(0.07, 0.2, 0.07);
    side.position.y = 0.13;
    const top = new THREE.Mesh(domeGeometry, jarGlass);
    top.scale.set(0.07, 0.07, 0.07);
    top.position.y = 0.23;
    object.add(side, top);
    return object;
  }

  function createBookcase(index, loft = false) {
    const object = prop('Decor_Open_Bookcase');
    box(object, woodMaterial, [2.8, 2.8, 0.025], [0, 1.4, -0.212]);
    for (const x of [-1.35, 1.35]) box(object, woodMaterial, [0.10, 2.8, 0.45], [x, 1.4, 0]);
    for (const y of [0.15, 0.98, 1.815, 2.65]) {
      // Fit between the stiles; their shared front planes used to overlap.
      box(object, woodMaterial, [2.60, 0.075, 0.45], [0, y, 0]);
      box(object, woodMaterial, [2.77, 0.09, 0.04], [0, y, 0.208]);
    }
    // Small cap overhang separates its faces from the stile tops/fronts.
    box(object, woodMaterial, [2.8, 0.10, 0.456], [0, 2.755, 0]);
    if (index === 3) return object; // Gallery bays retain their shelves without overlapping props.
    for (let i = 0; i < 3; i++) place(object, book(index + i, false, 0.23 + i * 0.025), -0.92 + i * 0.05, 0.188, 0.035);
    for (let i = 0; i < 2; i++) place(object, book(index + i + 3, false, 0.25 + i * 0.03), 0.58 + i * 0.048, 1.853, 0.035);
    place(object, book(index + 4, true), -0.65, 2.688, 0.025, 0.08);
    place(object, archiveBox(), loft ? -0.76 : 0.58, 1.018, 0);
    for (let i = 0; i < 4; i++) {
      place(object, book(index + i + 2, false, 0.22 + (i % 3) * 0.027),
        loft ? 0.20 + i * 0.045 : -0.27 + i * 0.045, 1.018, 0.018, (i - 1) * 0.018);
    }
    if (index % 2 === 0) {
      const vase = prop('Decor_Small_Ceramic_Vase');
      cylinder(vase, ceramic, 0.033, 0.075, [0, 0.0375, 0]);
      cylinder(vase, ceramic, 0.021, 0.040, [0, 0.090, 0]);
      place(object, vase, 0.24, 2.688, 0.015);
    }
    if (loft) {
      place(object, bundle(), 0.74, 2.688, 0);
      place(object, book(1, true, 0.28), -0.05, 1.018, 0.025, 0.10);
      place(object, lamp(true), 0.70, 1.018, 0);
    } else if (index === 1) {
      place(object, archiveBox(), -0.56, 1.018, 0);
      place(object, bundle(), 0.07, 1.018, 0);
    }
    return object;
  }

  function dressRoom({ group, desk, fireplace, concealmentChair, loftY }) {
    // Keep the incident note's left/rear desk quadrant completely clear.
    place(desk, lamp(), 0.64, 0.79, -0.20);
    for (let i = 0; i < 3; i++) place(desk, book(i + 1, true), -0.63, 0.79 + i * 0.035, 0.21, -0.08 + i * 0.07);
    place(desk, bundle(true), 0.08, 0.79, -0.18, 0.13);
    place(desk, bundle(), 0.12, 0.801, -0.18, 0.04);
    const ink = prop('Decor_Ink_Bottle');
    cylinder(ink, green, 0.021, 0.055, [0, 0.028, 0]);
    cylinder(ink, brassMaterial, 0.015, 0.010, [0, 0.06, 0]);
    place(desk, ink, 0.42, 0.79, 0.20);
    const pen = cylinder(desk, brassMaterial, 0.0025, 0.13, [0.40, 0.793, 0.015]);
    pen.rotation.z = Math.PI / 2;

    // A symmetrical garniture, as a Victorian mantel was set: candlesticks at
    // the ends (live flames; the fire's light covers the mantel), vases, and
    // a bell jar in the middle where the photo used to be.
    for (const side of [-1, 1]) {
      place(fireplace, candle(), side * 0.76, 1.46, 0.05);
      place(fireplace, vase(), side * 0.42, 1.46, 0.02);
    }
    place(fireplace, bellJar(), 0, 1.46, 0.02);

    // Follow the chair's local left side, with clearance from its arm and the wall.
    const tablePosition = concealmentChair.localToWorld(new THREE.Vector3(-0.82, 0, 0.24));
    const table = place(group, sideTable(), tablePosition.x, 0, tablePosition.z, concealmentChair.rotation.y);
    place(table, candle(), -0.10, 0.61, -0.075);
    place(table, book(3, true, 0.20, 0.026), 0.075, 0.61, 0.035, -0.14);
    place(table, book(1, true, 0.19, 0.023), 0.075, 0.636, 0.035, -0.075);

    /**
     * Brass candle sconces round the room, every one hung flat on the
     * wallpaper (SCONCE_WALL_OFFSET in front of the wall plane: the first two
     * used to float 4 cm off it). Each spot was checked against everything on
     * its wall; the note on each row says what it sits between.
     *
     * None is within a metre of the Shadow Crest's three lamp dials (front
     * wall, x -5.35 to -3.25). Its plaque reads THREE LIGHTS GUARD THE ARCHIVE,
     * and a real flame beside them would read as a fourth lamp.
     *
     * The last number is the sconce's light, for when the room's light pool
     * hands it one. Ground-floor pools use half these reference values;
     * loft pools use 32%, leaving dark gaps and keeping the torch useful.
     * All sconces share desaturated amber and a short 2.6m reach.
     */
    const back = -6.5 + SCONCE_WALL_OFFSET, front = 6.5 - SCONCE_WALL_OFFSET;
    const left = -8 + SCONCE_WALL_OFFSET, right = 8 - SCONCE_WALL_OFFSET;
    const loft = loftY + 1.65;
    for (const [x, y, z, yaw, intensity] of [
      // Ground floor, back wall (under the loft, 2.82 m high).
      [-6.53, 1.75, back, 0, 2.0],            // left of the fireplace (x -6.25), clear of Annabelle's corner
      [-4.07, 1.75, back, 0, 2.5],            // right of the fireplace (-4.35), left of the bookcase (-3.8)
      [3.90, 1.63, back, 0, 2.0],             // left of the mirror (4.33): the original sconce
      [5.70, 1.63, back, 0, 1.9],             // right of the mirror (5.27), left of the reseal panel (6.12)
      // Left wall, below the windows (sills at 2.75).
      [left, 1.70, 0.05, Math.PI / 2, 2.0],   // between the bookcase (ends z -0.6) and the portrait (0.55..1.45)
      [left, 1.70, 1.95, Math.PI / 2, 1.9],   // the portrait's other side
      [left, 1.70, 4.20, Math.PI / 2, 1.8],   // under the pier between the windows at z 3.1 and 5.3
      // Front wall.
      [-6.45, 1.65, front, Math.PI, 1.8],     // left of the crest: the original sconce, 1.1 m from its left dial
      [-2.15, 1.65, front, Math.PI, 2.2],     // right of the crest, 1.1 m from its right dial; exit casing at -1.09
      [7.40, 1.65, front, Math.PI, 1.7],      // beyond the map board (ends 6.85), short of the corner
      // Right wall.
      [right, 1.65, -4.35, -Math.PI / 2, 1.9], // under the landing, beside the clock (z -4.99)
      [right, 1.65, 3.30, -Math.PI / 2, 1.8],  // between the stair foot (2.6) and the entry casing (3.86)
      // Loft, back wall, either side of each archive (cabinets +/-0.82 wide).
      [-6.84, loft, back, 0, 1.9],            // between the loft bookcase (x -7.46) and the memory archive (-6.22)
      [-3.74, loft, back, 0, 2.2],            // between the memory archive (-4.58) and the gallery bookcase (-2.955)
      [3.14, loft, back, 0, 2.7],             // between the gallery bookcase (2.755) and the restricted archive (3.58)
      [5.86, loft, back, 0, 1.9],             // between the restricted archive (5.22) and the landing
      // Loft, right wall, where the stair arrives.
      [right, loft, -2.65, -Math.PI / 2, 2.0]  // past the loft bookcase (ends -3.345), 0.8 m from the stair head
    ]) {
      place(group, wallSconce({color:0xffd0a0,intensity:intensity*(y>loftY?.32:.5),distance:2.6}), x, y, z, yaw);
    }

    // Collapse repeated static box/cylinder parts into a few shared instance batches.
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert();
    const batches = new Map();
    for (const object of meshes) {
      const key = `${object.geometry.uuid}:${object.material.uuid}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(object);
    }
    for (const objects of batches.values()) {
      if (objects.length < 3) continue;
      const instances = new THREE.InstancedMesh(objects[0].geometry, objects[0].material, objects.length);
      instances.name = 'Study_Decor_Instances';
      instances.castShadow = false;
      instances.receiveShadow = true;
      // The sconces' parts are off the minimap (MAIN_ONLY); everything else stays on layer 0.
      instances.layers.mask = objects[0].layers.mask;
      objects.forEach((object, index) => {
        instances.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
        object.removeFromParent();
      });
      instances.instanceMatrix.needsUpdate = true;
      group.add(instances);
    }
    return propCount;
  }
  return { createBookcase, dressRoom };
}
