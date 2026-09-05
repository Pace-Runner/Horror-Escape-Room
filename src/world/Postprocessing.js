import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VisorPass } from './VisorPass.js';

/**
 * The game's post-processing chain. One place, so nothing else has to know that
 * rendering stopped being a single renderer.render() call.
 *
 * TWO THINGS HERE ARE NOT OPTIONAL, and both fail silently if forgotten.
 *
 * 1. OutputPass, last. main.js sets renderer.outputColorSpace = SRGBColorSpace,
 *    which applies when the renderer draws to the CANVAS. Once a composer is in
 *    the path it draws to intermediate targets that are LINEAR, and the final
 *    blit is what has to do the sRGB conversion. Without OutputPass every level
 *    comes out washed out, which would silently undo the hand-measured
 *    per-level light tuning documented at the top of main.js -- and it would
 *    look like a lighting regression rather than a colour-space one.
 *
 * 2. samples on the render target. The renderer is constructed with
 *    antialias: true, but that only covers the default framebuffer. The
 *    composer's own targets default to no MSAA, so simply adding a composer
 *    turns antialiasing off across the whole game. This asks for 4x, which
 *    every WebGL2 context supports.
 *
 * WHAT IS INSIDE THE PASS. The hands and the torch are children of the camera,
 * so they are rendered as part of the scene and are tinted by the visor along
 * with everything else. That is the right answer rather than an accident: the
 * visor is on the player's face, so it is between their eyes and their own
 * hands too. Excluding them would make the hands the one object in the world
 * that the lenses do not affect, which reads as a bug.
 */
export function createPostFX(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());

  const target = new THREE.WebGLRenderTarget(
    size.width * renderer.getPixelRatio(),
    size.height * renderer.getPixelRatio(),
    {
      type: THREE.HalfFloatType,
      // See note 2 above. Without this, adding post-processing silently
      // disables the antialiasing the renderer was asked for.
      samples: 4
    }
  );

  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.width, size.height);

  composer.addPass(new RenderPass(scene, camera));
  const visorPass = new VisorPass();
  composer.addPass(visorPass);
  // Last, always. See note 1.
  composer.addPass(new OutputPass());

  visorPass.setSize(size.width, size.height);

  /**
   * Eased rather than switched. Putting on a pair of glasses is a physical
   * movement, and a one-frame colour change reads as a light being flipped.
   * Taking them off is quicker than putting them on, which is also true.
   */
  const VISOR_ON_TIME = 0.42;
  const VISOR_OFF_TIME = 0.26;
  let visorTarget = 0;

  /** The caught flash: fast in, slow out, because recovery should feel slow. */
  const CAUGHT_ON_TIME = 0.14;
  const CAUGHT_OFF_TIME = 1.1;
  let caughtTarget = 0;

  /** Frame-rate independent approach, the same easing the player class uses. */
  function approach(current, goal, tau, dt) {
    if (tau <= 0) return goal;
    return current + (goal - current) * (1 - Math.exp(-dt / tau));
  }

  return {
    composer,
    visorPass,

    /** @param on {boolean} — ramps toward worn / not worn. */
    setVisor(on) {
      visorTarget = on ? 1 : 0;
    },

    /** @param amount {number} 0..1 — how caught. Unit 8 drives this. */
    setCaught(amount) {
      caughtTarget = THREE.MathUtils.clamp(amount, 0, 1);
    },

    /** Snaps both dials to their targets. For restart, where easing is wrong. */
    reset() {
      visorTarget = 0;
      caughtTarget = 0;
      visorPass.visor = 0;
      visorPass.caught = 0;
    },

    get visorAmount() {
      return visorPass.visor;
    },

    update(dt) {
      const goingOn = visorTarget > visorPass.visor;
      visorPass.visor = approach(
        visorPass.visor, visorTarget, goingOn ? VISOR_ON_TIME : VISOR_OFF_TIME, dt
      );
      const rising = caughtTarget > visorPass.caught;
      visorPass.caught = approach(
        visorPass.caught, caughtTarget, rising ? CAUGHT_ON_TIME : CAUGHT_OFF_TIME, dt
      );
    },

    setSize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      visorPass.setSize(width, height);
    },

    render() {
      composer.render();
    }
  };
}
