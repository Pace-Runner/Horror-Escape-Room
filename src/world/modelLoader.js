import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Shared loader for Blender-authored .glb assets (see blender/*.py for the
// generation scripts). One GLTFLoader instance reused across every call
// rather than constructing a new one per model.
const loader = new GLTFLoader();

export function loadModel(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      // Resolves the SCENE, not the whole gltf, because every existing call site
      // wants the scene and nothing else. The clips are attached to it as
      // `userData.animations` rather than thrown away -- glTF puts animations on
      // the gltf root, not the scene, so loading a rigged character used to make
      // its clips unreachable no matter what the .glb contained.
      (gltf) => {
        gltf.scene.userData.animations = gltf.animations ?? [];
        resolve(gltf.scene);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

// Blender materials keep their name through the glTF export, so meshes
// using a given Blender material can be found back by that name and given
// a real map/normalMap -- the Blender scripts only ever set a flat PBR
// colour (no UV-mapped texture baked into the .glb itself), so this is
// how those objects end up with the same canvas-generated texture
// treatment as everything else in the room.
export function applyTextureByMaterialName(root, materialName, map, normalMap) {
  root.traverse((child) => {
    if (child.isMesh && child.material && child.material.name === materialName) {
      child.material.map = map;
      if (normalMap) child.material.normalMap = normalMap;
      child.material.needsUpdate = true;
    }
  });
}
