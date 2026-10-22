import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Shared loader for Blender-authored .glb assets (see blender/*.py for the
// generation scripts). One GLTFLoader instance reused across every call
// rather than constructing a new one per model.
const loader = new GLTFLoader();
const models = new Map();
let loadingEnabled = true;
let enableLoading = null;
let loadingGate = Promise.resolve();

/** The launch menu needs no game models. Release this gate once Start is clicked. */
export function deferModelLoads() {
  if (!loadingEnabled) return;
  loadingEnabled = false;
  loadingGate = new Promise((resolve) => { enableLoading = resolve; });
}

export function startModelLoads() {
  loadingEnabled = true;
  enableLoading?.();
  enableLoading = null;
}

export function preloadModel(url) {
  if (!models.has(url)) {
    const ready = loadingGate.then(() => loader.loadAsync(url));
    models.set(url, ready);
    ready.catch(() => models.delete(url));
  }
  return models.get(url);
}

export function loadModel(url) {
  return preloadModel(url).then((gltf) => {
    const scene = clone(gltf.scene);
    const materials = new Map();
    const geometries = new Map();
    const textures = new Map();
    const copyMaterial = (material) => {
      if (!materials.has(material)) {
        const copy = material.clone();
        for (const [key, value] of Object.entries(copy)) {
          if (!value?.isTexture) continue;
          if (!textures.has(value)) textures.set(value, value.clone());
          copy[key] = textures.get(value);
        }
        materials.set(material, copy);
      }
      return materials.get(material);
    };
    scene.traverse((node) => {
      // Room-specific UV/rig/material edits remain isolated, just as separate
      // GLTF loads were. Only fetching, decoding and parsing are shared.
      if (node.geometry) {
        if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
        node.geometry = geometries.get(node.geometry);
      }
      if (node.material) node.material = Array.isArray(node.material)
        ? node.material.map(copyMaterial) : copyMaterial(node.material);
    });
    replaceTransmission(scene);
    scene.userData.animations = gltf.animations ?? [];
    return scene;
  });
}

/**
 * Exported see-through glass (glTF's KHR_materials_transmission) becomes plain
 * transparent glass letting the same share of light through.
 *
 * three.js's `transmission` renders the whole scene a second time for every
 * frame the glass is on screen, and builds every shader in view a second time
 * for that render -- measured at about half of the opening load, from one
 * perfume bottle. TintedGlassMaterial avoids it by hand for the same reason.
 */
function replaceTransmission(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    for (const material of [].concat(child.material)) {
      if (!(material?.transmission > 0)) continue;
      material.opacity = 1 - material.transmission;
      material.transmission = 0;
      material.transparent = true;
      material.depthWrite = false;
    }
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

// Three's ImageLoader reads this same decoded-image cache at level creation.
THREE.Cache.enabled = true;
const texturePreloads = new Map();
export function preloadTexture(url) {
  if (!texturePreloads.has(url)) {
    const ready = new THREE.TextureLoader().loadAsync(url);
    texturePreloads.set(url, ready);
    ready.catch(() => texturePreloads.delete(url));
  }
  return texturePreloads.get(url);
}
const fontPreloads = new Map();
export function preloadFont(url) {
  if (!fontPreloads.has(url)) {
    fontPreloads.set(url, new FontFace('NoteHandwriting', `url(${url})`).load().then((face) => document.fonts.add(face)));
  }
  return fontPreloads.get(url);
}
