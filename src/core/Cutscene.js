import * as THREE from 'three';

/**
 * Scripted camera work: a timeline of shots, filmed through a camera of its own.
 *
 * Shaped after transitionTo() in main.js, and for the same reasons: a
 * generation counter so a restart taken mid-scene cannot be resumed by the
 * scene unwinding behind it, and one place (give) that hands everything back
 * whatever happened. Those two are not optional. A scene holds the view, hides
 * the hands and freezes the player, so a scene that ends without restoring them
 * does not produce a glitch -- it produces an unplayable game with a frozen
 * view, and no way out but a page reload.
 *
 * A SEPARATE CAMERA, NOT THE PLAYER'S ONE MOVED ABOUT -- the same call the free
 * camera and the third-person view already made, for the same reason. The
 * player's camera IS the player: the creature faces it, the doorway trigger
 * reads its z, the minimap centres on it, the audio director's footsteps are
 * placed off it. Fly that camera down the hall for a shot and the hall
 * activates under it, which cancels the very scene that moved it. So the shot
 * camera moves, the player's camera stays exactly where the player is standing,
 * and the game carries on round them while the scene plays. The torch is a
 * child of the player's camera too, so a shot looking back at the player sees
 * their beam coming from where they stand -- which is the point of looking back.
 *
 * ON THE FRAME CLOCK. update(dt) is called from main.js's tick, after the
 * creature has been posed and before the draw. That buys three things a private
 * requestAnimationFrame loop could not: Esc freezes a shot along with its voice
 * line (main.js skips update while the captions are paused), the free camera's
 * slow motion slows a scene down for review, and onFrame() can add to a
 * character's pose after its own update() has reset every bone -- the order
 * JumpScare.js relies on.
 *
 * WHAT A SCENE HAS TO REMEMBER TO TURN OFF, and why:
 *
 *   the hands   - they are children of the PLAYER'S camera, so from the shot
 *                 camera they are a glove and a torch hanging in the air.
 *   the motes   - DustMotes lights its motes along the torch beam, and they hang
 *                 off the player's camera as well: a cone of dust in mid-air.
 *   interaction - the centre-screen raycast keeps hitting things, so E during a
 *                 scene opens a drawer somewhere off screen.
 *   the player  - movement and look, or WASD walks them out of their own shot.
 *
 * Each is a one-line call and each one, forgotten, is immediately visible. They
 * are wired here rather than left to each scene so no scene can forget, and
 * each is put back to what it WAS, not to "on" -- the third-person view hides
 * the hands too, and a scene must not bring them back over it. Then
 * `onHandBack` lets main.js re-derive them from the game's real state, which
 * is what wins when something changed while the scene played (the torch
 * switched off, a restart that cancelled it).
 *
 * A SCENE is plain data, so it can live in its own file under src/cutscenes/
 * and know nothing about main.js:
 *
 *     {
 *       name: 'hallwayReveal',
 *       letterbox: true,
 *       shots: [
 *         { at: 'player', lookAt: 'creature.head', seconds: 0.8 },
 *         { path: [[0, 1.6, 1], [0, 1.6, 1.3]], lookAt: 'creature.head', fov: [70, 38], seconds: 2.2 },
 *         { cut: true, at: [0.4, 1.0, 10.6], lookAt: 'player', fov: 45, seconds: 1.3, shake: 0.4 },
 *       ],
 *       cues: [{ t: 3.0, run: (ctx) => ctx.sfx('wood_creak') }],
 *       onFrame: (ctx, t, dt) => {},
 *     }
 *
 * See docs/CUTSCENES.md for every field.
 */

/** The longest a scene may run, as a safety stop: a typo in `seconds` cannot strand the view. */
const MAX_SCENE_SECONDS = 90;

/** Shake frequencies, in Hz. Incommensurate, so the wobble never visibly repeats. */
const SHAKE_HZ = [5.3, 7.9, 11.7];

/** A hand-back only re-aims the player if the last shot ended this close to their eye. */
const HANDBACK_MAX_METRES = 0.5;

const EASES = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
  // Smoothstep. The default: a camera that starts at full speed reads as a cut.
  inout: (u) => u * u * (3 - 2 * u)
};

