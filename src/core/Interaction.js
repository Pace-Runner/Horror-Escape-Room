import * as THREE from 'three';

const RAY_ORIGIN = new THREE.Vector2(0, 0);

// Centre-screen raycast against a flat list of "interactable" meshes.
// Each interactable carries userData.interact = { label, range, onInteract }.
// This is intentionally simple (no inventory, no puzzle state machine) --
// it exists so every story prop in the world can already be looked at and
// explained before the real puzzle logic is layered on top of it.
export class Interaction {
  /**
   * `captions` is a CaptionSequencer. This class used to own the caption box
   * outright and drive it with a single setTimeout, which meant two lines close
   * together erased each other -- see the note at the top of
   * core/CaptionSequencer.js. It now only forwards.
   */
  constructor(camera, promptEl, captions) {
    this.camera = camera;
    this.promptEl = promptEl;
    this.captions = captions;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.2;
    this.targets = [];
    this.current = null;
    // Gate for the level-transition fade. Skipping update() alone is NOT
    // enough to suppress interaction: this keydown listener tests `current`,
    // which stays latched on whatever was last hovered, so E would keep firing
    // the old level's door while the screen is black.
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyE') return;
      this.interact();
    });
  }

  /**
   * Uses whatever the crosshair is on. E calls this, and so does right-click
   * (wired in main.js, which knows when the mouse belongs to the game).
   */
  interact() {
    if (!this.enabled) return;
    if (this.beforeInteract?.()) return;
    if (!this.current) return;
    this.current.userData.interact.onInteract?.();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    // Clearing `current` is the whole point -- see the constructor note.
    if (!enabled) {
      this.current = null;
      this.promptEl.style.display = 'none';
    }
  }

  setTargets(objects) {
    this.targets = objects;
    // Same latch, different cause: after a level switch `current` still points
    // at a mesh in the level just left, so the first E press in the new room
    // could fire the old room's interaction. Also covers a one-shot pickup
    // splicing itself out of the list, which used to leave a stale prompt.
    this.current = null;
    this.promptEl.style.display = 'none';
  }

  /**
   * Incidental examine text. Kept as a method because ~50 level call sites take
   * it as a `showCaption` callback; it is now a one-line delegate.
   *
   * The default duration is gone deliberately: the sequencer reads the line and
   * gives long ones longer, which a flat 4200 ms could not. Pass a duration to
   * override.
   */
  showCaption(text, duration) {
    return this.captions.say(text, duration);
  }

  update() {
    if (!this.enabled) return;
    const overridePrompt = this.getOverridePrompt?.();
    if (overridePrompt) {
      this.current = null;
      this.promptEl.textContent = `[E] ${overridePrompt}`;
      this.promptEl.style.display = 'block';
      return;
    }
    this.raycaster.setFromCamera(RAY_ORIGIN, this.camera);
    // `allow`, when set, narrows what can be used right now (main.js: only
    // the hide-and-seek's own objects while the study is dark).
    const hits = this.raycaster.intersectObjects(this.targets, false)
      .filter((candidate) => !this.allow || this.allow(candidate.object));
    // Most interactions keep nearest-hit behaviour. A child target may opt
    // into a higher priority when a broad parent hitbox overlaps it, such as
    // an item inside an open drawer. This preserves aiming at the item rather
    // than allowing the container to consume the interaction.
    const hit = hits.reduce((currentHit, candidate) => {
      if (!currentHit) return candidate.object;
      const currentPriority = currentHit.userData.interact.priority ?? 0;
      const candidatePriority = candidate.object.userData.interact.priority ?? 0;
      return candidatePriority > currentPriority ? candidate.object : currentHit;
    }, null);

    if (hit !== this.current) {
      this.current = hit;
      if (hit) {
        this.promptEl.textContent = `[E] ${hit.userData.interact.label}`;
        this.promptEl.style.display = 'block';
      } else {
        this.promptEl.style.display = 'none';
      }
    } else if (hit) {
      // A target can change its own label while it is looked at -- a door
      // going from "open" to "close" -- so keep the prompt in step with it.
      const text = `[E] ${hit.userData.interact.label}`;
      if (this.promptEl.textContent !== text) this.promptEl.textContent = text;
    }
  }
}
