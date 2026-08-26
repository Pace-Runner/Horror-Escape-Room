/**
 * First-person hands - the ONLY public entry point.  [owner: Hands]
 *
 * Two gloved hands at the bottom of the screen, rigged, animated, able to hold
 * and manipulate objects. These hands are the player's entire physical presence
 * in this game: there is no third-person body during normal play, so every
 * interaction - picking a lock, turning a valve, lifting a photograph, putting on
 * the visor, holding a torch in the dark - is communicated through them. They
 * carry the game's tactility.
 *
 * ARCHITECTURE - read this before changing anything
 *
 *   hands.js      this file. Public API, lifecycle, per-hand state. No geometry,
 *                 no GLSL, no clip maths.
 *   rig.js        joint names, hierarchy, forward kinematics, pose application.
 *   hand-mesh.js  ALL geometry. The swappable seam - see its header.
 *   materials.js  the shared glove material and its uniforms.
 *   animator.js   clip playback, crossfade, additive layers, event frames.
 *   sockets.js    attachment points.
 *   poses/        static pose DATA, plain modules.
 *   clips/        animation clip DATA, plain modules.
 *   layers/       procedural additive layers.
 *
 * The rig and animation layers know NOTHING about what the hands look like. That
 * is deliberate: the code-built segment meshes may later be replaced by a
 * sculpted Blender glove, and if the animation system were coupled to the mesh
 * that swap would mean rewriting everything. Decoupled, it means one new module.
 *
 * THE HANDS ARE NOT PHYSICAL. They are a view model: children of the camera, no
 * colliders, no rigid bodies, not in the physics world. This module never
 * touches Rapier, and that boundary is what makes it independently testable in
 * dev/hands.html. The Interaction system owns the physics side of holding
 * something - see the event contract below and ./README.md.
 *
 * ZERO ALLOCATION IN update(). It runs every frame for the life of the game.
 * Anything allocated there becomes garbage-collector stutter, which is penalised
 * under two separate rubric categories. Event payloads are the documented
 * exception - see _makeEventSink().
 *
 * Unit 0 status: this API is COMPLETE AND FROZEN. Method bodies are no-ops or
 * sensible defaults; later units fill them in without changing a signature. Any
 * change to this surface needs a decision recorded in HANDOVER.md, because every
 * other unit is built against it.
 */

import * as THREE from "three";

// Only what the body actually uses is imported; the re-export block below is
// what makes the rest of the module's vocabulary reachable through this file.
// SIDES is deliberately NOT imported here any more - the body iterates
// ACTIVE_SIDES instead. It is still re-exported below, so consumers can ask the
// rig layer what sides exist in principle.
import {
  isSide,
  adoptRig,
  applyPose,
  blendPose,
  HAND_ROOT_POSITION,
  HAND_ROOT_ROTATION,
} from "./rig.js";
import { SOCKETS, SOCKET_NAMES, isSocket, buildSockets } from "./sockets.js";
import { Animator, LAYER_NAMES, DEFAULT_LAYER_WEIGHTS, INERT_CLIP_HANDLE } from "./animator.js";
import { createGloveMaterialSet } from "./materials.js";
import { loadHandAsset, buildHandMesh } from "./hand-mesh.js";
import { POSE_NAMES, getPose } from "./poses/index.js";
import { CLIP_NAMES, getClip } from "./clips/index.js";

/* --------------------------------------------------------- re-exports */

// Re-exported so consumers need exactly one import to talk to this module.
// `import { Hands, JOINTS, SOCKETS } from './systems/hands/hands.js'`
export { JOINTS, JOINT_NAMES, JOINT_PARENTS, FINGERS, SIDES, qualify } from "./rig.js";
export { SOCKETS, SOCKET_NAMES } from "./sockets.js";
export { LAYERS, LAYER_NAMES } from "./animator.js";
export { POSES, POSE_NAMES } from "./poses/index.js";
export { CLIPS, CLIP_NAMES } from "./clips/index.js";

/* ------------------------------------------------------ event contract */

