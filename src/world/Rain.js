import * as THREE from 'three';
import { MAIN_ONLY } from '../core/RenderLayers.js';

/**
 * RAIN OUTSIDE A WINDOW: streaks, not dots.
 *
 * A falling drop is never seen as a drop. The eye smears it over the moment
 * it is in view, so rain reads as short, thin, bright streaks leaning with the
 * wind. This draws each drop as exactly that: a thin quad stretched along its
 * fall, turned about that line to face the eye, soft across, with a soft head
 * and a tail that fades. It used to be PointsMaterial squares, and through a
 * window a metre away they were centimetre blocks hanging in the air like
 * snow.
 *
 * The drops fill a box beyond the glass that widens with distance, as the
 * view through a window does, and the further ones are fainter. A streak is
 * never drawn thinner than about a pixel: a distant drop gets fainter instead
 * of shimmering in and out between pixels. Everything moves on the GPU from
 * one time uniform, so nothing is uploaded per frame. A lightning flash
 * (setFlash) lights every drop at once, which is how a strike shows you how
 * hard it is raining.
 */

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uOrigin;
  uniform vec3 uOut;
  uniform vec3 uAlong;
  uniform vec3 uEye;
  uniform vec2 uWind;
  uniform vec2 uSpeed;
  uniform float uWidth;
  uniform float uDepth;
  uniform float uHeight;
  uniform float uSpread;
  uniform float uLength;
  uniform float uThickness;
  uniform float uScreenHeight;
  uniform float uBrightness;
  attribute vec2 aCorner;   // x: -1..1 across the streak; y: 0 at its head .. 1 at its tail
  attribute vec4 aDrop;     // x: -0.5..0.5 along the glass; y: 0..1 away from it; z: phase; w: size
  varying vec2 vQuad;
  varying float vAlpha;

  void main() {
    // Bigger drops fall faster, streak longer and catch more light.
    float speed = mix(uSpeed.x, uSpeed.y, aDrop.w);
    float fallen = fract(aDrop.z + uTime * speed / uHeight) * uHeight;
    float away = aDrop.y * uDepth;
    vec3 base = uOrigin + uOut * away + uAlong * aDrop.x * (uWidth + away * uSpread);
    // It starts upwind and the wind carries it in towards the glass as it falls,
    // landing at its base: never through the wall and into the room.
    vec3 drift = vec3(uWind.x, 0.0, uWind.y);
    vec3 head = base + vec3(0.0, uHeight - fallen, 0.0) + drift * (fallen - uHeight);
    vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
    float streak = uLength * speed / uSpeed.y;
    vec3 p = head - dir * streak * aCorner.y;

    // Width: its own, or a pixel at its distance, whichever is more; a drop
    // drawn wider than it is keeps its light, so it is fainter, not fatter.
    vec4 centre = modelViewMatrix * vec4(p, 1.0);
    float pixel = 2.0 * max(-centre.z, 0.01) / (projectionMatrix[1][1] * uScreenHeight);
    float width = max(uThickness, pixel * 1.2);
    vec3 side = normalize(cross(dir, normalize(uEye - p)));
    p += side * aCorner.x * width * 0.5;

    // Out of the top and bottom of the box softly, so a drop never pops.
    float ends = smoothstep(0.0, 0.35, fallen) * smoothstep(0.0, 0.35, uHeight - fallen);
    vAlpha = uBrightness * ends * mix(1.0, 0.35, aDrop.y) * mix(0.55, 1.0, aDrop.w) * (uThickness / width);
    vQuad = aCorner;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uFlash;
  uniform vec3 uColor;
  uniform vec3 uFlashColor;
  varying vec2 vQuad;
  varying float vAlpha;

  void main() {
    float across = 1.0 - smoothstep(0.15, 1.0, abs(vQuad.x));
    float along = smoothstep(0.0, 0.12, vQuad.y) * (1.0 - smoothstep(0.35, 1.0, vQuad.y));
    // In the dark they are barely there; a strike lights every one of them.
    float flash = clamp(uFlash, 0.0, 1.0);
    vec3 colour = mix(uColor, uFlashColor, flash) * (0.32 + flash * 2.4);
    gl_FragColor = vec4(colour * across * along * vAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

const _eye = new THREE.Vector3();
const _size = new THREE.Vector2();

export class Rain {
  /**
   * @param {object} [options]
   * @param {number} [options.count] - drops.
   * @param {THREE.Vector3} [options.origin] - the bottom of the box, at its middle, on the glass side.
   * @param {THREE.Vector3} [options.out] - the way out from the glass, level.
   * @param {number} [options.width] - metres along the glass, at the glass.
   * @param {number} [options.depth] - metres out from the glass.
   * @param {number} [options.height] - metres from the bottom of the box to its top.
   * @param {number} [options.spread] - how much wider the box gets per metre out (the view through a window widens).
   * @param {number[]} [options.wind] - metres a drop drifts, [x, z], for every metre it falls.
   * @param {number[]} [options.speed] - fall speed, metres a second, [smallest drop, biggest].
   * @param {number} [options.length] - streak length of the fastest drop, metres.
   * @param {number} [options.thickness] - streak width, metres.
   * @param {number} [options.brightness] - how much light a drop catches, 1 by default.
   */
  constructor({
    count = 800,
    origin = new THREE.Vector3(),
    out = new THREE.Vector3(0, 0, -1),
    width = 1.6,
    depth = 3,
    height = 4,
    spread = 1.1,
    wind = [0.06, 0.1],
    speed = [6.5, 9],
    length = 0.26,
    thickness = 0.0028,
    brightness = 1
  } = {}) {
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, 0, 1, 0, 1, 1, -1, 1], 2));
    // Wound to face the eye: the shader turns every streak towards it.
    quad.setIndex([0, 2, 1, 0, 3, 2]);
    // three needs a position attribute to draw; the shader places every vertex itself.
    quad.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    const drops = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      drops[i * 4 + 0] = Math.random() - 0.5;
      // More of them near the glass, where the view is narrow and they are big.
      drops[i * 4 + 1] = Math.pow(Math.random(), 1.35);
      drops[i * 4 + 2] = Math.random();
      drops[i * 4 + 3] = Math.random();
    }
    quad.setAttribute('aDrop', new THREE.InstancedBufferAttribute(drops, 4));
    quad.instanceCount = count;

    const outward = out.clone().setY(0).normalize();
    const along = new THREE.Vector3(0, 1, 0).cross(outward).normalize();
    this.material = new THREE.ShaderMaterial({
      name: 'Rain',
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: Math.random() * 100 },
        uOrigin: { value: origin.clone() },
        uOut: { value: outward },
        uAlong: { value: along },
        uEye: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector2(wind[0], wind[1]) },
        uSpeed: { value: new THREE.Vector2(speed[0], speed[1]) },
        uWidth: { value: width },
        uDepth: { value: depth },
        uHeight: { value: height },
        uSpread: { value: spread },
        uLength: { value: length },
        uThickness: { value: thickness },
        uScreenHeight: { value: 1080 },
        uBrightness: { value: brightness },
        uFlash: { value: 0 },
        uColor: { value: new THREE.Color(0x8796a8) },
        uFlashColor: { value: new THREE.Color(0xd8e6ff) }
      }
    });

    const mesh = new THREE.Mesh(quad, this.material);
    mesh.name = 'Rain';
    // Placed in the shader, so three cannot know where it is.
    mesh.frustumCulled = false;
    mesh.layers.set(MAIN_ONLY);
    // The eye, in the rain's own space, and the pixel size, for whichever camera draws it.
    mesh.onBeforeRender = (renderer, scene, camera) => {
      mesh.worldToLocal(camera.getWorldPosition(_eye));
      this.material.uniforms.uEye.value.copy(_eye);
      this.material.uniforms.uScreenHeight.value = renderer.getDrawingBufferSize(_size).y || 1080;
    };
    /** What to add to the scene. */
    this.object = mesh;
  }

  update(dt) {
    // Wrapped, so the time never grows large enough to lose precision.
    this.material.uniforms.uTime.value = (this.material.uniforms.uTime.value + dt) % 3600;
  }

  /** 0..1: how much of a lightning flash is lighting it now. */
  setFlash(level) {
    this.material.uniforms.uFlash.value = level;
  }
}
