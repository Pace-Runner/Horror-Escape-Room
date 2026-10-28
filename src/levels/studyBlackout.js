import * as THREE from 'three';
import { STUDY_WINDOWS } from './studyWindows.js';
import boardUrl from '../assets/models/study/study_breaker_board.glb?url';
import fuseUrl from '../assets/models/fuse.glb?url';
import tinUrl from '../assets/models/study/study_fuse_tin.glb?url';

/**
 * THE STUDY'S BLACKOUT: the storm takes the power after the crest key pickup.
 *
 * See docs/LEVEL3_HIDE_AND_SEEK.md for the story. In short: a strike kills the
 * study's power by coincidence, and Annabelle uses the dark to find
 * Mark and sedate him. Almost everything goes out. What is left is the moon
 * through the three left-wall casements, the candle the gust missed, and the
 * lightning. The way out is the breaker up on the loft. The component retains
 * its legacy blown-fuse mode, but visor collection no longer starts a second encounter.
 *
 * LIGHTS ARE BAKED INTO SHADERS (CLAUDE.md). This file makes NO lights. The
 * room keeps a light budget (scripts/check-study-reveal.mjs), and main's
 * night lighting already has the moon in it: studyExterior.js's window light,
 * the study's one shadow caster. setFills() hands that and the night sky over,
 * and the lightning comes in through the same window light, flashing it. A
 * blackout only ever moves intensities -- the room's lamp out, the fill down,
 * the window up for a strike -- and recolours the ambient, which is a uniform
 * and costs no program.
 */

/** How fast the room's own lights die and come back (per second, exponential). */
const FADE_OUT_RATE = 9;
const FADE_IN_RATE = 3.5;
/** The ambient that is left: enough that the room has a shape, never enough to read a face. */
const DARK_AMBIENT = 0.16;
/**
 * How much of the dark's fill is left, against the first tuning: the ambient
 * above, the moon through the windows, the night outside (`fills`) and the
 * scene's environment light (main.js reads `fill`). A quarter (Kiran,
 * 2026-10-28: "make the room dark during hide and seek, try around 25%").
 * The candle the storm misses, the embers, the lightning and the torch are
 * light sources, not fill, and are left as they are.
 */
const BLACKOUT_FILL = 0.25;
/** What the ambient turns to as the power goes: moonlight. */
const MOON_COLOUR = 0x8ea6d6;
/** How bright a strike makes the window light, at full strength. */
const LIGHTNING_PEAK = 5.5;
/** Seconds between strikes while the power is out, drawn uniformly. */
const STRIKE_GAP = [7, 15];
/**
 * The candles the storm misses: the nearest wick to each of these. One, on
 * the mantel, by Annabelle's chair, where a sedated Mark comes round; it is
 * nowhere near the shadow crest's dials. The loft's had sat right over the
 * breaker, and that sconce is gone (Kiran, 2026-10-28; studyDecor.js).
 */
const SURVIVOR_NEAR = [new THREE.Vector3(-6.1, 1.7, -6.2)];
/** A survivor's pool, in metres: inside it the player is lit, whatever the dark. */
const CANDLE_POOL = 1.8;

/** The loft breaker, on the loft's back wall clear of the archive and the cabinet beside it. */
const BREAKER_AT = new THREE.Vector3(6.15, 0, -6.44);
const BREAKER_HEIGHT = 1.45;
/** The spare fuse's tin, on the boards against the desk's right-hand end. */
const FUSE_TIN_AT = new THREE.Vector3(1.2, 0, 1.3);

/**
 * @param {object} deps
 * @param {THREE.Group} deps.group - the study's root; the lights and the breaker go in it
 * @param {object[]} deps.interactables - the study's, by reference
 * @param {Array<THREE.Light>} deps.roomLights - every light the power feeds; each dies to 0
 * @param {THREE.AmbientLight} deps.ambient - goes to a cold trace, not to 0
 * @param {object} deps.candles - world/CandleFlames.js
 * @param {object} deps.hearth - world/HearthFire.js
 * @param {number} deps.loftY
 * @param {(url: string) => Promise<THREE.Object3D>} [deps.loadBoard] - the study's loader (harmonised)
 * @param {(url: string) => Promise<THREE.Object3D>} [deps.loadFuse] - the plain loader, for Level 2's fuse.glb
 * @param {(state: 'teaser'|'hunt') => void} [deps.onBreakerThrown] - the power is back
 * @param {() => void} [deps.onFuseTaken]
 * @param {() => boolean} [deps.hasFuse] - is the spare in the inventory
 * @param {() => void} [deps.onFuseFitted] - the spare used up
 * @param {(text: string) => void} [deps.showCaption]
 * @param {(name: string) => void} [deps.onSfx]
 * @param {() => void} [deps.onStrike] - each lightning flash, for the thunder
 */
