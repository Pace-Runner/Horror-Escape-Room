import * as THREE from 'three';

// Drives the two light sources the storyline calls for: an "unstable"
// warm bulb that flickers, and cold blue-white lightning that flashes
// through the window on an irregular timer and briefly lights the room.
export class Storm {
  constructor({ bulbLight, lightningLight, onFlash } = {}) {
    this.bulbLight = bulbLight;
    this.lightningLight = lightningLight;
    this.onFlash = onFlash;
    this.bulbBaseIntensity = bulbLight ? bulbLight.intensity : 0;
    this.bulbBlown = false;
    this.nextFlashAt = 2 + Math.random() * 4;
    this.flashTimer = 0;
    this.flashDuration = 0;
    this.clockElapsed = 0;
  }

  blowBulb() {
    this.bulbBlown = true;
    if (this.bulbLight) this.bulbLight.intensity = 0;
  }

  update(dt) {
    this.clockElapsed += dt;

    if (this.bulbLight && !this.bulbBlown) {
      // Irregular flicker: mostly steady with occasional dips/surges.
      const flicker = 0.85 + Math.random() * 0.15;
      const dip = Math.random() < 0.02 ? 0.15 : 1;
      this.bulbLight.intensity = this.bulbBaseIntensity * flicker * dip;
    }

    if (this.lightningLight) {
      if (this.flashTimer > 0) {
        this.flashTimer -= dt;
        const t = Math.max(this.flashTimer, 0) / this.flashDuration;
        this.lightningLight.intensity = t * 3.2 * (0.6 + Math.random() * 0.4);
        if (this.flashTimer <= 0) {
          this.lightningLight.intensity = 0;
        }
      } else {
        this.nextFlashAt -= dt;
        if (this.nextFlashAt <= 0) {
          this.flashDuration = 0.12 + Math.random() * 0.18;
          this.flashTimer = this.flashDuration;
          this.nextFlashAt = 5 + Math.random() * 9;
          this.onFlash?.();
        }
      }
    }
  }
}
