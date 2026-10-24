import * as THREE from 'three';
import { loadModel } from '../world/modelLoader.js';
import annabelleUrl from '../assets/models/study/annabelle.glb?url';
import skirtLinenUrl from '../assets/textures/study/annabelle_skirt_linen.png?url';

/**
 * ANNABELLE AT SIXTEEN, made from "Victorian Child - Low Poly Character Model"
 * by _memo (Sketchfab, CC-BY 4.0) rather than modelled from nothing: the same
 * hand-painted low-poly figure, reshaped into a girl of about sixteen in a
 * long nightgown that has been through a lot.
 *
 * annabelle.glb is the source with its colour atlas recoloured and dirtied
 * (scripts/build_annabelle.py). Everything about her shape is done here, to the
 * vertices, in the model's own units (feet at y 0, facing +Z, 0.1136 tall):
 *
 *   1. the arms come down from the source's A-pose to her sides, each turned
 *      about its shoulder, the turn faded in across the armpit so the shoulder
 *      bends rather than tears;
 *   2. the loose tunic is taken in to her hips;
 *   3. the body is stretched -- legs 1.35x, torso 1.12x -- each change blended
 *      over a few millimetres so no seam opens between them; the head keeps its
 *      own size, which is what makes her read as older than the child she was;
 *   4. an ankle-length skirt carries the nightgown on from the tunic's hem, with
 *      long hair down her back and a ribbon tied in it.
 *
 * Then scaled to HEIGHT_M, standing on y 0. The mesh has no skeleton, so this
 * is a statue's pose, which is all the study asks of her.
 */

const HEIGHT_M = 1.62;

const smooth = (x, a, b) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The shoulder each arm turns about, and how far it comes down (radians). */
const SHOULDER = { x: 0.0115, y: 0.081 };
const ARM_DROP = 0.42;
/** Only below the neck: the head is as wide as the shoulders. */
const ARM_TOP = 0.087;
/**
 * Where the arm begins, out from the middle, at original height y. It follows
 * the body down: at the shoulder the arm starts just past the chest, but by the
 * hips the A-posed arm is far out and the tunic flares wide, and a fixed line
 * there turned the tunic's hem with the arms.
 */
const armFrom = (y) => 0.0102 + 0.0073 * (1 - smooth(y, 0.055, 0.075));
const ARM_BLEND = 0.0035;

/**
 * The hips the tunic is taken in to: half-widths across and front to back, about
 * the body's own middle, which sits a little behind the origin. Fully taken in
 * from HIP_FROM (the hem is at ~0.0397) and not at all above HIP_TO, the waist.
 */
const HIP = { x: 0.0114, z: 0.0080, cz: -0.0017 };
const HIP_FROM = 0.041;
const HIP_TO = 0.066;

/** How much each band of the body is stretched, by original height: [up to y, factor]. */
const STRETCH = [[0.043, 1.35], [0.047, 1.12], [0.084, 1.12], [0.092, 1.0]];
/** The hair and ribbon were fitted to a head drawn in to 0.82, before it was left at full size. */
const HAIR_FIT = 1 / 0.82;

/** The stretch factor at original height y: constant in each band, eased between them. */
function stretchAt(y) {
  if (y <= STRETCH[0][0]) return STRETCH[0][1];
  for (let i = 1; i < STRETCH.length; i++) {
    const [y1, k1] = STRETCH[i];
    const [y0, k0] = STRETCH[i - 1];
    if (y <= y1) return k0 + (k1 - k0) * smooth(y, y0, y1);
  }
  return STRETCH[STRETCH.length - 1][1];
}

/** Original height -> new height: the running integral of stretchAt, tabulated once. */
const at = (() => {
  const steps = 2000;
  const top = 0.12;
  const table = new Float32Array(steps + 1);
  let acc = 0;
  for (let i = 1; i <= steps; i++) {
    acc += stretchAt((i - 0.5) * top / steps) * top / steps;
    table[i] = acc;
  }
  return (y) => {
    const f = Math.min(steps, Math.max(0, y / top * steps));
    const i = Math.floor(f);
    return i >= steps ? table[steps] : table[i] + (table[i + 1] - table[i]) * (f - i);
  };
})();

