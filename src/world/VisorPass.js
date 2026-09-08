import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * The calibration visor, as a full-screen pass.
 *
 * THE IDEA THIS HAS TO GET RIGHT. Mark's letter is explicit: "They don't reveal
 * another world. They correct the one I'm seeing." So this is NOT a horror
 * filter that makes the screen look stranger when it goes on. It is a
 * prescription. With the visor on the image gets *cleaner*: shadows lift, local
 * contrast comes up, the colour collapses toward the lenses' blue. The player
 * should feel like they can finally see, and only afterwards realise what that
 * means about every minute they spent without it.
 *
 * Getting that backwards -- adding grain and distortion on visor-on -- would
 * tell the player the visor is the lie, which is the opposite of the story.
 *
 * The optics (barrel warp, chromatic fringing at the edges, vignette) are there
 * so it reads as looking THROUGH something thick and ground to a prescription,
 * not as a colour grade someone dropped on the whole game. They are strongest
 * at the edges and effectively absent in the middle, which is how real lenses
 * behave and also keeps the centre of the screen -- where the player is
 * actually looking -- honest.
 *
 * uCaught is the fail state (Unit 8) sharing this pass rather than adding a
 * second one: being intercepted crushes the image to a red-black tunnel. One
 * shader, two independent dials, no extra full-screen blit.
 */
export const VisorShader = {
  name: 'VisorShader',

  uniforms: {
    tDiffuse: { value: null },
    /** 0 = not worn, 1 = fully on. Ramped by the caller so it eases. */
    uVisor: { value: 0 },
    /** 0 = fine, 1 = fully caught. */
    uCaught: { value: 0 },
    /** width / height, so the vignette is round rather than an ellipse. */
    uAspect: { value: 1 }
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVisor;
    uniform float uCaught;
    uniform float uAspect;
    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    /**
     * THE SPACE THIS SHADER WORKS IN, which cost a measured bug to get right.
     *
     * The composer's intermediate targets are LINEAR half-float; OutputPass
     * does the sRGB encode at the very end of the chain. Colour grading is a
     * DISPLAY-referred operation -- "pivot the contrast at 0.5" means mid-grey
     * on screen, which in linear light is about 0.21, not 0.5.
     *
     * Grading linear values with display-space constants subtracts a constant
     * from every pixel. On a normal bright scene that is a slightly moody look.
     * On this game, whose levels measure 6-35 of 255, it annihilates the image:
     * measured, turning the visor on took near-black pixels from 27.8% of the
     * frame to 93.0%. The visor was making the world impossible to see, which
     * is the exact opposite of what it is for.
     *
     * So: decode to display space, do all the grading there where the constants
     * mean what they look like they mean, and re-encode once at the end.
     */
    const float GAMMA = 2.2;
    vec3 toDisplay(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / GAMMA)); }
    vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(GAMMA)); }

    void main() {
      // Radius measured in aspect-corrected space, so every radial effect below
      // is a circle on screen instead of an ellipse on a wide monitor.
      vec2 centred = vUv - 0.5;
      vec2 aspectCentred = vec2(centred.x * uAspect, centred.y);
      float r = length(aspectCentred);

      // --- optics ---------------------------------------------------------
      // Barrel warp, proportional to r^2, so the centre is untouched and only
      // the periphery bends. Small: 0.05 is a lens, 0.3 is a fisheye toy.
      float warp = 0.05 * uVisor;
      vec2 uv = vUv + centred * dot(aspectCentred, aspectCentred) * warp;

      // Chromatic fringing, also edge-weighted. Thick ground glass splits
      // colour at its margins; this is what sells "prescription" over "filter".
      float fringe = 0.0022 * uVisor * r;
      vec3 base;
      base.r = texture2D(tDiffuse, uv + centred * fringe).r;
      base.g = texture2D(tDiffuse, uv).g;
      base.b = texture2D(tDiffuse, uv - centred * fringe).b;

      // Everything from here to the final encode is display-referred.
      vec3 disp = toDisplay(base);

      // --- the correction --------------------------------------------------
      // Shadows first: a gamma under 1 opens up the dark end, which is where
      // everything the visor is meant to show has been hiding all game.
      vec3 corrected = pow(disp, vec3(0.82));
      // Then contrast, pivoted at 0.22 rather than the usual 0.5. This game
      // lives almost entirely below mid-grey, so a 0.5 pivot would darken very
      // nearly every pixel on screen and cancel out the shadow lift above.
      corrected = clamp((corrected - 0.22) * 1.10 + 0.22, 0.0, 1.0);
      // Then the lenses themselves: collapse toward a blue-weighted luminance
      // rather than multiplying the blue channel, which would clip the
      // highlights and tint the darks unevenly.
      float lum = dot(corrected, LUMA);
      // Measured and then raised: at mix 0.62 with a 1.32 blue the frame came
      // out at a blue:red of 1.32, which is genuinely blue-biased but reads on
      // screen as cool grey rather than as the blue lenses the story describes.
      // These levels are dark enough that low saturation disappears entirely.
      vec3 lens = vec3(lum) * vec3(0.50, 0.84, 1.46);
      corrected = mix(corrected, lens, 0.72);

      // The rim. Starts beyond the corner so the falloff never bands, and is
      // deliberately gentle: a hard vignette would push the edges back into the
      // black this whole pass exists to lift them out of.
      float vignette = smoothstep(1.25, 0.45, r);
      corrected *= mix(1.0, vignette, 0.75);

      disp = mix(disp, corrected, uVisor);

      // --- caught -----------------------------------------------------------
      // Independent of the visor: this can happen wearing it or not.
      float caughtLum = dot(disp, LUMA);
      vec3 caught = mix(vec3(caughtLum), vec3(caughtLum * 1.5, caughtLum * 0.22, caughtLum * 0.18), 0.72);
      caught *= smoothstep(1.0, 0.08, r);
      disp = mix(disp, caught, uCaught);

      gl_FragColor = vec4(toLinear(disp), 1.0);
    }
  `
};

/** Convenience wrapper so main.js never touches uniform objects directly. */
export class VisorPass extends ShaderPass {
  constructor() {
    super(VisorShader);
  }

  /** 0..1. Callers ramp this; a step change reads as a light switch, not glass. */
  set visor(v) {
    this.uniforms.uVisor.value = THREE.MathUtils.clamp(v, 0, 1);
  }

  get visor() {
    return this.uniforms.uVisor.value;
  }

  set caught(v) {
    this.uniforms.uCaught.value = THREE.MathUtils.clamp(v, 0, 1);
  }

  get caught() {
    return this.uniforms.uCaught.value;
  }

  setSize(width, height) {
    this.uniforms.uAspect.value = height > 0 ? width / height : 1;
  }
}
