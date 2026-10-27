import * as THREE from 'three';
import { MAIN_ONLY } from '../core/RenderLayers.js';

/**
 * A Victorian brass candle sconce: an oval back plate with a beaded rim and a
 * raised boss, a swan-neck arm out of a rosette, a drip pan (the bobeche) with
 * a turned socket, and a taper with a couple of wax runs down its side.
 *
 * WHY A KIT, NOT A MODEL. The study wants seventeen of these and the bedroom
 * four. Every part here is ONE geometry built once and shared by every
 * sconce, so a batcher can draw all the back plates in one instanced call,
 * all the arms in another, and so on -- eight draws for any number of
 * sconces. A downloaded model would be one mesh per sconce, with its own
 * materials, and a licence row in the credits.
 *
 * HOW THE CURVED PARTS ARE MADE -- the same two tools as the decanter and the
 * trim, so nothing new to explain:
 *   - LatheGeometry spins a 2D profile (radius, height) round an axis. The back
 *     plate is a lathe too: spun round the axis that points out of the wall,
 *     then squashed into an oval by the mesh's scale. Its profile walks from
 *     the rim in to the centre, which is the order that makes three.js face
 *     the triangles outwards (walked the other way, the plate shows its back).
 *     The rise and dip in the profile ARE the relief: a bevelled edge, a
 *     beaded rim, a sunk field and a domed boss in the middle.
 *   - TubeGeometry sweeps a circle along a curve. The arm is a cubic Bezier
 *     that leaves the plate level, sags, and comes up vertically under the
 *     drip pan -- the swan neck.
 *
 * Local frame: the origin is on the wall, +z points into the room, +y is up.
 * Place a sconce SCONCE_WALL_OFFSET in front of the wall plane: its plate's
 * back face is that far behind the origin, so it sits on the wallpaper (one
 * millimetre proud, so the two never z-fight) instead of floating off it.
 *
 * Decorative only: no lights of its own -- the flame's light comes from the
 * room's CandleFlames pool -- no colliders, no interaction.
 */

export const SCONCE_WALL_OFFSET = 0.007;

/** Where the candle stands, out from the wall. */
const CANDLE_Z = 0.15;
const PLATE_CENTRE_Y = 0.11;
const PAN_Y = 0.125;
const WAX_BOTTOM = 0.128;
const WAX_HEIGHT = 0.16;
/** The flame's base: the wick, just clear of the wax. */
export const SCONCE_WICK_TIP = new THREE.Vector3(0, WAX_BOTTOM + WAX_HEIGHT + 0.001, CANDLE_Z);

/**
 * The pool light a sconce asks for, standing 20 cm out from the flame -- see
 * "A candle can say where its light stands" in world/CandleFlames.js for why.
 * Levels override intensity (and anything else) per sconce.
 */
export const SCONCE_LIGHT = Object.freeze({ color: 0xff9a48, intensity: 1, distance: 3, decay: 2, offset: [0, 0.022, 0.2] });

const lathe = (points, segments) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);

/**
 * @param {object} options
 * @param {THREE.Material} options.metal  The brass (or iron).
 * @param {THREE.Material} options.wax
 * @param {THREE.Material} [options.wick]
 * @param {object} [options.candles]  world/CandleFlames.js: each sconce's taper is lit on it.
 * @param {THREE.Mesh[]} [options.meshes]  Every part is pushed here as it is made, for the
 *   caller's own batcher (the study's dressRoom). Leave it out and call batch() instead.
 */
