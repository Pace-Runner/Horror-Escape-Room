import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const STUDY_RUG = Object.freeze({ width: 9.2, depth: 7.2, x: -0.15, y: 0.004, z: -0.25 });

// Applied joinery only: original mirror plane, door slab and hinges stay authoritative.
function details(name) {
  const root = new THREE.Group(); root.name = name;
  root.userData.studyStaticDetails = true;
  return root;
}
function part(root, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = true;
  root.add(mesh); return mesh;
}
function timber(root, material, size, position) {
  return part(root, new RoundedBoxGeometry(...size, 1, 0.004), material, ...position);
}

export function dressStudyMirror(frame, glass, walnut, brass) {
  const root = details('Victorian_Mirror_Carved_Joinery'); frame.add(root);
  for (const side of [-1, 1]) {
    timber(root, walnut, [0.085, 1.96, 0.070], [side * 0.408, 1.075, 0.077]);
    timber(root, walnut, [0.10, 0.15, 0.09], [side * 0.408, 0.10, 0.077]);
    const column = new THREE.LatheGeometry([
      [0.023, 0], [0.029, 0.035], [0.019, 0.08], [0.015, 0.14],
      [0.015, 1.56], [0.022, 1.62], [0.028, 1.66], [0.028, 1.70]
    ].map(p => new THREE.Vector2(...p)), 10);
    part(root, column, walnut, side * 0.408, 0.23, 0.111);
    for (const y of [0.245, 1.94]) {
      const band = part(root, new THREE.TorusGeometry(0.024, 0.003, 4, 12), brass, side * 0.408, y, 0.111);
      band.rotation.x = Math.PI / 2;
    }
  }
  timber(root, walnut, [0.91, 0.095, 0.080], [0, 0.105, 0.078]);
  timber(root, walnut, [0.91, 0.105, 0.080], [0, 2.055, 0.078]);
  timber(root, walnut, [0.94, 0.035, 0.086], [0, 2.12, 0.080]);
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      [side * 0.36, 2.13, 0.09], [side * 0.24, 2.17, 0.09],
      [side * 0.12, 2.255, 0.09], [side * 0.055, 2.22, 0.09],
      [side * 0.095, 2.195, 0.09]
    ].map(p => new THREE.Vector3(...p)));
    part(root, new THREE.TubeGeometry(curve, 20, 0.014, 6, false), walnut, 0, 0, 0);
    const leaf = part(root, new THREE.SphereGeometry(1, 10, 6), walnut, side * 0.028, 2.235, 0.095);
    leaf.scale.set(0.035, 0.070, 0.017); leaf.rotation.z = -side * 0.32;
  }
  const boss = part(root, new THREE.SphereGeometry(1, 10, 6), brass, 0, 2.22, 0.117);
  boss.scale.set(0.018, 0.027, 0.008);
  // Roughness only: cloudy edges without covering the functional/reveal plane.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const edge = Math.max(Math.abs(x / 255.5 - 1), Math.abs(y / 255.5 - 1));
    const cloud = Math.sin(x * 0.037) * Math.cos(y * 0.027) * 0.018;
    const value = Math.round(255 * (0.10 + 0.40 * edge ** 12 + cloud));
    const i = (y * 512 + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  glass.material.roughnessMap = new THREE.CanvasTexture(canvas);
  glass.material.roughness = 1; glass.material.metalness = 0.92;
  glass.material.color.setHex(0xa9afa5); glass.material.needsUpdate = true;
}

/** The least separation between two parallel visible faces that face the same way. */
const FACE_GAP = 0.005;
/** The bolection moulding round each panel: its width, and its depth off the leaf. */
const MOULDING_WIDTH = 0.025;
const MOULDING_PROUD = 0.027;
/** A raised panel stands this far off the leaf; the moulding is FACE_GAP+ beyond it. */
const PANEL_PROUD = 0.011;
/** Knob height above the floor, and its backset from the latch edge of the leaf. */
const KNOB_HEIGHT = 1.0;
const KNOB_BACKSET = 0.13;
/** Rays in the fanlight's sunburst, fanned evenly between these angles from the rail. */
const SUNBURST_RAYS = 7;
const SUNBURST_FIRST_RAY = 15;
const SUNBURST_RAY_STEP = 25;

