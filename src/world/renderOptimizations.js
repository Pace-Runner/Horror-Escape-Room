// Render-cost trims that leave every frame looking exactly as it did.
//
// Each one here removes work the GPU or three.js was doing for a result
// nobody could see. None of them touches a texture, a light's brightness, a
// material's look or the post chain -- if a change here ever shows up on
// screen, it is a bug in this file, not a trade-off.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * How far apart a geometry's bounding box can be on one axis and still count
 * as flat. Decal planes are authored at exactly zero thickness; this only
 * absorbs float noise from baked transforms.
 */
const FLAT_GEOMETRY_TOLERANCE_METRES = 1e-5;

/**
 * Reports whether a geometry lies entirely in one plane.
 *
 * Checked from the bounding box rather than the geometry's class, so it also
 * catches flat meshes that came out of a GLB as a plain BufferGeometry -- and,
 * just as importantly, it REJECTS a single geometry built from several
 * crossed planes, which is not flat even though every part of it is.
 *
 * Only axis-aligned flatness is detected (a plane baked at an angle into its
 * vertices reads as not flat). That errs the safe way: such a mesh just keeps
 * three.js's default two-pass draw.
 *
 * @param {THREE.BufferGeometry} geometry - the geometry to test. Its
 *   boundingBox is computed if it has not been already.
 * @returns {boolean} true when one axis of the bounding box has no extent.
 */
function isGeometryFlat(geometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  return max.x - min.x <= FLAT_GEOMETRY_TOLERANCE_METRES
    || max.y - min.y <= FLAT_GEOMETRY_TOLERANCE_METRES
    || max.z - min.z <= FLAT_GEOMETRY_TOLERANCE_METRES;
}

/**
 * Lets flat, transparent, double-sided materials draw in one pass instead of
 * two.
 *
 * WHY THIS IS THE BIG ONE. three.js draws every transparent DoubleSide
 * material twice -- back faces, then front faces -- so a closed transparent
 * shape sorts against itself. To do it, it flips `material.side` and sets
 * `material.needsUpdate` TWICE PER MESH PER FRAME, which throws away the
 * renderer's cached program choice and makes it rebuild the full program key
 * for that mesh every time. The backrooms has hundreds of such decals (damp
 * stains, blood, cobwebs, lenses, glare), and profiling had getProgram /
 * getProgramCacheKey / getParameters near the top of every frame there.
 *
 * WHY IT LOOKS IDENTICAL. A flat plane can only ever show one of its two
 * faces to the camera at any pixel, so the back-face pass and the front-face
 * pass never both draw the same fragment. One DoubleSide pass draws exactly
 * the fragments the two passes did, in the same order relative to everything
 * else.
 *
 * A material is only switched when EVERY mesh using it is flat: a material
 * shared with one real 3D shape keeps the two-pass draw that shape needs.
 *
 * Idempotent and cheap (one traversal), so it is safe to call again after a
 * level's GLBs finish loading in.
 *
 * @param {THREE.Object3D} root - the subtree to scan, usually the scene.
 * @returns {number} how many materials were switched to a single pass by this
 *   call (materials already switched by an earlier call are not counted).
 */
export function enableSinglePassForFlatDecals(root) {
  // Material -> whether every mesh seen using it so far is flat.
  const allUsersFlatByMaterial = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const geometryIsFlat = isGeometryFlat(object.geometry);
    for (const material of materials) {
      if (!material?.transparent || material.side !== THREE.DoubleSide) continue;
      const allUsersFlat = allUsersFlatByMaterial.get(material) ?? true;
      allUsersFlatByMaterial.set(material, allUsersFlat && geometryIsFlat);
    }
  });

  let switchedMaterialCount = 0;
  for (const [material, allUsersFlat] of allUsersFlatByMaterial) {
    if (!allUsersFlat || material.forceSinglePass) continue;
    material.forceSinglePass = true;
    switchedMaterialCount++;
  }
  return switchedMaterialCount;
}

/**
 * Creates a per-frame switch that stops re-rendering shadow maps for lights
 * that are currently giving no light.
 *
 * three.js re-renders a shadow-casting light's shadow map every frame whether
 * or not the light is on -- intensity 0 is still a light as far as the shadow
 * pass is concerned. For a PointLight that is six full scene renders (one per
 * cube face). In this game that was:
 *   - the bedroom ceiling bulb, which blows early and then stays at 0 for the
 *     whole of Level 1 -- roughly 350 of the bedroom's ~470 draw calls a frame;
 *   - the torch's spill light, whenever the torch is off or not yet found;
 *   - the lab's surgical lamp, dark until the power is restored.
 *
 * A dark light's shadow map contributes nothing to the frame, so skipping its
 * update is invisible. The moment the intensity rises again the next update()
 * turns auto-updates back on BEFORE that frame renders, so the light never
 * shows a stale shadow.
 *
 * Lights whose shadow.autoUpdate is already false when they are collected are
 * left alone: those (the bedroom's lightning) refresh their shadow by hand on
 * purpose and this must not take that over.
 *
 * @param {THREE.Light[]} lights - candidate lights; any that do not cast
 *   shadows or already manage their own shadow updates are ignored.
 * @returns {{ update: () => void, refreshAllShadowsOnce: () => void,
 *   lightCount: number }} call update() once per frame before rendering.
 */