export function createWallSconceKit({ metal, wax, wick = null, candles = null, meshes = [] }) {
  const wickMaterial = wick ?? new THREE.MeshStandardMaterial({ color: 0x16110e, roughness: 1 });

  // The back plate, spun round +y and then turned to face +z. Profile in
  // (radius 0..1, height in metres): back face, bevel, beaded rim, sunk
  // field, rising boss. Scaled to 11 x 22 cm by the mesh.
  const plateGeometry = lathe([
    [1.00, -0.006], [1.00, -0.001], [0.97, 0.003], [0.92, 0.0055], [0.86, 0.0055],
    [0.82, 0.003], [0.74, 0.0015], [0.50, 0.0015], [0.40, 0.004], [0.30, 0.0075],
    [0.17, 0.0095], [0.00, 0.010]
  ], 20).rotateX(Math.PI / 2);
  // Rosette, knop and finial drop are one squashed sphere; so are the wax runs.
  const sphereGeometry = new THREE.SphereGeometry(1, 10, 8);
  const armCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, PLATE_CENTRE_Y, 0.004),
    new THREE.Vector3(0, PLATE_CENTRE_Y, 0.085),
    new THREE.Vector3(0, -0.01, CANDLE_Z),
    new THREE.Vector3(0, PAN_Y - 0.012, CANDLE_Z)
  );
  const armGeometry = new THREE.TubeGeometry(armCurve, 20, 0.0055, 6, false);
  // The bottom of the swan neck, where a little drop hangs.
  const armLow = armCurve.getPoints(40).reduce((low, point) => (point.y < low.y ? point : low));
  // The drip pan, walked like a vase: out along the underside, over the lip,
  // and back in across the dish -- one profile, faces outward all the way.
  const panGeometry = lathe([
    [0.000, -0.009], [0.014, -0.009], [0.030, -0.005], [0.042, 0.002], [0.046, 0.007],
    [0.045, 0.010], [0.041, 0.010], [0.038, 0.006], [0.026, 0.002], [0.000, 0.0015]
  ], 16);
  // The socket the taper stands in: a turned waist and a flared rim.
  const cupGeometry = lathe([
    [0.0175, 0.000], [0.0195, 0.006], [0.0150, 0.013], [0.0150, 0.019],
    [0.0185, 0.025], [0.0215, 0.030], [0.0195, 0.0315], [0.0125, 0.029]
  ], 12);
  const waxGeometry = new THREE.CylinderGeometry(0.0108, 0.0118, WAX_HEIGHT, 12);
  const wickGeometry = new THREE.CylinderGeometry(0.0011, 0.0011, 0.012, 5);

  const parts = [];
  function part(parent, geometry, material, position, scale = null) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    // A light fixture's housing reads as nothing from above: kept off the minimap.
    mesh.layers.set(MAIN_ONLY);
    parent.add(mesh);
    parts.push(mesh);
    meshes.push(mesh);
    return mesh;
  }
  const at = (x, y, z) => new THREE.Vector3(x, y, z);

  /**
   * One sconce, its taper lit on `candles`.
   * @param {object} [flame]  CandleFlames.add() options; `light` defaults to SCONCE_LIGHT,
   *   and an object for it is merged over SCONCE_LIGHT (so { intensity: 2 } keeps the offset).
   * @returns {THREE.Group} with userData.wickTip, the flame's anchor.
   */
  function build({ light = true, ...flame } = {}) {
    const object = new THREE.Group();
    object.name = 'Brass_Candle_Sconce';
    part(object, plateGeometry, metal, at(0, PLATE_CENTRE_Y, 0), [0.055, 0.11, 1]);
    part(object, sphereGeometry, metal, at(0, PLATE_CENTRE_Y, 0.008), [0.017, 0.017, 0.009]);
    part(object, armGeometry, metal, at(0, 0, 0));
    part(object, sphereGeometry, metal, at(0, armLow.y - 0.008, armLow.z), [0.006, 0.011, 0.006]);
    part(object, sphereGeometry, metal, at(0, PAN_Y - 0.011, CANDLE_Z), [0.011, 0.008, 0.011]);
    part(object, panGeometry, metal, at(0, PAN_Y, CANDLE_Z));
    part(object, cupGeometry, metal, at(0, PAN_Y + 0.0015, CANDLE_Z));
    part(object, waxGeometry, wax, at(0, WAX_BOTTOM + WAX_HEIGHT / 2, CANDLE_Z));
    // Two runs of wax down the taper's side, half sunk into it.
    for (const [angle, top, length] of [[0.7, 0.004, 0.024], [2.5, 0.010, 0.040]]) {
      part(object, sphereGeometry, wax, at(
        Math.cos(angle) * 0.0102, WAX_BOTTOM + WAX_HEIGHT - top - length / 2, CANDLE_Z + Math.sin(angle) * 0.0102
      ), [0.0032, length / 2, 0.0032]);
    }
    part(object, wickGeometry, wickMaterial, at(0, SCONCE_WICK_TIP.y + 0.002, CANDLE_Z));
    const wickTip = new THREE.Object3D();
    wickTip.name = 'Sconce_Candle_Wick_Tip';
    wickTip.position.copy(SCONCE_WICK_TIP);
    object.add(wickTip);
    object.userData.wickTip = wickTip;
    const lightSettings = light === true ? SCONCE_LIGHT : light ? { ...SCONCE_LIGHT, ...light } : false;
    candles?.add(wickTip, { width: 0.016, height: 0.048, halo: 0.08, ...flame, light: lightSettings });
    return object;
  }

  /**
   * Collapses every part built so far into one InstancedMesh per geometry and
   * material, parented to `root` (the parts must already be in its tree). The
   * sconce groups and their wick-tip anchors stay; only the meshes go.
   */
  function batch(root) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const groups = new Map();
    for (const mesh of parts) {
      const key = `${mesh.geometry.uuid}:${mesh.material.uuid}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mesh);
    }
    const matrix = new THREE.Matrix4();
    for (const list of groups.values()) {
      const instances = new THREE.InstancedMesh(list[0].geometry, list[0].material, list.length);
      instances.name = 'Wall_Sconce_Instances';
      instances.castShadow = false;
      instances.receiveShadow = true;
      instances.layers.mask = list[0].layers.mask;
      list.forEach((mesh, index) => {
        instances.setMatrixAt(index, matrix.multiplyMatrices(inverse, mesh.matrixWorld));
        mesh.removeFromParent();
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingSphere();
      root.add(instances);
    }
    parts.length = 0;
  }

  return { build, batch };
}
