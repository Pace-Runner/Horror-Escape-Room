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
 * Track 1. The backrooms ONLY now -- the user moved it out of the house: a
 * woman laughing somewhere in the maze, never where you are, and heard mostly
 * as its echo off the corridors.
 *
 * -26 dBFS at 15 m, quieter than any voice line by 20 dB, and it waits for
 * captions anyway. inverse ref 3 makes 12 m -24 and 30 m -32: always somewhere
 * else in the maze, never at the next corner. The echo send is nearly double
 * the house's old 0.35, so in the long hard corridors the reflections carry as
 * much of it as the laugh itself.
 *
 * It shares the maze with the hunter, so it does not wait for the hunter to be
 * gone (it never is): only for its chase, and for its own footsteps to finish.
 */
const LAUGH = {
  cue: 'laugh_distant', peakDb: -26, at: 15,
  // HRTF, so it is in FRONT of or BEHIND you as well as left or right -- the
  // equal-power panner only ever said which ear, and with a heavy echo on top
  // the laugh read as coming from nowhere. Trimmed for HRTF's presence lift.
  panner: { model: 'HRTF', distanceModel: 'inverse', refDistance: 3, rolloff: 1 },
  hrtfTrimDb: -3,
  gapByLevel: { backrooms: [30, 70] },
  firstAfter: 20, defer: [6, 12], distance: [12, 30], height: [1.2, 2.2],
  // Never within 30 degrees of where the last one came from.
  minTurn: Math.PI / 6,
  // A wall between it and the player: -6 dB and most of the top gone.
  occludedDb: -6, occludedLowpass: 900,
  // Clear line: 3.5 kHz at 12 m, darkening to ~2 kHz at 30 m.
  clearLowpass: 3500, darkenExponent: 0.63,
  // The echo is mono and unpanned: at 0.6 it was as loud as the laugh and
  // smeared away where it was. 0.22 keeps the corridors' ring without that.
  fade: 0.08, echoSend: 0.22,
  // Quiet this long after the hunter last chased you or the aura last played,
  // so a laugh never lands on top of the thing that is actually there...
  monsterQuiet: 20,
  // ...and this long after its footsteps stopped, so the two scares alternate
  // rather than one following straight on from the other.
  stepsQuiet: 4,
  // Used only if the manifest has no phrase list for the file.
  excerpt: [3, 6],
  // The FIRST crossing has no hunter, only the trailing shadow -- and its
  // breathing kept the 20 s monster quiet topped up, so the laugh almost never
  // got in. There it comes early and only waits a few seconds after the aura.
  firstCrossing: { firstAfter: 8, monsterQuiet: 4 }
};

/**
 * Track 3. Annabelle, singing -- and where she is, is where to go.
 *
 *   upstairsHallway  Down the stairs, round the turn into the passage at their
 *                    foot (upstairsHallwayLevel's singingAnchor). Never loud
 *                    in the hall: -28.5 dBFS at 5 m, the top of the stairs, and
 *                    with inverse ref 1.5 / rolloff 1.4 about -38.5 at the
 *                    bedroom door, 14 m off -- slightly there on arrival,
 *                    growing the whole way down, and below and ahead of you, so
 *                    it is plain she is down the stairs. Round a corner, so dark:
 *                    900 Hz from the far end, 1.8 kHz at the top of the stairs.
 *   backrooms        At the exit door this crossing needs (backroomsLevel's
 *                    exitDoorPosition): a thread to follow through the maze.
 *                    -20.5 dBFS at 2 m; inverse ref 4 keeps her -34.5 at 20 m
 *                    and -40.5 at 40 m, so she is faintly somewhere from anywhere in
 *                    it, and the top closes in with distance, 2.6 kHz near the
 *                    door to 700 Hz at 40 m.
 *
 * Sung through, then a pause, then again -- see updateSinging.
 */
