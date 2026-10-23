import * as THREE from 'three';

/**
 * COMING ROUND, on the floor of the backrooms. Played twice over:
 *
 *   - after the fall down the hallway stairs (core/StairsFall.js), the long
 *     way: the player is lying on the wet carpet under a buzzing fluorescent
 *     and does not know where they are;
 *   - after being caught, quickly: they have been here before.
 *
 * First person throughout, framed as play is -- no bars:
 *
 *   1. the eyes crack open on the fluorescent overhead and fall shut again
 *   2. they open, blurred and doubled, the sound dull, on the ceiling tiles
 *   3. a blink, and the head comes up off the carpet -- down the body to the
 *      corridor running away past their feet
 *   4. up onto their feet in one movement, the double vision clearing last,
 *      and the view is exactly the one play starts from
 *
 * Lying with their head toward the sealed door they came through, so they sit
 * up facing into the maze, the way the crossing faces them. The eyes are
 * world/WakePass.js (postFX.setWake), as in wakeUp.js.
 *
 * @param {object} p
 * @param {{x: number, z: number, yaw: number}} p.spawn - where they stand up,
 *   and the way they face.
 * @param {number} p.eyeHeight - standing eye height, metres.
 * @param {number[]} p.lampAt - [x, y, z] of the fixture overhead.
 * @param {number} p.baseFov
 * @param {number} [p.seconds] - the whole scene; the beats scale with it.
 */
export function comeRound({ spawn, eyeHeight, lampAt, baseFov, seconds = 6 }) {
  const T = seconds;
  const s = T / 6;
  const f = [-Math.sin(spawn.yaw), 0, -Math.cos(spawn.yaw)];
  const at = (back, y) => [spawn.x - f[0] * back, y, spawn.z - f[2] * back];
  const smooth = (u) => THREE.MathUtils.smoothstep(u, 0, 1);

  /** Piecewise, eased into and out of every key: for the lids, where a blink is all stops. */
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
  /** The same, for vectors: one eased move between each pair of keys. */
  const path = (keys) => (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const u = smooth((t - t0) / Math.max(1e-6, t1 - t0));
        return v0.map((a, c) => a + (v1[c] - a) * u);
      }
    }
    return keys[keys.length - 1][1];
  };

  const lids = stepped([
    [0, 0], [0.6 * s, 0], [0.85 * s, 0.3], [1.15 * s, 0.04],
    [1.9 * s, 0.7], [2.5 * s, 0.7], [2.62 * s, 0], [2.75 * s, 0], [3.2 * s, 0.95], [4.0 * s, 1]
  ]);
  const blur = stepped([[0, 1], [1.9 * s, 0.9], [3.4 * s, 0.4], [4.8 * s, 0]]);
  const double = stepped([[0, 1], [3.0 * s, 0.7], [5.3 * s, 0]]);
  const glow = stepped([[0, 0.8], [2.0 * s, 0.5], [3.6 * s, 0]]);

  // Lying flat on their back, head toward the door, then up on an elbow,
  // then standing where play starts.
  const where = path([
    [0, at(0.25, 0.2)], [2.6 * s, at(0.25, 0.22)],
    [3.8 * s, at(0.3, 0.85)], [5.3 * s, at(0, eyeHeight)], [T, at(0, eyeHeight)]
  ]);
  const ahead = [spawn.x + f[0] * 4, eyeHeight - 0.1, spawn.z + f[2] * 4];
  const down = [spawn.x + f[0] * 2, 0.2, spawn.z + f[2] * 2];
  const target = path([
    [0, lampAt], [2.6 * s, lampAt], [3.8 * s, down], [5.3 * s, ahead], [T, [spawn.x + f[0] * 4, eyeHeight, spawn.z + f[2] * 4]]
  ]);
  // Flat on their back, the top of the frame is the top of their head:
  // toward the door. It comes round to the world's up as they sit.
  const up = path([[0, [-f[0], 0, -f[2]]], [2.6 * s, [-f[0], 0.15, -f[2]]], [3.8 * s, [0, 1, 0]], [T, [0, 1, 0]]]);

  return {
    name: 'comeRound',
    letterbox: false,
    skippable: true,
    shots: [{
      cut: true,
      at: (u) => where(u * T),
      lookAt: (u) => target(u * T),
      up: (u) => up(u * T),
      fov: baseFov,
      seconds: T,
      ease: 'linear'
    }],
    cues: [
      {
        t: 0,
        run: (ctx) => {
          ctx.postFX.setWake(0, 1, { double: 1, glow: 0.8 });
          ctx.clearFade();
          ctx.audio.setMuffle(1);
          ctx.setBreathing(0.7);
        }
      },
      { t: 1.9 * s, run: (ctx) => ctx.audio.setMuffle(0.5, 1.2 * s) },
      { t: 3.2 * s, run: (ctx) => { ctx.sfx('cloth'); ctx.audio.setMuffle(0, 1.8 * s); } },
      { t: 5.3 * s, run: (ctx) => ctx.setBreathing(ctx.restingBreath()) }
    ],
    onFrame(ctx, t) {
      ctx.postFX.setWake(lids(t), blur(t), { double: double(t), glow: glow(t) });
    },
    onEnd(ctx) {
      ctx.postFX.setWake(1, 0);
      ctx.audio.setMuffle(0, 0.4);
      ctx.clearFade();
    }
  };
}
