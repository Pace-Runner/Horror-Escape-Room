import { cueInfo } from '../world/audio/assets.js';
import { buildSeamlessLoop } from '../world/audio/spatial.js';
import { segmentBlocked } from '../core/collision.js';

/**
 * WHO PLAYS WHEN.
 *
 * AudioEngine is DSP and loading; this is the rules. main.js constructs it,
 * ticks it once a frame, and tells it the few things only main.js knows -- a
 * level became active, a door opened, the creature stepped into view, the
 * player was caught. Everything else it reads for itself each frame: the
 * hunter's state, the CRT's power, the player's position. That split is the
 * same one CreatureAI.js has with the creature rig, and it is what keeps the
 * rules for thirteen cues out of a 3,700-line main.js.
 *
 * TIME. Every scheduler here runs on its own clock, advanced by the frame's dt
 * and ONLY while the player is actually playing (pointer locked, context
 * running) -- never setTimeout. A restart used to fire stale timers into the
 * fresh run (see core/Script.js), and a paused game must not bank a laugh to
 * play the instant it resumes.
 *
 * THE MONSTER RULES, which the user was emphatic about:
 *
 *   stalking aura (12)    never while the backrooms hunter is running, and never
 *                         on the crossing it hunts, even in the moments it is
 *                         momentarily stopped (its start delay, a respawn)
 *   hunter breathing (2)  only while it is CHASING -- it can see you
 *   hunter footsteps (13) only while it is searching or hunting -- it cannot
 *
 * and at most one scare cue (laughter, aura, footsteps) at a time.
 *
 * Every level below is DERIVED: "X dBFS at D metres" is turned into a gain
 * from the cue's measured peak in manifest.json and the panner's own distance
 * law, so a rebuilt file at a different level keeps sounding the same size.
 * The targets are against the existing mix's anchors -- the wind drone around
 * -35 dBFS peak, the base breathing -34.5, a player footstep -25.9, a voice
 * line at 0.9, the loudest story-beat breath -14.9.
 */

// ---------------------------------------------------------------------------
// Tunables. Each is a starting value for the user's ear; the derivation is the
// one-line reason for it.
// ---------------------------------------------------------------------------

/**
 * The equal-power panner at dead centre puts cos(pi/4) of a mono source in each
 * ear -- 3 dB under the same source played flat. Folded into every spatial
 * cue's gain, so its target is what actually arrives in front of the player.
 *
 * HRTF is not that simple: its filters lift 2-5 kHz straight ahead, so a cue
 * full of sharp transients peaks higher through it than through equal-power.
 * Measured offline (an OfflineAudioContext running this graph, straight ahead
 * at the reference distance): the hunter's breathing landed on target, its
 * footsteps 6.6 dB over and the stalking aura 4.8 dB over. `hrtfTrimDb` on those
 * two specs takes it back out. Re-measure if either file changes.
 */
const PAN_CENTRE = Math.SQRT1_2;

/**
 * Track 5. -33 dBFS peak, which at the file's 19 dB peak-to-loudness ratio is
 * about -52 LUFS: level with the wind drone. The brief's -30 put it 3 dB OVER
 * the wind, the loudest continuous thing in a Level 1 built to be quiet, and
 * under a voice line either way.
 */
const BED = {
  cue: 'rain_bed', peakDb: -33, levels: ['bedroom', 'study'], fadeIn: 3, fadeOut: 2.5
};

/** Track 9. -40 dBFS at 1 m; the inverse law at ref 0.35, rolloff 2 is -27 dB at 4 m. */
const CANDLE = {
  cue: 'candle', peakDb: -40, at: 1, fadeIn: 1.5, fadeOut: 0.5,
  panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 0.35, rolloff: 2 },
  // inverse has no hard cutoff (maxDistance does nothing to it), so the gain
  // itself goes to nothing between these.
  fadeFrom: 4, silentBy: 5
};

/**
 * Track 4. -30 dBFS at 1 m at full picture: clear at the desk, faint across the
 * lab (-21 dB at 6 m under ref 0.8, rolloff 1.6), gone down the hallway. The
 * floor is the dead tube's hiss -- the screen is dark until the fuse is in and
 * its button pressed, and this is a set that hums regardless.
 */
const STATIC = {
  cue: 'crt_static', peakDb: -30, at: 1, floor: 0.3, fadeIn: 0.4, fadeOut: 0.6,
  panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 0.8, rolloff: 1.6 },
  fadeFrom: 8, silentBy: 10, stopAt: 'routed'
};

