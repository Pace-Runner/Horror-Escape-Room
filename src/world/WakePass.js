import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Waking up, as a full-screen pass: eyelids, and eyes that have been shut for
 * a long time and have not caught up yet.
 *
 * FOUR DIALS, all driven frame by frame by the wake-up scene
 * (cutscenes/wakeUp.js) rather than eased here: a blink is a shape in time --
 * lids that drop fast and lift slower, open a crack and fall shut again -- and
 * only the scene knows that shape.
 *
 *   uOpen    0 = lids shut, 1 = wide open (no lids on screen at all)
 *   uBlur    0 = sharp, 1 = the first seconds: smeared, dim and a little grey
 *   uDouble  0 = one image, 1 = the two eyes not yet agreeing: a ghost of the
 *            room beside itself, which slides home as they focus
 *   uGlow    0 = none, 1 = lights bloom into soft halos, the way a bulb does
 *            to eyes whose pupils are still wide from the dark
 *
 * THE LIDS ARE AN ALMOND, not two straight bars. A lid is a curve over a
 * round eye, so it closes at the outer corners first and the last thing to go
 * dark is a horizontal slit through the middle -- which is what reads as an
 * eye rather than as a letterbox. The edge is soft and darkened a little
 * inside it (lashes, the shadow of the lid), and softer still the more nearly
 * closed it is, because a lid that close to the eye is out of focus.
 *
 * SHUT IS NOT QUITE BLACK. Light comes through closed eyelids as a dim, warm
 * red, brighter where the room is brighter, so a lamp in front of shut eyes
 * is a red smudge. Faint on purpose: it is the difference between "the screen
 * went black" and "your eyes are closed".
 *
 * THE BLUR IS A DISC, not a gaussian: 24 taps on a golden-angle spiral, so it
 * smears a lamp into a soft round blob the way an unfocused eye does, with no
 * second pass. Up to three of those per pixel (two eyes and the halo) on a
 * full-screen half-float target is not free, which is why the pass switches
 * itself off once the dials are back at rest -- it costs nothing for the rest
 * of the game.
 */
export const WakeShader = {
  name: 'WakeShader',

  uniforms: {
    tDiffuse: { value: null },
    uOpen: { value: 1 },
    uBlur: { value: 0 },
    uDouble: { value: 0 },
    uGlow: { value: 0 },
    /** One CSS pixel in UV, so radii are the same on every display. */
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    /** width / height, so the almond keeps its shape on any screen. */
    uAspect: { value: 16 / 9 }
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uOpen;
    uniform float uBlur;
    uniform float uDouble;
    uniform float uGlow;
    uniform vec2 uTexel;
    uniform float uAspect;
    varying vec2 vUv;

    // Pixels of blur radius at uBlur = 1, of halo radius at uGlow = 1, and of
    // separation between the two images at uDouble = 1.
    const float BLUR_RADIUS = 18.0;
    const float GLOW_RADIUS = 46.0;
    const float DOUBLE_OFFSET = 16.0;
    const int TAPS = 24;

    // Golden-angle spiral: an even disc with no rings or spokes in it.
    vec3 disc(vec2 uv, float radius) {
      if (radius < 0.05) return texture2D(tDiffuse, uv).rgb;
      vec3 sum = vec3(0.0);
      for (int i = 0; i < TAPS; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / float(TAPS)) * radius;
        float a = fi * 2.39996323;
        sum += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * r * uTexel).rgb;
      }
      return sum / float(TAPS);
    }

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
      float radius = uBlur * BLUR_RADIUS;
      vec3 col;
      if (uDouble > 0.002) {
        // The two eyes, each a little off, sliding together as they focus.
        // Mostly sideways, a touch vertical: eyes that are tired drift both ways.
        vec2 off = vec2(1.0, 0.18) * uDouble * DOUBLE_OFFSET * uTexel;
        col = mix(disc(vUv - off, radius), disc(vUv + off, radius), 0.5);
      } else {
        col = disc(vUv, radius);
      }

      // Halo: only what is bright enough to bloom, spread wide and added back.
      vec3 wide = vec3(0.0);
      if (uGlow > 0.002) {
        wide = disc(vUv, uGlow * GLOW_RADIUS);
        col += max(wide - vec3(0.32), vec3(0.0)) * 1.4 * uGlow;
      }

      // Groggy: greyer and dimmer while the eyes have not focused yet.
      float lum = luma(col);
      col = mix(col, vec3(lum), 0.4 * uBlur);
      vec2 p = vUv - 0.5;
      p.x *= uAspect;
      col *= 1.0 - 0.55 * uBlur * dot(p, p);

      // The lids. Half-height of the opening at the centre, curving in toward
      // the corners; fully open it clears even the corners of a 16:9 screen.
      float open = clamp(uOpen, 0.0, 1.0);
      float halfHeight = mix(-0.04, 0.95, open) - 0.36 * p.x * p.x;
      float soft = mix(0.09, 0.03, open);
      float inside = 1.0 - smoothstep(halfHeight - soft, halfHeight, abs(p.y));
      // Lashes and lid shadow: a dark band just inside the edge.
      float band = smoothstep(halfHeight - soft * 3.0, halfHeight - soft, abs(p.y));
      // Light through the lid: dim warm red, following how bright the room is
      // there (the halo sample when there is one -- it is already a wide blur).
      float through = luma(uGlow > 0.002 ? wide : col);
      vec3 lid = vec3(0.32, 0.05, 0.035) * min(through * 1.6, 0.5);
      col = mix(lid, col * (1.0 - 0.45 * band), inside);

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

/** Convenience wrapper so main.js never touches uniform objects directly. */
export class WakePass extends ShaderPass {
  constructor() {
    super(WakeShader);
    this.#syncEnabled();
  }

  /** 0 shut .. 1 open. */
  set open(v) {
    this.uniforms.uOpen.value = THREE.MathUtils.clamp(v, 0, 1);
    this.#syncEnabled();
  }

  get open() {
    return this.uniforms.uOpen.value;
  }

  /** 0 sharp .. 1 the first seconds awake. */
  set blur(v) {
    this.uniforms.uBlur.value = THREE.MathUtils.clamp(v, 0, 1);
    this.#syncEnabled();
  }

  get blur() {
    return this.uniforms.uBlur.value;
  }

  /** 0 one image .. 1 two, side by side. */
  set double(v) {
    this.uniforms.uDouble.value = THREE.MathUtils.clamp(v, 0, 1);
    this.#syncEnabled();
  }

  get double() {
    return this.uniforms.uDouble.value;
  }

  /** 0 none .. 1 lights bloom into halos. */
  set glow(v) {
    this.uniforms.uGlow.value = THREE.MathUtils.clamp(v, 0, 1);
    this.#syncEnabled();
  }

  get glow() {
    return this.uniforms.uGlow.value;
  }

  setSize(width, height) {
    this.uniforms.uAspect.value = height > 0 ? width / height : 1;
    this.uniforms.uTexel.value.set(width > 0 ? 1 / width : 0, height > 0 ? 1 / height : 0);
  }

  /** At rest the pass is skipped entirely: eyes open and sharp cost nothing. */
  #syncEnabled() {
    const u = this.uniforms;
    this.enabled = u.uOpen.value < 0.999 || u.uBlur.value > 0.002
      || u.uDouble.value > 0.002 || u.uGlow.value > 0.002;
  }
}