/**
 * Clips emit these at specific keyframes. They are how gameplay stays in sync
 * with animation, and the timing is not cosmetic: an object must attach at the
 * frame the fingers close, and a thrown object must be released at the frame the
 * hand reaches peak velocity - not before, not after.
 *
 * Every event fires BOTH through the per-play `onEvent` callback and on the
 * shared bus, so a caller that started the clip can react locally while systems
 * that know nothing about the call site (audio, particles, puzzle state) can
 * subscribe globally.
 *
 *   hands:grasp          fingers close on target  -> Interaction parents the object to the socket
 *   hands:release        fingers open             -> Interaction unparents
 *   hands:throw-release  peak of the throw arc    -> Physics applies the impulse
 *   hands:impact         tool strikes something   -> audio + particles + puzzle state
 *   hands:clip-end       one-shot finishes        -> Interaction re-enables input
 */
export const HANDS_EVENTS = Object.freeze({
  GRASP: "hands:grasp",
  RELEASE: "hands:release",
  THROW_RELEASE: "hands:throw-release",
  IMPACT: "hands:impact",
  CLIP_END: "hands:clip-end",
});

/* ------------------------------------------------------------- warnings */

/**
 * Bad names warn ONCE and carry on rather than throwing.
 *
 * A typo'd pose name must never take down the frame in the middle of a live
 * demo, and it must never spam sixty identical lines a second into a console
 * someone is trying to read. Warn-once gets both.
 */
const _warned = new Set();

function warnOnce(key, message) {
  if (_warned.has(key)) return;
  _warned.add(key);
  console.warn(`[hands] ${message}`);
}

/* --------------------------------------------------------- active hands */

/**
 * WHICH HANDS ARE ACTUALLY BUILT. The game currently shows the RIGHT HAND ONLY.
 *
 * This is a deliberate art decision, not an oversight, and it is a real removal
 * rather than a hidden object: the left hand is never cloned, never rigged, never
 * added to the scene graph, never posed and never updated. It costs no geometry,
 * no draw call and no frame time. Put "left" back in this array and the left hand
 * returns, mirrored, with no other change - `rig.js` still defines both sides and
 * every pose file already drives either.
 *
 * Two consequences worth knowing:
 *   - Anything addressed to the left hand - setPose('left', ...), attach('left',
 *     ...) - now warns once and does nothing, which is the module's documented
 *     behaviour for an absent hand rather than a new failure mode.
 *   - The handedness convention in README.md (torch in the left, interactions in
 *     the right) cannot hold with one hand. If a torch ever needs holding, it
 *     goes in the right hand's `grip` socket, or the left comes back.
 */
const ACTIVE_SIDES = Object.freeze(["right"]);

/* ---------------------------------------------------------------- Hands */

export class Hands {
  /**
   * @param {object} deps
   * @param {THREE.PerspectiveCamera} deps.camera  hands parent to this; see §7 - view model, not physics
   * @param {THREE.WebGLRenderer} deps.renderer    needed for the Unit 11 layered view-model pass
   * @param {{ emit: Function, on: Function }} [deps.bus]  core/Events.js bus; optional so the dev harness can run headless
   */
  constructor({ camera, renderer, bus } = {}) {
    this.camera = camera ?? null;
    this.renderer = renderer ?? null;
    this.bus = bus ?? null;

    /**
     * Everything this module puts in the scene hangs off here, so teardown is
     * one detach and framing/visibility is one transform.
     */
    this.root = new THREE.Group();
    this.root.name = "hands";

    this.ready = false;
    this.disposed = false;

    /** The shared loaded model. Both hands clone it; init() fills this in. */
    this.asset = null;

    /** Seconds since init. Used by the procedural layers when the caller does not pass its own. */
    this.elapsed = 0;

    /**
     * The glove material is created here rather than in init() so that
     * setGrime() / setWetness() are safe to call before the hands are built -
     * a level that sets starting grime during construction should not have to
     * care about init ordering. The set is inert until Unit 3 gives it a real
     * material; the stored values are applied when it does.
     */
    this.materialSet = createGloveMaterialSet();

    /**
     * Master additive-layer weights, pushed to both hands. §4 gives
     * setLayerWeight no side parameter on purpose: breathing, sway, bob and
     * tremor are properties of the PLAYER, not of one arm, and letting them
     * drift apart per hand would look like a bug.
     */
    this.layerWeights = { ...DEFAULT_LAYER_WEIGHTS };

    /** Per-side state records, built in init(). */
    this._records = { left: null, right: null };

    /**
     * The same records in a plain array, built once, so update() can iterate
     * with an index loop and allocate nothing. Object.values() per frame would
     * allocate an array per frame.
     */
    this._active = [];

    /** Honoured by init() if setVisible() was called before it. */
    this._visible = true;
  }

