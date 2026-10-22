import * as THREE from 'three';
import { brassKeyMaterial } from './keyMaterials.js';

/**
 * One mesh builder per inventory item, shared by the hand and the floor.
 *
 * WHY ONE MODULE FOR BOTH. An item the player drops has to look like the thing
 * that was in their hand a moment ago, and the same thing they found in the
 * room before that. Two builders (one for the view model, one for the dropped
 * prop) would be two shapes to keep in step, and the first time they drifted the
 * crowbar would change colour on its way to the floor. So every item is built
 * once, as a PROTOTYPE, and both views are clones of it.
 *
 * CLONES SHARE GEOMETRY AND MATERIALS with the prototype (Object3D.clone keeps
 * references), which is also why nothing here is ever disposed: a dropped prop
 * that freed its geometry would take the held copy, and the level prop it was
 * cloned from, down with it. Per-object flags (shadows, culling, visibility) are
 * NOT shared, so each view sets its own.
 *
 * WHERE THE SHAPES COME FROM. Items that already exist in a level (the bedroom
 * key under the floorboard, the paperclip on the bed, the study's keys and
 * visor, the torch) are cloned from that level's own mesh, handed in with
 * setTemplate(). Only the crowbar and the brass key never had a mesh -- the
 * lockbox and the pin-pad drawer grant them straight into the inventory -- so
 * those two are built here from primitives.
 *
 * THE CANONICAL FRAME, which every builder returns its item in:
 *   - true WORLD size (whatever size the level draws it at; the paperclip is
 *     already 1.75x life there, see PAPERCLIP_SCALE in bedroomLevel.js),
 *   - the item's long axis along local +Y,
 *   - the origin at the point a fist would close around.
 * That is the grip socket's own convention (systems/hands/sockets.js: "+Y runs
 * along the cylinder axis, out of the top of the fist"), so the torch drops in
 * unchanged and every other item only needs the per-item framing in
 * core/HeldItems.js, never a per-item fix-up in the hand.
 */

/**
 * How each item lies on the floor once dropped, as an XYZ Euler applied to the
 * canonical frame. The drop code then yaws the whole thing to the player's view
 * and lifts it until its lowest point touches the boards, so only the TILT lives
 * here.
 *
 * [0, 0, -PI/2] lays the long axis flat along local +X (the default, and how the
 * bedroom dresses its own torch on the nightstand). The extra +PI/2 about X on
 * the flat items turns their broad face down, so a paperclip, a key and the
 * visor land lying on the floor rather than standing on an edge.
 */
const FLAT = [0, 0, -Math.PI / 2];
const FACE_DOWN = [Math.PI / 2, 0, -Math.PI / 2];
const REST_ROTATION = {
  flashlight: FLAT,
  crowbar: FLAT,
  brassKey: FACE_DOWN,
  // The two study keys and the bedroom key keep the attitude their own level
  // gave them -- FLAT undoes the canonical frame's quarter turn exactly.
  bedroomKey: FLAT,
  doorKey: FLAT,
  gateKey: FLAT,
  paperclip: FACE_DOWN,
  visor: FACE_DOWN,
  // Undoes the builder's quarter turn below: lying flat, label up.
  sessionTape: [-Math.PI / 2, 0, 0],
  // Face up.
  photo1984: [-Math.PI / 2, 0, 0],
  photo1985: [-Math.PI / 2, 0, 0],
  photo1986: [-Math.PI / 2, 0, 0],
  photo1987: [-Math.PI / 2, 0, 0],
  // On its side, like the loose fuses lying round the lab.
  fuse15: FLAT,
  fuse20: FLAT,
  fuse30: FLAT,
  fuse45: FLAT
};

/**
 * Wraps a clone of a level's own mesh into the canonical frame.
 *
 * The clone's root transform is replaced (the level placed it somewhere in the
 * room; here it has to sit at the origin) but its SCALE is kept, because that is
 * the size the level decided to draw it at. It is also forced visible: most of
 * these templates are hidden until revealed or once taken, and a clone inherits
 * that.
 */