/**
 * Track 1. -26 dBFS at 15 m -- quieter than any voice line by 20 dB, and it
 * waits for captions anyway. inverse ref 3 makes 9 m -21.5 and 22 m -29.3.
 */
const LAUGH = {
  cue: 'laugh_distant', peakDb: -26, at: 15,
  panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 3, rolloff: 1 },
  gapByLevel: { bedroom: [90, 180], hallwayBasement: [60, 150], study: [75, 160] },
  firstAfter: 75, defer: [10, 20], distance: [9, 22], height: [1.2, 2.2],
  // Never within 30 degrees of where the last one came from.
  minTurn: Math.PI / 6,
  // A wall between it and the player: -6 dB and most of the top gone.
  occludedDb: -6, occludedLowpass: 900,
  // Clear line: 3.5 kHz at 9 m, darkening to ~2 kHz at 22 m.
  clearLowpass: 3500, darkenExponent: 0.63,
  fade: 0.08, echoSend: 0.35,
  // Quiet this long after any monster cue, so a laugh never lands on a sighting.
  monsterQuiet: 20,
  // Used only if the manifest has no phrase list for the file.
  excerpt: [3, 6]
};

/**
 * Track 2. -14 dBFS at <= 2.5 m: under the sting (-8) and the loudest story
 * breath's neighbourhood. LINEAR, so it is genuinely silent beyond 14 m (the
 * hunter's own BREATH_FAR) and rises monotonically to full at 2.5.
 */
const HUNTER_BREATH = {
  cue: 'hunter_breath', peakDb: -14, at: 2.5, y: 1.5,
  panner: { model: 'HRTF', distanceModel: 'linear', refDistance: 2.5, maxDistance: 14, rolloff: 1 },
  // setTargetAtTime reaches 95% in three time constants.
  fadeIn: 0.25, fadeOut: 0.9, cut: 0.06
};

/**
 * Track 13. -22 dBFS at 3 m, and audible across the maze: inverse ref 3 is
 * -19 dB at 28 m, where the gain ramp takes it the rest of the way out.
 */
const HUNTER_STEPS = {
  cue: 'hunter_steps', peakDb: -22, at: 3, y: 0.3,
  panner: { model: 'HRTF', distanceModel: 'inverse', refDistance: 3, rolloff: 1 },
  hrtfTrimDb: -6.6,
  fadeFrom: 24, silentBy: 28,
  // Distance darkening: 8 kHz up close to 1.2 kHz at the far edge.
  nearLowpass: 8000, farLowpass: 1200,
  firstDelay: [4, 8], gap: [7, 18], length: [5, 9], fade: 0.15, chaseFade: 0.25, cut: 0.06
};

/**
 * Track 12. -20 dBFS at 2 m; inverse ref 2 keeps it -15 dB at 11 m, where the
 * backrooms' trailing shadow walks.
 */
const STALK = {
  cue: 'stalk_breath', peakDb: -20, at: 2, y: 1.4,
  panner: { model: 'HRTF', distanceModel: 'inverse', refDistance: 2, rolloff: 1 },
  hrtfTrimDb: -4.8,
  fadeIn: 0.15, fadeOut: 1, tail: 1,
  // With no body to sit on, it sits this far behind the listener.
  behind: 3,
  // The window bag: 0.1 s steps, and never within 1.5 s of the last start.
  step: 0.1, minApart: 1.5
};

/**
 * Track 6. The loudest cue in the game for its length, 6 dB over the hunter's
 * breathing at its closest. Everything under it drops 12 dB while it plays.
 */
const STING = {
  cue: 'caught_sting', peakDb: -8, duckDb: -12, duckAttack: 0.04, duckRelease: 1.5,
  // Study's Annabelle "hauls you back" -- a death sting there would undercut the
  // ending. Flip to give her catch the sting too.
  onStudyCatch: false
};

/** Track 11. -14 dBFS standing at the door, which is inside the 1.5 m reference. */
const DOOR = {
  cue: 'door_open', peakDb: -14, at: 1.5, y: 1.1,
  panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 1.5, rolloff: 1 }
};

/**
 * Track 10. -16 dBFS at 1.5 m (arm's length from the cubby): a little under the
 * door, since the box is small and the player is reading its tag as it opens.
 */
const LOCKBOX = {
  cue: 'lockbox_open', peakDb: -16, at: 1.5,
  panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 0.8, rolloff: 1.2 }
};

// ---------------------------------------------------------------------------

