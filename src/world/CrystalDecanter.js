import * as THREE from 'three';

/**
 * A cut-crystal decanter and a tumbler on the study desk: the game's REFRACTIVE
 * glass, and its deliberately flat-shaded stopper.
 *
 * WHY NOT three's `transmission`. MeshPhysicalMaterial's transmission draws the
 * whole scene a second time, every frame, for as long as the glass is on
 * screen -- the same reason TintedGlassMaterial.js gives for doing the lab's
 * glass in a shader instead. Here the refraction is the textbook
 * environment-mapped kind:
 *
 *   1. ONCE, the first time the study is lit, a CubeCamera standing where the
 *      decanter stands renders the room six times (one per cube face) into a
 *      cube texture -- a STATIC environment map of this exact room. After that
 *      the glass costs one ordinary draw a frame.
 *   2. Per fragment, the shader bends the view ray through the surface with
 *      GLSL's refract() (Snell's law, eta = 1 / index of refraction) and looks
 *      the bent ray up in that cube. Lead crystal is about 1.6.
 *   3. DISPERSION: red, green and blue are bent by slightly different amounts
 *      -- real glass's index varies with wavelength -- so each channel is a
 *      separate lookup, and edges pick up a faint rainbow fringe.
 *   4. FRESNEL: glass seen face-on mostly lets light through; seen edge-on it
 *      mostly reflects. Schlick's approximation, F0 + (1 - F0)(1 - cos)^5 with
 *      F0 from the same index, mixes the refracted lookup with a reflected one
 *      (reflect()), which is what makes the silhouette read as solid glass.
 *   5. THE WHISKY is not another mesh. Below a fill height in the glass's own
 *      space the refracted light is tinted amber, with a bright meniscus line
 *      at the surface -- no second transparent object to sort against the first.
 *
 * SMOOTH VERSUS FLAT SHADING, side by side on purpose. The lathe-turned body
 * and tumbler are SMOOTH: their normals are interpolated across each triangle
 * from the vertices, so 48 flat facets read as one curve. The stopper is the
 * same shader with `flatShading: true`, which makes three define FLAT_SHADED;
 * the shader then throws the interpolated normal away and rebuilds one per
 * triangle from the screen-space derivatives of the world position
 * (cross(dFdx(p), dFdy(p)) is perpendicular to the triangle under the pixel).
 * Every facet refracts the room in its own direction, which is what a cut
 * crystal stopper actually looks like.
 */

/** Lead crystal. Window glass would be ~1.52, water ~1.33. */
const CRYSTAL_INDEX_OF_REFRACTION = 1.6;
/** How far apart red and blue are bent, as a share of eta. Exaggerated a little. */
const CRYSTAL_DISPERSION = 0.022;
/** Glass is very nearly colourless; old lead crystal leans faintly warm. */
const CRYSTAL_TINT = new THREE.Color(0.97, 0.96, 0.93);
/** Whisky, as a transmission colour: what survives a few centimetres of it. */
const WHISKY_TINT = new THREE.Color(0.78, 0.40, 0.11);
/** Off: a fill height below the glass's own base never tints anything. */
const NO_LIQUID_IN_METRES = -1;
/** The cube texture's face size. The decanter is a hand's width across; 256 is plenty. */
const ENVIRONMENT_FACE_SIZE_IN_PIXELS = 256;
/** How far above the desk the cube is captured from: inside the decanter's body. */
const CAPTURE_HEIGHT_IN_METRES = 0.09;

/** The decanter's outline, (radius, height) in metres, turned about the Y axis. */
const DECANTER_PROFILE = [
  [0.0, 0.0], [0.050, 0.0], [0.056, 0.006], [0.060, 0.030], [0.061, 0.070],
  [0.058, 0.105], [0.048, 0.135], [0.030, 0.158], [0.019, 0.172], [0.017, 0.205],
  [0.021, 0.212], [0.022, 0.219], [0.016, 0.222], [0.0, 0.222]
];
/** An open tumbler with a thick base: up the outside, over the rim, down the inside. */
const TUMBLER_PROFILE = [
  [0.0, 0.0], [0.034, 0.0], [0.036, 0.004], [0.039, 0.082],
  [0.036, 0.083], [0.033, 0.013], [0.0, 0.013]
];
const DECANTER_FILL_IN_METRES = 0.085;
const TUMBLER_FILL_IN_METRES = 0.034;
const STOPPER_RADIUS_IN_METRES = 0.026;
/** Where the tumbler stands, relative to the decanter. */
const TUMBLER_OFFSET_IN_METRES = new THREE.Vector3(-0.13, 0, 0.09);

