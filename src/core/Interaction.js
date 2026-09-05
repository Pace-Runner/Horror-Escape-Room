import * as THREE from 'three';

const RAY_ORIGIN = new THREE.Vector2(0, 0);

// Centre-screen raycast against a flat list of "interactable" meshes.
// Each interactable carries userData.interact = { label, range, onInteract }.
// This is intentionally simple (no inventory, no puzzle state machine) --
// it exists so every story prop in the world can already be looked at and
// explained before the real puzzle logic is layered on top of it.
export class Interaction {
  constructor(camera, promptEl, captionEl) {
    this.camera = camera;
    this.promptEl = promptEl;
    this.captionEl = captionEl;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.2;
    this.targets = [];
    this.current = null;
    this.captionTimer = null;
    // Gate for the level-transition fade. Skipping update() alone is NOT
    // enough to suppress interaction: this keydown listener tests `current`,
    // which stays latched on whatever was last hovered, so E would keep firing
    // the old level's door while the screen is black.
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyE') return;
      if (!this.enabled || !this.current) return;
      this.current.userData.interact.onInteract?.();
    });
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

  showCaption(text, duration = 4200) {
    this.captionEl.textContent = text;
    this.captionEl.classList.add('visible');
    clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => {
      this.captionEl.classList.remove('visible');
    }, duration);
  }

  update() {
    if (!this.enabled) return;
    this.raycaster.setFromCamera(RAY_ORIGIN, this.camera);
    const hits = this.raycaster.intersectObjects(this.targets, false);
    const hit = hits[0]?.object ?? null;

    if (hit !== this.current) {
      this.current = hit;
      if (hit) {
        this.promptEl.textContent = `[E] ${hit.userData.interact.label}`;
        this.promptEl.style.display = 'block';
      } else {
        this.promptEl.style.display = 'none';
      }
    }
  }
}
