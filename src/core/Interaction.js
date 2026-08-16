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

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.current) {
        this.current.userData.interact.onInteract?.();
      }
    });
  }

  setTargets(objects) {
    this.targets = objects;
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