const vertexShader = /* glsl */`
  // World space, because the cube texture is a picture of the world: a ray
  // has to be bent and looked up in the same space the room was filmed in.
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  // The glass's own height, so the whisky line stays level with the glass.
  varying float vLocalHeight;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    // mat3(modelMatrix) is only a correct normal matrix for uniform scale; the
    // stopper's slight stretch is too small to matter, and it is flat-shaded,
    // which does not use this normal at all.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vLocalHeight = position.y;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */`
  uniform samplerCube uEnvironment;
  uniform float uIndexOfRefraction;
  uniform float uDispersion;
  uniform vec3 uGlassTint;
  uniform vec3 uLiquidTint;
  uniform float uFillHeight;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vLocalHeight;

  void main() {
    #ifdef FLAT_SHADED
      // One normal per triangle, rebuilt from how the position changes across
      // the screen: two edge vectors of the triangle under this pixel, crossed.
      vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    #else
      // Interpolated from the vertices: smooth shading.
      vec3 normal = normalize(vWorldNormal);
    #endif

    // From the eye to the surface. cameraPosition is three's built-in uniform.
    vec3 incident = normalize(vWorldPosition - cameraPosition);

    // Snell's law, once per colour: a slightly different index for each.
    float eta = 1.0 / uIndexOfRefraction;
    vec3 refractedRed = refract(incident, normal, eta * (1.0 - uDispersion));
    vec3 refractedGreen = refract(incident, normal, eta);
    vec3 refractedBlue = refract(incident, normal, eta * (1.0 + uDispersion));
    vec3 refracted = vec3(
      textureCube(uEnvironment, refractedRed).r,
      textureCube(uEnvironment, refractedGreen).g,
      textureCube(uEnvironment, refractedBlue).b
    );
    vec3 reflected = textureCube(uEnvironment, reflect(incident, normal)).rgb;

    // The whisky: light that came through it is tinted, with a bright line
    // where the surface meets the glass (the meniscus catches the light).
    float underLiquid = 1.0 - smoothstep(uFillHeight - 0.002, uFillHeight + 0.002, vLocalHeight);
    float meniscus = 1.0 - smoothstep(0.0, 0.0025, abs(vLocalHeight - uFillHeight));
    vec3 transmitted = refracted * uGlassTint * mix(vec3(1.0), uLiquidTint, underLiquid);
    transmitted += vec3(0.9, 0.62, 0.3) * meniscus * 0.12 * step(0.0, uFillHeight);

    // Schlick's Fresnel term, with F0 from the same index of refraction.
    float f0 = pow((uIndexOfRefraction - 1.0) / (uIndexOfRefraction + 1.0), 2.0);
    float facing = clamp(dot(-incident, normal), 0.0, 1.0);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - facing, 5.0);

    gl_FragColor = vec4(mix(transmitted, reflected, fresnel), 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * One crystal material. Every piece shares the same shader; only its uniforms
 * and whether it is flat-shaded differ.
 *
 * @param {object} options
 * @param {THREE.Texture} options.environment - the room's cube texture (black until captured).
 * @param {number} options.fillHeightInMetres - whisky level in the mesh's own space, or NO_LIQUID_IN_METRES.
 * @param {boolean} [options.isFlatShaded] - facets (true) or a smooth curve (false).
 * @returns {THREE.ShaderMaterial}
 */
function createCrystalMaterial({ environment, fillHeightInMetres, isFlatShaded = false }) {
  return new THREE.ShaderMaterial({
    name: isFlatShaded ? 'CrystalGlassFaceted' : 'CrystalGlass',
    uniforms: {
      uEnvironment: { value: environment },
      uIndexOfRefraction: { value: CRYSTAL_INDEX_OF_REFRACTION },
      uDispersion: { value: CRYSTAL_DISPERSION },
      uGlassTint: { value: CRYSTAL_TINT },
      uLiquidTint: { value: WHISKY_TINT },
      uFillHeight: { value: fillHeightInMetres }
    },
    vertexShader,
    fragmentShader,
    flatShading: isFlatShaded
  });
}

/** Turns a (radius, height) table into a LatheGeometry with this many sides. */
function createLatheFromProfile(profile, segmentCount) {
  return new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), segmentCount);
}

