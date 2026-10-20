import * as THREE from 'three';

/**
 * WAKING UP -- the first thing the player sees, after the prologue's front
 * page. First person throughout, from the player's own eyes:
 *
 *   1. eyes opening slowly, as after a very long sleep: a crack of light that
 *      falls shut again, then most of the way, blurred and grey; two blinks
 *      and the ceiling comes into focus                     (lying on the bed)
 *   2. then ONE unbroken movement of the head: down the length of their own
 *      body to the headboard rail the chain is wrapped round; across to the
 *      right, to their wrist in a cuff on the end of it -- they pull, and it
 *      holds; back across the bed to the window on the left as lightning
 *      lights it; and up, sitting, into the room
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
 * Eyelids and blur are the WakePass (world/WakePass.js), driven here frame by
 * frame through ctx.postFX.setWake(open, blur).
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
 */
export function wakeUp({ bedX, bedZ, duvetTop, cuff, windowAt, bulbAt, ahead, baseFov }) {
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

  // ---------- the eyes ----------
  // Lids fall fast and lift slowly; each opening gets a little further.
  const lidsAt = stepped([
    [0, 0], [1.0, 0],
    [2.3, 0.3], [2.75, 0.05],          // a crack of light, and it falls shut again
    [3.9, 0.55], [4.3, 0.55],
    [4.42, 0], [4.55, 0], [4.85, 0.78], // first blink
    [5.15, 0.78], [5.25, 0], [5.35, 0], [5.7, 1], // second
    [T_BLINK_SHUT, 1], [T_BLINK_SHUT + 0.15, 0],
    [T_BLINK_OPEN, 0], [T_BLINK_OPEN + 0.35, 1]
  ]);
  const blurAt = stepped([
    [0, 1], [2.75, 1], [3.9, 0.85], [4.6, 0.7],
    [4.85, 0.5], [5.35, 0.45], [5.7, 0.2], [7.0, 0]
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

  /** Far along the current direction, so a few centimetres of eye movement cannot swing the aim. */
  const LOOK_DISTANCE = 50;
  const lookAt = (t) => {
    const d = dirAt(t);
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    return [
      LYING_EYE[0] + (d[0] / len) * LOOK_DISTANCE,
      LYING_EYE[1] + (d[1] / len) * LOOK_DISTANCE,
      LYING_EYE[2] + (d[2] / len) * LOOK_DISTANCE
    ];
  };

  // ---------- the body ----------
  /** 0 lying flat .. 1 sitting up. */
  const sitAt = (t) => smooth((t - T_SIT) / (T_SAT - T_SIT));
  /** The cuffed arm pulled once against the chain, while they are looking at it. */
  const T_TUG = T_CUFF + 0.35;
  const tugAt = (t) => {
    const u = (t - T_TUG) / 0.55;
    return u > 0 && u < 1 ? Math.sin(u * Math.PI) * (1 - u * 0.4) : 0;
  };

  // Radians. Measured on the rig: +x on the right shoulder swings the arm out
  // from the body, -x on a hip brings the leg forward, +x on the spine, chest,
  // neck and head curls forward.
  const ARM_OUT = 0.6;          // the right wrist out to where the cuff lies
  const ARM_DOWN = -0.15;       // and down onto the duvet
  const TUG = 0.22;
  // The lift is a small curl, spread down the spine so no one joint kinks:
  // about 25 cm of rise at the eyes at full lift.
  const SPINE_LIFT = 0.25;
  const CHEST_LIFT = 0.1;
  const NECK_LIFT = 0.5;
  const HEAD_LIFT = 0.25;

  const _hips = new THREE.Vector3();

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

  // ---------- the lens ----------
  // One shot from the first crack of light to sitting upright, on the scene's
  // own clock: the shot starts at t = 0, so its u maps straight onto it.
  const MOVEMENT = T_SAT;
  const sceneTime = (u) => u * MOVEMENT;

  return {
    name: 'wakeUp',
    shots: [
      {
        cut: true,
        at: 'player.body.eyes',
        lookAt: (u) => lookAt(sceneTime(u)),
        up: (u) => upAt(sceneTime(u)),
        fov: (u) => fovAt(sceneTime(u))[0],
        ease: 'linear',
        shake: 0.1,
        seconds: MOVEMENT
      },
      // Eyes shut: onto the player's own eye and view, which play starts from.
      { at: 'player', seconds: SETTLE },
      { at: 'player', seconds: OPEN_HOLD }
    ],
    cues: [
      { t: 0, run: (ctx) => { ctx.playerBody.setHeadVisible(false); ctx.showPlayerBody(true); } },
      { t: 1.6, run: (ctx) => ctx.captions.play(ctx.line('dialog_wake')) },
      { t: T_TUG + 0.08, run: (ctx) => ctx.sfx('chain_drop', { gainDb: -9 }) },
      { t: T_WINDOW - 0.25, run: (ctx) => ctx.flashLightning() },
      { t: T_SIT + 0.05, run: (ctx) => ctx.sfx('cloth') },
      // Gone while the eyes are shut: play has no body in first person.
      { t: T_BLINK_SHUT + 0.15, run: (ctx) => ctx.showPlayerBody(false) }
    ],
    onFrame(ctx, t) {
      ctx.postFX.setWake(lidsAt(t), blurAt(t));
      poseBody(ctx.playerBody, t);
    },
    onEnd(ctx) {
      ctx.postFX.setWake(1, 0);
      ctx.playerBody.refs.root.rotation.set(0, 0, 0);
      ctx.playerBody.setHeadVisible(true);
      ctx.showPlayerBody(false);
    }
  };
}