export function createStudyBlackout({
  group, interactables, roomLights, ambient, candles, hearth, loftY,
  loadBoard = () => new Promise(() => {}), loadFuse = () => new Promise(() => {}),
  onBreakerThrown = () => {}, onFuseTaken = () => {}, hasFuse = () => false, onFuseFitted = () => {},
  showCaption = () => {}, onSfx = () => {}, onStrike = () => {}
}) {
  const baseIntensity = new Map(roomLights.map((light) => [light, light.intensity]));
  /** The night's lights (setFills), each at its own intensity, as built. */
  const fillIntensity = new Map();
  /** The one the lightning comes in by: the window light (setFills `flash`). */
  let flashLight = null;
  const ambientBase = { intensity: ambient.intensity, color: ambient.color.clone() };
  const moonColour = new THREE.Color(MOON_COLOUR);

  let out = false;
  /** 1 lit as built, 0 dead; eased toward `out`. */
  let power = 1;
  let strikeIn = Infinity;
  /** The flash in flight: seconds into it, or null. */
  let flashAge = null;
  let flashStrength = 0;
  const survivors = [];

  function pickSurvivors() {
    survivors.length = 0;
    const anchors = candles.anchors;
    const at = new THREE.Vector3();
    for (const near of SURVIVOR_NEAR) {
      let best = null;
      let bestD = Infinity;
      for (const anchor of anchors) {
        const d = anchor.getWorldPosition(at).distanceToSquared(near);
        if (d < bestD) { bestD = d; best = anchor; }
      }
      if (best && !survivors.some((s) => s.anchor === best)) {
        survivors.push({ anchor: best, position: best.getWorldPosition(new THREE.Vector3()) });
      }
    }
  }

  // ------------------------------------------------------------- the breaker
  // An old slate switchboard (blender/study/build_breaker_board.py): a brass
  // knife switch, blades up is ON, and a porcelain carrier the fuse lies in.
  // Not Level 2's breaker_panel.glb: that is a modern consumer unit, and the
  // study was wired long before the lab. The model faces into the room as it
  // comes; its origin is the middle of the board's back, on the wall.
  const breaker = new THREE.Group();
  breaker.name = 'Study_Breaker';
  breaker.position.set(BREAKER_AT.x, loftY + BREAKER_HEIGHT, BREAKER_AT.z);
  group.add(breaker);
  /** The blades: found in the model once it is in. At 0 they are up in the jaws. */
  let leverPivot = null;
  const LEVER_ON = 0;
  const LEVER_OFF = 2.3;
  let leverAngle = LEVER_ON;
  let leverTarget = LEVER_ON;
  /** The fuse in the carrier, and the spare in the tin: Level 2's fuse.glb, which these clips fit. */
  const seatedFuse = new THREE.Group();
  seatedFuse.name = 'Study_Breaker_Fuse';
  breaker.add(seatedFuse);
  const fuse = loadFuse(fuseUrl);
  loadBoard(boardUrl).then((model) => {
    breaker.add(model);
    leverPivot = model.getObjectByName('LeverPivot');
    const seat = model.getObjectByName('FuseSeat');
    if (seat) seatedFuse.position.copy(seat.position);
  }).catch((error) => console.warn('Study breaker board could not load:', error));
  // fuse.glb stands along +Y; the carrier holds it lying along X.
  fuse.then((model) => {
    const copy = model.clone(true);
    copy.rotation.z = Math.PI / 2;
    seatedFuse.add(copy);
  }).catch((error) => console.warn('Study fuse could not load:', error));
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const breakerHit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.34), hitMat);
  breakerHit.position.set(0, 0, 0.17);
  breaker.add(breakerHit);

  /**
   * 'on'      the power is on; the breaker is just a breaker
   * 'tripped' blackout 1: the lever is down, throw it back
   * 'blown'   blackout 2: the fuse went with the strike; it needs the spare
   * 'fused'   the spare is in; throw the lever
   */
  let breakerState = 'on';
  let blackoutKind = null;
  let blownHinted = false;

  function setBreakerState(state) {
    breakerState = state;
    leverTarget = state === 'on' ? LEVER_ON : LEVER_OFF;
    seatedFuse.visible = state !== 'blown';
    breakerHit.userData.interact.label = {
      on: 'The breaker',
      tripped: 'Throw the breaker',
      blown: hasFuse() ? 'Fit the spare fuse' : 'The breaker: the fuse is blown',
      fused: 'Throw the breaker'
    }[state];
  }

  breakerHit.userData.hintKey = 'l3_breaker';
  breakerHit.userData.interact = {
    label: 'The breaker',
    onInteract: () => {
      if (breakerState === 'on') {
        showCaption("The power's on. For now.");
      } else if (breakerState === 'blown') {
        if (!hasFuse()) {
          showCaption(blownHinted
            ? 'The fuse is black. The spare is in the tin by the desk.'
            : 'The fuse has blown. There was a tin of spares down by the desk.');
          blownHinted = true;
          onSfx('metal_click');
          return;
        }
        onFuseFitted();
        onSfx('metal_click');
        setBreakerState('fused');
        showCaption('The spare fuse seats with a click.');
      } else {
        onSfx('main_lever');
        const kind = blackoutKind;
        setOut(false);
        onBreakerThrown(kind);
      }
    }
  };
  interactables.push(breakerHit);
  // A label that tracks the inventory: the fuse may be picked up after the
  // player last looked at the breaker.
  function refreshBreakerLabel() {
    if (breakerState === 'blown') setBreakerState('blown');
  }

  // ----------------------------------------------------------- the spare fuse
  // A battered tin on the floor by the desk, its printed lid off beside it
  // (blender/study/build_fuse_tin.py). Its fuse only matters once the second
  // strike has blown the one in the breaker; it lies inside the tin.
  const tin = new THREE.Group();
  tin.name = 'Study_Fuse_Tin';
  tin.position.copy(FUSE_TIN_AT);
  group.add(tin);
  loadBoard(tinUrl).then((model) => tin.add(model))
    .catch((error) => console.warn('Study fuse tin could not load:', error));
  const looseFuse = new THREE.Group();
  // On its side in the tin: the caps' radius above the tin's floor.
  looseFuse.rotation.set(0, 0.3, Math.PI / 2);
  looseFuse.position.set(0.03, 0.026, 0);
  tin.add(looseFuse);
  fuse.then((model) => looseFuse.add(model.clone(true))).catch(() => {});
  const fuseHit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), hitMat);
  fuseHit.position.set(0, 0.08, 0);
  tin.add(fuseHit);
  fuseHit.userData.hintKey = 'l3_fuse';
  fuseHit.userData.interact = {
    label: 'Take the spare fuse',
    onInteract: () => {
      if (!looseFuse.visible || breakerState !== 'blown') return;
      looseFuse.visible = false;
      const index = interactables.indexOf(fuseHit);
      if (index >= 0) interactables.splice(index, 1);
      onFuseTaken();
      refreshBreakerLabel();
    }
  };

  function offerFuse(on) {
    looseFuse.visible = true;
    const index = interactables.indexOf(fuseHit);
    if (on && index < 0) interactables.push(fuseHit);
    if (!on && index >= 0) interactables.splice(index, 1);
  }

  // ---------------------------------------------------------------- control
  /** Sets the power. `kind` says which blackout: it decides what the breaker needs. */
  function setOut(next, { kind = null, instant = false } = {}) {
    out = !!next;
    if (out) {
      blackoutKind = kind ?? 'teaser';
      pickSurvivors();
      candles.setExtinguished(true, { spare: survivors.map((s) => s.anchor) });
      // The gust that put them out: in through the casements.
      for (const z of STUDY_WINDOWS.zs) {
        candles.gust(new THREE.Vector3(STUDY_WINDOWS.wallX + 0.3, STUDY_WINDOWS.bottom, z), { strength: 1.1, radius: 6, life: 1.6 });
      }
      hearth.setLevel(0, { instant });
      setBreakerState(blackoutKind === 'hunt' ? 'blown' : 'tripped');
      offerFuse(blackoutKind === 'hunt');
      strikeIn = 4 + Math.random() * 4;
    } else {
      candles.setExtinguished(false);
      hearth.setLevel(1, { instant });
      setBreakerState('on');
      offerFuse(false);
      blackoutKind = null;
      strikeIn = Infinity;
    }
    if (instant) power = out ? 0 : 1;
  }

  /** A flash now: the lightning light pulses two or three times over a third of a second. */
  function strike({ strength = 1 } = {}) {
    flashAge = 0;
    flashStrength = strength;
    onStrike();
  }

  /** The pulses of one flash, 0..1 at `age` seconds. */
  function flashCurve(age) {
    const pulse = (at, length, peak) => (age >= at && age < at + length ? peak * (1 - (age - at) / length) : 0);
    return Math.max(pulse(0, 0.08, 1), pulse(0.12, 0.06, 0.55), pulse(0.22, 0.14, 0.85));
  }

  function update(dt) {
    const step = Math.max(0, Math.min(dt, 0.1));
    const rate = out ? FADE_OUT_RATE : FADE_IN_RATE;
    power += ((out ? 0 : 1) - power) * Math.min(1, step * rate);
    for (const [light, base] of baseIntensity) light.intensity = base * power;
    const fill = THREE.MathUtils.lerp(BLACKOUT_FILL, 1, power);
    for (const [light, base] of fillIntensity) light.intensity = base * fill;
    ambient.intensity = THREE.MathUtils.lerp(DARK_AMBIENT * BLACKOUT_FILL, ambientBase.intensity, power);
    ambient.color.copy(moonColour).lerp(ambientBase.color, power);

    if (out) {
      strikeIn -= step;
      if (strikeIn <= 0) {
        strike({ strength: 0.7 + Math.random() * 0.3 });
        strikeIn = STRIKE_GAP[0] + Math.random() * (STRIKE_GAP[1] - STRIKE_GAP[0]);
      }
    }
    // A strike: on top of the window's own light, which the fill above has
    // just set afresh, so the flash leaves nothing behind when it is over.
    if (flashAge !== null) {
      flashAge += step;
      if (flashLight) flashLight.intensity += LIGHTNING_PEAK * flashStrength * flashCurve(flashAge);
      if (flashAge > 0.5) flashAge = null;
    }
    leverAngle += (leverTarget - leverAngle) * Math.min(1, step * 14);
    if (leverPivot) leverPivot.rotation.x = leverAngle;
  }

  /** Is (x, y, z) somewhere the dark does not hide you? A survivor's pool, or a flash. */
  function isLit(x, y, z) {
    if (!out) return true;
    if (lightningActive()) return true;
    for (const { position } of survivors) {
      if (Math.abs(position.y - (y + 1)) > 2.2) continue;
      if (Math.hypot(position.x - x, position.z - z) < CANDLE_POOL) return true;
    }
    return false;
  }

  function lightningActive() {
    return flashAge !== null && flashCurve(flashAge) > 0.35;
  }

  function reset() {
    setOut(false, { instant: true });
    blownHinted = false;
    leverAngle = leverTarget = LEVER_ON;
    flashAge = null;
    update(0);
  }

  setBreakerState('on');
  update(0);

  return {
    setOut,
    strike,
    update,
    isLit,
    reset,
    refreshBreakerLabel,
    get isOut() { return out; },
    get kind() { return blackoutKind; },
    get breakerState() { return breakerState; },
    get lightning() { return lightningActive(); },
    /** 0 dark .. 1 full power, as the room's own lights see it. */
    get power() { return power; },
    /**
     * The night's own lights, which reach in through the windows: turned down
     * with the room's in a blackout, and `flash`, the window light, is the one
     * the lightning comes in by. Built after this, so handed over after.
     */
    setFills(lights, { flash = null } = {}) {
      for (const light of lights) if (!fillIntensity.has(light)) fillIntensity.set(light, light.intensity);
      flashLight = flash;
    },
    /**
     * More of the house's electric lights, built after this: they go out with
     * the power as the desk lamp does (the porch lamp, the HOLLOW map's
     * picture light).
     */
    addRoomLights(lights) {
      for (const light of lights) if (light && !baseIntensity.has(light)) baseIntensity.set(light, light.intensity);
    },
    /** The share of the fill light left: BLACKOUT_FILL dark .. 1 lit. main.js scales the environment by it. */
    get fill() { return THREE.MathUtils.lerp(BLACKOUT_FILL, 1, power); },
    /** Level 2's fuse model, for world/itemMeshes.js: the spare in the hand is the same fuse. */
    fuseTemplate: fuse,
    breaker,
    breakerHit,
    fuseTin: tin,
    /** Where the breaker is worked from, on the loft floor. */
    breakerStand: [BREAKER_AT.x, BREAKER_AT.z + 0.75],
    get survivors() { return survivors.map((s) => s.position); }
  };
}
