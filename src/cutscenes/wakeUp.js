import * as THREE from 'three';

/**
 * WAKING UP -- the first thing the player sees, after the prologue's front
 * page. First person throughout, from the player's own eyes:
 *
 *   1. eyes opening slowly, as after a very long sleep: a crack of light (and
 *      lightning, which is what woke them) that falls shut again, then most of
 *      the way, blurred, doubled and grey; two blinks and the ceiling bulb
 *      comes into focus                                    (lying on the bed)
 *   2. then ONE unbroken movement of the head: down the length of their own
 *      body to the headboard rail the chain is wrapped round; across to the
 *      right, to their wrist in a cuff on the end of it -- they yank it, it
 *      holds, and their breath goes; back across the bed to the window on the
 *      left as lightning lights it; and up, sitting, into the room
 *   3. the eyes close for a moment as they come upright ...   (blink)
 *   4. ... and open on exactly the view play starts from
 *
 * ONE MOVEMENT, NOT A LIST OF LOOKS. Each look used to be its own shot that
 * eased in, stopped dead, held, and eased out again, which reads as a camera
 * being pointed at things -- not as a person coming round. Now the whole
 * movement is one shot whose direction, roll, lens and head-lift are smooth
 * curves through keyed moments (`keyed()` below): continuous in speed as well
 * as position, so the head slows as it reaches something it wants to look at
 * (`linger`) and drifts on from it, but never stops until they are sitting.
 * On top of it, a slow breathing drift -- never a jitter -- that is loose at
 * first and steadies as they wake, and one flinch, when the chain holds.
 *
 * WAKING IS ALL THE SENSES COMING BACK AT DIFFERENT SPEEDS:
 *   sight   lids, blur, double vision and halos round the lights
 *           (WakePass, via ctx.postFX.setWake) -- each clearing on its own
 *           schedule, the double vision last of all
 *   hearing the whole mix muffled, clearing as the eyes do (setMuffle)
 *   breath  slow and asleep, catching hard at the cuff, settling as they sit
 *   words   each of the three wake-up lines on the moment it describes, not
 *           as one block -- "your wrist is chained" when the wrist is seen
 *
 * THE PLAYER LIES WITH THEIR HEAD AT THE FOOT OF THE BED. Not where the
 * pillows are, and deliberately: play starts sitting up and facing the
 * headboard (the paperclip and the window corner are that way), so this is
 * the only way to lie down that sits up into it. It also puts the chain's
 * anchor on the headboard rail at the end of the "look down at yourself"
 * movement, and the cuffed wrist -- the right -- on the right.
 *
 * THE BODY IS THE PLAYER'S OWN (playerBody, the clean Okabe, correction 1),
 * laid on the duvet by rotating its root a quarter turn about X with the hips
 * pinned where they lie, so that sitting up is the same rotation undone while
 * the legs bend at the hip to stay flat on the bed. Its head is hidden
 * (setHeadVisible) because the lens is inside it. Play has no body in first
 * person, so the body goes while the eyes are shut in the last blink -- the
 * same blink that hides the lens settling onto the player's own camera.
 *
 * SKIPPABLE (hold Space -- core/CutsceneSkip.js), because it plays on every
 * new game. A skip still shows whichever of the three lines had not been
 * reached: the second one is how a player learns they are chained.
 *
 * @param {object} p
 * @param {number} p.bedX       the bed's centre line, world x
 * @param {number} p.bedZ       the bed's centre, world z
 * @param {number} p.duvetTop   height of the duvet under the hips
 * @param {number[]} p.cuff     the locked cuff, world [x,y,z]
 * @param {number[]} p.windowAt the window's centre, world [x,y,z]
 * @param {number[]} p.bulbAt   the ceiling bulb, world [x,y,z]
 * @param {number[]} p.ahead    a point straight ahead of the view play starts from
 * @param {number} p.baseFov    the player's field of view
 * @param {function(string, object): void} p.onThought queues Mark's thoughts at authored camera cues
 */
