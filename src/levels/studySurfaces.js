import * as THREE from 'three';
import {
  createDamaskWallpaperTexture, createWoodFloorTexture,
  createWoodFloorRoughnessTexture, createFurnitureWoodTexture
} from '../world/textures.js';

function canvas(size) {
  const image = document.createElement('canvas');
  image.width = image.height = size;
  return image;
}
function texture(image, color = true) {
  const map = new THREE.CanvasTexture(image);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Study-only surface palette. No geometry, lights, or gameplay objects are created. */
export function createStudySurfaces() {
  const wallpaper = createDamaskWallpaperTexture({ base: [77, 72, 65], motif: [87, 81, 72] });
  const wallImage = canvas(1024);
  const wallContext = wallImage.getContext('2d');
  for (let panel = 0; panel < 4; panel++) wallContext.drawImage(wallpaper.image, panel * 256, 0, 256, 1024);
  wallpaper.dispose();
  const wallPixels = wallContext.getImageData(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const index = (y * 1024 + x) * 4;
    const corner = Math.min(x, 1023 - x) / 1024;
    const stain = (0.88 + 0.12 * Math.min(1, corner / 0.13))
      * (1 - 0.055 * Math.sin(x * 0.011 + Math.sin(y * 0.007)) ** 2
        - 0.035 * Math.sin(y * 0.012 + x * 0.0035) ** 2);
    for (let c = 0; c < 3; c++) wallPixels.data[index + c] *= stain;
  }
  wallContext.putImageData(wallPixels, 0, 0);
  const wallMap = texture(wallImage);
  const wallRoughImage = canvas(512);
  const wallRoughContext = wallRoughImage.getContext('2d');
  const wallRoughPixels = wallRoughContext.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const index = (y * 512 + x) * 4;
    const value = 236 + Math.round(10 * Math.sin(x * 0.021 + Math.sin(y * 0.014)) ** 2);
    for (let c = 0; c < 3; c++) wallRoughPixels.data[index + c] = value;
    wallRoughPixels.data[index + 3] = 255;
  }
  wallRoughContext.putImageData(wallRoughPixels, 0, 0);
  const wallRoughness = texture(wallRoughImage, false);

  // Bake the old 4x4 plank coverage into one room map. Grain orientation and
  // board size stay the same; edge dirt no longer repeats in every tile.
  const plankColor = createWoodFloorTexture({ stain: 0.90 });
  const plankRoughness = createWoodFloorRoughnessTexture();
  const floorImage = canvas(1024);
  const floorContext = floorImage.getContext('2d');
  const floorRoughImage = canvas(512);
  const floorRoughContext = floorRoughImage.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    floorContext.drawImage(plankColor.image, x * 256, y * 256, 256, 256);
    floorRoughContext.drawImage(plankRoughness.image, x * 128, y * 128, 128, 128);
  }
  const floorPixels = floorContext.getImageData(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const index = (y * 1024 + x) * 4;
    const edge = Math.min(x, y, 1023 - x, 1023 - y) / 1024;
    const traffic = Math.exp(-((x / 1024 - 0.56) ** 2 / 0.07 + (y / 1024 - 0.65) ** 2 / 0.10));
    const shade = (0.83 + 0.17 * Math.min(1, edge / 0.13)) * (1 - traffic * 0.035);
    floorPixels.data[index] *= shade * 0.84;
    floorPixels.data[index + 1] *= shade * 0.91;
    floorPixels.data[index + 2] *= shade;
  }
  floorContext.putImageData(floorPixels, 0, 0);
  const roughPixels = floorRoughContext.getImageData(0, 0, 512, 512);
  for (let i = 0; i < roughPixels.data.length; i += 4) {
    const value = 195 + roughPixels.data[i + 1] / 255 * 43;
    roughPixels.data[i] = roughPixels.data[i + 1] = roughPixels.data[i + 2] = value;
  }
  floorRoughContext.putImageData(roughPixels, 0, 0);
  plankColor.dispose();
  plankRoughness.dispose();
  const floorMap = texture(floorImage);
  const floorRoughness = texture(floorRoughImage, false);

  const fallbackWood = createFurnitureWoodTexture({ tint: [66, 52, 40] });
  const woodMaterials = new Map();
  let adoptedWood = null;
  const seenMaterials = new WeakSet();
  function applyWood(material, shade) {
    if (!adoptedWood) return;
    material.map = adoptedWood.map;
    material.roughnessMap = adoptedWood.roughnessMap;
    material.color.copy(adoptedWood.color).multiplyScalar(shade);
    material.roughness = 1;
    material.envMapIntensity = 0.3;
    material.needsUpdate = true;
  }
  function woodMaterial(shade = 1) {
    const material = new THREE.MeshStandardMaterial({
      map: fallbackWood, color: new THREE.Color().setScalar(shade), roughness: 0.92
    });
    woodMaterials.set(material, shade);
    applyWood(material, shade);
    return material;
  }
  function adoptWalnut(source) {
    // One sampler setup shared across every procedural wood surface. The packed
    // images themselves stay untouched and are shared with the authored desk.
    const repeatMap = (map) => {
      if (!map || (map.wrapS === THREE.RepeatWrapping && map.wrapT === THREE.RepeatWrapping)) return map;
      const shared = map.clone();
      shared.wrapS = shared.wrapT = THREE.RepeatWrapping;
      shared.needsUpdate = true;
      return shared;
    };
    adoptedWood = { map: repeatMap(source.map), roughnessMap: repeatMap(source.roughnessMap), color: source.color.clone() };
    for (const [material, shade] of woodMaterials) applyWood(material, shade);
    fallbackWood.dispose();
  }
  function harmoniseAsset(model) {
    model.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of [].concat(object.material)) {
        if (seenMaterials.has(material)) continue;
        seenMaterials.add(material);
        const name = material.name.toLowerCase();
        if (name.includes('walnut')) {
          material.color.multiply(new THREE.Color().setRGB(0.77, 0.82, 0.88));
          material.metalness = 0;
          material.roughness = 1;
          material.envMapIntensity = 0.3;
          if ('clearcoat' in material) { material.clearcoat = 0; material.clearcoatRoughness = 0.85; }
        } else if (name.includes('brass')) {
          material.color.multiplyScalar(0.76);
          material.roughness = Math.max(material.roughness, 0.68);
          material.envMapIntensity = 0.35;
        } else if (name.includes('oxblood')) {
          material.color.multiply(new THREE.Color().setRGB(0.84, 0.81, 0.81));
          material.roughness = 1;
        } else if (name.includes('painted steel')) {
          material.color.multiplyScalar(0.86);
          material.roughness = Math.max(material.roughness, 0.94);
          material.metalness = Math.min(material.metalness, 0.35);
          material.envMapIntensity = 0.3;
        } else if (name.includes('cream')) {
          material.color.multiply(new THREE.Color().setRGB(0.88, 0.86, 0.79));
          material.roughness = Math.max(material.roughness, 0.92);
        }
      }
    });
    return model;
  }
  function ageRug(map) {
    const image = map.image;
    const context = image.getContext('2d');
    const pixels = context.getImageData(0, 0, image.width, image.height);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const index = (y * image.width + x) * 4;
      const edge = Math.min(x, y, image.width - 1 - x, image.height - 1 - y) / image.width;
      const shade = (0.87 + 0.13 * Math.min(1, edge / 0.12))
        * (0.96 + 0.035 * Math.sin(x * 0.017) * Math.cos(y * 0.021));
      for (let c = 0; c < 3; c++) pixels.data[index + c] *= shade;
    }
    context.putImageData(pixels, 0, 0);
    map.needsUpdate = true;
    return map;
  }
  function alignSurfaces(group, wallMaterial, roomHeight) {
    group.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const alignedWood = new Set();
    group.traverse((object) => {
      if (!object.isMesh) return;
      const geometry = object.geometry;
      const uv = geometry.getAttribute('uv');
      const positions = geometry.getAttribute('position');
      if (!uv) return;
      if (object.material === wallMaterial) {
        normal.set(0, 0, 1).transformDirection(object.matrixWorld);
        for (let i = 0; i < uv.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
          uv.setXY(i, ((Math.abs(normal.x) > 0.5 ? point.z : point.x) + 8) / 16, point.y / roomHeight);
        }
        uv.needsUpdate = true;
      } else if (woodMaterials.has(object.material) && !alignedWood.has(geometry)) {
        alignedWood.add(geometry);
        if (geometry.type === 'LatheGeometry') {
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
        } else if (geometry.parameters?.width && geometry.parameters?.height && geometry.parameters?.depth) {
          const normals = geometry.getAttribute('normal');
          for (let i = 0; i < uv.count; i++) {
            point.fromBufferAttribute(positions, i);
            normal.fromBufferAttribute(normals, i);
            const { width, height, depth } = geometry.parameters;
            if (Math.abs(normal.y) > 0.7) {
              uv.setXY(i, (depth > width ? point.z : point.x) * 0.8, (depth > width ? point.x : point.z) * 0.8);
            } else if (height >= width && height >= depth) {
              uv.setXY(i, point.y * 0.8, (Math.abs(normal.x) > 0.7 ? point.z : point.x) * 0.8);
            } else {
              uv.setXY(i, (depth > width ? point.z : point.x) * 0.8, point.y * 0.8);
            }
          }
        }
        uv.needsUpdate = true;
      }
    });
  }
  return { wallMap, wallRoughness, floorMap, floorRoughness, woodMaterial, adoptWalnut, harmoniseAsset, ageRug, alignSurfaces };
}
