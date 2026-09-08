import * as THREE from 'three';

/**
 * Scripted camera shots.
 *
 * Shaped after transitionTo() in main.js, and for the same reasons: a
 * generation counter so a restart taken mid-shot cannot be resumed by the shot
 * unwinding behind it, and a `finally` that hands the camera back whatever
 * happened. Those two are not optional. A cutscene holds the camera, hides the
 * hands and freezes the player, so an exception escaping without restoring them
 * does not produce a glitch -- it produces an unplayable game with a frozen
 * view, and no way out but a page reload.
 *
 * WHAT A SHOT HAS TO REMEMBER TO TURN OFF, and why:
 *
 *   the hands   - they are children of the CAMERA. Move the camera anywhere the
 *                 player is not, and a disembodied glove and torch fly through
 *                 the scene attached to the lens.
 *   the beam    - DustMotes lights its motes along the torch beam. Left on
 *                 during a third-person pan it draws a cone of dust hanging in
 *                 mid-air where the player used to be standing.
 *   interaction - the centre-screen raycast keeps hitting things, so E during a
 *                 cutscene opens a drawer somewhere off screen.
 *
 * Each is a one-line call and each one, forgotten, is immediately visible. They
 * are wired here rather than left to each shot so no shot can forget.
 */

/** Frames the runner will not exceed for a single shot, as a safety stop. */
const MAX_SHOT_SECONDS = 90;

/** Smoothstep. Every shot eases; a camera that starts at full speed reads as a cut. */
function ease(t) {
  return t * t * (3 - 2 * t);
}

export function createCutsceneRunner({
  camera,
  player,
  interaction,
  hands = null,
  dustMotes = null,
  captions = null,
  fade = null
} = {}) {
  let generation = 0;
  let running = false;

  /** Everything a shot borrows, put back exactly as it was found. */
  function take() {
    player.cinematic = true;
    player.movementEnabled = false;
    player.lookEnabled = false;
    interaction?.setEnabled(false);
    hands?.setVisible?.(false);
    dustMotes?.setBeamOn?.(false);
  }

  const HANDBACK = new THREE.Euler(0, 0, 0, 'YXZ');

  function give(restoreBeam, returnTo) {
    player.cinematic = false;
    // spawn() rather than just clearing the flag: the player class owns yaw and
    // pitch as the source of truth and DERIVES the quaternion from them, so
    // handing back a camera it did not move would leave the two disagreeing and
    // snap the view on the first mouse movement. Documented in
    // PointerLockPlayer's update().
    //
    // Where it hands back to matters. By default it is wherever the shot left
    // the camera, read off the camera's own quaternion in the same YXZ order
    // the player uses -- so the view does not move at all on the handover. A
    // shot that ends somewhere the player cannot stand (a third-person pan out
    // of the house) passes `returnTo` instead.
    if (returnTo) {
      player.spawn(returnTo.x, returnTo.z, returnTo.yaw ?? 0, returnTo.pitch ?? 0);
    } else {
      HANDBACK.setFromQuaternion(camera.quaternion, 'YXZ');
      player.spawn(camera.position.x, camera.position.z, HANDBACK.y, HANDBACK.x);
    }
    player.movementEnabled = true;
    player.lookEnabled = true;
    interaction?.setEnabled(true);
    hands?.setVisible?.(true);
    if (restoreBeam) dustMotes?.setBeamOn?.(true);
  }

  return {
    get isRunning() {
      return running;
    },

    /**
     * Stop whatever is playing and give the camera back. Restart calls this
     * first, exactly as every instant level jump calls abortTransition().
     */
    cancel() {
      generation++;
      if (running) {
        running = false;
        give(false, null);
      }
      captions?.cancel();
    },

    /**
     * Fly the camera along a path while `body` runs.
     *
     * @param points  [[x,y,z], ...] at least two. A CatmullRomCurve3 through
     *                them, so a three-point path is a curve rather than a
     *                dog-leg -- this codebase already uses CatmullRomCurve3 for
     *                geometry, never yet as a camera path.
     * @param lookAt  [x,y,z] held throughout, or a function t -> [x,y,z].
     * @param seconds duration.
     * @param body    optional async work run alongside the move -- captions,
     *                usually. The move finishes when the TIME is up regardless,
     *                so a slow body cannot strand the camera mid-air.
     * @param restoreBeam whether the torch beam comes back at the end. False
     *                for a shot that ends the game.
     * @param returnTo {x, z, yaw, pitch} where the player is put down
     *                afterwards. Omit and they are left where the camera
     *                finished, which is right for a shot that ends where they
     *                are standing and wrong for one that flies out of the
     *                building.
     * @returns true if it played to the end, false if it was cancelled. Same
     *          contract as CaptionSequencer.play(), for the same reason: the
     *          caller has to be able to tell.
     */
    async play({ points, lookAt, seconds = 6, body = null, restoreBeam = true, returnTo = null } = {}) {
      if (running) return false;
      if (!points || points.length < 2) {
        console.warn('[cutscene] a shot needs at least two points');
        return false;
      }
      const mine = ++generation;
      running = true;
      take();

      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
      const target = new THREE.Vector3();
      const duration = Math.min(seconds, MAX_SHOT_SECONDS);

      try {
        if (body) body();          // deliberately not awaited; see the doc above
        const start = performance.now();
        // Driven by its own rAF rather than by the game's tick, so a shot is
        // self-contained and a level does not have to remember to pump it.
        await new Promise((resolve) => {
          const step = () => {
            if (mine !== generation) { resolve(); return; }
            const t = Math.min(1, (performance.now() - start) / (duration * 1000));
            curve.getPoint(ease(t), target);
            camera.position.copy(target);
            const at = typeof lookAt === 'function' ? lookAt(t) : lookAt;
            if (at) camera.lookAt(at[0], at[1], at[2]);
            if (t >= 1) { resolve(); return; }
            requestAnimationFrame(step);
          };
          step();
        });
        return mine === generation;
      } finally {
        // Guarded on the generation so a cancel that already restored state is
        // not stomped by this stale shot unwinding behind it.
        if (mine === generation) {
          running = false;
          give(restoreBeam, returnTo);
        }
      }
    },

    /**
     * A shot that ends on black -- the endings. Same as play(), but the fade
     * out is part of the shot rather than something the caller has to
     * remember, and the camera is never handed back mid-fade.
     */
    async playToBlack({ points, lookAt, seconds = 8, body = null, fadeMs = 1600, returnTo = null } = {}) {
      const ok = await this.play({ points, lookAt, seconds, body, restoreBeam: false, returnTo });
      if (!ok || !fade) return ok;
      await fade.fadeOut(fadeMs);
      return true;
    }
  };
}