const SINGING = {
  cue: 'annabelle_singing', firstAfter: 1.5, gap: [3, 7], fadeIn: 1.2, fadeOut: 1.5,
  places: {
    upstairsHallway: {
      // Both 25% (+1.9 dB) up on the first pass, and 20% (+1.6 dB) more on
      // the second, at the user's ask.
      peakDb: -28.5, at: 5,
      panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 1.5, rolloff: 1.4 },
      nearLowpass: 1800, farLowpass: 900, nearFrom: 5, farFrom: 14
    },
    backrooms: {
      peakDb: -20.5, at: 2,
      panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 4, rolloff: 1 },
      nearLowpass: 2600, farLowpass: 700, nearFrom: 2, farFrom: 40
    }
  }
};

/**
 * Track 2. -8.5 dBFS at <= 2.5 m: raised 5.5 dB from the first pass's -14 at
 * the user's ask, so up close it is the loudest continuous thing in the game --
 * level with the sting (-8), which cuts it on a catch anyway. LINEAR, so it
 * still rises monotonically to full at 2.5 m and is genuinely silent past
 * maxDistance -- 22 m, past the 18 m it can now see you at (BackroomsHunter's
 * SIGHT_RANGE), so the breath is on you a moment before it is.
 */
const HUNTER_BREATH = {
  cue: 'hunter_breath', peakDb: -8.5, at: 2.5, y: 1.5,
  panner: { model: 'HRTF', distanceModel: 'linear', refDistance: 2.5, maxDistance: 22, rolloff: 1 },
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

/**
 * THE FREE SOUND EFFECTS (tracks 101+; sources, authors and licences in
 * src/assets/audio/SOURCES.md). Same contract as the cues above: `peakDb` at
 * `at` metres when the sound is out in the room, through SFX_PANNER. With no
 * `at` it is flat and centred -- something in the player's own hands. Pinned
 * against the synthesised effects they stand in for: the old creak peaked
 * around -20 dBFS, the spark -15, the paper -25.
 *
 *   variants  one of several files, never the same one twice running
 *   rate      [lo, hi] playback-rate jitter, so a repeated sound is not a loop
 *   duration  play only the first this-many seconds (with a short fade)
 */
const SFX_PANNER = { model: 'equalpower', distanceModel: 'inverse', refDistance: 1.5, rolloff: 1 };
const SFX = {
  // In the hands.
  keys_pickup: { peakDb: -22 },
  drawer_open: { peakDb: -20 },
  door_locked_rattle: { peakDb: -18, at: 1.2, rate: [0.94, 1.06] },
  paper: { peakDb: -26, duration: 1.3 },
  lockpick: { peakDb: -24 },
  planks_pry: { peakDb: -15, rate: [0.92, 1.05] },
  padlock_open: { peakDb: -20 },
  deadbolt_open: { peakDb: -18 },
  latch: { peakDb: -20 },
  metal_click: { peakDb: -22 },
  keypad_press: { peakDb: -26, rate: [0.94, 1.06] },
  keypad_wrong: { peakDb: -22 },
  keypad_accept: { peakDb: -22 },
  switch_click: { peakDb: -20, rate: [0.95, 1.05] },
  visor_on: { peakDb: -24 },
  visor_off: { peakDb: -26 },
  cctv_glitch: { peakDb: -24, rate: [0.9, 1.1] },
  breaker_on: { peakDb: -17, rate: [0.96, 1.04] },
  breaker_off: { peakDb: -18, rate: [0.96, 1.04] },
  main_lever: { peakDb: -13 },
  chain_drop: { peakDb: -18 },
  gate_open: { peakDb: -15 },
  gate_locked: { peakDb: -18 },
  cloth: { peakDb: -28 },
  gasp: { peakDb: -17 },
  // In the room.
  metal_door_open: { peakDb: -14, at: 1.5 },
  chair_scrape: { peakDb: -20, at: 2.5 },
  spark: { peakDb: -14, at: 1.5, variants: ['spark_pop'], rate: [0.9, 1.15] },
  panel_trip: { peakDb: -14, at: 1.5 },
  tubes_start: { peakDb: -24, at: 2 },
  power_down: { peakDb: -13, at: 3 },
  generator_stop: { peakDb: -15, at: 2 },
  creak: { peakDb: -21, variants: ['wood_creak', 'hinge_creak'], rate: [0.88, 1.1] },
  sniff: { peakDb: -20, at: 2 },
  drip: { peakDb: -32, at: 2, rate: [0.85, 1.2] },
  // A few miles off: the full strike, darkened. `near` in sfx() takes the top off less.
  thunder: {
    peakDb: -13, lowpass: 1600, nearLowpass: 6000,
    variants: ['thunder_1', 'thunder_2', 'thunder_3', 'thunder_4', 'thunder_5']
  }
};

/**
 * Loops that sit on something in a level and follow its state rather than a
 * schedule. The inverse law's tail never reaches silence, so each fades out
 * between `fadeFrom` and `silentBy` like the candles.
 *
 *   generator  Level 2's generator, whenever its engine is turning over
 *   tubes      Level 2's fluorescents while they have power, and the backrooms'
 *              lamps as lit as each one is -- heard from the nearest fixture
 *   glare      the overload buzz: rides the white-out an over-rated fuse or a
 *              tripped panel puts on the screen
 *   rain       against the upstairs hallway's one window
 */
const GENERATOR = {
  cue: 'generator_idle', peakDb: -21, at: 1.5, y: 0.5, fadeIn: 0.8, fadeOut: 0.4,
  panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 1, rolloff: 1.2 },
  fadeFrom: 14, silentBy: 20
};
const TUBES = {
  cue: 'tube_hum', peakDb: -36, at: 1.5,
  panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 1, rolloff: 1 },
  fadeFrom: 12, silentBy: 18, rise: 0.4
};
const GLARE = { cue: 'overload_buzz', peakDb: -16, rise: 0.04, fall: 0.25 };
const RAIN_GLASS = {
  cue: 'rain_glass', peakDb: -30, at: 1, level: 'upstairsHallway', fadeIn: 2, fadeOut: 1.5,
  panner: { model: 'equalpower', distanceModel: 'inverse', refDistance: 1, rolloff: 1 }
};