function fromTemplate(template, { rotation = [0, 0, 0], position = [0, 0, 0] } = {}) {
  const copy = template.clone(true);
  copy.position.fromArray(position);
  copy.rotation.set(rotation[0], rotation[1], rotation[2]);
  copy.visible = true;
  const canonical = new THREE.Group();
  canonical.add(copy);
  return canonical;
}

/**
 * The crowbar. Never had a mesh: the bedroom's lockbox grants it outright.
 *
 * Grey forged steel, hexagonal like the real thing (a round bar reads as a pipe),
 * a curved claw at the top and a short bent chisel at the bottom. Held near the
 * chisel end, as you would to pry, so the claw is what rises into view.
 *
 * About 0.62 m end to end -- an ordinary 24-inch wrecking bar. The view model is
 * scaled in core/HeldItems.js, not here, so the dropped one stays life size.
 */
function buildCrowbar() {
  // Mid-grey, only half metal, with a trace of emission -- the same trace the
  // keys and the paperclip carry, and for the same reason. It was near-black,
  // 80% metal steel, and a metal is lit almost entirely by what it reflects,
  // which in this house is darkness: dropped on the boards it vanished even in
  // the torch beam (a thin dark line along the skirting), and held after the
  // bulb blows -- the torch is always away while the crowbar is out -- it was
  // black on black. Grey with enough diffuse response to take the beam and the
  // candlelight, it still reads as forged steel.
  const steel = new THREE.MeshStandardMaterial({
    color: 0x5a6068, metalness: 0.55, roughness: 0.45,
    emissive: 0x0e1013, emissiveIntensity: 1
  });
  // Worn bright where it has actually been used to pry: the claw tip and the
  // chisel edge. Without it the whole bar is one silhouette and the curve,
  // which is the part that says "crowbar", disappears against a dark room.
  const worn = new THREE.MeshStandardMaterial({
    color: 0xa3a8ae, metalness: 0.75, roughness: 0.3,
    emissive: 0x1a1c1f, emissiveIntensity: 1
  });
  const crowbar = new THREE.Group();
  crowbar.name = 'crowbar';

  const BAR_R = 0.0115;
  const SHAFT_BOTTOM = -0.11;
  const SHAFT_TOP = 0.40;

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, SHAFT_TOP - SHAFT_BOTTOM, 6), steel);
  shaft.position.y = (SHAFT_TOP + SHAFT_BOTTOM) / 2;
  crowbar.add(shaft);

  // The goose-neck: the bar keeps going, curling forward and over.
  const neckPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, SHAFT_TOP - 0.005, 0),
    new THREE.Vector3(0, SHAFT_TOP + 0.055, 0.004),
    new THREE.Vector3(0, SHAFT_TOP + 0.098, 0.03),
    new THREE.Vector3(0, SHAFT_TOP + 0.115, 0.072),
    new THREE.Vector3(0, SHAFT_TOP + 0.1, 0.112),
    new THREE.Vector3(0, SHAFT_TOP + 0.07, 0.132)
  ], false, 'centripetal');
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckPath, 20, BAR_R, 6, false), steel);
  crowbar.add(neck);

  // The split claw: two tapering prongs leaving the end of the curve along its
  // own tangent, with the nail slot between them.
  const clawEnd = neckPath.getPoint(1);
  const clawDir = neckPath.getTangent(1).normalize();
  const PRONG_LEN = 0.045;
  for (const side of [-1, 1]) {
    // Narrow end (radiusTop) at +Y, which is turned onto the tangent: the prong
    // tapers AWAY from the bar, to the point that goes under a nail head.
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0062, PRONG_LEN, 5), worn);
    prong.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), clawDir);
    prong.position.copy(clawEnd).addScaledVector(clawDir, PRONG_LEN / 2);
    prong.position.x += side * 0.0062;
    // Flattened across the slot, like a forged claw rather than two nails.
    prong.scale.set(1, 1, 0.55);
    crowbar.add(prong);
  }

  // The chisel end: a short kink and a flattened bevel.
  const chiselDir = new THREE.Vector3(0, -1, 0.34).normalize();
  const CHISEL_LEN = 0.06;
  const chisel = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, 0.0035, CHISEL_LEN, 6), worn);
  chisel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), chiselDir.clone().negate());
  chisel.position.set(0, SHAFT_BOTTOM, 0).addScaledVector(chiselDir, CHISEL_LEN / 2 - 0.004);
  chisel.scale.set(1.35, 1, 0.5);
  crowbar.add(chisel);

  return crowbar;
}

