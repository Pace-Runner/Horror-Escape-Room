import * as THREE from 'three';
import wallpaperUrl from '../assets/textures/study/option_a_damask_512.jpg?url';
import floorUrl from '../assets/textures/study/weathered_dark_hardwood_floor_texture.png?url';
import ceilingUrl from '../assets/textures/study/option_a_ceiling_512.jpg?url';
import builtInWoodUrl from '../assets/textures/study/aged_dark_brown_wood_grain_texture.png?url';
import trimWoodUrl from '../assets/textures/study/aged_espresso_wood_grain_texture.png?url';
import featureWoodUrl from '../assets/textures/study/polished_mahogany_wood_grain_texture.png?url';
import wallRoughnessUrl from '../assets/textures/study/wall_roughness_512.png?url';
import floorRoughnessUrl from '../assets/textures/study/floor_roughness_512.png?url';
import woodRoughnessUrl from '../assets/textures/study/wood_roughness_512.png?url';

// Option A wall/ceiling tiles are cropped from the supplied sheet at 512px; wood/floors unchanged.
// No runtime image baking, duplicated texture loads or large source uploads.
const surfaceTextures = new Map();
function loadSurface(url, color = true, mirrored = false) {
  if (!surfaceTextures.has(url)) {
    const map = new THREE.TextureLoader().load(url);
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = mirrored ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    map.anisotropy = 4;
    surfaceTextures.set(url, map);
  }
  return surfaceTextures.get(url);
}