/** The player's breath catching when the hunter first sees them, at most this often. */
const GASP_EVERY = 25;

/**
 * It has lost you, and it sniffs for you -- at most this often, and only when
 * it is near enough to be heard doing it: past that it is a sound from nowhere.
 */
/**
 * The roar at a safe room (BackroomsHunter's onEnraged). `recording` is the
 * monster/ file it plays (LionGrill's CC0 "Jumpscare Sound", chosen
 * 2026-10-23). If the build lacks it, AudioEngine.roar()
 * is the stand-in at `level`, losing half of it by `falloffMetres` away -- it
 * is meant to carry.
 */
const ROAR = {
  recording: 'roar', peakDb: -2, y: 1.9, echoSend: 0.5,
  panner: { model: 'HRTF', distanceModel: 'inverse', refDistance: 6, rolloff: 0.6 },
  level: 1.3, falloffMetres: 24, panWidth: 0.8, duckDb: -9, seconds: 2.3
};

/**
 * The jump scares' screams (user, 2026-10-23: "like Five Nights at Freddy's"):
 * three CC0 recordings, one per scare, never the same twice running. Flat and
 * loud -- a scream in your face has no direction.
 */
const SCREAMS = { cues: ['scream_classic', 'scream_distorted', 'scream_remake'], peakDb: -1 };

const SNIFF_EVERY = 30;
const SNIFF_WITHIN = 18;

/**
 * Water dripping somewhere in the backrooms' ceiling tiles: one drop every
 * `gap` seconds, `distance` metres off in a random direction at ceiling height.
 */