const dbToGain = (db) => 10 ** (db / 20);
const rand = (a, b) => a + Math.random() * (b - a);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The Web Audio distance laws, so a target can be stated at a distance. */
function distanceGain(p, d) {
  const ref = p.refDistance ?? 1;
  const roll = p.rolloff ?? 1;
  if (p.distanceModel === 'linear') {
    const max = p.maxDistance ?? 10000;
    const c = Math.min(Math.max(d, ref), max);
    return 1 - roll * (c - ref) / (max - ref);
  }
  if (p.distanceModel === 'exponential') return (Math.max(d, ref) / ref) ** -roll;
  return ref / (ref + roll * (Math.max(d, ref) - ref));
}

/**
 * The gain that puts a cue's own measured peak at `spec.peakDb` at `spec.at`
 * metres. A missing manifest entry assumes the -3 dBFS every file is built to.
 */
function levelFor(spec) {
  const peak = cueInfo(spec.cue)?.peakDb ?? -3;
  const space = spec.panner ? distanceGain(spec.panner, spec.at) * PAN_CENTRE : 1;
  return dbToGain(spec.peakDb - peak + (spec.hrtfTrimDb ?? 0)) / space;
}

/** 1 inside `from`, 0 past `to`, linear between. */
const rangeFade = (d, from, to) => Math.min(1, Math.max(0, (to - d) / (to - from)));