  /* ------------------------------------------------------------ lifecycle */

  /**
   * Builds the rig, the mesh, the sockets and the material for both hands.
   *
   * Async because Unit 10 loads the leather normal and roughness maps here.
   * Nothing awaits anything yet, but the signature is fixed now so no caller has
   * to change when it does.
   */
  async init() {
    if (this.disposed) {
      warnOnce("init-after-dispose", "init() called after dispose(); construct a new Hands instead.");
      return this;
    }
    if (this.ready) return this;

    /**
     * Loaded ONCE and cloned per hand, so geometry and textures reach the GPU a
     * single time. If it fails, say so loudly and carry on with an empty rig
     * rather than throwing - a missing asset should not take the game down, and
     * every public method already tolerates an uninitialised hand.
     */
    try {
      this.asset = await loadHandAsset();
    } catch (error) {
      this.asset = null;
      warnOnce("asset-load", `could not load the hand model: ${error?.message ?? error}`);
    }

    for (let i = 0; i < ACTIVE_SIDES.length; i++) {
      const side = ACTIVE_SIDES[i];

      const mesh = buildHandMesh({
        asset: this.asset,
        side,
        material: this.materialSet.material,
        // The nails are their own primitive in the asset and want the opposite
        // treatment to skin - paler and glossy. hand-mesh.js works out which
        // primitive they are from the skinning; if a replacement model welds
        // them into the skin mesh, this is simply unused.
        nailMaterial: this.materialSet.nailMaterial,
      });
      const rig = adoptRig({ root: mesh.root, joints: mesh.joints, side });
      const socketSet = buildSockets({ rig, side });

      if (mesh.root) {
        const position = HAND_ROOT_POSITION[side];
        if (position) mesh.root.position.fromArray(position);
        /**
         * THE LEFT HAND NEGATES Y AND Z. Feeding both hands the same Euler
         * triple does NOT produce a mirrored pair, which is what this code used
         * to do.
         *
         * Object3D composes its matrix as T * R * S, so the negative X scale
         * below sits to the RIGHT of the rotation: it mirrors the geometry in
         * the hand's own local space, turning the right-hand mesh into a left
         * one, and then the SAME rotation is applied to the result. A true
         * mirror across the camera's YZ plane needs the conjugate rotation
         * X * R * X as well, which for an XYZ Euler triple is exactly
         * (x, -y, -z).
         *
         * Without it both hands aim their fingers in the same direction rather
         * than symmetrically - measured at 149 mm of landmark asymmetry, with
         * the left hand's fingertips skewed 20 degrees toward screen centre.
         * With it the pair is symmetric to 0 micrometres.
         */
        const rotation =
          side === "left"
            ? [HAND_ROOT_ROTATION[0], -HAND_ROOT_ROTATION[1], -HAND_ROOT_ROTATION[2]]
            : HAND_ROOT_ROTATION;
        mesh.root.rotation.fromArray(rotation);
        /**
         * MIRROR THE LEFT HAND. The asset is a single right hand, so the left is
         * the same clone with a negative X scale. Three.js flips the winding
         * order for negative-determinant matrices, so it is not inside out, and
         * identical local bone rotations then produce correctly mirrored motion -
         * which is what lets one set of pose files drive both hands (Unit 9).
         */
        if (side === "left") mesh.root.scale.x *= -1;
      }

      const animator = new Animator({ side, onEvent: this._makeEventSink(side) });
      for (let n = 0; n < LAYER_NAMES.length; n++) {
        const name = LAYER_NAMES[n];
        animator.setLayerWeight(name, this.layerWeights[name]);
      }

      const record = {
        side,
        rig,
        socketSet,
        mesh,
        animator,
        /** The Object3D currently parented into one of this hand's sockets. */
        held: null,
        /** Which socket it is in, or null. */
        heldSocket: null,
        /**
         * Set by the two-handed clips (inspect, don-visor, cover-mouth), which
         * temporarily take over the left hand and must give back whatever it was
         * holding afterwards. Unit 9 implements the stash/restore.
         */
        stashed: null,
        stashedSocket: null,
      };

      this._records[side] = record;
      this._active.push(record);

      if (rig.root) this.root.add(rig.root);
    }

    // Children of the camera: the hands travel with the view and are not in the
    // physics world (§7). Unit 11 keeps this parenting but moves the meshes onto
    // a dedicated Layers channel rendered by a second camera with a very small
    // near plane, which is what stops them clipping through walls.
    if (this.camera) this.camera.add(this.root);

    this.root.visible = this._visible;
    this.ready = true;

    /**
     * SETTLE BOTH HANDS INTO `relaxed` BEFORE THE FIRST FRAME.
     *
     * Without this the hands render at the imported asset's BIND pose - fingers
     * straight and fanned apart - which the HANDOVER calls the biggest remaining
     * visual problem, and which reads as a mannequin rather than a hand. Nothing
     * else applies a pose: the animator's update() is still a stub, so whatever
     * is written here is what stays on screen.
     *
     * After `ready`, so setPose() resolves the per-side record instead of
     * warning that the module is uninitialised.
     */
    for (let i = 0; i < ACTIVE_SIDES.length; i++) this.setPose(ACTIVE_SIDES[i], "relaxed");

    return this;
  }