export function createDarkShadowSkipper(lights) {
  const managedLights = lights.filter((light) => light.castShadow && light.shadow?.autoUpdate);

  /** Matches each managed light's shadow updates to whether it is lit. */
  function update() {
    for (const light of managedLights) {
      light.shadow.autoUpdate = light.intensity > 0;
    }
  }

  /**
   * Makes the next render draw every managed light's shadow map, dark or not.
   * For the loading screen's warm-up draws: a shadow pass that is skipped never
   * builds its depth shaders, and they would then be built mid-game the first
   * time that light comes on.
   */
  function refreshAllShadowsOnce() {
    for (const light of managedLights) light.shadow.needsUpdate = true;
  }

  return {
    update, refreshAllShadowsOnce,
    addLights(lights) {
      for (const light of lights) {
        if (light.castShadow && light.shadow?.autoUpdate && !managedLights.includes(light)) managedLights.push(light);
      }
    },
    get lightCount() { return managedLights.length; }
  };
}

/**
 * Lists every shadow-casting light under a root.
 *
 * @param {THREE.Object3D} root - the subtree to scan.
 * @returns {THREE.Light[]} the lights with castShadow set, in traversal order.
 */
export function findShadowCastingLights(root) {
  const shadowCastingLights = [];
  root.traverse((object) => {
    if (object.isLight && object.castShadow) shadowCastingLights.push(object);
  });
  return shadowCastingLights;
}

/**
 * Builds the key that decides which meshes may share one draw call: same
 * material, and the same per-object render flags. Two meshes that differ in
 * any of these would draw differently once merged, so they stay apart.
 *
 * @param {THREE.Mesh} mesh - the mesh to key.
 * @returns {string} a key equal for meshes that can be merged together.
 */
function createMergeKey(mesh) {
  return [
    mesh.material.uuid,
    mesh.castShadow,
    mesh.receiveShadow,
    mesh.layers.mask,
    mesh.renderOrder
  ].join('|');
}

/**
 * Replaces many static meshes with one mesh per material, baking each mesh's
 * position, rotation and scale into the merged geometry.
 *
 * WHY. Every mesh is a draw call, and in WebGL each one costs CPU time in
 * three.js and the driver whatever its size -- a dead fly 8 mm across costs
 * the same as a wall. The backrooms drew ~126 flies, ~200 skirting boards and
 * ~180 wall panels one at a time from a handful of shared materials.
 *
 * WHY IT LOOKS IDENTICAL. The vertices end up exactly where the meshes put
 * them and are drawn with the same material, so the depth buffer resolves
 * them the same way. Only use it on OPAQUE meshes: transparent ones are sorted
 * per object, and merging them would change their draw order.
 *
 * Only meshes that are direct children of `parent` are merged (their local
 * matrix is then their transform relative to the parent, which is what gets
 * baked). Anything else, and any material group of just one mesh, is left as
 * it was. The originals are removed from `parent`; their source geometries are
 * not disposed, because the callers share one geometry between many meshes.
 *
 * Callers must not keep references to the meshes passed in -- after this they
 * are no longer in the scene.
 *
 * @param {THREE.Mesh[]} meshes - static, opaque meshes already added to parent.
 * @param {THREE.Object3D} parent - the object the meshes sit directly under;
 *   the merged meshes are added here.
 * @param {string} [name] - name for the merged meshes, to keep the scene
 *   readable in a debugger.
 * @returns {THREE.Mesh[]} the merged meshes that were created.
 */
export function mergeStaticMeshesByMaterial(meshes, parent, name = 'MergedStatic') {
  const meshesByKey = new Map();
  for (const mesh of meshes) {
    if (mesh.parent !== parent || Array.isArray(mesh.material)) continue;
    const key = createMergeKey(mesh);
    if (!meshesByKey.has(key)) meshesByKey.set(key, []);
    meshesByKey.get(key).push(mesh);
  }

  const mergedMeshes = [];
  for (const meshGroup of meshesByKey.values()) {
    if (meshGroup.length < 2) continue;
    const bakedGeometries = meshGroup.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const mergedGeometry = mergeGeometries(bakedGeometries);
    bakedGeometries.forEach((geometry) => geometry.dispose());
    // null when the geometries have mismatched attributes; leave those meshes
    // drawing separately rather than lose any of them.
    if (!mergedGeometry) continue;

    const [firstMesh] = meshGroup;
    const mergedMesh = new THREE.Mesh(mergedGeometry, firstMesh.material);
    mergedMesh.name = name;
    mergedMesh.castShadow = firstMesh.castShadow;
    mergedMesh.receiveShadow = firstMesh.receiveShadow;
    mergedMesh.layers.mask = firstMesh.layers.mask;
    mergedMesh.renderOrder = firstMesh.renderOrder;
    meshGroup.forEach((mesh) => parent.remove(mesh));
    parent.add(mergedMesh);
    mergedMeshes.push(mergedMesh);
  }
  return mergedMeshes;
}