/** A plain box given by its extents -- [x0, x1], [y0, y1], [z0, z1] -- not by its centre. */
function block(root, material, [x0, x1], [y0, y1], [z0, z1]) {
  return part(root, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material,
    (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
/** The same extents on the -x side (s = -1) or the +x side (s = 1) of the doorway. */
const onSide = (s, near, far) => (s > 0 ? [near, far] : [-far, -near]);
/**
 * Flat, metre-based grain for a piece alignSurfaces will not map (it maps
 * only box-shaped geometry): along x at 0.85 m a repeat, across at 0.25 m,
 * the same scale every timber in the study is given.
 */
function planarGrain(geometry) {
  const uv = geometry.attributes.uv, position = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) / 0.85, position.getY(i) / 0.25);
  return geometry;
}

/**
 * THE STUDY'S FRONT DOOR -- the last door in the game -- dressed as a
 * Victorian front door: a box frame with an architrave round it, a transom
 * rail with a fanlight above, and one set of brass on a panelled leaf.
 *
 * WHY EVERY PIECE IS A PLAIN BOX. This used to be built from
 * RoundedBoxGeometry, and the edges of the casing either side of the door
 * sparkled whenever the player moved. Two causes, both gone by not using it:
 *
 *   1. RoundedBoxGeometry reports itself as a 1 x 1 x 1 'BoxGeometry' -- its
 *      real size lives only in its vertices -- so studySurfaces.alignSurfaces
 *      planned the grain of every rounded timber as if it were a tall cube.
 *      And a rounded edge's vertex normals lean 45 degrees, just past the 0.7
 *      that picks which way to project, so each 3 mm edge strip had about half
 *      a texture tile squeezed across it. A strip thinner than a pixel with a
 *      run of grain inside it lands on a different texel every frame.
 *   2. An older box casing was still being built underneath the rounded one,
 *      so slivers of a second, darker wood showed between the two, beside
 *      parallel faces barely a centimetre apart.
 *
 * A 4 mm bevel cannot be seen from where the player stands. A plain box gets
 * true metre-based grain from alignSurfaces, and lets every face below be
 * placed by arithmetic instead of by eye.
 *
 * NO TWO VISIBLE FACES SHARE A PLANE. Coplanar faces that face the same way
 * tie in the depth buffer; which one wins changes with the camera, so the
 * surface flickers between their two textures (z-fighting). Every piece here
 * is either butt-jointed -- faces meet only where they face each other, which
 * is inside the joint and never drawn -- or kept at least FACE_GAP from any
 * parallel neighbour. Positions are in frontDoor's space: the closed leaf's
 * room face is at z = -leafT / 2, the plaster at z = opening.wallZ, and the
 * room is towards -z. Each piece is written as its extents, so a comment and
 * the line under it are the same numbers.
 *
 * WHERE THINGS LIVE. The frame belongs to `frontDoor` and never moves. The
 * panels, mouldings and brass belong to the leaf, so they swing with it. The
 * hinge knuckles belong to `hinge`: they sit on the pin, the one line that
 * does not move when the door opens. Each is a group flagged
 * studyStaticDetails, so batchStudyPuzzleDetails merges it into one draw per
 * material -- worth doing twice over here, because the study mirror draws the
 * room a second time every frame.
 *
 * NO LIGHT BEHIND THE FANLIGHT. The glass is opaque and dark with a faint warm
 * emissive, the recipe the house's own windows use outside, which reads as
 * night glass with the porch lamp somewhere beyond it. A real light would
 * change the light count the boot warm-up compiled every shader for, and the
 * whole study would recompile in the middle of the ending.
 *
 * @param {object} door
 * @param {THREE.Group} door.frontDoor - the doorway's own group; the frame goes here.
 * @param {THREE.Object3D} door.hinge - the rotating pin, at the leaf's porch-side hinge edge.
 * @param {THREE.Mesh} door.slab - the leaf, a box; its `finalExitPanel` children are the code.
 * @param {{width: number, height: number, wallZ: number}} door.opening - the doorway in
 *   frontDoor's space: its size, and the z of the room's wall plane.
 * @param {THREE.Material} door.wood - leaf, frame and mouldings.
 * @param {THREE.Material} door.panelWood - the nine counted panels.
 * @param {THREE.Material} door.brass - knobs, escutcheons, letter plate, hinges.
 * @returns {{lockHeights: number[]}} the three locks' heights above the floor, top first.
 */
export function dressFinalStudyExit({ frontDoor, hinge, slab, opening, wood, panelWood, brass }) {
  const { width: leafW, height: leafH, depth: leafT } = slab.geometry.parameters;
  // Floor heights: the hinge stands on the floor; the slab hangs off it.
  const leafCentre = hinge.position.y + slab.position.y;
  const leafTop = leafCentre + leafH / 2;
  const roomFace = -leafT / 2;
  const half = opening.width / 2;
  const night = new THREE.MeshStandardMaterial({
    name: 'StudyFanlightGlass', color: 0x0b0d10, roughness: 0.1, metalness: 0.6,
    emissive: 0x3a2410, emissiveIntensity: 0.2
  });

  // ---------- the frame ----------
  const frame = details('Final_Exit_Frame'); frontDoor.add(frame);

  // Linings: the box the leaf hangs in. 5 mm inside the plaster edge, so they
  // stand in front of the porch reveal planes at x = +-half instead of in them,
  // and 1 cm into the wall at the back, so the joint is never seen.
  const liningIn = half - FACE_GAP;                 // 0.895
  const liningOut = liningIn + 0.03;                // 0.925
  const liningFront = roomFace - 0.06;              // -0.105
  const intoWall = opening.wallZ + 0.01;            // +0.06
  const headUnder = opening.height - 0.03;          // 2.97
  for (const s of [-1, 1]) {
    // The sides stop under the head piece: it alone owns the corner.
    block(frame, wood, onSide(s, liningIn, liningOut), [0, headUnder], [liningFront, intoWall]);
  }
  block(frame, wood, [-liningOut, liningOut], [headUnder, opening.height], [liningFront, intoWall]);

  // Stops on the room side: the leaf opens outward, so it shuts against them.
  // They lap 3 cm over its edges and stand 2 mm off its face; each end is
  // buried 3 mm in the lining or the transom, never flush with it.
  const stopFront = roomFace - 0.03;                // -0.075
  const stopBack = roomFace - 0.002;                // -0.047
  const stopIn = liningIn - 0.03;                   // 0.865
  const headStop = leafTop - 0.025;                 // 2.40
  const transomBottom = leafTop + FACE_GAP;         // 2.43
  for (const s of [-1, 1]) {
    block(frame, wood, onSide(s, stopIn, liningIn + 0.003), [0, headStop], [stopFront, stopBack]);
  }
  block(frame, wood, [-liningIn - 0.003, liningIn + 0.003], [headStop, transomBottom + 0.003], [stopFront, stopBack]);

  // The transom rail over the leaf: flush with the leaf outside, 1 cm behind
  // the linings' front inside, and 5 mm into the linings at each end.
  const transomTop = transomBottom + 0.1;           // 2.53
  block(frame, wood, [-half, half], [transomBottom, transomTop], [liningFront + 0.01, -roomFace]);

  // The fanlight: one pane on the leaf's centre plane, its edges buried 5 mm in
  // the rail, the linings and the head.
  block(frame, night, [-half, half], [transomTop - FACE_GAP, headUnder + FACE_GAP], [-0.003, 0.003]);

  // Its sunburst. The hub is a half disc standing on the rail (its flat edge 5
  // mm inside it) and 6 mm proud of the bars on both faces. The bars start
  // inside the hub, past the 5 cm where neighbours 25 degrees apart would
  // overlap each other, and run 2 cm on into the frame at the far end.
  const hubY = transomTop - FACE_GAP;
  const hub = planarGrain(new THREE.CylinderGeometry(0.1, 0.1, 0.042, 16, 1, false, -Math.PI / 2, Math.PI)
    .rotateX(-Math.PI / 2));
  part(frame, hub, wood, 0, hubY, 0);
  const rayStart = 0.08;
  for (let i = 0; i < SUNBURST_RAYS; i++) {
    const angle = THREE.MathUtils.degToRad(SUNBURST_FIRST_RAY + SUNBURST_RAY_STEP * i);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const toHead = (headUnder - hubY) / dy;
    const toSide = Math.abs(dx) > 1e-6 ? liningIn / Math.abs(dx) : Infinity;
    const rayEnd = Math.min(toHead, toSide) + 0.02;
    const mid = (rayStart + rayEnd) / 2;
    const ray = part(frame, new THREE.BoxGeometry(rayEnd - rayStart, 0.022, 0.03), wood, dx * mid, hubY + dy * mid, 0);
    ray.rotation.z = angle;
  }

  // The architrave. Legs from the plinths to the head, a bead on each leg's
  // inner edge, plinth blocks for the skirting to run into, and a frieze and a
  // projecting cornice across the top. Each front is 5 mm or more off the
  // next: bead -0.135, plinth -0.14, leg -0.125, frieze -0.13, cornice -0.17.
  const plinthTop = 0.26;
  const legIn = half + 0.01;                        // 0.91
  const legOut = legIn + 0.19;                      // 1.10
  const legFront = liningFront - 0.02;              // -0.125
  for (const s of [-1, 1]) {
    block(frame, wood, onSide(s, legIn, legOut), [plinthTop, opening.height], [legFront, intoWall]);
    block(frame, wood, onSide(s, legIn + FACE_GAP, legIn + FACE_GAP + 0.03), [plinthTop, opening.height],
      [legFront - 0.01, legFront + FACE_GAP]);
    block(frame, wood, onSide(s, half + FACE_GAP, legOut + 0.02), [0, plinthTop], [legFront - 0.015, intoWall]);
  }
  block(frame, wood, [-legOut - 0.05, legOut + 0.05], [opening.height, opening.height + 0.2],
    [legFront - FACE_GAP, intoWall]);
  block(frame, wood, [-legOut - 0.11, legOut + 0.11], [opening.height + 0.2, opening.height + 0.25],
    [legFront - 0.045, intoWall]);

  // ---------- the leaf ----------
  const leaf = details('Final_Exit_Leaf_Joinery'); slab.add(leaf);
  // Out from either face of the leaf (side -1 is the room), in the slab's space.
  const off = (side, near, far) => (side < 0 ? [-leafT / 2 - far, -leafT / 2 - near] : [leafT / 2 + near, leafT / 2 + far]);

  // The counted panels join the batch -- nine draws become one -- and the same
  // nine go on the porch face, as they would on a real door: the panels run
  // through it. Grouped into their rows, top row first.
  const rows = new Map();
  for (const panel of slab.children.filter(p => p.userData.finalExitPanel)) {
    leaf.add(panel);
    const porchSide = panel.clone();
    delete porchSide.userData.finalExitPanel;
    porchSide.position.z = -panel.position.z;
    leaf.add(porchSide);
    const { width, height } = panel.geometry.parameters;
    const key = panel.position.y.toFixed(4);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ left: panel.position.x - width / 2, right: panel.position.x + width / 2,
      bottom: panel.position.y - height / 2, top: panel.position.y + height / 2 });
  }
  const panelRows = [...rows.values()].sort((a, b) => b[0].top - a[0].top);

  // The mouldings frame each panel, half on it and half on the leaf. In the
  // four-panel row the panels are under 2 cm apart, so two 2.5 cm mouldings
  // would overlap there, face on face; neighbours share one wider bar instead.
  // The cross pieces butt between the uprights.
  const m = MOULDING_WIDTH / 2;
  for (const side of [-1, 1]) {
    const depth = off(side, -0.003, MOULDING_PROUD);
    for (const row of panelRows) {
      row.sort((a, b) => a.left - b.left);
      const ys = [row[0].bottom - m, row[0].top + m];
      const uprights = [[row[0].left - m, row[0].left + m]];
      for (let i = 1; i < row.length; i++) uprights.push([row[i - 1].right - m, row[i].left + m]);
      uprights.push([row.at(-1).right - m, row.at(-1).right + m]);
      for (const xs of uprights) block(leaf, wood, xs, ys, depth);
      for (const p of row) {
        for (const y of [p.bottom, p.top]) block(leaf, wood, [p.left + m, p.right - m], [y - m, y + m], depth);
      }
    }
  }

  // The brass, on the wide lock stile, the same on both faces: one knob at
  // 1 m, and the three locks the CCTV feed shows on this door (LOCK_COUNT in
  // CctvFeeds.js), at the quarter points of the leaf the way the feed paints
  // them. Each escutcheon is four plates round a keyhole slot with a dark
  // backing 5 mm down, so the hole reads as a hole without a cutout.
  const knobX = leafW / 2 - KNOB_BACKSET;
  const knobY = KNOB_HEIGHT - leafCentre;
  const lockYs = [1, 2, 3].map(k => leafH / 2 - leafH * k / 4);
  for (const side of [-1, 1]) {
    const at = d => side * (leafT / 2 + d);
    const rose = part(leaf, new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), brass, knobX, knobY, at(0.004));
    rose.rotation.x = Math.PI / 2;
    const neck = part(leaf, new THREE.CylinderGeometry(0.01, 0.01, 0.032, 10), brass, knobX, knobY, at(0.024));
    neck.rotation.x = Math.PI / 2;
    const knob = part(leaf, new THREE.SphereGeometry(0.032, 16, 10), brass, knobX, knobY, at(0.058));
    knob.scale.z = 0.75;
    const plate = off(side, -0.002, 0.01);
    for (const y of lockYs) {
      block(leaf, brass, [knobX - 0.025, knobX - 0.0045], [y - 0.055, y + 0.055], plate);
      block(leaf, brass, [knobX + 0.0045, knobX + 0.025], [y - 0.055, y + 0.055], plate);
      block(leaf, brass, [knobX - 0.0045, knobX + 0.0045], [y + 0.017, y + 0.055], plate);
      block(leaf, brass, [knobX - 0.0045, knobX + 0.0045], [y - 0.055, y - 0.017], plate);
      block(leaf, night, [knobX - 0.0065, knobX + 0.0065], [y - 0.019, y + 0.019], off(side, -0.002, 0.005));
    }
  }
  // A letter plate on the porch face, centred on the rail under the middle row.
  const fieldLeft = Math.min(...panelRows.flat().map(p => p.left));
  const fieldRight = Math.max(...panelRows.flat().map(p => p.right));
  const letterX = (fieldLeft + fieldRight) / 2;
  const letterY = (panelRows[1][0].bottom + panelRows[2][0].top) / 2;
  block(leaf, brass, [letterX - 0.15, letterX + 0.15], [letterY - 0.0375, letterY + 0.0375], off(1, -0.002, 0.008));
  block(leaf, brass, [letterX - 0.125, letterX + 0.125], [letterY - 0.02, letterY + 0.02], off(1, 0.006, 0.014));

  // ---------- the hinges ----------
  // Three knuckles on the pin, which is the porch face's hinge edge: a door
  // that opens outward shows its hinges outside.
  const knuckles = details('Final_Exit_Hinge_Knuckles'); hinge.add(knuckles);
  for (const y of [leafTop - leafH + 0.245, leafCentre, leafTop - 0.245]) {
    part(knuckles, new THREE.CylinderGeometry(0.008, 0.008, 0.1, 12), brass, 0, y, 0);
  }

  return { lockHeights: lockYs.map(y => leafCentre + y) };
}
