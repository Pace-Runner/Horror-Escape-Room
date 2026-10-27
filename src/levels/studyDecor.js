import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createArchivePaperMaterial } from './studyArchivePresentation.js';

/** Static, non-interactive dressing. Repeated parts are instanced after placement. */
export function createStudyDecor({ woodMaterial, brassMaterial }) {
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
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xe3b36c, toneMapped: false });
  const flameGeometry = new THREE.SphereGeometry(1, 7, 5);
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
  function candle() {
    const object = prop('Decor_Candlestick');
    cylinder(object, brassMaterial, 0.043, 0.012, [0, 0.006, 0]);
    cylinder(object, brassMaterial, 0.010, 0.14, [0, 0.08, 0]);
    cylinder(object, brassMaterial, 0.031, 0.012, [0, 0.155, 0]);
    cylinder(object, wax, 0.012, 0.11, [0, 0.215, 0]);
    mesh(object, flameGeometry, flameMaterial, [0.004, 0.014, 0.004], [0, 0.284, 0]);
    return object;
  }
  function wallSconce() {
    const object = prop('Decor_Brass_Candle_Sconce');
    const back = mesh(object, cylinderGeometry, brassMaterial, [0.050, 0.014, 0.090], [0, 0.10, 0]);
    back.rotation.x = Math.PI / 2;
    box(object, brassMaterial, [0.015, 0.018, 0.14], [0, 0.055, 0.070]);
    place(object, candle(), 0, 0.060, 0.14);
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

    place(fireplace, candle(), -0.68, 1.46, 0.08);
    place(fireplace, book(2, true), 0.59, 1.46, 0.025, 0.10);
    place(fireplace, book(4, true, 0.21, 0.026), 0.59, 1.495, 0.025, -0.035);

    // Follow the chair's local left side, with clearance from its arm and the wall.
    const tablePosition = concealmentChair.localToWorld(new THREE.Vector3(-0.82, 0, 0.24));
    const table = place(group, sideTable(), tablePosition.x, 0, tablePosition.z, concealmentChair.rotation.y);
    place(table, candle(), -0.10, 0.61, -0.075);
    place(table, book(3, true, 0.20, 0.026), 0.075, 0.61, 0.035, -0.14);
    place(table, book(1, true, 0.19, 0.023), 0.075, 0.636, 0.035, -0.075);

    place(group, wallSconce(), 3.90, 1.63, -6.455);
    place(group, wallSconce(), -6.30, 1.65, 6.455, Math.PI);

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