/**
 * The brass safe key. Never had a mesh either: the lamp drawer's pin pad grants
 * it. Small and old-fashioned -- a round bow, a collar, two bit teeth -- in the
 * same brass the study's keys use, with the same trace of emission they carry so
 * it stays findable on a dark floor.
 *
 * Its broad face is local XY (the bow's ring and the teeth both lie in it), which
 * is why it rests FACE_DOWN rather than FLAT.
 */
function buildBrassKey() {
  // Rusted brass, the same as the key lying in the lamp drawer -- see keyMaterials.js.
  const brass = brassKeyMaterial();
  const key = new THREE.Group();
  key.name = 'brassKey';

  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0032, 8, 18), brass);
  bow.position.y = -0.0085;
  key.add(bow);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.004, 10), brass);
  collar.position.y = 0.0045;
  key.add(collar);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.042, 8), brass);
  shaft.position.y = 0.0275;
  key.add(shaft);
  const toothA = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.006, 0.0026), brass);
  toothA.position.set(0.0058, 0.041, 0);
  key.add(toothA);
  const toothB = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.0045, 0.0026), brass);
  toothB.position.set(0.0046, 0.0325, 0);
  key.add(toothB);
  return key;
}

/**
 * Builders, keyed by the same ids as GameState's ITEMS. Each takes the item's
 * template (or nothing) and returns it in the canonical frame, or null when the
 * template it needs has not arrived yet.
 *
 * The rotations below only turn each level mesh's own long axis onto +Y and
 * slide its bow or end into the fist; they are worked out from how each level
 * builds the mesh, which is cited beside each one.
 */
const BUILDERS = {
  // flashlight.glb is authored to the grip convention already (beam down +Y,
  // origin at the grip -- see bedroomLevel.js's note on the nightstand torch).
  flashlight: (t) => (t ? fromTemplate(t) : null),

  crowbar: () => buildCrowbar(),
  brassKey: () => buildBrassKey(),

  // bedroomLevel.js: shaft along X, bow at -X, bit at +X. A quarter turn about
  // Z stands it up with the bow at the bottom, in the fist.
  bedroomKey: (t) => (t ? fromTemplate(t, { rotation: [0, 0, Math.PI / 2], position: [0, 0.055, 0] }) : null),

  // studyLevel.js's desk-drawer key: the same layout as the bedroom key, smaller.
  doorKey: (t) => (t ? fromTemplate(t, { rotation: [0, 0, Math.PI / 2], position: [0, 0.045, 0] }) : null),

  // studyLevel.js's gate key hangs bow-UP on the mirror (shaft along Y, bow at
  // +Y). Half a turn about X puts the bow at the bottom.
  gateKey: (t) => (t ? fromTemplate(t, { rotation: [Math.PI, 0, 0], position: [0, 0.035, 0] }) : null),

  // bedroomLevel.js: one bent wire lying in the XZ plane, long axis Z. A quarter
  // turn about X stands it up; held by one end, so the loop rises out of the fist.
  paperclip: (t) => (t ? fromTemplate(t, { rotation: [-Math.PI / 2, 0, 0], position: [0, 0.018, 0] }) : null),

  // studyLevel.js: the band runs along X with the lenses facing +Z. Held by one
  // end of the band, the way you pick up a pair of glasses by an arm.
  visor: (t) => (t ? fromTemplate(t, { rotation: [0, 0, Math.PI / 2], position: [0, 0.075, 0] }) : null),

  // hallwayBasementLevel.js's session tape (audio_cassette.glb): lying flat,
  // label up, its tape edge toward +Z. A quarter turn about X stands it up with
  // the label facing +Z and reading upright, and lifting it by half its depth
  // puts the tape edge in the fist -- held up the way you would read a label.
  sessionTape: (t) => (t ? fromTemplate(t, { rotation: [Math.PI / 2, 0, 0], position: [0, 0.03, 0] }) : null),
  // bedroomLevel.js's photo cards stand in their own XY plane, picture to +Z;
  // held by the bottom edge.
  photo1984: (t) => (t ? fromTemplate(t, { position: [0, 0.1, 0] }) : null),
  photo1985: (t) => (t ? fromTemplate(t, { position: [0, 0.1, 0] }) : null),
  photo1986: (t) => (t ? fromTemplate(t, { position: [0, 0.1, 0] }) : null),
  photo1987: (t) => (t ? fromTemplate(t, { position: [0, 0.1, 0] }) : null),
  // fuse.glb already stands along +Y; held by its lower cap.
  fuse15: (t) => (t ? fromTemplate(t, { rotation: [0, Math.PI / 2, 0], position: [0, 0.035, 0] }) : null),
  fuse20: (t) => (t ? fromTemplate(t, { rotation: [0, Math.PI / 2, 0], position: [0, 0.035, 0] }) : null),
  fuse30: (t) => (t ? fromTemplate(t, { rotation: [0, Math.PI / 2, 0], position: [0, 0.035, 0] }) : null),
  fuse45: (t) => (t ? fromTemplate(t, { rotation: [0, Math.PI / 2, 0], position: [0, 0.035, 0] }) : null)
};