/** One original-space point, moved: arms down, hips taken in, body stretched. */
function reshape(v) {
  const side = Math.sign(v.x);
  const from = armFrom(v.y);
  const arm = v.y < ARM_TOP ? smooth(Math.abs(v.x), from, from + ARM_BLEND) : 0;
  if (arm > 0) {
    const a = -side * ARM_DROP * arm;
    const px = side * SHOULDER.x;
    const dx = v.x - px;
    const dy = v.y - SHOULDER.y;
    v.x = px + dx * Math.cos(a) - dy * Math.sin(a);
    v.y = SHOULDER.y + dx * Math.sin(a) + dy * Math.cos(a);
  } else {
    // Whatever stands out past the hips between waist and hem comes in to them.
    const fit = v.y > 0.034 ? smooth(v.y, HIP_TO, HIP_FROM) : 0;
    if (fit > 0) {
      if (Math.abs(v.x) > HIP.x) v.x = Math.sign(v.x) * (HIP.x + (Math.abs(v.x) - HIP.x) * (1 - fit));
      const dz = v.z - HIP.cz;
      if (Math.abs(dz) > HIP.z) v.z = HIP.cz + Math.sign(dz) * (HIP.z + (Math.abs(dz) - HIP.z) * (1 - fit));
    }
  }
  v.y = at(v.y);
  return v;
}

/** The ankle-length skirt, from the hips inside the tunic out to the floor, with soft folds. */
function buildSkirt(linen, lace) {
  const hem = at(0.0405);
  const ankle = 0.0035;
  const profile = [
    new THREE.Vector2(0.0188, ankle),
    new THREE.Vector2(0.0172, hem - (hem - ankle) * 0.72),
    new THREE.Vector2(0.0142, hem - (hem - ankle) * 0.3),
    new THREE.Vector2(HIP.x, hem),
    // Up inside the tunic, which is fitted to the same hips: its hem is the only edge seen.
    new THREE.Vector2(HIP.x * 0.93, hem + 0.012)
  ];
  const geometry = new THREE.LatheGeometry(profile, 48);
  // Folds deepening toward the hem: a lathe is a lampshade without them.
  const p = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const down = THREE.MathUtils.clamp((hem - v.y) / (hem - ankle), 0, 1);
    const phi = Math.atan2(v.x, v.z);
    const fold = 1 + down * (0.045 * Math.sin(phi * 9) + 0.02 * Math.sin(phi * 4 + 1.3));
    p.setXYZ(i, v.x * fold, v.y, v.z * fold);
  }
  geometry.computeVertexNormals();
  const skirt = new THREE.Group();
  skirt.add(new THREE.Mesh(geometry, linen));
  const frill = new THREE.Mesh(new THREE.CylinderGeometry(0.0192, 0.0198, 0.0035, 48, 1, true), lace);
  frill.position.y = ankle + 0.0018;
  skirt.add(frill);
  // Oval like her hips, so her heels and the back of the tunic stay inside it.
  skirt.scale.z = HIP.z / HIP.x;
  skirt.position.z = HIP.cz;
  return skirt;
}

/** Long hair down her back, the back of a tapering shell, open at her face. */
function buildHair(material) {
  const crown = at(0.1105);
  const ends = at(0.069);
  const profile = [];
  for (let i = 10; i >= 0; i--) {
    const t = i / 10;
    // Round over the back of the head, then falling nearly straight.
    const r = HAIR_FIT * (t < 0.25 ? 0.0074 + 0.0032 * Math.sin(t / 0.25 * Math.PI / 2) : 0.0106 + 0.0014 * (t - 0.25));
    profile.push(new THREE.Vector2(r, crown - (crown - ends) * t));
  }
  // A lathe sweeps from +Z, her front: start past her face and stop short of it.
  const hair = new THREE.Mesh(new THREE.LatheGeometry(profile, 24, Math.PI * 0.35, Math.PI * 1.3), material);
  hair.scale.z = 0.92;
  hair.position.z = -0.0012 * HAIR_FIT;
  return hair;
}