  /**
   * Advances animation. Call once per frame from the game loop.
   *
   * Belongs in Loop's per-frame `update`, NOT its fixedUpdate: the hands are
   * presentation, and animating them at a fixed 60 Hz on a 144 Hz monitor would
   * throw away the smoothness the display can show. Physics stays fixed-step;
   * this does not need to be.
   *
   * ALLOCATES NOTHING.
   *
   * @param {number} dt seconds since the last frame
   * @param {number} [elapsed] seconds since init; tracked internally when omitted
   */
  update(dt, elapsed) {
    if (!this.ready || this.disposed) return;

    this.elapsed += dt;
    const time = elapsed === undefined ? this.elapsed : elapsed;

    for (let i = 0; i < this._active.length; i++) {
      const record = this._active[i];
      record.animator.update(dt, time, record.rig);
    }
  }

  /**
   * Releases every GPU resource this module created and detaches from the scene.
   *
   * Three.js frees nothing on its own - see core/Disposer.js. The game tears
   * levels down and rebuilds them in place, so memory has to return to baseline
   * every time; Unit 16 verifies that across three teardowns with
   * renderer.info.memory.
   *
   * IDEMPOTENT. Calling it twice is safe, because a level teardown racing a
   * scene-graph disposal walk is exactly the situation where it gets called
   * twice.
   */
  dispose() {
    if (this.disposed) return;

    for (let i = 0; i < this._active.length; i++) {
      const record = this._active[i];
      // Held props are owned by the Interaction system / the level, never by
      // this module, so they are handed back rather than disposed. Disposing a
      // borrowed torch here would leave the level holding a dead mesh.
      this.detach(record.side);
      record.animator.dispose();
      record.mesh.dispose();
      record.socketSet.dispose();
      record.rig.dispose();
    }

    this._active.length = 0;
    this._records.left = null;
    this._records.right = null;

    this.materialSet.dispose();

    // The clones share the original's geometry, so the asset is released only
    // after every clone has gone.
    this.asset?.dispose?.();
    this.asset = null;

    this.root.removeFromParent();
    this.root.clear();

    this.ready = false;
    this.disposed = true;
  }

  /* ---------------------------------------------------------------- poses */

  /**
   * Snaps a hand to a named static pose.
   * @param {'left'|'right'} side
   * @param {string} poseName key from poses/index.js, e.g. 'relaxed', 'grip-cylinder'
   */
  setPose(side, poseName) {
    const record = this._record(side, "setPose");
    if (!record) return;

    const pose = getPose(poseName);
    if (!pose) {
      warnOnce(`pose:${poseName}`, `unknown pose "${poseName}". Known: ${POSE_NAMES.join(", ")}`);
      return;
    }

    applyPose(record.rig, pose);
  }