/** Every id this module can build -- the same set the hotbar has icons for. */
export const ITEM_MESH_IDS = Object.freeze(Object.keys(BUILDERS));

/**
 * The shared mesh factory. One per game, created in main.js; the levels hand
 * their meshes in with setTemplate() once they exist.
 */
export function createItemMeshes() {
  const templates = new Map();
  const prototypes = new Map();

  /** The prototype for `id`, built on first use, or null if it cannot be yet. */
  function prototypeFor(id) {
    if (prototypes.has(id)) return prototypes.get(id);
    const builder = BUILDERS[id];
    if (!builder) return null;
    const proto = builder(templates.get(id) ?? null);
    if (!proto) return null;
    proto.name = `item:${id}`;
    prototypes.set(id, proto);
    return proto;
  }

  return {
    /**
     * Registers a level's own mesh as the source for an item. Replacing a
     * template drops the cached prototype, so the next build picks it up.
     */
    setTemplate(id, object3D) {
      if (!object3D) return;
      templates.set(id, object3D);
      prototypes.delete(id);
    },

    /** True once `id` can actually be built (its template, if it needs one, is in). */
    has(id) {
      return !!prototypeFor(id);
    },

    /**
     * A fresh copy of the item in the canonical frame.
     *
     * 'held' is a VIEW MODEL: no shadows, because it is inches from the near
     * plane and its shadow would be an enormous smear across whatever the
     * player is looking at (the same reason main.js always gave the held torch);
     * and never frustum-culled, because it hangs off an animated socket whose
     * bounds are not worth trusting at that distance from the lens.
     *
     * 'world' is a prop on the floor: casts and receives like the rest of the
     * room, except transparent glass (the torch lens, the visor's lenses),
     * which three.js would stamp into the shadow map as solid -- the same
     * exception bedroomLevel.js makes for TorchLens.
     *
     * @param {string} id
     * @param {'held'|'world'} view
     * @returns {THREE.Group|null}
     */
    build(id, view = 'world') {
      const proto = prototypeFor(id);
      if (!proto) return null;
      const copy = proto.clone(true);
      const held = view === 'held';
      copy.traverse((o) => {
        if (!o.isMesh) return;
        const transparent = Array.isArray(o.material)
          ? o.material.some((m) => m.transparent)
          : !!o.material?.transparent;
        o.castShadow = held ? false : !transparent;
        o.receiveShadow = !held;
        o.frustumCulled = !held;
      });
      return copy;
    },

    /** How the item lies once dropped. See REST_ROTATION. */
    restRotation(id) {
      return REST_ROTATION[id] ?? FLAT;
    }
  };
}