/**
 * Builds the decanter, its stopper and a tumbler, as one group whose origin is
 * the decanter's foot. The caller places it on a surface.
 *
 * @returns {{
 *   root: THREE.Group,
 *   isCaptured: boolean,
 *   captureEnvironment: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, options?: { layersMask?: number, hidden?: THREE.Object3D[] }) => void
 * }}
 */
export function createCrystalDecanter() {
  const root = new THREE.Group();
  root.name = 'Study_Crystal_Decanter';

  const cubeTarget = new THREE.WebGLCubeRenderTarget(ENVIRONMENT_FACE_SIZE_IN_PIXELS, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });
  const cubeCamera = new THREE.CubeCamera(0.02, 30, cubeTarget);

  const bodyMaterial = createCrystalMaterial({ environment: cubeTarget.texture, fillHeightInMetres: DECANTER_FILL_IN_METRES });
  const tumblerMaterial = createCrystalMaterial({ environment: cubeTarget.texture, fillHeightInMetres: TUMBLER_FILL_IN_METRES });
  const stopperMaterial = createCrystalMaterial({
    environment: cubeTarget.texture, fillHeightInMetres: NO_LIQUID_IN_METRES, isFlatShaded: true
  });

  // Smooth: 48 sides, so the facets vanish under interpolated normals.
  const body = new THREE.Mesh(createLatheFromProfile(DECANTER_PROFILE, 48), bodyMaterial);
  body.name = 'Decanter_Body';
  root.add(body);

  // Flat: an icosahedron with no subdivision is 20 triangles, every one visible.
  // A child of the body, because a stopper goes wherever its decanter goes.
  const stopper = new THREE.Mesh(new THREE.IcosahedronGeometry(STOPPER_RADIUS_IN_METRES, 0), stopperMaterial);
  stopper.name = 'Decanter_Stopper';
  stopper.scale.set(1, 1.3, 1);
  stopper.position.y = DECANTER_PROFILE[DECANTER_PROFILE.length - 1][1] + STOPPER_RADIUS_IN_METRES;
  body.add(stopper);

  const tumbler = new THREE.Mesh(createLatheFromProfile(TUMBLER_PROFILE, 40), tumblerMaterial);
  tumbler.name = 'Decanter_Tumbler';
  tumbler.position.copy(TUMBLER_OFFSET_IN_METRES);
  root.add(tumbler);

  for (const mesh of [body, stopper, tumbler]) {
    // Glass does not throw a solid shadow, and a shadow map would draw it as one.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  let isCaptured = false;

  return {
    root,

    get isCaptured() { return isCaptured; },

    /**
     * Films the room into the cube texture from where the decanter stands.
     * Run once the room is lit and its models are in; it costs six renders of
     * the scene, once, and nothing afterwards.
     *
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @param {object} [options]
     * @param {number} [options.layersMask] - the eye's layer mask. The cube's
     *   six cameras see layer 0 only by default, and three culls LIGHTS by the
     *   camera's layers too -- see HauntedMirror.js for the same trap.
     * @param {THREE.Object3D[]} [options.hidden] - anything that must not be in
     *   the picture: the player's view model hangs off the camera.
     */
    captureEnvironment(renderer, scene, { layersMask = null, hidden = [] } = {}) {
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(cubeCamera.position);
      cubeCamera.position.y += CAPTURE_HEIGHT_IN_METRES;
      if (layersMask !== null) {
        for (const faceCamera of cubeCamera.children) faceCamera.layers.mask = layersMask;
      }
      const objects = [root, ...hidden];
      const wasVisible = objects.map((object) => object.visible);
      for (const object of objects) object.visible = false;
      try {
        cubeCamera.update(renderer, scene);
      } finally {
        objects.forEach((object, index) => { object.visible = wasVisible[index]; });
      }
      isCaptured = true;
    }
  };
}
