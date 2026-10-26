import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { compileVisibleAsync } from './compileVisible.js';
import { VisorPass } from './VisorPass.js';
import { WakePass } from './WakePass.js';

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
 * 2. samples on the render target. The canvas framebuffer is not where the
 *    scene is drawn (main.js leaves antialias off on it for that reason). The
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

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const visorPass = new VisorPass();
  composer.addPass(visorPass);
  // The eyelids go over everything, the visor included: they are nearer the
  // eye than the lenses are. Skipped by the composer while the eyes are open.
  const wakePass = new WakePass();
  composer.addPass(wakePass);
  // Last, always. See note 1.
  composer.addPass(new OutputPass());

  visorPass.setSize(size.width, size.height);
  wakePass.setSize(size.width, size.height);

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

  /**
   * Runs `work` with the composer's target set. compile() picks every program
   * synchronously -- only the waiting is asynchronous -- so the target is only
   * needed around each batch.
   */
  function intoComposerTarget(work) {
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.readBuffer);
    try {
      work();
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
  }

  /** Frame-rate independent approach, the same easing the player class uses. */
  function approach(current, goal, tau, dt) {
    if (tau <= 0) return goal;
    return current + (goal - current) * (1 - Math.exp(-dt / tau));
  }

  return {
    composer,
    visorPass,

    /** Allocate targets and compile fullscreen effects without drawing the room. */
    prepare() {
      const scenePassEnabled = renderPass.enabled;
      const wakeEnabled = wakePass.enabled;
      const renderToScreen = composer.renderToScreen;
      try {
        renderer.initRenderTarget(composer.renderTarget1);
        renderer.initRenderTarget(composer.renderTarget2);
        renderPass.enabled = false;
        wakePass.enabled = true;
        composer.renderToScreen = false;
        composer.render(0);
      } finally {
        renderPass.enabled = scenePassEnabled;
        wakePass.enabled = wakeEnabled;
        composer.renderToScreen = renderToScreen;
      }
    },

    /**
     * Draw from a different camera, for the third-person view.
     *
     * The alternative was moving the player's camera back, and it is worse in
     * a way that is easy to miss: that camera IS the player. Its position is
     * read as the player's position by the hunter's sightlines, the breathing
     * distance, the minimap and the level reveal, and the torch, the hands and
     * the dust are all parented to it. Pulling it two metres backwards would
     * quietly move the player two metres backwards as well. Swapping only what
     * the RenderPass draws from leaves every one of those alone.
     */
    setCamera(cam) {
      renderPass.camera = cam;
    },

    /** @param on {boolean} — ramps toward worn / not worn. */
    setVisor(on) {
      visorTarget = on ? 1 : 0;
    },

    /** @param amount {number} 0..1 — how caught. Unit 8 drives this. */
    setCaught(amount) {
      caughtTarget = THREE.MathUtils.clamp(amount, 0, 1);
    },

    /**
     * Eyelids and the blur of just waking, set directly every frame by the
     * wake-up scene -- no easing here, because a blink is a shape only the
     * scene knows. See WakePass.js.
     *
     * @param open   0 shut .. 1 open
     * @param blur   0 sharp .. 1 unfocused
     * @param double 0 one image .. 1 the two eyes not yet agreeing
     * @param glow   0 none .. 1 lights blooming into halos
     */
    setWake(open, blur = 0, { double = 0, glow = 0 } = {}) {
      wakePass.open = open;
      wakePass.blur = blur;
      wakePass.double = double;
      wakePass.glow = glow;
    },

    /** The settings screen's brightness, 1 = as tuned. See VisorPass's uBrightness. */
    setBrightness(value) {
      visorPass.brightness = value;
    },

    /**
     * MSAA samples on the scene target, for the graphics setting (0 = off).
     * Only the target the RenderPass draws into needs them -- every pass after
     * it is a full-screen triangle with no edges to smooth. Disposing frees the
     * old multisampled buffers; three allocates the new ones on next use.
     */
    setSamples(sampleCount) {
      for (const renderTarget of [composer.renderTarget1, composer.renderTarget2]) {
        if (renderTarget.samples === sampleCount) continue;
        renderTarget.samples = sampleCount;
        renderTarget.dispose();
      }
    },

    /** Snaps every dial to rest. For restart, where easing is wrong. */
    reset() {
      visorTarget = 0;
      caughtTarget = 0;
      visorPass.visor = 0;
      visorPass.caught = 0;
      wakePass.open = 1;
      wakePass.blur = 0;
      wakePass.double = 0;
      wakePass.glow = 0;
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
      wakePass.setSize(width, height);
    },

    render() {
      composer.render();
    },

    /**
     * Builds, in the background, the shaders for everything visible as the
     * RenderPass will really draw it. See compileVisibleAsync().
     *
     * A shader is built for its render target as well as its lights: drawn to
     * the canvas it tone maps and converts to sRGB, drawn into the composer's
     * target it does neither (OutputPass does that later). Built with no
     * target set, every shader came out as the canvas variant and the first
     * real frame built them all again, blocking the page while it did.
     */
    compileVisible(cam) {
      return compileVisibleAsync(renderer, scene, cam, { around: intoComposerTarget });
    }
  };
}