export function createAudioDirector({
  audio,
  /** The Object3D the player hears from, every frame. */
  getListener,
  player,
  captions,
  /** { key, level } for the active level. */
  getLevel,
  /** True while a transition, a catch or a cutscene owns the screen. */
  isBusy,
  hunter,
  /** True on the crossing the hunter hunts -- the aura is refused for all of it. */
  isHuntingCrossing,
  /** bedroom.refs.candleAnchors: Object3Ds at each flame. */
  candleAnchors = [],
  /** hallwayBasement.refs, for the CRT's position, power and the power stage. */
  basementRefs = null,
  THREE
}) {
  const v = new THREE.Vector3();
  const listenerPos = new THREE.Vector3();
  const listenerFwd = new THREE.Vector3();

  const gains = {
    bed: levelFor(BED), candle: levelFor(CANDLE), static: levelFor(STATIC), laugh: levelFor(LAUGH),
    hunterBreath: levelFor(HUNTER_BREATH), hunterSteps: levelFor(HUNTER_STEPS),
    stalk: levelFor(STALK), sting: levelFor(STING), door: levelFor(DOOR), lockbox: levelFor(LOCKBOX)
  };

  /** The director's clock: seconds of actual play. */
  let clock = 0;
  let levelKey = null;

  /** Every sound alive, for debug() and for teardown: { name, emitter, spans }. */
  const live = new Set();

  let bed = null;
  /** anchor Object3D -> its looping emitter. */
  const candles = new Map();
  let staticCue = null;
  let staticDone = false;
  const laugh = { nextAt: Infinity, cue: null, lastBearing: null, recent: [] };
  let hunterBreath = null;
  let hunterBreathTarget = -1;
  let hunterBreathLoop = null;
  const steps = { cue: null, nextAt: Infinity, wasSearching: false };
  const stalk = { cue: null, token: 0, follow: null, endsAt: Infinity, bag: [], lastStart: null, window: null };
  let lastMonsterAt = -Infinity;
  let lockboxCue = null;
  /** DEV auditions still playing: { emitter, until } in context seconds. */
  const auditions = new Set();

  function play(name, bus, opts, { spans = false } = {}) {
    const buffer = audio.cue(name);
    if (!buffer) return null;
    let entry = null;
    const emitter = audio.emit(bus, {
      buffer,
      ...opts,
      onEnded: () => { live.delete(entry); opts.onEnded?.(); }
    });
    if (!emitter) return null;
    entry = { name, emitter, spans };
    live.add(entry);
    return emitter;
  }

  const isRunning = () => (player.isLocked || director.forceActive) && audio.ctx?.state === 'running';
  const isHunterRunning = () => hunter.state !== 'stopped';
  /** The aura's guard, asked by the director AND by every caller. */
  const stalkAllowed = () => !isHunterRunning() && !isHuntingCrossing();

  function stopCue(emitter, fade) {
    emitter?.stop(fade);
    return null;
  }

  // ---------- level-scoped loops ----------

  function ensureBed() {
    const wanted = BED.levels.includes(levelKey);
    // A bed already fading out (left and came straight back) is not playing:
    // a fresh one comes in over its tail.
    const playing = bed?.alive && !bed.stopping;
    if (wanted && !playing) {
      const info = cueInfo(BED.cue);
      const loop = info?.loop ?? { start: 0, end: 0 };
      // Level 1 opens on the top of the bed. Anywhere else (Level 3) starts at
      // a random point, so the study does not open on the same bar.
      const offset = levelKey === 'bedroom' || !loop.end ? loop.start : rand(loop.start, loop.end);
      bed = play(BED.cue, 'amb', {
        loop: true, loopStart: loop.start, loopEnd: loop.end, offset, gain: gains.bed, fadeIn: BED.fadeIn
      });
    } else if (!wanted && playing) {
      bed = stopCue(bed, BED.fadeOut);
    }
  }

  /** One loop per flame. A candle whose model has not loaded yet joins when it does. */
  function updateCandles() {
    if (levelKey !== 'bedroom') return;
    const loop = cueInfo(CANDLE.cue)?.loop ?? { start: 0, end: 0 };
    for (const anchor of candleAnchors) {
      anchor.getWorldPosition(v);
      let c = candles.get(anchor);
      if (!c) {
        if (!audio.cue(CANDLE.cue)) return;
        // Each its own random start, so the two never phase-lock into one candle.
        c = play(CANDLE.cue, 'amb', {
          loop: true, loopStart: loop.start, loopEnd: loop.end,
          offset: loop.end ? rand(loop.start, loop.end) : 0,
          gain: 0, fadeIn: CANDLE.fadeIn, panner: CANDLE.panner, position: [v.x, v.y, v.z]
        });
        if (!c) return;
        candles.set(anchor, c);
      }
      c.setPosition(v.x, v.y, v.z, 0);
      c.setGain(gains.candle * rangeFade(listenerPos.distanceTo(v), CANDLE.fadeFrom, CANDLE.silentBy), 0.2);
    }
  }

  function updateStatic() {
    if (levelKey !== 'hallwayBasement' || !basementRefs) return;
    if (staticDone) return;
    if (basementRefs.powerStage === STATIC.stopAt) {
      // "Until the power is properly fixed": routed, not merely the 30A fuse.
      staticCue = stopCue(staticCue, STATIC.fadeOut);
      staticDone = true;
      return;
    }
    if (!staticCue) {
      const loop = cueInfo(STATIC.cue)?.loop ?? { start: 0, end: 0 };
      staticCue = play(STATIC.cue, 'amb', {
        loop: true, loopStart: loop.start, loopEnd: loop.end, offset: loop.start,
        gain: 0, fadeIn: STATIC.fadeIn, panner: STATIC.panner
      });
      if (!staticCue) return;
    }
    basementRefs.monitorBody.getWorldPosition(v);
    staticCue.setPosition(v.x, v.y, v.z, 0);
    // The hiss follows the tube: it swells with the CRT warm-up and sags as it dies.
    const power = basementRefs.screenMaterial.uniforms.uPower.value;
    const reach = rangeFade(listenerPos.distanceTo(v), STATIC.fadeFrom, STATIC.silentBy);
    staticCue.setGain(gains.static * (STATIC.floor + (1 - STATIC.floor) * power) * reach, 0.08);
  }

  // ---------- laughter ----------

  function laughBlocked() {
    return !isRunning()
      || captions.isPlaying || captions.isVisible
      || player.cinematic || isBusy()
      || laugh.cue?.alive || stalk.cue?.alive || steps.cue?.alive || hunterBreath?.alive
      || clock - lastMonsterAt < LAUGH.monsterQuiet
      || isHunterRunning();
  }

  function scheduleLaugh(after) {
    const gap = LAUGH.gapByLevel[levelKey];
    laugh.nextAt = gap ? clock + (after ?? rand(gap[0], gap[1])) : Infinity;
  }

  /** One phrase of the recording, never one of the last two played. */
  function pickExcerpt() {
    const info = cueInfo(LAUGH.cue);
    const phrases = info?.phrases?.length ? info.phrases : null;
    if (phrases) {
      const options = phrases.map((p, i) => i).filter((i) => !laugh.recent.includes(i));
      const i = options[Math.floor(Math.random() * options.length)] ?? 0;
      laugh.recent = [...laugh.recent, i].slice(-2);
      return { offset: phrases[i][0], duration: phrases[i][1] - phrases[i][0] };
    }
    const total = info?.duration ?? audio.cue(LAUGH.cue)?.duration ?? 0;
    if (total <= 7) return { offset: 0, duration: total };
    const length = rand(LAUGH.excerpt[0], LAUGH.excerpt[1]);
    return { offset: rand(0, total - length), duration: length };
  }

  function playLaugh() {
    let bearing = 0;
    for (let i = 0; i < 12; i++) {
      bearing = Math.random() * Math.PI * 2;
      if (laugh.lastBearing === null || Math.abs(wrapAngle(bearing - laugh.lastBearing)) >= LAUGH.minTurn) break;
    }
    laugh.lastBearing = bearing;
    const d = rand(LAUGH.distance[0], LAUGH.distance[1]);
    const x = listenerPos.x + Math.sin(bearing) * d;
    const z = listenerPos.z + Math.cos(bearing) * d;
    const y = rand(LAUGH.height[0], LAUGH.height[1]);
    // "Elsewhere in the house": through a wall is quieter and duller; in the
    // open it is only distance-dark.
    const blocked = segmentBlocked(listenerPos.x, listenerPos.z, x, z, getLevel().level?.colliders ?? []);
    const lowpass = blocked
      ? LAUGH.occludedLowpass
      : LAUGH.clearLowpass * (LAUGH.distance[0] / d) ** LAUGH.darkenExponent;
    const { offset, duration } = pickExcerpt();
    laugh.cue = play(LAUGH.cue, 'amb', {
      offset, duration, fadeIn: LAUGH.fade, fadeOut: LAUGH.fade,
      gain: gains.laugh * (blocked ? dbToGain(LAUGH.occludedDb) : 1),
      panner: LAUGH.panner, position: [x, y, z], lowpass,
      send: audio.echoInput() ? { node: audio.echoInput(), level: LAUGH.echoSend } : null
    });
  }

  function updateLaugh() {
    if (!LAUGH.gapByLevel[levelKey] || clock < laugh.nextAt) return;
    if (laughBlocked() || !audio.cue(LAUGH.cue)) {
      laugh.nextAt = clock + rand(LAUGH.defer[0], LAUGH.defer[1]);
      return;
    }
    playLaugh();
    scheduleLaugh();
  }

  // ---------- the hunter ----------

  function updateHunterBreath() {
    const inMaze = levelKey === 'backrooms' && isHunterRunning();
    if (!inMaze) {
      hunterBreath = stopCue(hunterBreath, HUNTER_BREATH.cut);
      hunterBreathTarget = -1;
      return;
    }
    const chasing = hunter.state === 'chase';
    if (!hunterBreath && chasing) {
      // Built once from the user's 0-8 s and kept: the seam is the same every time.
      if (!hunterBreathLoop) {
        const buffer = audio.cue(HUNTER_BREATH.cue);
        const loop = cueInfo(HUNTER_BREATH.cue)?.runtimeLoop ?? { start: 0, end: 8, xfade: 0.25 };
        if (buffer) hunterBreathLoop = buildSeamlessLoop(audio.ctx, buffer, loop.start, loop.end - loop.start, loop.xfade);
      }
      if (!hunterBreathLoop) return;
      const p = hunter.position;
      // Started silent; the target below brings it up. Kept running, muted,
      // through every chase/hunt flip so re-entering a chase does not restart
      // the breath from the top.
      hunterBreath = play(HUNTER_BREATH.cue, 'monster', {
        buffer: hunterBreathLoop, loop: true, gain: 0, fadeIn: 0,
        panner: HUNTER_BREATH.panner, position: [p.x, HUNTER_BREATH.y, p.z]
      });
      if (!hunterBreath) return;
      hunterBreathTarget = -1;
    }
    if (!hunterBreath) return;
    const p = hunter.position;
    hunterBreath.setPosition(p.x, HUNTER_BREATH.y, p.z, 0.05);
    const target = chasing ? gains.hunterBreath : 0;
    if (target !== hunterBreathTarget) {
      hunterBreathTarget = target;
      hunterBreath.setGain(target, (chasing ? HUNTER_BREATH.fadeIn : HUNTER_BREATH.fadeOut) / 3);
    }
    if (chasing) lastMonsterAt = clock;
  }

  function playHunterSteps() {
    const info = cueInfo(HUNTER_STEPS.cue);
    const s = info?.sections;
    const total = info?.duration ?? 0;
    // A random stretch, in the recorded order: it starts somewhere in the walk,
    // and if it runs long enough the walk turns into the run.
    const length = rand(HUNTER_STEPS.length[0], HUNTER_STEPS.length[1]);
    const from = s ? rand(s.walkStart, Math.max(s.walkStart, s.walkEnd - 1)) : rand(0, Math.max(0, total - length));
    const duration = Math.min(length, (s?.runEnd ?? total) - from);
    const p = hunter.position;
    steps.cue = play(HUNTER_STEPS.cue, 'monster', {
      offset: from, duration, fadeIn: HUNTER_STEPS.fade, fadeOut: HUNTER_STEPS.fade,
      gain: 0, panner: HUNTER_STEPS.panner, position: [p.x, HUNTER_STEPS.y, p.z],
      lowpass: HUNTER_STEPS.nearLowpass
    });
  }

  function updateHunterSteps() {
    const searching = levelKey === 'backrooms' && (hunter.state === 'search' || hunter.state === 'hunt');
    if (!searching) {
      // It has seen you: the footsteps go quickly. It has stopped: they go at once.
      const fade = hunter.state === 'chase' ? HUNTER_STEPS.chaseFade : HUNTER_STEPS.cut;
      steps.cue = stopCue(steps.cue, fade);
      steps.nextAt = Infinity;
      steps.wasSearching = false;
      return;
    }
    if (!steps.wasSearching) {
      steps.wasSearching = true;
      steps.nextAt = clock + rand(HUNTER_STEPS.firstDelay[0], HUNTER_STEPS.firstDelay[1]);
    }
    if (steps.cue && !steps.cue.alive) {
      steps.cue = null;
      steps.nextAt = clock + rand(HUNTER_STEPS.gap[0], HUNTER_STEPS.gap[1]);
    }
    if (!steps.cue && clock >= steps.nextAt && isRunning()) {
      playHunterSteps();
      // Not loaded yet: try again after a normal gap rather than every frame.
      if (!steps.cue) steps.nextAt = clock + rand(HUNTER_STEPS.gap[0], HUNTER_STEPS.gap[1]);
    }
    if (steps.cue) {
      const p = hunter.position;
      steps.cue.setPosition(p.x, HUNTER_STEPS.y, p.z, 0.05);
      v.set(p.x, HUNTER_STEPS.y, p.z);
      const d = listenerPos.distanceTo(v);
      steps.cue.setGain(gains.hunterSteps * rangeFade(d, HUNTER_STEPS.fadeFrom, HUNTER_STEPS.silentBy), 0.1);
      const t = Math.min(1, Math.max(0, (d - HUNTER_STEPS.panner.refDistance) / (HUNTER_STEPS.silentBy - HUNTER_STEPS.panner.refDistance)));
      steps.cue.setLowpass(HUNTER_STEPS.nearLowpass * (HUNTER_STEPS.farLowpass / HUNTER_STEPS.nearLowpass) ** t, 0.1);
      lastMonsterAt = clock;
    }
  }

  // ---------- the stalking aura ----------

  /** A start that is not within minApart of the last one: a fresh 4 s each appearance. */
  function drawWindow() {
    const w = cueInfo(STALK.cue)?.runtimeWindows ?? { from: 0.2, to: 11.2, length: 4, xfade: 0.25 };
    for (let tries = 0; tries < 2; tries++) {
      if (!stalk.bag.length) {
        for (let t = w.from; t <= w.to + 1e-6; t += STALK.step) stalk.bag.push(+t.toFixed(2));
        // Fisher-Yates.
        for (let i = stalk.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [stalk.bag[i], stalk.bag[j]] = [stalk.bag[j], stalk.bag[i]];
        }
      }
      const i = stalk.bag.findIndex((t) => stalk.lastStart === null || Math.abs(t - stalk.lastStart) >= STALK.minApart);
      if (i >= 0) {
        const start = stalk.bag.splice(i, 1)[0];
        stalk.lastStart = start;
        return { start, ...w };
      }
      stalk.bag = [];
    }
    return { start: w.from, ...w };
  }

  function stalkPosition() {
    const p = stalk.follow?.();
    if (p) return [p.x, STALK.y, p.z];
    // No body: just behind the player's head, wherever they turn.
    return [listenerPos.x - listenerFwd.x * STALK.behind, listenerPos.y, listenerPos.z - listenerFwd.z * STALK.behind];
  }

  function updateStalk() {
    if (!stalk.cue) return;
    if (!stalk.cue.alive) { stalk.cue = null; return; }
    if (!stalkAllowed()) {
      stalk.cue = stopCue(stalk.cue, 0.06);
      return;
    }
    const [x, y, z] = stalkPosition();
    stalk.cue.setPosition(x, y, z, 0.05);
    lastMonsterAt = clock;
    if (clock >= stalk.endsAt) stalk.cue = stopCue(stalk.cue, STALK.fadeOut);
  }

  // ---------- teardown ----------

  function cutLevelCues() {
    candles.forEach((c) => c.stop(CANDLE.fadeOut));
    candles.clear();
    staticCue = stopCue(staticCue, 0.1);
    staticDone = false;
    laugh.cue = stopCue(laugh.cue, 0.3);
    stalk.cue = stopCue(stalk.cue, 0.3);
    hunterBreath = stopCue(hunterBreath, HUNTER_BREATH.cut);
    hunterBreathTarget = -1;
    steps.cue = stopCue(steps.cue, HUNTER_STEPS.cut);
    steps.nextAt = Infinity;
    steps.wasSearching = false;
    lockboxCue = stopCue(lockboxCue, 0.1);
  }

  const director = {
    /**
     * DEV only: run the schedulers without pointer lock. The preview pane
     * refuses pointer lock, and without this every scheduler sits idle there
     * and nothing can be probed.
     */
    forceActive: false,

    get isRunning() { return isRunning(); },
    get clock() { return clock; },
    /** The derived gains, for docs/AUDIO.md's table and the dev console. */
    gains,

    /** Called by activateLevel(), the one place that serves real exits, debug jumps and restarts. */
    onLevelActivated(key) {
      cutLevelCues();
      // One-shots that belong to the room being left go; the ones that are
      // meant to span the fade (a door, the sting) are left to finish.
      for (const entry of live) {
        if (!entry.spans && entry.emitter !== bed) entry.emitter.stop(0.1);
      }
      levelKey = key;
      laugh.recent = [];
      scheduleLaugh(LAUGH.firstAfter);
      ensureBed();
    },

    /**
     * Restart. Cuts everything, the door and the sting included -- EXCEPT the
     * bed when it is already playing: the restart lands in the bedroom, where
     * it plays anyway, and cycling it would put a hole in it for the same
     * reason resetGame() leaves the breathing loop running.
     */
    reset() {
      for (const entry of live) {
        if (entry.emitter !== bed) entry.emitter.stop(0.06);
      }
      cutLevelCues();
      audio.clearDucks();
      laugh.lastBearing = null;
      laugh.recent = [];
      lastMonsterAt = -Infinity;
    },

    /** Once a frame, after everything that moves the player or the monster. */
    update(dt) {
      if (!audio.ctx) return;
      const ear = getListener();
      audio.updateListener(ear);
      ear.getWorldPosition(listenerPos);
      ear.getWorldDirection(listenerFwd);
      if (isRunning()) clock += dt;

      ensureBed();
      updateCandles();
      updateStatic();
      updateLaugh();
      updateHunterBreath();
      updateHunterSteps();
      updateStalk();
      // Auditions run on the context's own clock, which a pause suspends.
      for (const a of auditions) {
        if (!a.emitter.alive) auditions.delete(a);
        else if (audio.ctx.currentTime >= a.until) { a.emitter.stop(0.5); auditions.delete(a); }
      }
    },

    /** A door starts to swing. It finishes across the level fade. */
    door(position) {
      return play(DOOR.cue, 'sfx', {
        gain: gains.door, fadeIn: 0.005, panner: DOOR.panner,
        position: [position.x, DOOR.y, position.z]
      }, { spans: true });
    },

    /** The lockbox lid starts to move. Cut if the room resets mid-open. */
    lockbox(position) {
      lockboxCue = play(LOCKBOX.cue, 'sfx', {
        gain: gains.lockbox, fadeIn: 0.005, panner: LOCKBOX.panner,
        position: [position.x, position.y, position.z]
      });
      return lockboxCue;
    },

    /**
     * The creature is in view and STALKING. Returns a token for endStalk(), or
     * null when the cue is refused -- which it always is while the backrooms
     * hunter is running or on the crossing it hunts.
     *
     * @param follow  () => {x, z} of the body each frame, or null for "behind you"
     * @param linger  seconds it will be seen for; the sound lasts that plus a
     *                second's tail. null: until endStalk().
     */
    startStalk({ follow = null, linger = null } = {}) {
      if (!stalkAllowed()) return null;
      const buffer = audio.cue(STALK.cue);
      if (!buffer) return null;
      stalk.cue = stopCue(stalk.cue, 0.3);
      // One scare at a time: a laugh in flight gives way to the thing in the room.
      laugh.cue = stopCue(laugh.cue, 0.3);
      const w = drawWindow();
      const loopBuffer = buildSeamlessLoop(audio.ctx, buffer, w.start, w.length, w.xfade);
      stalk.follow = follow;
      const [x, y, z] = stalkPosition();
      stalk.cue = play(STALK.cue, 'monster', {
        buffer: loopBuffer, loop: true, gain: gains.stalk, fadeIn: STALK.fadeIn,
        panner: STALK.panner, position: [x, y, z]
      });
      if (!stalk.cue) return null;
      stalk.window = w.start;
      stalk.endsAt = linger === null ? Infinity : clock + linger + STALK.tail;
      lastMonsterAt = clock;
      return ++stalk.token;
    },

    /** The appearance is over. A stale token (a newer appearance took over) does nothing. */
    endStalk(token, fade = STALK.fadeOut) {
      if (token === null || token === undefined || token !== stalk.token) return;
      stalk.cue = stopCue(stalk.cue, fade);
    },

    /**
     * Caught. The first thing onHunterCaught() does, so it lands on the catch
     * and not on the caption after it. The hunter's own cues go at once; the
     * bed and the breathing drop 12 dB for the sting's length and come back
     * as the screen does.
     */
    caught({ where = 'backrooms' } = {}) {
      if (where === 'study' && !STING.onStudyCatch) return null;
      hunterBreath = stopCue(hunterBreath, HUNTER_BREATH.cut);
      hunterBreathTarget = -1;
      steps.cue = stopCue(steps.cue, HUNTER_STEPS.cut);
      const length = cueInfo(STING.cue)?.duration ?? 5;
      audio.duck(['amb', 'breath'], STING.duckDb, {
        attack: STING.duckAttack, hold: length - STING.duckAttack, release: STING.duckRelease
      });
      return play(STING.cue, 'sfx', { gain: gains.sting, fadeIn: 0.002 }, { spans: true });
    },

    /**
     * DEV: play any cue a couple of metres in front of the player so it can be
     * heard on demand. Loops run for `seconds` then fade.
     */
    audition(name, { seconds = 6, distance = 2 } = {}) {
      const specs = {
        laugh_distant: LAUGH, hunter_breath: HUNTER_BREATH, crt_static: STATIC, rain_bed: BED,
        caught_sting: STING, candle: CANDLE, lockbox_open: LOCKBOX, door_open: DOOR,
        stalk_breath: STALK, hunter_steps: HUNTER_STEPS
      };
      const spec = specs[name];
      if (!spec) return Object.keys(specs);
      const info = cueInfo(name);
      const loop = info?.loop;
      // The two built-at-play-time loops audition as their raw files, looped whole.
      const looped = !!loop || !!info?.runtimeLoop || !!info?.runtimeWindows;
      const x = listenerPos.x + listenerFwd.x * distance;
      const z = listenerPos.z + listenerFwd.z * distance;
      const e = play(name, spec.panner ? 'monster' : 'sfx', {
        loop: looped, loopStart: loop?.start ?? 0, loopEnd: loop?.end ?? 0, offset: loop?.start ?? 0,
        gain: levelFor(spec), fadeIn: 0.05, panner: spec.panner ?? null, position: [x, listenerPos.y, z]
      }, { spans: true });
      if (e && looped) auditions.add({ emitter: e, until: audio.ctx.currentTime + seconds });
      return e ? `${name}: ${spec.peakDb} dBFS at ${spec.at ?? 0} m, heard from ${distance} m` : `${name}: not loaded`;
    },

    /** DEV: what is playing right now, and where. */
    debug() {
      return [...live].map(({ name, emitter, spans }) => {
        const p = emitter.position;
        return {
          name,
          spans,
          stopping: emitter.stopping,
          gain: +emitter.level.toFixed(4),
          position: p ? p.map((n) => +n.toFixed(2)) : null,
          distance: p ? +Math.hypot(p[0] - listenerPos.x, p[1] - listenerPos.y, p[2] - listenerPos.z).toFixed(2) : null
        };
      });
    },

    /** DEV: the scheduler state, for probing the rules without waiting minutes. */
    get state() {
      return {
        level: levelKey, clock: +clock.toFixed(2), running: isRunning(),
        laughNextAt: +laugh.nextAt.toFixed(2), stepsNextAt: +steps.nextAt.toFixed(2),
        hunter: hunter.state, stalkWindow: stalk.window ?? null, staticDone,
        lastMonsterAt: +lastMonsterAt.toFixed(2)
      };
    },

    /** DEV: bring the next laugh forward to `seconds` from now. */
    scheduleLaughIn(seconds) { laugh.nextAt = clock + seconds; }
  };
  return director;
}