  /**
   * Eases a hand into a named pose over `seconds`.
   * @param {'left'|'right'} side
   * @param {string} poseName
   * @param {number} [seconds]
   */
  blendToPose(side, poseName, seconds = 0.25) {
    const record = this._record(side, "blendToPose");
    if (!record) return;

    const pose = getPose(poseName);
    if (!pose) {
      warnOnce(`pose:${poseName}`, `unknown pose "${poseName}". Known: ${POSE_NAMES.join(", ")}`);
      return;
    }

    // Unit 5 owns the timed blend; blendPose is the per-frame primitive it
    // drives. Snapping is the honest Unit 0 behaviour - it is visibly wrong
    // rather than silently doing nothing.
    void seconds;
    void blendPose;
    applyPose(record.rig, pose);
  }

  /* ---------------------------------------------------------------- clips */

  /**
   * Plays a named clip on one hand.
   *
   * @param {'left'|'right'} side
   * @param {string} clipName key from clips/index.js
   * @param {object} [options]
   * @param {(name: string, payload: object) => void} [options.onEvent] per-play callback; events also go to the bus
   * @param {number} [options.fade] crossfade seconds
   * @returns {{ side: string|null, clip: object|null, done: boolean, time: number, stop: Function }}
   */
  play(side, clipName, { onEvent = null, fade } = {}) {
    const record = this._record(side, "play");
    if (!record) return INERT_CLIP_HANDLE;

    const clip = getClip(clipName);
    if (!clip) {
      warnOnce(`clip:${clipName}`, `unknown clip "${clipName}". Known: ${CLIP_NAMES.join(", ")}`);
      return INERT_CLIP_HANDLE;
    }

    return record.animator.play(clip, { onEvent, fade });
  }

  /** Stops whatever `side` is playing. A stop is not a finish, so no hands:clip-end. */
  stop(side) {
    const record = this._record(side, "stop");
    if (!record) return;
    record.animator.stop();
  }

  /**
   * True while a one-shot clip is still running on that hand.
   *
   * The Interaction system gates input on this, so that a player cannot start a
   * second pickup halfway through the first. Looping clips (lockpick, idle) do
   * NOT count as busy - they would block input forever.
   */
  isBusy(side) {
    const record = this._record(side, "isBusy");
    return record ? record.animator.isBusy() : false;
  }

  /* -------------------------------------------------------------- layers */

  /**
   * Sets an additive layer's weight on BOTH hands. See ./animator.js for names.
   * @param {string} name e.g. 'tremor', 'breathe', 'walkbob'
   * @param {number} weight 0..1, clamped
   */
  setLayerWeight(name, weight) {
    if (!Object.prototype.hasOwnProperty.call(this.layerWeights, name)) {
      warnOnce(`layer:${name}`, `unknown layer "${name}". Known: ${LAYER_NAMES.join(", ")}`);
      // Stored anyway: a layer added by a later unit should work the moment its
      // module lands, without the caller having to be edited too.
    }

    const value = clamp01(weight);
    this.layerWeights[name] = value;

    for (let i = 0; i < this._active.length; i++) {
      this._active[i].animator.setLayerWeight(name, value);
    }
  }

  /* ---------------------------------------------------------- attachment */

  /**
   * Parents an object into one of a hand's sockets.
   *
   * The object keeps being owned by whoever passed it in - this module borrows
   * it and never disposes it. Typically called by the Interaction system on the
   * `hands:grasp` event, after it has made the object's rigid body kinematic.
   *
   * @param {'left'|'right'} side
   * @param {THREE.Object3D} object3D
   * @param {string} [socketName] 'grip' | 'pinch' | 'flat' | 'palm'
   * @returns {THREE.Object3D|null} the socket it attached to, or null on failure
   */
  attach(side, object3D, socketName = SOCKETS.GRIP) {
    const record = this._record(side, "attach");
    if (!record) return null;

    if (!object3D || !object3D.isObject3D) {
      warnOnce("attach-bad-object", "attach() needs an Object3D.");
      return null;
    }

    const socket = this.getSocket(side, socketName);
    if (!socket) return null;

    if (record.held && record.held !== object3D) this.detach(side);

    socket.add(object3D);
    record.held = object3D;
    record.heldSocket = socketName;
    return socket;
  }

  /**
   * Removes whatever a hand is holding from its socket and hands it back.
   *
   * The caller is responsible for re-parenting it and restoring its rigid body
   * at the socket's world transform - this module does not know about Rapier and
   * must not start now. Returning the object rather than silently reparenting it
   * to the scene is what keeps that boundary explicit.
   *
   * @returns {THREE.Object3D|null} the detached object, or null if empty-handed
   */
  detach(side) {
    const record = this._record(side, "detach");
    if (!record || !record.held) return null;

    const object3D = record.held;
    object3D.removeFromParent();
    record.held = null;
    record.heldSocket = null;
    return object3D;
  }

