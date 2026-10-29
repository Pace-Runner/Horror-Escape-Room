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
   * @param moonlight what the lightning light rests at between strikes: the
   *   night through the window. A strike adds to it.
   */
  constructor({ bulbLight, lightningLight, bulbMaterial = null, onFlash, onBlow, moonlight = 0 } = {}) {
    this.bulbLight = bulbLight;
    this.lightningLight = lightningLight;
    this.moonlight = moonlight;
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
    /** Seconds of the first strokes, the bright part: what the window scare is lit for. */
    this.revealSeconds = 0;
    this.flashAge = 0;
    /** This flash's strokes: [{ at, length, peak }], and the sky's afterglow. */
    this.strokes = [];
    this.afterglow = null;
    this.clockElapsed = 0;
  }

  /**
   * A strike is not one flash. The channel is lit by two to four return
   * strokes a few hundredths of a second apart, each at full brightness at
   * once and dying away, with the channel faintly lit between them; then the
   * cloud keeps a little of it for a moment. It used to be one linear fade
   * with a random flicker every frame, which read as a lamp being switched.
   */
  #planFlash() {
    const count = 2 + Math.floor(Math.random() * 3);
    this.strokes = [];
    let at = 0;
    for (let i = 0; i < count; i++) {
      const last = i === count - 1;
      this.strokes.push({
        at,
        length: 0.05 + Math.random() * 0.07 + (last ? 0.06 : 0),
        peak: i === 0 ? 0.85 + Math.random() * 0.15 : 0.35 + Math.random() * 0.65
      });
      at += this.strokes[i].length + 0.03 + Math.random() * 0.09;
    }
    const lastStroke = this.strokes[count - 1];
    this.afterglow = { at: lastStroke.at, length: 0.35 + Math.random() * 0.3, peak: 0.12 + Math.random() * 0.08 };
    this.flashDuration = this.afterglow.at + this.afterglow.length;
    const second = this.strokes[1];
    this.revealSeconds = second.at + second.length;
    this.flashAge = 0;
  }

  /** 0..1: how lit the sky is `age` seconds into this flash. */
  #flashLevel(age) {
    let level = 0;
    for (const { at, length, peak } of this.strokes) {
      const u = (age - at) / length;
      if (u < 0 || u >= 1) continue;
      // Full brightness almost at once, then dying away.
      level = Math.max(level, peak * (u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.6)));
    }
    // The channel, faintly, between the strokes.
    const lastStroke = this.strokes[this.strokes.length - 1];
    if (age < lastStroke.at) level = Math.max(level, 0.08);
    const glow = this.afterglow;
    const g = (age - glow.at) / glow.length;
    if (g >= 0 && g < 1) level = Math.max(level, glow.peak * (1 - g) * (1 - g));
    return level;
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

  /**
   * A strike on the next frame rather than whenever the storm's own clock
   * says, for a scene that wants the window lit at a given moment. It goes
   * through the normal path -- onFlash, thunder, the shadow render -- and the
   * storm then picks its rhythm back up from there. Ignored mid-flash.
   */
  flashNow() {
    if (this.flashTimer <= 0) this.nextFlashAt = 0;
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
        this.flashAge += dt;
        this.flashTimer = Math.max(0, this.flashDuration - this.flashAge);
        this.lightningLight.intensity = this.moonlight + 3.2 * this.#flashLevel(this.flashAge);
        if (this.flashTimer <= 0) {
          this.lightningLight.intensity = this.moonlight;
        }
      } else {
        this.nextFlashAt -= dt;
        if (this.nextFlashAt <= 0) {
          this.#planFlash();
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
