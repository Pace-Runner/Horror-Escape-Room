# Cutscenes

How the game's scripted camera work is built, how to direct a new scene with
the free camera, and how to get pictures out of the game to try AI video with.

## The parts

| File | Job |
|------|-----|
| [src/core/Cutscene.js](../src/core/Cutscene.js) | The runner. Plays a scene (a timeline of shots, cues and per-frame acting) through a camera of its own, and borrows and returns everything a scene has to switch off. |
| [src/cutscenes/](../src/cutscenes/) | One file per scene. Each exports a function that builds the scene from where things are when it plays. |
| [src/core/FreeCamera.js](../src/core/FreeCamera.js) | The fly camera (N). M marks framings and J records moves, both copied as shot data ready to paste into a scene. |
| [src/core/CutsceneExport.js](../src/core/CutsceneExport.js) | Dev only. Saves stills, character turnarounds and webm recordings as references for AI video. |
| [src/world/WakePass.js](../src/world/WakePass.js) | Eyes just waking, as a post-processing pass: lids (with light glowing red through them when shut), blur, double vision, and halos round lights. Driven by `postFX.setWake(open, blur, { double, glow })`; switched off at rest. |
| [src/core/CutsceneSkip.js](../src/core/CutsceneSkip.js) | Hold Space to skip, for scenes marked `skippable`. The prompt only appears once a key is pressed during the scene. |
| [src/world/VideoFeed.js](../src/world/VideoFeed.js) | Plays a clip on a CCTV feed through the monitor's phosphor look. |

`main.js` owns the scene registry (`SCENES`), the context every scene acts with
(`cutsceneContext`) and `playCutscene(name)`. It ticks the runner every frame:
after every figure has been posed, before the draw, and not while the game is
paused.

## How a scene is filmed

**Through its own camera.** The player's camera is the player: the creature
faces it, the doorway trigger reads it, the minimap centres on it. A scene that
moved it would walk the player through the house. So the runner films through
`cutscene.camera`, and the player's camera stays where the player is standing.
The game carries on round them. The torch stays in their hand too, so a shot
looking back at the player sees their beam.

**On the frame clock.** Esc holds a scene together with its voice line. Held,
not skipped: the scene still re-applies its acting each frame, so nothing
snaps behind the see-through restart dialog. The
free camera's slow motion (T) slows a scene down for review. The free camera
outranks a scene, so N during a scene lets you watch it from outside. It
starts from the shot on screen, so a framing you like can be picked up,
adjusted and marked with M.

**Keys a scene holds.** While a scene plays, F (torch), Q (drop), V (visor),
T (third person), H (hint) and G (debug skip) do nothing: each acts through
the hand or the view the scene has borrowed. Restart, credits and the level
jumps still work, and each cancels the scene properly.

**What it switches off, and puts back.** The hands, the dust motes, the torch
beam's motes, interaction, and the player's movement and look. Each is put
back to what it WAS, not to "on". Then `main.js` gets the last word through
the runner's `onHandBack`: it re-derives which view the player is in and
whether their torch is really lit (`applyViewVisibility()`,
`applyFlashlightBeam()`). That wins whenever something changed under the
scene, such as a restart that put the torch away before cancelling it. The
HUD and crosshair are hidden while a scene plays (`body.cutscene`). Captions
stay.

**Handing back.** If the last shot ends at the player's eye (within 0.5 m),
the player is re-aimed to that shot's view (`player.aim()`, which turns them
without moving them, so a crouching player stays crouched). Ending a scene by cutting back to
their eyes therefore hands over exactly the picture on screen, with no snap. A
scene that ends anywhere else leaves their aim as it was, unless it gives
`returnTo`.

**Cancelling.** `cutscene.cancel()` stops the scene and puts everything back.
Restart and every level change call it. The promise from `playScene()`
resolves `true` if the scene played out, `false` if it was cancelled.

## Writing a scene

```js
// src/cutscenes/myScene.js
export function myScene({ eye, standing, baseFov }) {
  return {
    name: 'myScene',
    letterbox: true,
    shots: [
      { at: 'player', lookAt: 'creature.head', seconds: 1.0 },
      { at: [0, 1.6, 2], lookAt: 'creature.head', fov: 38, seconds: 2.2 },
      { cut: true, path: [[0.4, 1.0, 10.6], [0.3, 1.0, 10.4]], lookAt: 'player', fov: 42, seconds: 1.4, shake: 0.35 },
      { cut: true, at: 'player', lookAt: 'creature.head', fov: baseFov, seconds: 0.5 },
    ],
    cues: [
      { t: 3.2, run: (ctx) => { ctx.showPlayerBody(true); ctx.sfx('creak'); } },
    ],
    onFrame(ctx, t, dt) { ctx.creature.offsetBones({ Head: [0, 0, 0.3] }); },
    onEnd(ctx, completed) { ctx.showPlayerBody(false); },
  };
}
```

