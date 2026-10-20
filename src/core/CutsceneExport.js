import * as THREE from 'three';

/**
 * DEV ONLY: getting pictures OUT of the game, as references for AI video.
 *
 * An AI video model has never seen this house or this creature, and asked for
 * "a pale thing at the end of a Victorian hallway" it will invent both. What
 * keeps a generated clip looking like THIS game is feeding it frames the game
 * actually drew:
 *
 *   exportStills()     each shot of a scene, frozen and saved -- the first and
 *                      last frames an image-to-video model is anchored on.
 *   exportTurnaround() the creature (or the player's body) from four sides on
 *                      flat grey: the character sheet a model is told to keep to.
 *   recordScene()      a scene played and recorded to webm -- the input for a
 *                      video-to-video restyle, which keeps the game's motion and
 *                      framing and only repaints the surface.
 *
 * Everything is saved to the player's own Downloads; nothing is uploaded and
 * nothing is written into the repo. Reached through window.__game, which only
 * exists in dev builds. See docs/CUTSCENES.md.
 *
 * WHY STILLS ARE READ RIGHT AFTER A RENDER. The renderer is not made with
 * preserveDrawingBuffer, so the canvas is only guaranteed to hold the frame
 * until the browser composites it. Rendering and calling toBlob() in the same
 * task reads it while it is still there; toBlob copies the bitmap when it is
 * called, not when it resolves.
 */

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Turnaround views, in degrees round the figure from its front. */
const TURNAROUND_ANGLES = [
  { label: 'front', degrees: 0 },
  { label: 'three-quarter', degrees: 40 },
  { label: 'side', degrees: 90 },
  { label: 'back', degrees: 180 }
];

export function createCutsceneExport({ renderer, postFX, cutscene, playCutscene, figures }) {
  const canvas = renderer.domElement;

  /** The frame the composer is about to draw, drawn now and read before it can be cleared. */
  async function grabFrame() {
    // Two frames: the first lets tick() re-pose everything for the seek (the
    // creature's own update resets its bones, the scene's onFrame acts on top),
    // the second is drawn from that settled state.
    await nextFrame();
    await nextFrame();
    postFX.render();
    return canvasToBlob(canvas);
  }

  return {
    /**
     * Freezes a scene on each shot and saves a PNG of it.
     *
     * @param name   a scene from SCENES to play first, or omit to use the one
     *               playing now (for a scene that needs staging -- the reveal
     *               plays from __game.stageHallwayReveal()).
     * @param times  scene seconds to grab. Default: the start of every shot
     *               and the very end, which is what first/last-frame models want.
     * @param save   false to only return the blobs (for checking in a probe).
     * @returns [{ t, blob }]
     */
    async exportStills(name = null, { times = null, save = true } = {}) {
      if (name) {
        if (cutscene.isRunning) cutscene.cancel();
        playCutscene(name);
      }
      if (!cutscene.isRunning) {
        console.warn('[export] no scene is playing');
        return [];
      }
      const sceneName = cutscene.name;
      const grabs = times ?? [
        ...cutscene.shotTimes.map((s) => s.t0 + Math.min(0.05, s.seconds / 2)),
        cutscene.duration
      ];
      const stills = [];
      for (const t of grabs) {
        if (!cutscene.seek(t)) break;
        const blob = await grabFrame();
        stills.push({ t, blob });
        if (save && blob) download(blob, `${sceneName}_${t.toFixed(2)}s.png`);
      }
      cutscene.resume();
      return stills;
    },

    /**
     * Four views of a figure on flat grey, lit evenly: the character sheet.
     *
     * The figure is borrowed out of the world into a scene of its own for the
     * four renders and put straight back, so the house's lights -- and the
     * darkness the house is mostly made of -- do not decide what the reference
     * looks like. Its own lights mean a one-off shader compile; this is a dev
     * tool, and that is fine.
     *
     * @param which  'creature' (the monster) or 'player' (the man).
     */
    async exportTurnaround(which = 'creature', { save = true } = {}) {
      const figure = figures[which];
      if (!figure) {
        console.warn(`[export] no figure called "${which}"`);
        return [];
      }
      await figure.ready;
      await nextFrame();

      const sheet = new THREE.Scene();
      sheet.background = new THREE.Color(0x2a2a2a);
      sheet.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(1.5, 3, -2.5);
      sheet.add(key);

      const group = figure.group;
      const parent = group.parent;
      const wasVisible = figure.visible;
      const was = { x: figure.position.x, z: figure.position.z, yaw: figure.yaw };

      const height = figure.height || 1.8;
      const lens = new THREE.PerspectiveCamera(28, canvas.width / canvas.height, 0.05, 50);
      lens.layers.enableAll();
      const distance = height * 2.4;
      // All four drawn and read in ONE synchronous pass, the figure put back
      // before anything is awaited. Awaiting between views would let the
      // game's tick run, and the tick puts the figure back where it stands in
      // the world (the player's body follows the player every frame), so the
      // later views would be of an empty grey backdrop.
      const pending = [];
      try {
        sheet.add(group);
        figure.setPosition(0, 0);
        figure.setYaw(0);
        figure.visible = true;
        for (const view of TURNAROUND_ANGLES) {
          // Yaw 0 faces -Z (the game's convention), so its front is out along -Z.
          const a = THREE.MathUtils.degToRad(view.degrees);
          lens.position.set(-Math.sin(a) * distance, height * 0.55, -Math.cos(a) * distance);
          lens.lookAt(0, height * 0.5, 0);
          renderer.setRenderTarget(null);
          renderer.render(sheet, lens);
          // toBlob copies the canvas when it is CALLED, so the next render
          // cannot overwrite this one.
          pending.push({ view: view.label, blob: canvasToBlob(canvas) });
        }
      } finally {
        parent?.add(group);
        figure.setPosition(was.x, was.z);
        figure.setYaw(was.yaw);
        figure.visible = wasVisible;
      }
      const views = [];
      for (const { view, blob: waiting } of pending) {
        const blob = await waiting;
        views.push({ view, blob });
        if (save && blob) download(blob, `${which}_turnaround_${view}.png`);
      }
      return views;
    },

    /**
     * Plays a scene and records the canvas to webm while it runs.
     *
     * @param play     a scene name, or a function that starts one (the reveal:
     *                 () => __game.stageHallwayReveal()).
     * @param tail     seconds to keep recording after the scene, so what it
     *                 leads into (the rush) is on the clip too.
     * @param fps      capture rate.
     * @param save     false to only return the blob.
     */
    async recordScene(play, { tail = 0, fps = 30, bitsPerSecond = 6_000_000, save = true } = {}) {
      if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
        console.warn('[export] this browser cannot record a canvas');
        return null;
      }
      const stream = canvas.captureStream(fps);
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

      recorder.start(250);
      let name = typeof play === 'string' ? play : null;
      if (name) {
        await playCutscene(name);
      } else {
        play();
        await nextFrame();
        name = cutscene.name;
        while (cutscene.isRunning) await nextFrame();
      }
      const until = performance.now() + tail * 1000;
      while (performance.now() < until) await nextFrame();
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());

      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      if (save) download(blob, `${name ?? 'scene'}_${Date.now()}.webm`);
      return blob;
    }
  };
}