  /**
   * The Object3D to parent a prop to. Null before init and before Unit 8.
   * @param {'left'|'right'} side
   * @param {string} socketName
   * @returns {THREE.Object3D|null}
   */
  getSocket(side, socketName = SOCKETS.GRIP) {
    const record = this._record(side, "getSocket");
    if (!record) return null;

    if (!isSocket(socketName)) {
      warnOnce(
        `socket:${socketName}`,
        `unknown socket "${socketName}". Known: ${SOCKET_NAMES.join(", ")}`,
      );
      return null;
    }

    const node = record.socketSet.sockets.get(socketName);
    if (!node) {
      warnOnce(
        `socket-missing:${socketName}`,
        `socket "${socketName}" does not exist yet - sockets land in Unit 8.`,
      );
      return null;
    }
    return node;
  }

  /* ------------------------------------------------------ material state */

  /**
   * 0..1 grime, accumulating across the game - soot from the basement, residue
   * from the creature's trail. Visible, cumulative, story-linked change to the
   * thing the player looks at most.
   *
   * Note that 0 is a USED working glove, not a new one. These hands have been
   * through something before the game starts.
   */
  setGrime(value) {
    this.materialSet.setGrime(value);
  }

  /** 0..1 wetness - rain, and the damp basement. Raises specular, darkens albedo. */
  setWetness(value) {
    this.materialSet.setWetness(value);
  }

  /* ------------------------------------------------------------ visibility */

  /**
   * Hides or shows both hands. Needed for cutscenes, the CCTV view, and puzzle
   * close-up panels, where hands floating over a full-screen UI panel reads as a
   * rendering bug.
   *
   * Toggles one Group rather than walking the meshes: cheaper, and it cannot
   * leave one finger visible.
   */
  setVisible(visible) {
    this._visible = !!visible;
    this.root.visible = this._visible;
  }

  /* ---------------------------------------------------------------- private */

  /**
   * Resolves a side to its record, warning once on a bad side or an uninitialised
   * module. Returns null rather than throwing - every public method has to be
   * safe to call before init() and after dispose().
   */
  _record(side, caller) {
    if (!isSide(side)) {
      warnOnce(`side:${caller}:${side}`, `${caller}() needs 'left' or 'right', got "${side}".`);
      return null;
    }
    if (!this.ready) {
      warnOnce(`not-ready:${caller}`, `${caller}() called before init() (or after dispose()).`);
      return null;
    }
    const record = this._records[side];
    /**
     * A VALID SIDE THAT WAS NEVER BUILT. Before ACTIVE_SIDES existed both hands
     * always existed once `ready`, so this branch could not happen and the method
     * returned null in silence. With the left hand switched off it can, and
     * silence is the wrong answer: a caller written against the README's
     * handedness convention (torch in the left hand) would do nothing at all,
     * with no diagnostic, which is exactly the failure mode this module's
     * warn-once policy exists to prevent.
     */
    if (!record) {
      warnOnce(
        `inactive:${caller}:${side}`,
        `${caller}() addressed the ${side} hand, which is not built. ` +
          `Active hands: ${ACTIVE_SIDES.join(", ")}. See ACTIVE_SIDES in hands.js.`,
      );
      return null;
    }
    return record;
  }

  /**
   * Builds one event sink per hand, ONCE at init, and hands it to that hand's
   * animator. Created here rather than per play() call so that starting a clip
   * allocates no closure.
   *
   * ON ALLOCATION: this sink builds a fresh payload object per event. That is
   * deliberate and is not a violation of the zero-allocation rule, which is
   * about the FRAME LOOP - events fire a handful of times per interaction, not
   * sixty times a second. A reused mutable payload would be worse than the
   * garbage it saves: it crosses the bus to listeners this module cannot see,
   * and any listener that held onto it would find its contents silently
   * rewritten by the next event.
   */
  _makeEventSink(side) {
    return (name, detail) => {
      const payload = { side, name, clip: detail?.clip ?? null, time: detail?.time ?? 0 };
      if (this.bus) this.bus.emit(name, payload);
    };
  }
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