export function wakeUp({ bedX, bedZ, duvetTop, cuff, windowAt, bulbAt, ahead, baseFov, onThought = () => {} }) {
  // ---------- where the body lies ----------
  // Hips a little toward the foot of the bed from its centre, so the head
  // (0.77 m up the body from the hips, lying) rests just inside the foot end.
  const HIPS = new THREE.Vector3(bedX, duvetTop + 0.11, bedZ + 0.18);
  const QUARTER_TURN = Math.PI / 2;
  // Roughly where the eyes are, lying and sitting: only used to turn the
  // keyed look targets into directions, so a few centimetres do not matter.
  const LYING_EYE = [bedX, duvetTop + 0.17, HIPS.z + 0.77];
  const SITTING_EYE = [bedX, HIPS.y + 0.77, HIPS.z - 0.06];

  // ---------- the timeline, in seconds ----------
  // Slow on purpose: someone coming round turns their head at well under
  // 100 degrees a second, and anything quicker reads as the camera snapping.
  const T_CRACK = 2.3;      // the first crack of light -- lightning
  const T_FOCUSED = 5.8;    // eyes open and focused on the ceiling; the head starts to move
  const T_FEET = 8.2;       // down the body, to the headboard rail
  const T_CUFF = 10.2;      // across to the wrist
  const T_CUFF_HELD = 11.2; // still on it, drifting along the chain
  const T_ACROSS = 12.7;    // back across the bed, past the headboard
  const T_WINDOW = 14.1;    // the window on the left
  const T_SIT = 13.9;       // starts sitting up as the eyes reach the window
  const T_SAT = 16.3;       // upright, looking ahead
  const SETTLE = 0.35;      // eyes shut: the lens settles onto the player's own
  const OPEN_HOLD = 0.6;
  const T_BLINK_SHUT = T_SAT - 0.2;
  const T_BLINK_OPEN = T_SAT + SETTLE;
  /** The yank on the chain, while they are looking at it. */
  const T_TUG = T_CUFF + 0.35;

  // The three wake-up lines (dialogue/level1_bedroom.js), each on its moment.
  const T_LINE = [3.0, T_CUFF + 0.25, T_SAT - 0.7];

  const smooth = (u) => {
    const c = Math.min(1, Math.max(0, u));
    return c * c * (3 - 2 * c);
  };

  /** Piecewise curve through [t, value] keys that eases into and out of every key. For the lids: a blink is all stops. */
  const stepped = (keys) => (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        return v0 + (v1 - v0) * smooth((t - t0) / Math.max(1e-6, t1 - t0));
      }
    }
    return keys[keys.length - 1][1];
  };

  /**
   * A smooth path through keys in TIME, for movement: cubic Hermite, each
   * key's tangent the slope across its two neighbours, scaled by
   * (1 - linger). linger 0 sweeps straight through a key; 1 comes to rest on
   * it; in between slows as it arrives and carries on. Continuous in value
   * AND velocity -- across keys spaced unevenly in time too, because the
   * tangents are per second, not per key -- which is what makes a string of
   * looks one movement instead of several.
   *
   * @param read key -> number[]  the values to interpolate (a direction, a lens...)
   * @returns t -> number[]
   */
  function keyed(keys, read) {
    const n = keys.length;
    const values = keys.map(read);
    const tangents = keys.map((key, i) => {
      if (i === 0 || i === n - 1) return values[i].map(() => 0);
      const span = keys[i + 1].t - keys[i - 1].t;
      const slow = 1 - (key.linger ?? 0);
      return values[i].map((_, c) => ((values[i + 1][c] - values[i - 1][c]) / span) * slow);
    });
    return (t) => {
      if (t <= keys[0].t) return values[0].slice();
      if (t >= keys[n - 1].t) return values[n - 1].slice();
      let i = 0;
      while (t > keys[i + 1].t) i++;
      const h = keys[i + 1].t - keys[i].t;
      const u = (t - keys[i].t) / h;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      return values[i].map((p0, c) =>
        h00 * p0 + h10 * h * tangents[i][c] + h01 * values[i + 1][c] + h11 * h * tangents[i + 1][c]);
    };
  }

  const direction = (from, to) => {
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
    return [d.x, d.y, d.z];
  };

  /** A smooth bump: 0 before `start`, up to 1 over `rise`, back to 0 over `fall`. */
  const bump = (t, start, rise, fall) => {
    if (t <= start) return 0;
    if (t <= start + rise) return smooth((t - start) / rise);
    return 1 - smooth((t - start - rise) / fall);
  };

  // ---------- the eyes ----------
  // Lids fall fast and lift slowly; each opening gets a little further.
  const lidsKeyed = stepped([
    [0, 0], [1.0, 0],
    [T_CRACK, 0.3], [2.75, 0.05],      // a crack of light, and it falls shut again
    [3.9, 0.55], [4.3, 0.55],
    [4.42, 0], [4.55, 0], [4.85, 0.78], // first blink
    [5.15, 0.78], [5.25, 0], [5.35, 0], [5.7, 1], // second
    [T_BLINK_SHUT, 1], [T_BLINK_SHUT + 0.15, 0],
    [T_BLINK_OPEN, 0], [T_BLINK_OPEN + 0.35, 1]
  ]);
  /**
   * Heavy lids do not hold still half open: a small tremble while they fight
   * to stay up, only before the eyes have properly opened.
   */
  const lidsAt = (t) => {
    const v = lidsKeyed(t);
    if (t >= T_FOCUSED || v < 0.04 || v > 0.96) return v;
    return Math.min(1, Math.max(0, v + 0.035 * Math.sin(t * 31) * Math.sin(t * 7.3)));
  };
  const blurAt = stepped([
    [0, 1], [2.75, 1], [3.9, 0.85], [4.6, 0.7],
    [4.85, 0.5], [5.35, 0.45], [5.7, 0.2], [7.0, 0]
  ]);
  /**
   * The two eyes agreeing last of all, a while after the blur has gone -- and
   * swimming apart again for a moment when the chain holds and the breath goes.
   */
  const doubleKeyed = stepped([
    [0, 1], [2.75, 1], [3.9, 0.8], [4.6, 0.7], [4.85, 0.45],
    [5.35, 0.4], [5.7, 0.2], [7.4, 0]
  ]);
  const doubleAt = (t) => Math.min(1, doubleKeyed(t) + 0.3 * bump(t, T_TUG, 0.25, 1.4));
  /** Pupils wide from the dark: lights bloom, then settle as they adjust. */
  const glowAt = stepped([
    [0, 1], [3.9, 0.9], [5.7, 0.55], [8.5, 0.2], [T_SIT, 0.1], [T_SAT - 0.3, 0]
  ]);

  // ---------- the head ----------
  // Straight up, drawn most of the way toward the bulb: the first thing that
  // comes into focus is a blur of light, which is where eyes go when they open.
  const TOWARD_BULB = 0.8;
  const ceiling = [
    bedX + (bulbAt[0] - bedX) * TOWARD_BULB,
    2.9,
    LYING_EYE[2] + (bulbAt[2] - LYING_EYE[2]) * TOWARD_BULB
  ];
  const pastTheFeet = [bedX, duvetTop + 0.12, bedZ - 0.95];
  // A little way back along the chain from the cuff, toward the rail.
  const alongTheChain = [cuff[0] + 0.02, cuff[1], cuff[2] - 0.18];
  // Between the wrist on the right and the window on the left, propped up as
  // they are, the head turns across the headboard rather than rolling face-up
  // over the pillow: the short way round, and the one a person takes.
  const acrossTheBed = [bedX - 0.3, duvetTop + 0.5, bedZ - 1.1];

  // Lying on their back, the top of the frame is the top of their head.
  const HEAD_UP = [0, 0, 1];
  const HEAD_UP_TURNED = [0, 0.25, 1];

  /**
   * The movement. `lift` is head and shoulders up off the duvet: all the way
   * to look down the body, about half for the turns (propped up -- lying flat,
   * this coat's shoulders stand higher than the eyes and hide the wrist), and
   * back down as the sit-up takes over. The lens narrows on the wrist, where a
   * dark cuff on a dark duvet is otherwise small.
   */
  const LOOK_KEYS = [
    { t: 0, dir: direction(LYING_EYE, ceiling), up: HEAD_UP, fov: baseFov, lift: 0 },
    { t: T_FOCUSED, dir: direction(LYING_EYE, ceiling), up: HEAD_UP, fov: baseFov, lift: 0, linger: 1 },
    { t: T_FEET, dir: direction(LYING_EYE, pastTheFeet), up: [0, 1, 0.5], fov: baseFov, lift: 1, linger: 0.65 },
    { t: T_CUFF, dir: direction(LYING_EYE, cuff), up: HEAD_UP_TURNED, fov: 54, lift: 0.6, linger: 0.6 },
    { t: T_CUFF_HELD, dir: direction(LYING_EYE, alongTheChain), up: HEAD_UP_TURNED, fov: 48, lift: 0.6, linger: 0.5 },
    { t: T_ACROSS, dir: direction(LYING_EYE, acrossTheBed), up: HEAD_UP_TURNED, fov: 62, lift: 0.5, linger: 0 },
    { t: T_WINDOW, dir: direction(LYING_EYE, windowAt), up: HEAD_UP_TURNED, fov: baseFov, lift: 0.5, linger: 0.7 },
    { t: T_SAT, dir: direction(SITTING_EYE, ahead), up: [0, 1, 0], fov: baseFov, lift: 0, linger: 1 }
  ];
  const dirAt = keyed(LOOK_KEYS, (k) => k.dir);
  const upAt = keyed(LOOK_KEYS, (k) => k.up);
  const fovAt = keyed(LOOK_KEYS, (k) => [k.fov]);
  const liftAt = keyed(LOOK_KEYS, (k) => [k.lift]);

  /**
   * How loose the head still is: the breathing drift's size. Most at first,
   * steadying as they come round, never quite still.
   */
  const groggyAt = stepped([[0, 1], [T_FOCUSED, 0.8], [T_FOCUSED + 3, 0.45], [T_SAT, 0.3]]);
  const DRIFT_DEGREES = 1.1;
  const FLINCH_DEGREES = 1.6;
  const TAU = Math.PI * 2;
  /**
   * Slow, breathing-paced wander (well under 1 Hz, incommensurate so it never
   * visibly repeats), plus the flinch when the chain holds: a hard, fast
   * shudder that dies in a third of a second. In degrees, per world axis.
   */
  function wanderAt(t) {
    const g = groggyAt(t) * DRIFT_DEGREES / 1.45;
    const k = t - T_TUG;
    const flinch = k > 0 && k < 0.9 ? FLINCH_DEGREES * Math.exp(-k / 0.2) * Math.sin(k * 26) : 0;
    return [
      g * (Math.sin(TAU * 0.13 * t + 0.7) + 0.45 * Math.sin(TAU * 0.31 * t + 2.1)) + flinch * 0.5,
      g * (Math.sin(TAU * 0.19 * t + 1.9) + 0.45 * Math.sin(TAU * 0.41 * t + 0.4)) + flinch,
      g * (Math.sin(TAU * 0.11 * t + 2.6) + 0.45 * Math.sin(TAU * 0.27 * t + 1.2))
    ];
  }

  /** Far along the current direction, so a few centimetres of eye movement cannot swing the aim. */
  const LOOK_DISTANCE = 50;
  const METRES_PER_DEGREE = LOOK_DISTANCE * Math.tan(THREE.MathUtils.degToRad(1));
  const lookAt = (t) => {
    const d = dirAt(t);
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const w = wanderAt(t);
    return [
      LYING_EYE[0] + (d[0] / len) * LOOK_DISTANCE + w[0] * METRES_PER_DEGREE,
      LYING_EYE[1] + (d[1] / len) * LOOK_DISTANCE + w[1] * METRES_PER_DEGREE,
      LYING_EYE[2] + (d[2] / len) * LOOK_DISTANCE + w[2] * METRES_PER_DEGREE
    ];
  };

  // ---------- the body ----------
  /** 0 lying flat .. 1 sitting up. */
  const sitAt = (t) => smooth((t - T_SIT) / (T_SAT - T_SIT));
  /** The cuffed arm yanked once against the chain. */
  const tugAt = (t) => {
    const u = (t - T_TUG) / 0.55;
    return u > 0 && u < 1 ? Math.sin(u * Math.PI) * (1 - u * 0.4) : 0;
  };

  // Radians. Measured on the rig: +x on the right shoulder swings the arm out
  // from the body, -x on a hip brings the leg forward, +x on the spine, chest,
  // neck and head curls forward.
  const ARM_OUT = 0.6;          // the right wrist out to where the cuff lies
  const ARM_DOWN = -0.15;       // and down onto the duvet
  // Small: the cuff can only follow the wrist a few centimetres (CUFF_GIVE)
  // before the chain is taut, and a bigger yank would pull the hand out of it.
  const TUG = 0.12;
  /** How far the cuff comes with the wrist before the chain stops it, metres, in its parent's frame. */
  const CUFF_GIVE = new THREE.Vector3(0.03, 0.012, 0.01);
  // The lift is a small curl, spread down the spine so no one joint kinks:
  // about 25 cm of rise at the eyes at full lift.
  const SPINE_LIFT = 0.25;
  const CHEST_LIFT = 0.1;
  const NECK_LIFT = 0.5;
  const HEAD_LIFT = 0.25;

  const _hips = new THREE.Vector3();
  /** Where the cuff rests, captured on the first frame and put back on the last. */
  let cuffRest = null;

  function poseBody(body, t) {
    const sit = sitAt(t);
    const lift = Math.max(0, liftAt(t)[0]);
    const root = body.refs.root;
    // Lying: a quarter turn about X puts the head toward +Z and the face up.
    root.rotation.set((1 - sit) * QUARTER_TURN, 0, 0);
    body.offsetBones({
      'Left leg': [-QUARTER_TURN * sit, 0, 0],
      'Right leg': [-QUARTER_TURN * sit, 0, 0],
      'Right arm': [(ARM_OUT + TUG * tugAt(t)) * (1 - sit), 0, ARM_DOWN * (1 - sit)],
      Spine: [SPINE_LIFT * lift, 0, 0],
      Chest: [CHEST_LIFT * lift, 0, 0],
      Neck: [NECK_LIFT * lift, 0, 0],
      Head: [HEAD_LIFT * lift, 0, 0]
    });
    // Pin the hips where they lie, so sitting up pivots there and not at the
    // feet (the root's origin).
    if (!body.refs.hips) return;
    body.refs.hips.getWorldPosition(_hips);
    root.position.x += HIPS.x - _hips.x;
    root.position.y += HIPS.y - _hips.y;
    root.position.z += HIPS.z - _hips.z;
  }

  /** The cuff comes a little way with the yank, and is snapped back by the chain. */
  function poseCuff(cuffObject, t) {
    if (!cuffObject) return;
    if (!cuffRest) cuffRest = cuffObject.position.clone();
    cuffObject.position.copy(cuffRest).addScaledVector(CUFF_GIVE, tugAt(t));
  }

  // ---------- the lens ----------
  // One shot from the first crack of light to sitting upright, on the scene's
  // own clock: the shot starts at t = 0, so its u maps straight onto it.
  const MOVEMENT = T_SAT;
  const sceneTime = (u) => u * MOVEMENT;

  /** Plays wake-up lines `from`..`to` (indices) as one sequence. */
  const sayLines = (ctx, from, to = from) => {
    const lines = ctx.line('dialog_wake').slice(from, to + 1);
    if (lines.length) ctx.captions.play(lines);
  };

  return {
    name: 'wakeUp',
    skippable: true,
    shots: [
      {
        cut: true,
        at: 'player.body.eyes',
        lookAt: (u) => lookAt(sceneTime(u)),
        up: (u) => upAt(sceneTime(u)),
        fov: (u) => fovAt(sceneTime(u))[0],
        ease: 'linear',
        seconds: MOVEMENT
      },
      // Eyes shut: onto the player's own eye and view, which play starts from.
      { at: 'player', seconds: SETTLE },
      { at: 'player', seconds: OPEN_HOLD }
    ],
    cues: [
      {
        t: 0,
        run: (ctx) => {
          ctx.playerBody.setHeadVisible(false);
          ctx.showPlayerBody(true);
          // Asleep: the room dull and far away, the breath slow.
          ctx.audio.setMuffle(1);
          ctx.setBreathing(0.22);
        }
      },
      // What woke them: lightning, and the first crack of light is its flash.
      { t: T_CRACK - 0.12, run: (ctx) => { ctx.flashLightning(); ctx.audio.setMuffle(0.6, 1.0); } },
      { t: T_LINE[0], run: (ctx) => sayLines(ctx, 0) },
      { t: 4.4, run: (ctx) => ctx.audio.setMuffle(0.3, 1.2) },
      { t: T_FOCUSED, run: (ctx) => { ctx.audio.setMuffle(0, 2.5); ctx.setBreathing(0.3); } },
      // Silence through the eyes opening; react as the head starts exploring.
      { t: T_FOCUSED, run: () => onThought('l1_01', { delay: 0, cutscene: 'wakeUp' }) },
      { t: T_LINE[1], run: (ctx) => sayLines(ctx, 1) },
      { t: T_LINE[1], run: () => onThought('l1_02', { delay: 0, cutscene: 'wakeUp' }) },
      // The chain holds: metal, and the breath catches.
      {
        t: T_TUG + 0.06,
        run: (ctx) => {
          ctx.sfx('chain_drop', { gainDb: -9 });
          ctx.sfx('gasp', { gainDb: -4 });
          ctx.setBreathing(0.85);
        }
      },
      { t: T_ACROSS, run: (ctx) => ctx.setBreathing(0.6) },
      { t: T_WINDOW - 0.25, run: (ctx) => ctx.flashLightning() },
      { t: T_SIT + 0.05, run: (ctx) => { ctx.sfx('cloth'); ctx.setBreathing(0.45); } },
      { t: T_LINE[2], run: (ctx) => sayLines(ctx, 2) },
      // Gone while the eyes are shut: play has no body in first person.
      { t: T_BLINK_SHUT + 0.15, run: (ctx) => ctx.showPlayerBody(false) }
    ],
    onFrame(ctx, t) {
      ctx.postFX.setWake(lidsAt(t), blurAt(t), { double: doubleAt(t), glow: glowAt(t) });
      poseBody(ctx.playerBody, t);
      poseCuff(ctx.cuff, t);
    },
    /** A skip still delivers the lines not reached -- the second is how they learn they are chained. */
    onSkip(ctx, t) {
      const next = T_LINE.findIndex((at) => at > t);
      if (next !== -1) sayLines(ctx, next, T_LINE.length - 1);
    },
    onEnd(ctx) {
      ctx.postFX.setWake(1, 0);
      ctx.audio.setMuffle(0, 0.4);
      ctx.setBreathing(ctx.restingBreath());
      if (cuffRest && ctx.cuff) ctx.cuff.position.copy(cuffRest);
      ctx.playerBody.refs.root.rotation.set(0, 0, 0);
      ctx.playerBody.setHeadVisible(true);
      ctx.showPlayerBody(false);
    }
  };
}