/** Shared study palette. Replace synthetic wood only; preserve other authored channels. */
export function createStudySurfaces() {
  const wallMap = loadSurface(wallpaperUrl);
  const wallRoughness = loadSurface(wallRoughnessUrl, false, true);
  const floorMap = loadSurface(floorUrl);
  const floorRoughness = loadSurface(floorRoughnessUrl, false);
  const ceilingMap = loadSurface(ceilingUrl);
  const woodMaps = {
    builtIn: loadSurface(builtInWoodUrl), trim: loadSurface(trimWoodUrl), feature: loadSurface(featureWoodUrl)
  };
  // Supplied grain runs vertically. Existing metre-based UVs use U along the
  // timber, so rotate the shared samplers instead of stretching/rotating meshes.
  for (const map of Object.values(woodMaps)) {
    map.center.set(0.5, 0.5);
    map.rotation = Math.PI / 2;
  }
  const woodRoughness = loadSurface(woodRoughnessUrl, false);
  const woodMaterials = new Map();
  const materialCache = new Map();
  const seenMaterials = new WeakSet();
  const loftFloorMaterial = new THREE.MeshStandardMaterial({
    name: 'StudyLoftFloorboards', map: floorMap, roughnessMap: floorRoughness,
    color: 0xe0d9cf, roughness: 1, envMapIntensity: 0.2
  });
  function woodMaterial(shade = 1, family = 'builtIn') {
    const key = `${family}:${shade}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const material = new THREE.MeshStandardMaterial({
      name: `StudyWood_${family}_${shade}`,
      map: woodMaps[family], roughnessMap: woodRoughness,
      color: new THREE.Color(family === 'feature' ? 0xc2c7c2 : family === 'trim' ? 0xc4c0b8 : 0xddd5ca).multiplyScalar(shade),
      roughness: family === 'feature' ? 0.86 : 1, envMapIntensity: family === 'feature' ? 0.3 : 0.2
    });
    woodMaterials.set(material, shade);
    materialCache.set(key, material);
    return material;
  }
  function floorSurface(mesh, edgeMaterial = null) {
    mesh.userData.studyFloorSurface = true;
    if (edgeMaterial) {
      // Two draw groups, rather than one per box face; positions stay identical.
      const geometry = mesh.geometry, original = geometry.index.array;
      const edges = [], top = [];
      for (const face of geometry.groups) {
        const destination = face.materialIndex === 2 ? top : edges;
        for (let i = face.start; i < face.start + face.count; i++) destination.push(original[i]);
      }
      geometry.setIndex([...edges, ...top]);
      geometry.clearGroups();
      geometry.addGroup(0, edges.length, 0);
      geometry.addGroup(edges.length, top.length, 1);
      mesh.material = [edgeMaterial, loftFloorMaterial];
    }
  }
  function harmoniseAsset(model, woodFamily = 'feature') {
    model.updateMatrixWorld(true);
    model.traverse((object) => {
      if (!object.isMesh) return;
      const woodSlots = new Set();
      const materials = [].concat(object.material);
      materials.forEach((material, index) => {
        const name = material.name.toLowerCase();
        if (name.includes('walnut')) woodSlots.add(index);
        if (seenMaterials.has(material)) return;
        seenMaterials.add(material);
        if (name.includes('walnut')) {
          const shared = woodMaterial(0.95, woodFamily);
          material.map = shared.map;
          material.roughnessMap = shared.roughnessMap;
          material.color.copy(shared.color);
          material.metalness = 0;
          material.roughness = shared.roughness;
          material.envMapIntensity = shared.envMapIntensity;
          material.needsUpdate = true;
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
      });
      if (!woodSlots.size) return;
      // Imported Blender meshes can carry a Z-up transform. Project in the
      // converted model space, touching UVs only on wood material primitives.
      const geometry = object.geometry = object.geometry.clone();
      const positions = geometry.attributes.position, normals = geometry.attributes.normal;
      const uv = geometry.attributes.uv;
      if (!uv) return;
      const vertices = new Set();
      if (!geometry.groups.length) {
        for (let i = 0; i < positions.count; i++) vertices.add(i);
      } else for (const section of geometry.groups) {
        if (!woodSlots.has(section.materialIndex)) continue;
        for (let i = section.start; i < section.start + section.count; i++) vertices.add(geometry.index ? geometry.index.getX(i) : i);
      }
      const point = new THREE.Vector3(), normal = new THREE.Vector3();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
      for (const i of vertices) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
        const horizontal = Math.abs(normal.y) > 0.7;
        const along = horizontal ? point.x : point.y;
        const across = horizontal || Math.abs(normal.x) > 0.7 ? point.z : point.x;
        uv.setXY(i, along / 0.85, across / 0.25);
      }
      uv.needsUpdate = true;
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
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const mappedGeometry = new WeakMap();
    group.traverse((object) => {
      if (!object.isMesh) return;
      const materials = [].concat(object.material);
      const wood = materials.some(material => woodMaterials.has(material));
      if (object.material !== wallMaterial && !wood && !object.userData.studyFloorSurface) return;
      object.getWorldScale(scale);
      // Unit-box fixtures can share geometry but have different physical scales.
      // Cache by scale instead of changing shared UVs according to the first mesh.
      const source = object.geometry;
      const grainOffset = object.userData.studyGrainOffset || 0;
      const key = `${scale.x.toFixed(5)},${scale.y.toFixed(5)},${scale.z.toFixed(5)},${grainOffset}`;
      if (wood && !object.isInstancedMesh && !object.userData.studyFloorSurface) {
        let variants = mappedGeometry.get(source);
        if (!variants) { variants = new Map(); mappedGeometry.set(source, variants); }
        if (variants.has(key)) { object.geometry = variants.get(key); return; }
        object.geometry = source.clone();
        variants.set(key, object.geometry);
      }
      const geometry = object.geometry;
      const uv = geometry.getAttribute('uv'), positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      if (!uv) return;
      if (object.material === wallMaterial) {
        const colors = new Float32Array(positions.count * 3);
        for (let i = 0; i < uv.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
          normal.fromBufferAttribute(normals, i).transformDirection(object.matrixWorld);
          // Unwrap once around the room: adjacent walls share phase at corners.
          // 26 square repeats close exactly around the 58m perimeter, without mirroring.
          const around = Math.abs(normal.x) > 0.5
            ? (normal.x < 0 ? 16 + point.z + 6.5 : 45 + 6.5 - point.z)
            : (normal.z < 0 ? 29 + 8 - point.x : point.x + 8);
          const paperScale = 58 / 26;
          uv.setXY(i, around / paperScale, point.y / paperScale);
          const cornerDistance = Math.abs(normal.x) > 0.5 ? 6.5 - Math.abs(point.z) : 8 - Math.abs(point.x);
          const baseWear = Math.exp(-Math.max(0, point.y) / 0.30)
            + (point.y >= 3.1 ? Math.exp(-(point.y - 3.1) / 0.22) * 0.45 : 0);
          const shade = 1 - 0.15 * Math.exp(-Math.max(0, cornerDistance) / 0.5)
            - 0.14 * baseWear - 0.05 * Math.exp(-(roomHeight - point.y) / 0.35);
          const dust = 1 + 0.025 * Math.sin((point.x + point.z) * 0.39 + Math.sin(point.y * 0.53));
          colors.set([shade * dust, shade * dust, shade * dust], i * 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      } else if (object.userData.studyFloorSurface) {
        for (let i = 0; i < uv.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
          normal.fromBufferAttribute(normals, i).transformDirection(object.matrixWorld);
          // Shared world-space board spacing continues across both loft slabs.
          if (normal.y > 0.7) uv.setXY(i, (point.x + 8) / 3.2, (point.z + 6.5) / 2.0);
          else if (normal.y < -0.7) uv.setXY(i, point.x / 0.85, point.z / 0.25);
          else uv.setXY(i, (Math.abs(normal.x) > 0.7 ? point.z : point.x) / 0.85, point.y / 0.25);
        }
      } else if (geometry.type === 'LatheGeometry') {
        if (geometry.userData.studyGrainAligned) return;
        const height = Math.max(...geometry.parameters.points.map(p => p.y));
        const radius = Math.max(...geometry.parameters.points.map(p => p.x));
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i), v = uv.getY(i);
          uv.setXY(i, v * height / 0.85, u * 2 * Math.PI * radius / 0.25);
        }
        geometry.userData.studyGrainAligned = true;
      } else if (geometry.parameters?.width && geometry.parameters?.height && geometry.parameters?.depth) {
        const width = geometry.parameters.width * scale.x;
        const height = geometry.parameters.height * scale.y;
        const depth = geometry.parameters.depth * scale.z;
        for (let i = 0; i < uv.count; i++) {
          point.fromBufferAttribute(positions, i).multiply(scale);
          normal.fromBufferAttribute(normals, i);
          let along, across;
          if (Math.abs(normal.y) > 0.7) {
            along = depth > width ? point.z : point.x;
            across = depth > width ? point.x : point.z;
          } else if (height >= width && height >= depth) {
            along = point.y; across = Math.abs(normal.x) > 0.7 ? point.z : point.x;
          } else {
            along = depth > width ? point.z : point.x; across = point.y;
          }
          uv.setXY(i, along / 0.85 + grainOffset, across / 0.25 + grainOffset * 0.37);
        }
      }
      uv.needsUpdate = true;
    });
  }
  return { wallMap, wallRoughness, floorMap, floorRoughness, ceilingMap, woodMaterial,
    floorSurface, harmoniseAsset, ageRug, alignSurfaces };
}
