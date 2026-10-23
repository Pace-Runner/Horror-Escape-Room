import * as THREE from 'three';

const PUSH_SECONDS = 1.4;
const HOLD_SECONDS = 60;
const RETURN_SECONDS = 0.8;
const SCENE_NAME = 'session14';

/** Borrows the existing runner's control lock and holds its framing until the
 * tape actually ends. Cancellation restores controls without story callbacks.
 */
export function createSessionTapeFocus({ cutscene, camera }) {
  let phase = 'idle';
  let onRestored = null;

  return {
    start(deck) {
      if (cutscene.isRunning) return false;
      const target = deck.localToWorld(new THREE.Vector3(0, 0.065, 0.04));
      const eye = deck.localToWorld(new THREE.Vector3(0, 0.4, 0.75));
      phase = 'push';
      cutscene.playScene({
        name: SCENE_NAME,
        skippable: false,
        shots: [
          { at: eye.toArray(), lookAt: target.toArray(), fov: Math.min(camera.fov, 60), seconds: PUSH_SECONDS },
          { at: eye.toArray(), lookAt: target.toArray(), seconds: HOLD_SECONDS },
          { at: 'player', fov: camera.fov, seconds: RETURN_SECONDS }
        ],
        onEnd(_context, completed) {
          const callback = onRestored;
          onRestored = null;
          phase = 'idle';
          if (completed) callback?.();
        }
      });
      return true;
    },
    update() {
      if (phase !== 'push' || cutscene.name !== SCENE_NAME || cutscene.time < PUSH_SECONDS) return;
      phase = 'listen';
      cutscene.seek(PUSH_SECONDS);
    },
    finish(callback) {
      if (cutscene.name !== SCENE_NAME) { callback(); return; }
      onRestored = callback;
      phase = 'return';
      cutscene.seek(PUSH_SECONDS + HOLD_SECONDS);
      cutscene.resume();
    },
    cancel() {
      onRestored = null;
      phase = 'idle';
      if (cutscene.name === SCENE_NAME) cutscene.cancel();
    }
  };
}