const DRIPS = { level: 'backrooms', gap: [5, 14], distance: [4, 11], y: 2.6 };

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
  /** upstairsHallway.refs, for where Annabelle is singing. */
  hallwayRefs = null,
  /** backrooms.refs, for its lamps' hum and the exit door Annabelle sings at. */
  backroomsRefs = null,
  THREE
}) {
  const v = new THREE.Vector3();
  const listenerPos = new THREE.Vector3();
  const roarLook = new THREE.Vector3();
  let lastScream = null;
  const listenerFwd = new THREE.Vector3();
  const tubePos = new THREE.Vector3();

  const gains = {
    bed: levelFor(BED), candle: levelFor(CANDLE), static: levelFor(STATIC), laugh: levelFor(LAUGH),
    hunterBreath: levelFor(HUNTER_BREATH), hunterSteps: levelFor(HUNTER_STEPS),
    stalk: levelFor(STALK), sting: levelFor(STING), door: levelFor(DOOR), lockbox: levelFor(LOCKBOX),
    singingHallway: levelFor({ cue: SINGING.cue, ...SINGING.places.upstairsHallway }),
    singingBackrooms: levelFor({ cue: SINGING.cue, ...SINGING.places.backrooms }),
    generator: levelFor(GENERATOR), tubes: levelFor(TUBES),
    glare: levelFor(GLARE), rainGlass: levelFor(RAIN_GLASS)
  };
  /** Per file, not per effect: two variants recorded at different levels still land on the same target. */
  const sfxGain = (name, file) => {
    const spec = SFX[name];
    return levelFor({ ...spec, cue: file, at: spec.at ?? 1, panner: spec.at ? SFX_PANNER : null });
  };
  const sfxLast = {};

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
  let lastStepsAt = -Infinity;
  /**
   * `from`: set by startSinging() -- the hallway's singing, which starts once
   * the rush is over while the player may still be in the bedroom looking
   * through the open door, and carries on unbroken as they walk into the hall.
   */
  const singing = { cue: null, nextAt: Infinity, from: null };
  let lockboxCue = null;
  let generatorCue = null;
  let tubesCue = null;
  let glareCue = null;
  let glareLevel = 0;
  let rainGlassCue = null;
  let lastGaspAt = -Infinity;
  let wasChasing = false;
  let lastSniffAt = -Infinity;
  let hunterWas = null;
  let nextDripAt = Infinity;
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

  /** A looping cue started silent at `pos`, its loop window from the manifest, from a random point in it. */
  function startLoop(spec, bus, pos, fadeIn = spec.fadeIn ?? 0.5) {
    const loop = cueInfo(spec.cue)?.loop ?? { start: 0, end: 0 };
    return play(spec.cue, bus, {
      loop: true, loopStart: loop.start, loopEnd: loop.end,
      offset: loop.end ? rand(loop.start, loop.end) : 0,
      gain: 0, fadeIn, panner: spec.panner ?? null, position: pos ? [pos.x, pos.y, pos.z] : null
    });
  }

  /**
   * Level 2's generator, whenever the engine is turning over -- which is every
   * stage but the blackout. When the main is thrown it does not just stop: it
   * runs down (generator_stop) where it stands.
   */
  function updateGenerator() {
    const g = basementRefs?.generator;
    if (levelKey !== 'hallwayBasement' || !g) return;
    g.getWorldPosition(v);
    v.y += GENERATOR.y;
    const running = basementRefs.generatorRunning;
    if (!running && generatorCue) {
      generatorCue = stopCue(generatorCue, GENERATOR.fadeOut);
      director.sfx('generator_stop', { position: v });
      return;
    }
    if (running && !generatorCue) generatorCue = startLoop(GENERATOR, 'amb', v);
    if (!generatorCue) return;
    const reach = rangeFade(listenerPos.distanceTo(v), GENERATOR.fadeFrom, GENERATOR.silentBy);
    generatorCue.setGain(gains.generator * reach, 0.2);
  }

  /**
   * Fluorescent hum, heard from whichever fixture is nearest and as loud as it
   * is lit: the lab's tubes follow its power ramp; each backrooms lamp follows
   * its own flicker, outages and blackouts -- so when the exit door takes every
   * lamp down, "the humming stops all at once" is literally true.
   */
  function updateTubes() {
    const lab = levelKey === 'hallwayBasement';
    const tubes = lab ? basementRefs?.fluorescents : levelKey === 'backrooms' ? backroomsRefs?.lamps : null;
    if (!tubes?.length) return;
    let best = Infinity;
    let nearest = null;
    const near = tubePos;
    for (const tube of tubes) {
      tube.light.getWorldPosition(v);
      const d = listenerPos.distanceTo(v);
      if (d < best) { best = d; near.copy(v); nearest = tube; }
    }
    const power = lab
      ? basementRefs.powerLevel ?? 0
      : Math.min(1, nearest.light.intensity / (nearest.base || 1));
    if (!tubesCue && power > 0.01) tubesCue = startLoop(TUBES, 'amb', near, 0);
    if (!tubesCue) return;
    tubesCue.setPosition(near.x, near.y, near.z, 0.3);
    tubesCue.setGain(gains.tubes * power * rangeFade(best, TUBES.fadeFrom, TUBES.silentBy), TUBES.rise);
  }

  /** The overload buzz, riding the white-out. Flat: it is the whole room. */
  function updateGlare() {
    if (glareLevel > 0.01 && !glareCue) glareCue = startLoop(GLARE, 'sfx', null, 0);
    if (!glareCue) return;
    const g = gains.glare * Math.min(1, glareLevel * 1.4);
    glareCue.setGain(g, glareLevel > 0.01 ? GLARE.rise : GLARE.fall);
    if (glareLevel <= 0.01 && glareCue.level < 1e-3) glareCue = stopCue(glareCue, 0.05);
  }

  /** Rain against the upstairs hallway's window. */
  function updateRainGlass() {
    const anchor = hallwayRefs?.windowAnchor;
    if (levelKey !== RAIN_GLASS.level || !anchor) return;
    anchor.getWorldPosition(v);
    if (!rainGlassCue) {
      rainGlassCue = startLoop(RAIN_GLASS, 'amb', v);
      rainGlassCue?.setGain(gains.rainGlass, 0);
    }
  }

  /** The hunter has just seen them: the player's breath catches. */
  function updateGasp() {
    const chasing = levelKey === 'backrooms' && hunter.state === 'chase';
    if (chasing && !wasChasing && clock - lastGaspAt > GASP_EVERY && isRunning()) {
      if (director.sfx('gasp')) lastGaspAt = clock;
    }
    wasChasing = chasing;
  }

  /**
   * It has got to where it last saw or heard you, and you are not there: it
   * goes back to searching, and sniffs for you where it stands.
   */
  function updateSniff() {
    const state = levelKey === 'backrooms' ? hunter.state : null;
    if ((hunterWas === 'chase' || hunterWas === 'hunt' || hunterWas === 'enraged') && state === 'search' &&clock - lastSniffAt > SNIFF_EVERY && isRunning()) {
      const p = hunter.position;
      const near = Math.hypot(p.x - listenerPos.x, p.z - listenerPos.z) <= SNIFF_WITHIN;
      if (near && director.sfx('sniff', { position: { x: p.x, y: 1.5, z: p.z } })) lastSniffAt = clock;
    }
    hunterWas = state;
  }

  function updateDrips() {
    if (levelKey !== DRIPS.level || clock < nextDripAt) return;
    nextDripAt = clock + rand(DRIPS.gap[0], DRIPS.gap[1]);
    if (!isRunning()) return;
    const a = Math.random() * Math.PI * 2;
    const d = rand(DRIPS.distance[0], DRIPS.distance[1]);
    director.sfx('drip', { position: { x: listenerPos.x + Math.sin(a) * d, y: DRIPS.y, z: listenerPos.z + Math.cos(a) * d } });
  }

  // ---------- Annabelle, singing where you need to go ----------

  /** Which SINGING.places entry is singing now, or null. */
  function singingPlace() {
    if (levelKey === 'backrooms') return 'backrooms';
    if ((levelKey === 'upstairsHallway' || levelKey === 'bedroom') && singing.from === 'upstairsHallway') return 'upstairsHallway';
    return null;
  }

  /** Where she is, or null when she does not sing here. */
  function singingAt() {
    const placeKey = singingPlace();
    if (placeKey === 'upstairsHallway') {
      const anchor = hallwayRefs?.singingAnchor;
      return anchor ? anchor.getWorldPosition(v) : null;
    }
    if (placeKey === 'backrooms') {
      const p = backroomsRefs?.exitDoorPosition;
      return p ? v.set(p.x, p.y, p.z) : null;
    }
    return null;
  }

  /**
   * Sung through, a few seconds' pause, then again from the top, for as long
   * as the player is there. Not a loop: stitched end-to-start the song
   * restarts mid-breath, and a person who stops and starts again is what makes
   * it someone rather than a recording.
   */
  function updateSinging() {
    const placeKey = singingPlace();
    const place = placeKey && SINGING.places[placeKey];
    const at = place && singingAt();
    if (!at) return;
    if (singing.cue && !singing.cue.alive) {
      singing.cue = null;
      singing.nextAt = clock + rand(SINGING.gap[0], SINGING.gap[1]);
    }
    if (!singing.cue && clock >= singing.nextAt && isRunning()) {
      singing.cue = play(SINGING.cue, 'amb', {
        gain: placeKey === 'backrooms' ? gains.singingBackrooms : gains.singingHallway,
        fadeIn: SINGING.fadeIn, panner: place.panner,
        position: [at.x, at.y, at.z], lowpass: place.farLowpass
      });
      // Not decoded yet: look again shortly rather than every frame.
      if (!singing.cue) singing.nextAt = clock + 1;
    }
    if (singing.cue) {
      // The backrooms door changes with the crossing; follow it.
      singing.cue.setPosition(at.x, at.y, at.z, 0);
      // Clearer, not only louder, the nearer she is.
      const d = listenerPos.distanceTo(at);
      const t = Math.min(1, Math.max(0, (d - place.nearFrom) / (place.farFrom - place.nearFrom)));
      singing.cue.setLowpass(place.nearLowpass * (place.farLowpass / place.nearLowpass) ** t, 0.2);
    }
  }

  // ---------- laughter ----------

  function laughBlocked() {
    return !isRunning()
      || captions.isPlaying || captions.isVisible
      || player.cinematic || isBusy()
      || laugh.cue?.alive || stalk.cue?.alive || steps.cue?.alive
      || hunter.state === 'chase'
      || clock - lastMonsterAt < (isHuntingCrossing() ? LAUGH.monsterQuiet : LAUGH.firstCrossing.monsterQuiet)
      || clock - lastStepsAt < LAUGH.stepsQuiet;
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

  /**
   * A point IN the maze -- inside one of its corridors -- 12-30 m off and not
   * from where the last laugh came. A bare random bearing landed as often as
   * not in the solid between corridors, or outside the maze altogether.
   */
  function laughSpot() {
    const rects = Object.values(backroomsRefs?.corridors ?? {});
    for (let i = 0; i < 60 && rects.length; i++) {
      const [x0, x1, z0, z1] = rects[Math.floor(Math.random() * rects.length)];
      const x = rand(x0, x1), z = rand(z0, z1);
      const d = Math.hypot(x - listenerPos.x, z - listenerPos.z);
      if (d < LAUGH.distance[0] || d > LAUGH.distance[1]) continue;
      const bearing = Math.atan2(x - listenerPos.x, z - listenerPos.z);
      if (laugh.lastBearing !== null && Math.abs(wrapAngle(bearing - laugh.lastBearing)) < LAUGH.minTurn) continue;
      return { x, z, d, bearing };
    }
    let bearing = 0;
    for (let i = 0; i < 12; i++) {
      bearing = Math.random() * Math.PI * 2;
      if (laugh.lastBearing === null || Math.abs(wrapAngle(bearing - laugh.lastBearing)) >= LAUGH.minTurn) break;
    }
    const d = rand(LAUGH.distance[0], LAUGH.distance[1]);
    return { x: listenerPos.x + Math.sin(bearing) * d, z: listenerPos.z + Math.cos(bearing) * d, d, bearing };
  }

  function playLaugh() {
    const { x, z, d, bearing } = laughSpot();
    laugh.lastBearing = bearing;
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
    // One scare at a time: a laugh still echoing holds the footsteps back.
    if (!steps.cue && clock >= steps.nextAt && isRunning() && !laugh.cue?.alive) {
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
      // Its own clock, not lastMonsterAt: the footsteps come every 7-18 s, and
      // a 20 s quiet after each would keep the laughter out of the maze for good.
      lastStepsAt = clock;
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

  function cutLevelCues({ keepSinging = false } = {}) {
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
    // Out of the room she is singing in: it goes, but not as a cut. Not when
    // walking from the bedroom into the hall she is already singing below.
    if (!keepSinging) {
      singing.cue = stopCue(singing.cue, SINGING.fadeOut);
      singing.nextAt = Infinity;
    }
    generatorCue = stopCue(generatorCue, 0.3);
    tubesCue = stopCue(tubesCue, 0.3);
    glareCue = stopCue(glareCue, 0.1);
    glareLevel = 0;
    rainGlassCue = stopCue(rainGlassCue, RAIN_GLASS.fadeOut);
    wasChasing = false;
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
      const keepSinging = key === 'upstairsHallway' && singing.from === 'upstairsHallway';
      if (key !== 'upstairsHallway' && key !== 'bedroom') singing.from = null;
      cutLevelCues({ keepSinging });
      // One-shots that belong to the room being left go; the ones that are
      // meant to span the fade (a door, the sting) are left to finish.
      for (const entry of live) {
        if (keepSinging && entry.emitter === singing.cue) continue;
        if (!entry.spans && entry.emitter !== bed) entry.emitter.stop(0.1);
      }
      levelKey = key;
      laugh.recent = [];
      scheduleLaugh(key === 'backrooms' && !isHuntingCrossing() ? LAUGH.firstCrossing.firstAfter : LAUGH.firstAfter);
      // The hallway's singing is started by startSinging(), after the rush.
      if (key === 'backrooms') singing.nextAt = clock + SINGING.firstAfter;
      nextDripAt = key === DRIPS.level ? clock + rand(DRIPS.gap[0], DRIPS.gap[1]) : Infinity;
      hunterWas = null;
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
      lastGaspAt = -Infinity;
      lastSniffAt = -Infinity;
      singing.from = null;
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
      updateSinging();
      updateGenerator();
      updateTubes();
      updateGlare();
      updateRainGlass();
      updateGasp();
      updateSniff();
      updateDrips();
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

    /**
     * One of the free sound effects (SFX above). Returns the emitter, or null
     * when the file is not in the build or not decoded yet -- so a caller with
     * a synthesised stand-in can write `director.sfx('creak') || audio.creak()`.
     *
     * @param opts.position  {x, y, z} for a sound out in the room; omitted, an
     *                       effect with an `at` plays flat like a hand-held one
     * @param opts.gainDb    on top of the effect's own level
     * @param opts.near      thunder only: close, so less of the top is gone
     * @param opts.spans     let it finish across a level change
     */
    sfx(name, { position = null, gainDb = 0, near = false, spans = false } = {}) {
      const spec = SFX[name];
      if (!spec || !audio.ctx) return null;
      const files = spec.variants ?? [name];
      const ready = files.filter((f) => audio.cueBuffers.has(f));
      if (!ready.length) {
        audio.cue(files[0]); // says once, in the console, why it is silent
        return null;
      }
      const fresh = ready.length > 1 ? ready.filter((f) => f !== sfxLast[name]) : ready;
      const file = fresh[Math.floor(Math.random() * fresh.length)];
      sfxLast[name] = file;
      const spatial = !!(position && spec.at);
      const level = sfxGain(name, file) * dbToGain(gainDb);
      return play(file, 'sfx', {
        gain: spatial ? level : (spec.at ? level * distanceGain(SFX_PANNER, spec.at) * PAN_CENTRE : level),
        fadeIn: 0.004,
        duration: spec.duration ?? null, fadeOut: spec.duration ? 0.25 : 0.08,
        playbackRate: spec.rate ? rand(spec.rate[0], spec.rate[1]) : 1,
        lowpass: name === 'thunder' ? (near ? spec.nearLowpass : spec.lowpass) : null,
        panner: spatial ? SFX_PANNER : null,
        position: spatial ? [position.x, position.y, position.z] : null
      }, { spans });
    },

    /**
     * Annabelle starts singing down the stairs -- now, faintly, wherever the
     * player is (the bedroom with its door open, or the hall). main.js calls
     * it when the hallway rush is over and the light is back.
     */
    startSinging() {
      singing.from = 'upstairsHallway';
      if (!singing.cue) singing.nextAt = clock;
    },

    /** The screen-space white-out, 0..1, each frame it changes -- the overload buzz rides it. */
    glare(level) {
      glareLevel = level;
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
     * A jump scare's scream: one of SCREAMS, not the last one. Returns the
     * emitter (stop(fade) cuts it), or null if none is decoded -- the caller
     * then synthesises one.
     */
    scream() {
      if (!audio.ctx) return null;
      const ready = SCREAMS.cues.filter((c) => audio.cueBuffers.has(c) && c !== lastScream);
      if (!ready.length) return null;
      lastScream = ready[Math.floor(Math.random() * ready.length)];
      return play(lastScream, 'sfx', { gain: dbToGain(SCREAMS.peakDb), fadeIn: 0.002 }, { spans: true });
    },

    /**
     * The monster ROARS: the player has got into one of Annabelle's rooms and
     * it cannot follow. Loud wherever it is -- it is meant to be heard across
     * the maze -- and placed: HRTF from its body, through the shared echo, if
     * the build has a monster/roar recording; otherwise the synthesised one,
     * panned toward it and falling off only gently with distance. Ducks the bed
     * and the breathing under it, as the catch sting does, and counts as the
     * monster being heard, so a laugh does not land on top of it.
     */
    roar({ x, z }) {
      if (!audio.ctx) return;
      lastMonsterAt = clock;
      audio.duck(['amb', 'breath'], ROAR.duckDb, { attack: 0.04, hold: ROAR.seconds, release: 1.2 });
      if (audio.cueBuffers.has(ROAR.recording)) {
        play(ROAR.recording, 'monster', {
          gain: dbToGain(ROAR.peakDb), fadeIn: 0.01, panner: ROAR.panner, position: [x, ROAR.y, z],
          send: audio.echoInput() ? { node: audio.echoInput(), level: ROAR.echoSend } : null
        });
        return;
      }
      const ear = getListener();
      ear.getWorldDirection(roarLook);
      const dx = x - listenerPos.x;
      const dz = z - listenerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      // The listener's right is (-forward.z, forward.x) on the floor.
      const pan = (dx * -roarLook.z + dz * roarLook.x) / (d * Math.hypot(roarLook.x, roarLook.z) || 1);
      audio.roar({ pan: pan * ROAR.panWidth, level: ROAR.level / (1 + d / ROAR.falloffMetres) });
    },

    /**
     * DEV: play any cue a couple of metres in front of the player so it can be
     * heard on demand. Loops run for `seconds` then fade.
     */
    audition(name, { seconds = 6, distance = 2 } = {}) {
      const specs = {
        laugh_distant: LAUGH, hunter_breath: HUNTER_BREATH, crt_static: STATIC, rain_bed: BED,
        caught_sting: STING, candle: CANDLE, lockbox_open: LOCKBOX, door_open: DOOR,
        stalk_breath: STALK, hunter_steps: HUNTER_STEPS, annabelle_singing: { cue: SINGING.cue, ...SINGING.places.upstairsHallway },
        generator_idle: GENERATOR, tube_hum: TUBES, overload_buzz: GLARE, rain_glass: RAIN_GLASS
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
        singingNextAt: +singing.nextAt.toFixed(2), singing: !!singing.cue?.alive,
        lastMonsterAt: +lastMonsterAt.toFixed(2)
      };
    },

    /** DEV: bring the next laugh forward to `seconds` from now. */
    scheduleLaughIn(seconds) { laugh.nextAt = clock + seconds; }
  };
  return director;
}