Then add it to `SCENES` in `main.js` and play it with `playCutscene('myScene')`.
In a dev build it can be played from the console with
`__game.playCutscene('myScene')`.

### Shot fields

| Field | Meaning |
|-------|---------|
| `seconds` | How long the shot runs. Default 1. |
| `at` | Where the camera is: `[x,y,z]`, a target name, `'player'` (the player's eye), or a function of the shot's progress `u` (0 to 1). |
| `path` | Points to fly through on a smooth curve. If the shot does not `cut`, the curve starts from where the last shot ended. |
| `samples` | A recorded take from the free camera (J). Played back by time, exactly as flown. Overrides `at`, `path`, `lookAt` and `fov`. |
| `lookAt` | What it looks at: `[x,y,z]`, a target name, `'player'`, or a function of `u`. Omitted, it keeps the last shot's direction. `'player'` with no `lookAt` uses the player's own view. |
| `yaw`, `pitch` | A fixed direction instead of `lookAt`, in radians. Yaw 0 looks down -Z. |
| `up` | `[x,y,z]` or a function of `u`: which way is the top of the frame for `lookAt`. World up by default. A shot from the eyes of someone lying on their back needs the top of their head instead. |

**Separate shots read as separate camera moves.** Each eases in and out, so a
run of short looks stops dead between each one. For one continuous movement,
make it one long shot whose `lookAt`, `up` and `fov` are functions of time
through keyed moments. `wakeUp.js` has a `keyed()` helper for this: a cubic
path, continuous in speed, that slows at a key by its `linger` and never
stops.
| `fov` | A number (eased to from the last shot unless the shot cuts), `[from, to]`, or a function of `u`. Omitted, it keeps the last shot's. |
| `ease` | `'inout'` (default), `'linear'`, `'in'` or `'out'`. |
| `shake` | 0 to 1. At 1, about 0.8° of handheld wobble. |
| `cut` | `true` jumps straight to the shot. Without it, position, direction and FOV ease in from where the last shot ended. |

A shot that cannot be evaluated (a `lookAt` function that throws, a malformed
take) ends the scene with a console error rather than stopping the game.
A target name that doesn't exist logs a warning, and that point is skipped.

### Scene fields

| Field | Meaning |
|-------|---------|
| `name` | Shown in warnings and used to name exports. |
| `letterbox` | Slides black bars in for the scene. They cover the top and bottom 11% of the screen, so keep anything important out of those bands when framing. |
| `cues` | `{ t, run(ctx) }`, fired once each, in time order, when the scene reaches `t` seconds. |
| `onFrame(ctx, t, dt)` | Runs every frame, after the figures' own update and BEFORE the camera is posed, so a shot that follows a figure films this frame's pose. This is where acting goes. |
| `onEnd(ctx, completed)` | Runs when the scene finishes or is cancelled, after everything has been handed back, so it can start the next scene. Clean up anything the scene staged here. |
| `returnTo` | `{x, z, yaw, pitch}`: where to put the player down afterwards. |
| `skippable` | `true` lets the player hold Space to skip it. The scene ends on its last shot's final frame, as if it had played out. |
| `onSkip(ctx, t)` | Runs before a skip, for anything that must not be lost by skipping (a plot line not yet shown). Cues still to come do not fire. |
| `restoreBeam` | `false` leaves the torch's dust motes off afterwards (the endings). |

### Targets and context

Target names come from the `targets` map in `main.js`: `'creature.head'`,
`'creature.chest'`, `'player.body.head'`, `'player.body.eyes'` (between the
body's eye bones, for seeing from inside it), plus `'player'`, which is built
in. They are read every frame, so a target that moves is followed.

`ctx` holds everything a scene can act with: `creature`, `playerBody`, `sfx`,
`audio` (including `audio.setMuffle(amount, seconds)`, which muffles the whole
mix), `captions`, `line`, `postFX`, `flashLightning()` (a strike in the
bedroom window next frame), `cuff`, `setBreathing(level)`, `restingBreath()`
and `showPlayerBody(on)`. Scene files never import
`main.js`; if a scene needs something new, add it to `cutsceneContext`.

### Acting

Every figure (the creature, Annabelle, the backrooms figure, the player's body)
is the same procedurally animated Okabe rig. The monsters load the re-skinned
`okabe.glb` (dark, solid, empty eyes with a faint glint); the player's body loads
`okabe_clean.glb`. No model has animation clips.
Scenes move figures with `setPosition`, `setYaw` and `setSpeed` (speed drives
the walk and run), and pose them with `offsetBones({ Head: [x,y,z], Chest: [...] })`.

`offsetBones` must be called every frame from `onFrame`. The rig's own
`update()` resets every bone before adding its gait, so an offset set once is
gone the next frame. That is also why nothing has to be undone when the scene
ends. Measured on the rig: `+x` on `Right arm` swings the arm out from the
body, `-x` on a leg (`Left leg`, `Right leg`) brings it forward, and `+x` on
`Spine`, `Chest`, `Neck` and `Head` curls forward.

Two more for seeing through the player's own body: `setHeadVisible(false)`
hides the hair, face, eyes and mouth (the lens sits inside the head), and
`getEyePosition(out)` is where the eyes are. Anything a scene does to a
figure's root (`refs.root.rotation`, to lay it down) is NOT reset by
`update()`, so put it back in `onEnd`.

## Directing with the free camera

1. Run `npm run dev`, play to the moment, and press N.
2. Fly to a framing and press **M**. Do the same for each shot. Every M copies
   the whole list of marks as shot data, one shot per line:
   `{"cut":true,"at":[x,y,z],"lookAt":[x,y,z],"fov":70,"seconds":2.4}`.
   `seconds` is the gap to the next mark, so the pace you mark at is the pace
   the scene plays at.
3. For a camera move rather than held framings, press **J**, fly the move, and
   press **J** again. It copies `{"seconds":S,"samples":[...]}`, which replays
   the move exactly as flown.
4. Paste the result into a scene's `shots` (or hand it to Claude and say which
   shot it replaces). **Backspace** clears the marks.

The free camera shows the whole screen, so a framing marked for a letterboxed
scene loses its top and bottom 11% when it plays.

## The scenes

### wakeUp

[src/cutscenes/wakeUp.js](../src/cutscenes/wakeUp.js). The opening, after the
prologue's front page, about 15 seconds, first person throughout:

1. The eyes open slowly on the ceiling bulb: a crack of light that falls shut,
   then most of the way, blurred and grey; two blinks and it focuses.
2. Then one unbroken movement of the head, slowing at each thing it finds
   but never stopping. Down the body to the headboard rail the chain is
   wrapped round. Right, to the wrist in its cuff (the lens narrows; they pull
   once and the chain holds). Back across the bed to the window as lightning
   lights it. And up into sitting.
3. A blink as they come upright, opening on exactly the view play starts from.

Each of the three wake-up lines lands on the moment it describes: the first
as the eyes open, "your wrist is chained" when the wrist is seen, the last as
they sit up. Waking is the senses coming back at different speeds. The sound
is muffled and clears as the eyes do. The breath is slow, catches hard when
the chain holds, and settles. Lights halo and the two eyes see double, the
double vision clearing last. A slow breathing sway on the head steadies as
they come round, with one flinch when the chain holds. Lightning is what wakes
them: the first crack of light is its flash. Hold Space to skip. A skip still
shows whichever lines had not been reached. The player lies with their head at the
FOOT of the bed, because play starts sitting up and facing the headboard. That
is the only way to lie down that sits up into it, and it puts the cuffed (right)
wrist on the right. The body is the player's own `playerBody`: it is laid down
by turning its root a quarter turn about X with the hips pinned, and sitting up
undoes that while the legs bend at the hip. It goes during the last blink,
which also hides the lens settling onto the player's camera. Restarting does
not replay it, just as it never replayed the old fade.

To replay it in dev: `__game.resetGame()`, then `__game.playCutscene('wakeUp')`.

### The door-1 blinks

[src/core/HallwayBlinks.js](../src/core/HallwayBlinks.js). The bedroom door
opens onto a lit, empty hall, and then the lights start going. Each time they
come back it is standing closer: at the far end, a fifth of the way down, half
way with its head cocked over. One last blackout and the light comes back on
an empty hall. The singing starts below and the player can move again.

It is **not** a runner scene. It plays through the player's own camera, with
their hands and torch, and has no bars and no cuts, so the framing is the
game's own. It is built like the stairs scare: `player.cinematic`, `player.aim`
and steps on the frame clock ([src/core/FrameClock.js](../src/core/FrameClock.js)).
Each blackout is main.js's house blackout (`setHouseLightsOut`), and the torch
dies with it so the beam never shows it moving. Its eyes keep a faint glint in
the dark. If the door was opened from off to one side, the player glides onto
the door's centre line first. The G skip-through plays the same scene from
the hall. The beat timings are in the `BLINKS` table at the top of the file.

To replay it in dev: `__game.resetGame()`, then `__game.stageHallwayReveal()`.

### stairsBehind

[src/cutscenes/stairsBehind.js](../src/cutscenes/stairsBehind.js). The one
outside shot in the stairs scare: the monster bent over the player from behind.
It plays full screen, with no bars (user, 2026-10-23), like the rest of that
scare.

### The fall, and comeRound

[src/core/StairsFall.js](../src/core/StairsFall.js) replaces the fade down the
hallway stairs. The view walks on along the passage, the light below dies with
the torch, a step is not there, and the view drops and pitches over into black.
Then the maze comes up and [src/cutscenes/comeRound.js](../src/cutscenes/comeRound.js)
plays: the player comes round on the wet carpet under a fluorescent, eyes and
hearing clearing (WakePass and `setMuffle`, as in `wakeUp`), and gets up facing
into the maze. `comeRound` also replaces the fade-in after a backrooms catch,
at 3.2 s the first time and 2.2 s after that. Hold Space skips it.

`transitionTo()` takes `out` and `arrive` for this: a scene to play instead of
the fade out (it must end on black) and one instead of the fade in.
`CROSSING_SCENES` in main.js says which crossings use them.

To replay it in dev: from the maze, `__game.playCutscene('comeRound')`.

## Jump scares

[src/core/JumpScare.js](../src/core/JumpScare.js) is the shared rig: the light
under the lens, standing the figure so its FACE is where a scare wants it,
aiming, the scream, the red tunnel and the strobes. Each scare is one file in
[src/core/jumpScares/](../src/core/jumpScares/):

| Scare | Where | What happens |
|-------|-------|--------------|
| `lunge` | anywhere; the stairs scare | It rushes your face from 2.6 m. |
| `knockedDown` | anywhere | It hits you, the view falls to the floor, and it bends down over you. |
| `ceilingDrop` | the backrooms only (needs a ceiling height) | It swings down out of the tiles, upside down, into your face. |
| `alreadyThere` | anywhere | The light catches once and its face is already a hand from yours, perfectly still, then it snaps and screams. |

`jumpScare.run({ creature, kind, ceiling, colliders })` plays one. `kind` is a
name or `'random'`, and random never plays the same scare twice running. The
backrooms catch passes `'random'` with the 2.35 m ceiling and the maze walls,
so the scare turns to face open floor and keeps the head under the tiles. The
rig spreads head cocks and twitches down the chest, neck and head, and switches
off the rig's own twitches while a scare runs. The old version put them all on
the head bone, which is what made the neck look broken.

To see one in dev: from the maze, `__game.jumpScare.run({ creature: __game.okabe, kind: 'ceilingDrop', ceiling: 2.35 })`.

## AI video

Using AI video has a cost, so it is set up to be tried by hand first. Nothing
here calls a provider.

### Why it goes on the CCTV monitor, not full screen

AI video models have never seen this house or this creature. Given only a
prompt, they invent both, and the character drifts from shot to shot. On the
320x240 green-grey CCTV feed, behind scanlines and static, that drift falls
below what the screen can show. The feeds are also of rooms the game does not
model (kitchen, porch), which is exactly where a clip saves the most work.

### Getting references out of the game (dev build only)

These all save to your Downloads folder. Nothing is uploaded and nothing goes
into the repo.

- `__game.exportStills(name)` freezes a scene at the start of each shot and at
  its end, and saves a PNG of each. Called with no name, it uses the scene
  playing now, which is how to export a scene that needs staging:
  `__game.stageHallwayReveal(); await __game.exportStills()`.
  Use the stills as the first and last frames for an image-to-video model
  (Kling, Veo 3.1 and Seedance take both).
- `__game.exportTurnaround('creature')` (or `'player'`) renders the figure from
  the front, three-quarter, side and back on flat grey: a character reference
  sheet.
- `__game.recordScene(nameOrFunction, { tail })` records a scene to webm while
  it plays. The reveal is `__game.recordScene(() => __game.stageHallwayReveal(), { tail: 3 })`.
  Use the recording as the input to a video-to-video restyle (Runway Aleph or
  Act-Two, Wan VACE, Luma Modify). Those keep the game's motion and framing,
  which come from the real models, and only repaint the surface.

### Putting a clip in the game

Save it as `src/assets/video/<feedId>.webm` (or `.mp4`). The feed ids are
`kitchen`, `hallway`, `porch`, `study` and `basement`; any other name is
ignored. That feed then plays the clip instead of its drawing, through the
same phosphor palette, with the camera label, clock, power veil, scripted
figures and grain still drawn on top. No folder or no file means the feeds are
drawn exactly as before.

- Keep clips dark and mid-grey. Pure black hides the drawn figure silhouettes.
- They are cropped to fill 4:3, so a 16:9 clip loses its sides.
- Aim for 8 seconds or less and under 1 MB each. The feed is 320x240, so
  nothing is gained above that resolution.

### Before an AI clip ships

- The credits (`CREDITS` in `main.js`) and the README say the game ships no
  image assets. A clip makes that untrue: change both, and credit the tool.
- Check whether the COMS3006A brief allows AI-generated media.
