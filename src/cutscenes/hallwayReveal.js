/**
 * THE HALLWAY REVEAL -- the first scene, and the reference for the rest.
 *
 * The bedroom door has just opened onto the hall and it is already standing at
 * the far end. Before this scene the beat was one second of the player's own
 * view; now the lens takes over for five:
 *
 *   1. the player's own eyes, turning onto it            (no cut from play)
 *   2. a slow push down the hall on a lengthening lens --
 *      it fills the frame, its head going over            (push in, FOV 70 -> 34)
 *   3. CUT: from its own eyes, looking back up the hall
 *      at the player standing in the doorway, their own
 *      torch in the lens, the frame cocked with its head  (the reverse)
 *   4. CUT: back to the player's eyes, exactly where
 *      they are standing, looking at it                   (then handed back)
 *
 * and then the rush runs as it always has, in first person, playable: the
 * light goes and it comes down the hall. The scene is the stare; the rush is
 * the scare, and that stays the player's.
 *
 * WHY THE REVERSE SHOT. It is the one picture first person can never give: the
 * player, through ITS eyes -- it is looking at you. Same model as the monster
 * at correction 1 (see playerBody in main.js), so the figure in that frame is
 * the body it is a distortion of.
 *
 * FROM ITS EYE LINE, not from low behind it. The reverse used to be filmed
 * from its hip, behind its shoulder, which framed the shot round its leg. The
 * lens now sits between its eyes (its head is hidden from the lens for the
 * shot, so it does not see the inside of its own face) and follows them as
 * the head goes over, and the frame rolls with the cocked head.
 *
 * Built per play rather than as a constant, because the shots are placed
 * relative to where the player actually opened the door from and where it
 * actually stands. The numbers are a rough cut: fly the free camera (N), mark
 * framings with M and they replace these -- docs/CUTSCENES.md.
 *
 * @param {object} p
 * @param {{x:number, y:number, z:number}} p.eye  the player's eye, world space.
 * @param {{x:number, z:number}} p.standing       where the creature stands.
 * @param {{x:number, y:number, z:number}} p.creatureEyes  between its eyes, world space.
 * @param {number} p.baseFov                      the player's field of view.
 */
export function hallwayReveal({ eye, standing, creatureEyes, baseFov }) {
  // Unit vector, on the floor, from the creature to the player -- and the one
  // at right angles to it, for putting the lens off its shoulder.
  const dx = eye.x - standing.x;
  const dz = eye.z - standing.z;
  const len = Math.hypot(dx, dz) || 1;
  const toPlayer = [dx / len, dz / len];
  const across = [-toPlayer[1], toPlayer[0]];

  const TURN = 1.0;      // shot 1
  const PUSH = 2.2;      // shot 2
  const REVERSE = 1.4;   // shot 3
  const RETURN = 0.5;    // shot 4
  const CUT_TO_REVERSE = TURN + PUSH;
  const CUT_BACK = CUT_TO_REVERSE + REVERSE;

  // The push: through the doorway and into the hall, and a little low. The
  // hall's pendant hangs dead centre at the creature's own head height, half
  // way down, so from the player's eye the shade sits right over its face;
  // closer to the lamp and lower, the lamp rises clear above it (about 6
  // degrees) and the lens does the rest of the move.
  const PUSH_METRES = Math.min(1.8, len * 0.2);
  const push = [eye.x - toPlayer[0] * PUSH_METRES, eye.y - 0.2, eye.z - toPlayer[1] * PUSH_METRES];
  // The reverse is from its eyes, on a long lens so the player -- ten metres
  // off in the doorway -- reads as a figure rather than a speck. Its head is
  // cocked over, so the frame rolls by part of that: `up` leans across the
  // hall instead of straight up.
  const REVERSE_FOV = 30;
  const REVERSE_ROLL_SHARE = 0.6;
  // A little under its eyes and a hand forward of them. The hall's pendant
  // hangs half way down at its head height, dead in line with the player; from
  // exactly its eyes the shade sat over the player's head. This much lower and
  // the shade rises clear above them -- the same reason the push runs low.
  const EYE_LINE_DROP_METRES = 0.14;
  const EYE_LINE_FORWARD_METRES = 0.1;
  const eyeLine = [
    creatureEyes.x + toPlayer[0] * EYE_LINE_FORWARD_METRES,
    creatureEyes.y - EYE_LINE_DROP_METRES,
    creatureEyes.z + toPlayer[1] * EYE_LINE_FORWARD_METRES
  ];

  /** Its head going over, eased in across the push and held through the reverse. */
  const HEAD_TILT_RADIANS = 0.38;
  const HEAD_NOD_RADIANS = 0.06;
  const smooth = (u) => {
    const c = Math.min(1, Math.max(0, u));
    return c * c * (3 - 2 * c);
  };
  const tiltAt = (t) => smooth((t - TURN * 0.6) / (PUSH * 0.9));
  // And straightened again across the last shot, so nothing is left to snap:
  // once the scene hands back, the creature's own update() puts every bone
  // back to rest on the very next frame.
  const settleAt = (t) => 1 - smooth((t - CUT_BACK) / RETURN);

  return {
    name: 'hallwayReveal',
    letterbox: true,
    shots: [
      { at: 'player', lookAt: 'creature.head', seconds: TURN },
      { at: push, lookAt: 'creature.head', fov: 34, seconds: PUSH },
      {
        cut: true,
        at: eyeLine,
        lookAt: 'player',
        up: () => {
          const roll = HEAD_TILT_RADIANS * REVERSE_ROLL_SHARE;
          return [across[0] * Math.sin(roll), Math.cos(roll), across[1] * Math.sin(roll)];
        },
        fov: REVERSE_FOV,
        seconds: REVERSE,
        ease: 'linear',
        shake: 0.2
      },
      { cut: true, at: 'player', lookAt: 'creature.head', fov: baseFov, seconds: RETURN }
    ],
    cues: [
      {
        t: CUT_TO_REVERSE,
        run: (ctx) => {
          ctx.showPlayerBody(true);
          ctx.creature.setHeadVisible(false);
          ctx.sfx('creak');
        }
      },
      {
        t: CUT_BACK,
        run: (ctx) => {
          ctx.showPlayerBody(false);
          ctx.creature.setHeadVisible(true);
        }
      }
    ],
    onFrame(ctx, t) {
      const tilt = tiltAt(t);
      ctx.creature.offsetBones({ Head: [HEAD_NOD_RADIANS * tilt, 0, HEAD_TILT_RADIANS * tilt] }, settleAt(t));
      // The body stands where the player does but faces wherever they last
      // walked; in the reverse it has to be looking down the hall at it.
      ctx.playerBody.setYaw(Math.atan2(toPlayer[0], toPlayer[1]));
    },
    onEnd(ctx) {
      ctx.showPlayerBody(false);
      ctx.creature.setHeadVisible(true);
    }
  };
}