/** A ribbon tied at the back of her head: two loops, two tails and the knot. */
function buildBow(material) {
  const bow = new THREE.Group();
  bow.position.set(0, at(0.1035), -0.0098 * HAIR_FIT);
  bow.scale.setScalar(HAIR_FIT);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.ConeGeometry(0.0028, 0.006, 10), material);
    loop.rotation.z = s * Math.PI / 2;
    loop.position.x = s * 0.003;
    loop.scale.z = 0.45;
    bow.add(loop);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.007, 0.0005), material);
    tail.position.set(s * 0.0012, -0.004, -0.0003);
    tail.rotation.z = s * 0.25;
    bow.add(tail);
  }
  bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.0013, 8, 6), material));
  return bow;
}

/** Her look through the broken eye: dimmed and drawn toward the house's violet. */
const UNCORRECTED_TINT = new THREE.Color(0x6c6276);

/**
 * Annabelle, standing on y 0 facing +Z. The group is returned at once and she
 * appears in it when her model has loaded.
 *
 * @returns {{ root: THREE.Group, ready: Promise<void>, setCorrectedSight: (on: boolean) => void }}
 */
export function createAnnabelle() {
  const root = new THREE.Group();
  root.name = 'Annabelle';
  /** Each material and the colour it has with the visor on, for setCorrectedSight. */
  const tinted = [];
  let corrected = false;
  const tint = (material) => {
    tinted.push({ material, colour: material.color.clone() });
    return material;
  };
  const applySight = () => {
    for (const { material, colour } of tinted) {
      material.color.copy(colour);
      if (!corrected) material.color.multiply(UNCORRECTED_TINT);
    }
  };

  const skirtMap = new THREE.TextureLoader().load(skirtLinenUrl);
  // A GLB's convention, as the lathe's v runs from the ankle up; and round the skirt.
  skirtMap.flipY = false;
  skirtMap.colorSpace = THREE.SRGBColorSpace;
  skirtMap.wrapS = THREE.RepeatWrapping;
  const linen = tint(new THREE.MeshStandardMaterial({ map: skirtMap, roughness: 0.92, side: THREE.DoubleSide }));
  // Gone grey at the floor, like the hem above it.
  const lace = tint(new THREE.MeshStandardMaterial({ color: 0x9d9078, roughness: 0.85, side: THREE.DoubleSide }));
  const hair = tint(new THREE.MeshStandardMaterial({ color: 0x2c2230, roughness: 0.75, side: THREE.DoubleSide }));
  const ribbon = tint(new THREE.MeshStandardMaterial({ color: 0x5f6f8c, roughness: 0.6 }));

  const ready = loadModel(annabelleUrl).then((source) => {
    const body = new THREE.Group();
    // The source's node matrices turn it Z-up to Y-up and scale it to 0.01;
    // baked into the vertices so everything works in one frame.
    source.updateMatrixWorld(true);
    source.traverse((o) => {
      if (!o.isMesh) return;
      const geometry = o.geometry.clone();
      geometry.applyMatrix4(o.matrixWorld);
      const p = geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) p.setXYZ(i, ...reshape(v.fromBufferAttribute(p, i)).toArray());
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      body.add(new THREE.Mesh(geometry, tint(o.material)));
    });
    body.add(buildSkirt(linen, lace), buildHair(hair), buildBow(ribbon));

    // To height, standing on the floor.
    const box = new THREE.Box3().setFromObject(body);
    const scale = HEIGHT_M / (box.max.y - box.min.y);
    body.scale.setScalar(scale);
    body.position.y = -box.min.y * scale;
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    root.add(body);
    applySight();
  }).catch((error) => console.warn('Annabelle could not load:', error));

  return {
    root,
    ready,
    setCorrectedSight(on) {
      corrected = on;
      applySight();
    }
  };
}
