/**
 * THE STAIRS SCARE'S SHOT FROM OUTSIDE -- the one picture of core/StairsScare.js
 * that is not through the player's own eyes.
 *
 * The house is dark, the torch has died in their hand, something growled
 * close behind them. CUT: in front of them and off to one side, a little below
 * their eye, looking back past them up the hall -- and it is right behind
 * them, a head taller, bent over them and looking down at the top of their
 * head. A slow push in. Then StairsScare cuts back to their eyes and they turn
 * round, and it is gone.
 *
 * It stands off to the camera's side of them rather than straight behind:
 * straight behind, their own body hides it from the lens. And it is lifted a
 * little: it hunches, so standing it is barely taller than the player, and the
 * shot is about it looming. Its feet are out of frame, so nothing shows the lift.
 *
 * The scene is lit by `ctx.keyLight`, a cold light from above and in front:
 * there is no other light left in the house.
 *
 * Built per play, from where the player is standing. main.js stands the
 * monster where `monster` says before the scene starts and hides it after.
 *
 * @param {object} p
 * @param {{x: number, z: number}} p.standing - where the player stands.
 * @param {number} p.stairsYaw - the yaw that looks down the stairs; the player faces it.
 * @param {{left: number, right: number}} p.wallX - the hall's side walls, world x.
 */

/** Metres behind the player it stands (its root; its head hunches forward of this). */
const MONSTER_BEHIND_METRES = 0.78;
/** Metres off to the camera's side of the player, so their body does not hide it. */
const MONSTER_SIDE_METRES = 0.32;
/** Keeps its shoulders out of the hall's side walls. */
const MONSTER_WALL_CLEARANCE_METRES = 0.45;
/** Metres it is lifted, so its face is above the player's and it looks DOWN. */
const MONSTER_LIFT_METRES = 0.18;
/** Its neck and head bent forward over the player (+x curls forward on this rig). */
const NECK_BEND_RADIANS = 0.25;
const HEAD_BEND_RADIANS = 0.35;

const SHOT_SECONDS = 2.8;
/** The camera: in front of the player and off to one side, a little below eye height. */
const SHOT_START_AHEAD_METRES = 2.5;
const SHOT_END_AHEAD_METRES = 1.9;
const SHOT_SIDE_METRES = 1.0;
const SHOT_HEIGHT_METRES = 1.2;
const SHOT_FOV = 50;
/** The camera never goes closer than this to the hall's side walls. */
const SHOT_WALL_CLEARANCE_METRES = 0.25;
/** Where it looks: between the player's head and the monster's. */
const SHOT_TARGET_HEIGHT_METRES = 1.75;
const SHOT_TARGET_BEHIND_METRES = 0.4;

/** The key light: cold, from above and in front of the player. */
const KEY_COLOUR = 0x9fb6dc;
const KEY_INTENSITY = 3.2;
const KEY_RANGE_METRES = 4.5;
const KEY_HEIGHT_METRES = 2.55;
const KEY_AHEAD_METRES = 0.7;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function stairsBehind({ standing, stairsYaw, wallX }) {
  // Yaw 0 looks down -Z, as everywhere in this game.
  const forward = [-Math.sin(stairsYaw), -Math.cos(stairsYaw)];
  // The hall runs along Z, so "to the side" is along X: whichever side of the
  // player has more room, so the camera stays inside the walls.
  const hallCentreX = (wallX.left + wallX.right) / 2;
  const side = standing.x > hallCentreX ? -1 : 1;

  const monsterX = clamp(
    standing.x - forward[0] * MONSTER_BEHIND_METRES + side * MONSTER_SIDE_METRES,
    wallX.left + MONSTER_WALL_CLEARANCE_METRES,
    wallX.right - MONSTER_WALL_CLEARANCE_METRES
  );
  const monsterZ = standing.z - forward[1] * MONSTER_BEHIND_METRES;

  const cameraAt = (ahead) => [
    clamp(standing.x + forward[0] * ahead + side * SHOT_SIDE_METRES,
      wallX.left + SHOT_WALL_CLEARANCE_METRES, wallX.right - SHOT_WALL_CLEARANCE_METRES),
    SHOT_HEIGHT_METRES,
    standing.z + forward[1] * ahead
  ];
  const target = [
    standing.x - forward[0] * SHOT_TARGET_BEHIND_METRES + side * MONSTER_SIDE_METRES / 2,
    SHOT_TARGET_HEIGHT_METRES,
    standing.z - forward[1] * SHOT_TARGET_BEHIND_METRES
  ];

  return {
    name: 'stairsBehind',
    letterbox: true,
    /** Where main.js stands it before the scene starts: facing the back of the player's head. */
    monster: {
      x: monsterX,
      z: monsterZ,
      yaw: Math.atan2(-(standing.x - monsterX), -(standing.z - monsterZ))
    },
    shots: [
      {
        cut: true,
        path: [cameraAt(SHOT_START_AHEAD_METRES), cameraAt(SHOT_END_AHEAD_METRES)],
        lookAt: target,
        fov: SHOT_FOV,
        seconds: SHOT_SECONDS
      }
    ],
    cues: [
      {
        t: 0,
        run: (ctx) => {
          ctx.showPlayerBody(true);
          ctx.keyLight.color.setHex(KEY_COLOUR);
          ctx.keyLight.distance = KEY_RANGE_METRES;
          ctx.keyLight.position.set(
            standing.x + forward[0] * KEY_AHEAD_METRES,
            KEY_HEIGHT_METRES,
            standing.z + forward[1] * KEY_AHEAD_METRES
          );
        }
      }
    ],
    onFrame(ctx) {
      ctx.creature.offsetBones({ Neck: [NECK_BEND_RADIANS, 0, 0], Head: [HEAD_BEND_RADIANS, 0, 0] });
      const root = ctx.creature.refs.root;
      if (root) root.position.y = MONSTER_LIFT_METRES;
      // The body faces wherever they last walked; here it faces the stairs.
      ctx.playerBody.setYaw(stairsYaw);
      // A cold light that is not quite steady.
      ctx.keyLight.intensity = KEY_INTENSITY * (0.9 + Math.random() * 0.1);
    },
    onEnd(ctx) {
      ctx.showPlayerBody(false);
      ctx.keyLight.intensity = 0;
      const root = ctx.creature.refs.root;
      if (root) root.position.y = 0;
    }
  };
}