const _target = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _shake = new THREE.Euler(0, 0, 0, 'YXZ');
const _shakeQuat = new THREE.Quaternion();
const _sampleA = new THREE.Vector3();
const _sampleB = new THREE.Vector3();
const _lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _aim = new THREE.Quaternion();
const HANDBACK = new THREE.Euler(0, 0, 0, 'YXZ');

export function createCutsceneRunner({
  camera,
  player,
  interaction,
  hands = null,
  dustMotes = null,
  captions = null,
  fade = null,
  targets = {},
  onHandBack = null
} = {}) {
  /** The lens every shot is filmed through. main.js renders through it while a scene runs. */
  const shotCamera = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);

  let generation = 0;
  /** The scene playing now, or null. Everything about it lives here, so cancel() has one thing to drop. */
  let current = null;

  createLetterboxBars();

  /** Everything a scene borrows, remembered so it can be put back exactly as it was found. */
  function take(def) {
    const borrowed = {
      movementEnabled: player.movementEnabled,
      lookEnabled: player.lookEnabled,
      handsVisible: hands?.root?.visible ?? true,
      motesVisible: dustMotes?.points?.visible ?? true,
      beamOn: (dustMotes?.material?.uniforms?.uBeamOn?.value ?? 0) > 0
    };
    player.cinematic = true;
    player.movementEnabled = false;
    player.lookEnabled = false;
    interaction?.setEnabled(false);
    hands?.setVisible?.(false);
    dustMotes?.setBeamOn?.(false);
    if (dustMotes?.points) dustMotes.points.visible = false;
    document.body.classList.add('cutscene');
    document.body.classList.toggle('cutscene-letterbox', !!def.letterbox);
    shotCamera.layers.mask = camera.layers.mask;
    return borrowed;
  }

  function give(scene) {
    const { borrowed, def } = scene;
    player.cinematic = false;
    // The sprint blend froze where the scene found it (player.update() returns
    // early while cinematic), and main.js turns it into the FOV kick: a player
    // who ran at the door would get the view popping wide on the very frame
    // the hand-back was meant to make seamless. spawn() clears it the same way.
    player.sprint = 0;
    if (player.keys) player.keys.sprint = false;
    // aim() rather than just clearing the flag when the view is handed back
    // re-aimed: the player class owns yaw and pitch as the source of truth and
    // DERIVES the quaternion from them, so writing the camera's rotation alone
    // would snap back on the first mouse movement. Documented in
    // PointerLockPlayer's update(). aim() and not spawn(), because spawn() also
    // stands the player up: a crouching player would see the view jump up for
    // the hand-back frame and drop again on the next.
    //
    // Re-aimed only when the last shot ended at the player's own eye -- a scene
    // that cuts back to their view hands over exactly the view it left, so the
    // last frame of the scene and the first frame of play are the same picture.
    // A scene that ends 30 m away over the treeline leaves their aim alone.
    camera.getWorldPosition(_eye);
    const returnTo = def.returnTo && typeof def.returnTo === 'object' ? def.returnTo : null;
    if (returnTo) {
      player.spawn(returnTo.x, returnTo.z, returnTo.yaw ?? 0, returnTo.pitch ?? 0);
    } else if (shotCamera.position.distanceTo(_eye) < HANDBACK_MAX_METRES) {
      HANDBACK.setFromQuaternion(shotCamera.quaternion, 'YXZ');
      player.aim(HANDBACK.y, HANDBACK.x);
    }
    player.movementEnabled = borrowed.movementEnabled;
    player.lookEnabled = borrowed.lookEnabled;
    interaction?.setEnabled(true);
    hands?.setVisible?.(borrowed.handsVisible);
    if (dustMotes?.points) dustMotes.points.visible = borrowed.motesVisible;
    if (def.restoreBeam !== false) dustMotes?.setBeamOn?.(borrowed.beamOn);
    document.body.classList.remove('cutscene', 'cutscene-letterbox');
    // The snapshot above is what the scene found; onHandBack is the game saying
    // what is TRUE now. They differ whenever something changed under the scene
    // -- third person toggled, the torch switched off, a restart that put the
    // torch away before cancelling the scene -- and the game's word wins.
    try {
      onHandBack?.(def);
    } catch (err) {
      console.error('[cutscene] onHandBack threw', err);
    }
  }

  /** A point a shot can name: [x,y,z], a Vector3, a function of the shot's progress, or a target's name. */
  function resolvePoint(point, u, out) {
    if (point == null) return null;
    if (typeof point === 'function') point = point(u);
    if (typeof point === 'string') {
      if (point === 'player') return camera.getWorldPosition(out);
      const target = targets[point];
      if (!target) {
        console.warn(`[cutscene] no target called "${point}"`);
        return null;
      }
      point = target();
      if (point == null) return null;
    }
    if (point.isVector3) return out.copy(point);
    return out.set(point[0], point[1], point[2]);
  }

  /**
   * The orientation a camera at `position` needs to look at `point`, with
   * `up` as the top of the frame -- world up unless a shot says otherwise. A
   * shot from the eyes of someone lying on their back needs its own: the top
   * of their view is the top of their head, not the ceiling.
   */
  function lookQuaternion(position, point, out, up = null) {
    shotCamera.position.copy(position);
    if (up) shotCamera.up.set(up[0], up[1], up[2]).normalize();
    shotCamera.lookAt(point);
    shotCamera.up.set(0, 1, 0);
    return out.copy(shotCamera.quaternion);
  }

  /**
   * A recorded take (the free camera's J) is a list of samples. Played back by
   * time, linearly: the samples are 1/30 s apart and already carry the free
   * camera's easing, so smoothing them again would only blur the operator's hand.
   */
  function sampleTake(samples, seconds, out) {
    const last = samples[samples.length - 1];
    if (seconds <= samples[0].t) return Object.assign(out, samples[0]);
    if (seconds >= last.t) return Object.assign(out, last);
    let i = 1;
    while (samples[i].t < seconds) i++;
    const a = samples[i - 1];
    const b = samples[i];
    const k = (seconds - a.t) / Math.max(1e-6, b.t - a.t);
    _sampleA.fromArray(a.pos);
    _sampleB.fromArray(b.pos);
    out.pos = _sampleA.lerp(_sampleB, k).toArray();
    out.yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k;
    out.pitch = a.pitch + (b.pitch - a.pitch) * k;
    out.fov = a.fov + (b.fov - a.fov) * k;
    return out;
  }

  /**
   * A shot begins from wherever the one before it ENDED -- evaluated at its own
   * u = 1, not read off the camera -- so seek() lands on the same frame that
   * playing to that point would have, and a frame that overshoots the boundary
   * cannot shift where the next shot starts from.
   */
  function beginShot(scene, index) {
    const shot = scene.shots[index];
    if (index === 0) {
      shot.from = scene.start;
    } else {
      const before = scene.shots[index - 1];
      const end = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 0 };
      evaluateShot(scene, before, 1, end);
      shot.from = end;
    }
    const path = shot.def.path;
    if (path) {
      // A point that does not resolve (a misspelt target) is dropped, not
      // handed to the curve: CatmullRomCurve3 throws on a null point.
      const points = path.map((p) => resolvePoint(p, 0, new THREE.Vector3())).filter(Boolean);
      if (!shot.def.cut) points.unshift(shot.from.pos.clone());
      shot.curve = points.length >= 2 ? new THREE.CatmullRomCurve3(points) : null;
    }
    shot.begun = true;
  }

  /** Where the camera is, which way it looks and how wide, at progress u through a shot. */
  function evaluateShot(scene, shot, u, out) {
    const def = shot.def;
    const from = shot.from;
    const e = (EASES[def.ease] ?? EASES.inout)(u);
    const blendIn = !def.cut;

    if (def.samples?.length) {
      const sample = sampleTake(def.samples, u * shot.seconds, {});
      out.pos.fromArray(sample.pos);
      _lookEuler.set(sample.pitch, sample.yaw, 0, 'YXZ');
      out.quat.setFromEuler(_lookEuler);
      out.fov = sample.fov;
      return out;
    }

    if (shot.curve) {
      shot.curve.getPoint(e, out.pos);
    } else if (def.at != null) {
      resolvePoint(def.at, u, _target);
      if (blendIn) out.pos.copy(from.pos).lerp(_target, e);
      else out.pos.copy(_target);
    } else {
      out.pos.copy(from.pos);
    }

    const lookPoint = resolvePoint(def.lookAt, u, _target);
    if (lookPoint) {
      // `up` may be a function of u too, for a head that rolls as it turns.
      const up = typeof def.up === 'function' ? def.up(u) : def.up;
      lookQuaternion(out.pos, lookPoint, out.quat, up);
    } else if (def.yaw != null) {
      _lookEuler.set(def.pitch ?? 0, def.yaw, 0, 'YXZ');
      out.quat.setFromEuler(_lookEuler);
    } else if (def.at === 'player') {
      // Back at the player's eye with nothing named to look at: their own view.
      out.quat.copy(scene.start.quat);
    } else {
      out.quat.copy(from.quat);
    }
    // A shot that does not cut turns into its framing from the last one's,
    // rather than snapping the look to its target on its first frame.
    // The aim is copied out first: slerp reads its target AFTER the receiver is
    // overwritten, so `out.quat.copy(from).slerp(out.quat, e)` -- or
    // slerpQuaternions(from, out.quat, e) -- slerps from.quat to itself and the
    // shot never turns at all.
    if (blendIn) out.quat.slerpQuaternions(from.quat, _aim.copy(out.quat), e);

    if (typeof def.fov === 'function') {
      // A lens that breathes through a long shot, on the shot's own clock.
      out.fov = def.fov(u);
    } else if (Array.isArray(def.fov)) {
      out.fov = THREE.MathUtils.lerp(def.fov[0], def.fov[1], e);
    } else if (typeof def.fov === 'number') {
      out.fov = blendIn ? THREE.MathUtils.lerp(from.fov, def.fov, e) : def.fov;
    } else {
      out.fov = from.fov;
    }
    return out;
  }

  const _pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 70 };

  /** Puts the shot camera where the timeline says it is at scene time `t`. */
  function poseAt(scene, t) {
    let index = scene.shots.findIndex((s) => t < s.t0 + s.seconds);
    if (index === -1) index = scene.shots.length - 1;
    for (let i = 0; i <= index; i++) {
      if (!scene.shots[i].begun) beginShot(scene, i);
    }
    const shot = scene.shots[index];
    const u = THREE.MathUtils.clamp((t - shot.t0) / shot.seconds, 0, 1);
    evaluateShot(scene, shot, u, _pose);

    shotCamera.position.copy(_pose.pos);
    shotCamera.quaternion.copy(_pose.quat);
    const shake = shot.def.shake ?? 0;
    if (shake > 0) {
      // Degrees of wobble at shake = 1: a handheld operator who is frightened.
      const amplitude = THREE.MathUtils.degToRad(0.8) * shake;
      _shake.set(
        Math.sin(t * SHAKE_HZ[0] * Math.PI * 2) * amplitude,
        Math.sin(t * SHAKE_HZ[1] * Math.PI * 2 + 1.3) * amplitude,
        Math.sin(t * SHAKE_HZ[2] * Math.PI * 2 + 2.1) * amplitude * 0.5,
        'YXZ'
      );
      shotCamera.quaternion.multiply(_shakeQuat.setFromEuler(_shake));
    }
    shotCamera.aspect = camera.aspect;
    if (shotCamera.fov !== _pose.fov || shotCamera.userData.aspect !== camera.aspect) {
      shotCamera.fov = _pose.fov;
      shotCamera.userData.aspect = camera.aspect;
      shotCamera.updateProjectionMatrix();
    }
  }

  /** Every cue whose time has come, once each, in order. */
  function fireCues(scene, t) {
    while (scene.nextCue < scene.cues.length && scene.cues[scene.nextCue].t <= t) {
      const cue = scene.cues[scene.nextCue++];
      try {
        cue.run?.(scene.ctx);
      } catch (err) {
        console.error(`[cutscene] cue at ${cue.t}s in "${scene.def.name}" threw`, err);
      }
      // A cue that cancelled the scene (or ended it some other way) is the
      // last one: the rest belong to a scene that has already been cleaned up.
      if (current !== scene) return;
    }
  }

  function finish(scene, completed) {
    if (current !== scene) return;
    current = null;
    // Everything handed back FIRST, then the scene's own clean-up (a body it
    // showed, a light it held) -- on a cancel as much as on an ending, since a
    // restart mid-scene is exactly when something it staged would otherwise be
    // left standing. In that order so an onEnd that starts the next scene
    // starts it from the game's real state: the other way round, the next
    // scene's take() would snapshot this one's borrowed state, and this one's
    // give() would then hand the player back in the middle of the next.
    give(scene);
    try {
      scene.def.onEnd?.(scene.ctx, completed);
    } catch (err) {
      console.error(`[cutscene] onEnd in "${scene.def.name}" threw`, err);
    }
    scene.resolve(completed);
  }

  /** Builds the running state for a scene, starting from wherever the player is looking now. */
  function compile(def, ctx) {
    camera.updateMatrixWorld();
    const start = {
      pos: camera.getWorldPosition(new THREE.Vector3()),
      quat: camera.getWorldQuaternion(new THREE.Quaternion()),
      fov: camera.fov
    };
    let t0 = 0;
    const shots = def.shots.map((shotDef) => {
      // Not `?? 1`: a computed duration that came out NaN would make the whole
      // scene NaN long, and NaN is never past the end -- the view stranded for
      // good, which is what the MAX_SCENE_SECONDS cap exists to prevent.
      const seconds = Number.isFinite(shotDef.seconds) ? Math.max(0.01, shotDef.seconds) : 1;
      const shot = { def: shotDef, t0, seconds, from: null, curve: null, begun: false };
      t0 += seconds;
      return shot;
    });
    const cues = [...(def.cues ?? [])].sort((a, b) => a.t - b.t);
    return {
      def, ctx, start, shots, cues,
      nextCue: 0,
      time: 0,
      duration: Math.min(t0, MAX_SCENE_SECONDS),
      held: false,
      resolve: null
    };
  }

  const runner = {
    /** The shot camera. main.js draws through it while isRunning. */
    camera: shotCamera,

    get isRunning() {
      return current !== null;
    },

    /** The playing scene's name, or null. */
    get name() {
      return current?.def.name ?? null;
    },

    /** Seconds into the playing scene. */
    get time() {
      return current?.time ?? 0;
    },

    get duration() {
      return current?.duration ?? 0;
    },

    /** Whether the playing scene may be skipped -- its def says `skippable: true`. */
    get skippable() {
      return !!current?.def.skippable;
    },

    /**
     * Ends a skippable scene now, the way it would have ended: on its last
     * shot's final frame (so a scene that cuts back to the player's eyes still
     * hands over with no snap), after the scene's own onSkip(ctx, t) has done
     * whatever must not be lost by skipping -- a plot line not shown yet. Cues
     * still to come do not fire. Returns false if there is nothing to skip.
     */
    skip() {
      const scene = current;
      if (!scene || !scene.def.skippable) return false;
      try {
        scene.def.onSkip?.(scene.ctx, scene.time);
      } catch (err) {
        console.error(`[cutscene] onSkip in "${scene.def.name}" threw`, err);
      }
      if (current !== scene) return true;
      scene.held = false;
      scene.time = scene.duration;
      try {
        poseAt(scene, scene.duration);
      } catch (err) {
        console.error(`[cutscene] could not pose the end of "${scene.def.name}"`, err);
      }
      finish(scene, true);
      return true;
    },

    /** Where each shot of the playing scene starts and how long it runs, in scene seconds. */
    get shotTimes() {
      return current ? current.shots.map((s) => ({ t0: s.t0, seconds: s.seconds })) : [];
    },

    /**
     * Plays a scene. Resolves true if it played to the end, false if it was
     * cancelled or another scene was already playing. Same contract as
     * CaptionSequencer.play(), for the same reason: the caller has to be able
     * to tell.
     *
     * @param def  the scene; see the top of this file and docs/CUTSCENES.md.
     * @param ctx  passed to every cue and to onFrame: whatever the scene needs
     *             to act with (the creature, sfx, captions...), handed in by the
     *             caller so scene files never import main.js.
     */
    playScene(def, ctx = {}) {
      if (current) return Promise.resolve(false);
      if (!def?.shots?.length) {
        console.warn('[cutscene] a scene needs at least one shot');
        return Promise.resolve(false);
      }
      generation++;
      const scene = compile(def, ctx);
      scene.borrowed = take(def);
      current = scene;
      const promise = new Promise((resolve) => { scene.resolve = resolve; });
      // The first frame is posed now rather than on the next tick, so the frame
      // drawn between this call and that tick is already the scene's.
      runner.update(0);
      return promise;
    },

    /**
     * One frame of the playing scene. Called from main.js's tick after the
     * characters have been updated and before the draw; skipped there while the
     * game is paused.
     */
    update(dt) {
      const scene = current;
      if (!scene) return;
      if (!scene.held) scene.time = Math.min(scene.duration, scene.time + dt);
      const t = scene.time;
      fireCues(scene, t);
      if (current !== scene) return;   // a cue cancelled it
      // The acting first, the lens second: a shot that follows a figure (a
      // target on its body) then films this frame's pose, not the last one's.
      try {
        scene.def.onFrame?.(scene.ctx, t, scene.held ? 0 : dt);
      } catch (err) {
        console.error(`[cutscene] onFrame in "${scene.def.name}" threw`, err);
      }
      if (current !== scene) return;   // onFrame ended it
      try {
        poseAt(scene, t);
      } catch (err) {
        // A shot that cannot be evaluated (a lookAt function that throws, a
        // malformed take) ends the scene rather than escaping into main.js's
        // tick, which has no try/catch and would never draw another frame.
        console.error(`[cutscene] a shot in "${scene.def.name}" threw; ending the scene`, err);
        finish(scene, false);
        return;
      }
      if (!scene.held && t >= scene.duration) finish(scene, true);
    },

    /**
     * Stop whatever is playing and give everything back. Restart calls this
     * first, exactly as every instant level jump calls abortTransition().
     */
    cancel() {
      generation++;
      if (current) finish(current, false);
      captions?.cancel();
    },

    /**
     * DEV: hold the playing scene on the frame at `t` seconds. Cues up to `t`
     * fire, so lights a cue put out are out in the still; seeking backwards
     * does not re-fire them. resume() lets it play on from there.
     */
    seek(t) {
      const scene = current;
      if (!scene) return false;
      scene.held = true;
      scene.time = THREE.MathUtils.clamp(t, 0, scene.duration);
      runner.update(0);
      return true;
    },

    resume() {
      if (current) current.held = false;
    },

    /**
     * Fly the camera along one path -- the original single-shot API, kept for
     * the endings and rebuilt on playScene.
     *
     * @param points  [[x,y,z], ...] at least two, through a CatmullRomCurve3.
     * @param lookAt  [x,y,z] held throughout, or a function t -> [x,y,z].
     * @param seconds duration.
     * @param body    optional async work started alongside the move -- captions,
     *                usually. Not awaited: the move finishes when the TIME is up.
     * @param restoreBeam whether the torch beam's motes come back at the end.
     * @param returnTo {x, z, yaw, pitch} where the player is put down afterwards.
     */
    play({ points, lookAt, seconds = 6, body = null, restoreBeam = true, returnTo = null, tail = null } = {}) {
      if (!points || points.length < 2) {
        console.warn('[cutscene] a shot needs at least two points');
        return Promise.resolve(false);
      }
      const shots = [{ cut: true, path: points, lookAt, seconds }];
      const cues = body ? [{ t: 0, run: () => body() }] : [];
      if (tail) {
        // Held on the last frame while the tail runs (a fade), so nothing is
        // handed back until it has finished.
        shots.push({ cut: true, at: points[points.length - 1], lookAt: typeof lookAt === 'function' ? lookAt(1) : lookAt, seconds: tail.seconds });
        cues.push({ t: seconds, run: tail.run });
      }
      return runner.playScene({ name: 'shot', shots, cues, restoreBeam, returnTo });
    },

    /**
     * A shot that ends on black -- the endings. The fade is part of the scene,
     * filmed from the shot's last frame, so the view is never handed back to
     * the player until the screen is already black.
     */
    async playToBlack({ points, lookAt, seconds = 8, body = null, fadeMs = 1600, returnTo = null } = {}) {
      const tail = fade
        ? { seconds: fadeMs / 1000, run: () => { fade.fadeOut(fadeMs); } }
        : null;
      return runner.play({ points, lookAt, seconds, body, restoreBeam: false, returnTo, tail });
    }
  };

  return runner;
}

/**
 * Two black bars, top and bottom, that slide in for a scene that asks for them
 * (body.cutscene-letterbox; the slide is in style.css). Made here rather than in
 * index.html so the runner is self-contained, the way the free camera makes its
 * own status line.
 */
function createLetterboxBars() {
  for (const edge of ['top', 'bottom']) {
    const bar = document.createElement('div');
    bar.className = `cutscene-bar cutscene-bar-${edge}`;
    document.body.appendChild(bar);
  }
}
