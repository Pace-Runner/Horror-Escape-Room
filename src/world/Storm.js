import * as THREE from 'three';

/**
 * How long the bulb takes to die. Long enough to be an event you watch, short
 * enough that it is not a light show -- a filament failing is quick.
 */
const BLOW_TIME = 0.85;

// Drives the two light sources the storyline calls for: an "unstable"
// warm bulb that flickers, and cold blue-white lightning that flashes
// through the window on an irregular timer and briefly lights the room.
export class Storm {
  /**
   * @param bulbMaterial the bulb MESH's material. Without it the light goes out
   *   and the glass keeps glowing -- see blowBulb().
   * @param onBlow fired on the frame the filament actually goes, for the sound.
   */
  constructor({ bulbLight, lightningLight, bulbMaterial = null, onFlash, onBlow } = {}) {
    this.bulbLight = bulbLight;
    this.lightningLight = lightningLight;
    this.bulbMaterial = bulbMaterial;
    this.onFlash = onFlash;
    this.onBlow = onBlow;
    this.bulbBaseIntensity = bulbLight ? bulbLight.intensity : 0;
    this.bulbBaseEmissive = bulbMaterial ? bulbMaterial.emissiveIntensity : 0;
    this.bulbBlown = false;
    /** Seconds remaining in the blow-out; 0 when not blowing. */
    this.blowT = 0;
    this.nextFlashAt = 2 + Math.random() * 4;
    /**
     * Flashes come far more often once the bulb has gone, and go back to a
     * normal storm rhythm when the player has a torch.
     *
     * This is not mercy, it is the storyline: "Using the brief flashes of
     * lightning you find the flashlight seen previously." Measured, losing the
     * bulb takes the room from 6.6/255 to 2.0 with 94% of the frame at black --
     * correct, and unnavigable at one flash every 5 to 14 seconds. The light the
     * player is told to search by has to actually arrive.
     */
    this.urgent = false;
    this.flashTimer = 0;
    this.flashDuration = 0;
    this.clockElapsed = 0;
  }

  /**
   * The bulb goes. This used to be two assignments in one frame -- set a flag,
   * set intensity to 0 -- against a caption that promises the bulb "flickers,
   * whines, and blows". It delivered none of the three verbs, and worse, it
   * never touched the bulb MESH: its material sat at emissive 0xffb347 /
   * intensity 1.4 for the rest of the game, so the brightest object in a room
   * the player had just been told was dark was the dead bulb.
   *
   * Now it is a short timeline. A surge, two hard dropouts, then nothing --
   * light and glass together, because they are the same object.
   */
  blowBulb() {
    if (this.bulbBlown || this.blowT > 0) return;
    this.blowT = BLOW_TIME;
    this.urgent = true;
    this.onBlow?.();
  }

  /** Immediately dark, no performance. For restarts. */
  #killBulb() {
    this.bulbBlown = true;
    this.blowT = 0;
    if (this.bulbLight) this.bulbLight.intensity = 0;
    if (this.bulbMaterial) this.bulbMaterial.emissiveIntensity = 0;
  }

  /** Puts the bulb back, for a fresh run. */
  /** Back to a normal storm. Called when the torch is found. */
  calm() {
    this.urgent = false;
  }

  relight() {
    this.bulbBlown = false;
    this.blowT = 0;
    this.urgent = false;
    if (this.bulbLight) this.bulbLight.intensity = this.bulbBaseIntensity;
    if (this.bulbMaterial) this.bulbMaterial.emissiveIntensity = this.bulbBaseEmissive;
  }

  update(dt) {
    this.clockElapsed += dt;

    // --- the bulb going ---------------------------------------------------
    if (this.blowT > 0) {
      this.blowT = Math.max(0, this.blowT - dt);
      const t = 1 - this.blowT / BLOW_TIME;         // 0 -> 1 across the blow
      // A filament about to fail draws harder and glows brighter, twice
      // dropping out almost entirely, and then it is simply gone.
      const dropout = (t > 0.30 && t < 0.36) || (t > 0.68 && t < 0.74);
      const surge = dropout ? 0.05 : 1 + t * 0.9;
      if (this.bulbLight) this.bulbLight.intensity = this.bulbBaseIntensity * surge;
      if (this.bulbMaterial) this.bulbMaterial.emissiveIntensity = this.bulbBaseEmissive * surge;
      if (this.blowT === 0) this.#killBulb();
      return;
    }

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
          this.nextFlashAt = this.urgent
            ? 1.6 + Math.random() * 2.4
            : 5 + Math.random() * 9;
          this.onFlash?.();
        }
      }
    }
  }
}
