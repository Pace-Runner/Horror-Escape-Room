# World Design -- "Don't Let It Out"

This document explains how the current world maps to the storyline in
`Storyline Overview.pdf`, and the reasoning behind the scenegraph
hierarchy each level uses. It exists mainly to answer the brief's
requirement: *"you should be able to explain why a given object is a
child of another."*

## Scope of this pass

This is the **world foundation**, not the finished game. It delivers:

- A fully modelled, atmospheric **Level 1 bedroom**, matching the
  storyline beat for beat (chained wake-up, storm lighting, blown
  bulb, flashlight, scratched message, boarded door, polaroid).
- Light **environment blockouts** for **Level 2** (hallway + basement
  lab) and **Level 3** (study), so the whole house already exists and
  is navigable, dressed, and lit in the right mood.
- First-person movement and look (WASD + mouse, pointer-locked) with
  simple collision against walls and furniture.
- A raycast "examine" interaction system, already wired to every prop
  called out in the storyline, so props can be looked at and read
  before their puzzle logic exists.
- One custom GLSL shader (the basement CCTV monitor's static).
- Procedural textures and synthesised audio, so the only binary assets
  to path or credit are the Blender-authored `.glb` models and one
  breathing loop (`src/assets/audio/breathing.m4a`, which the game also
  runs without).

What is **not** yet built: the power-restore puzzle, the camera-feed
minigame, the three-lock sequence, the visor mechanic, the creature AI,
and the branching ending. Each level's file has a short header comment
flagging exactly what is still a blockout.

## Why each hierarchy decision was made

### Level 1 -- Bedroom (`src/levels/bedroomLevel.js`)

- **Ceiling light fixture**: the bulb mesh, its light, and the cord
  mesh are all children of a single `ceilingAnchor` Object3D. In
  reality the bulb *hangs from* the cord, which is *fixed to* the
  ceiling -- so the physical dependency is cord → ceiling, bulb →
  cord. Modelling it as one anchor with two children means moving or
  swapping the fixture later only touches one transform.
- **Chain + handcuff**: children of the bed's `headboardPost` mesh,
  not of the room. The chain is bolted to the bed frame in the story,
  so if the bed were ever repositioned (or animated swinging as the
  player struggles) the chain has to follow it automatically.
- **Boarded planks + polaroid**: children of the `doorFrame` group,
  specifically *not* of the door slab. The storyline places the
  polaroid "stuck to the door frame" and the planks nailed across the
  frame -- both stay fixed even if the slab itself is later animated
  open, because they were never attached to the slab.
- **Dresser drawers**: children of the dresser body, each offset in
  local space to read as "left half-open". This keeps the "abandoned
  in a hurry" pose defined once, relative to the dresser, rather than
  as three independent world-space props that would drift out of sync
  if the dresser ever moved.
- **Window**: the back wall is built from four slabs that leave a real
  rectangular gap, with the window frame/glass group placed in that
  gap -- not a solid wall with a window texture glued on top. A solid
  wall there would depth-occlude the rain particles sitting just
  outside it, so the "glass" would never actually show anything
  through it.

### Level 2 -- Hallway & Basement (`src/levels/hallwayBasementLevel.js`)

- **CCTV monitor + screen glow light**: children of the `desk` group.
  The monitor sits on the desk as one physical prop; moving the desk
  should move the monitor and its light with it.
- **Fluorescent tubes**: children of a dedicated `fixturesGroup`, kept
  separate from the rest of the lab so the whole light strip's
  material or position can be changed in one place without touching
  unrelated basement geometry.

### The backrooms corridor (`src/levels/backroomsLevel.js`)

Not a numbered level -- it is the one space every level-to-level
crossing passes through, and the reason `main.js` now owns a
`TRANSITIONS` table instead of each level hardcoding where its own door
leads. A level's exit callback says only `exitLevel('bedroom')`; the
table decides that this means "through the corridor, then to Level 2".

- **One instance, re-armed per crossing.** `setRoute()` sets the
  destination *and* re-arms the exit door's one-shot guard, so
  "configure for this crossing" and "reset for reuse" are the same
  call -- there is no second thing to remember and no way to make the
  level visible unarmed. A second instance per route would leave a
  duplicate set of geometry, lights and textures resident forever
  (every level here is built at boot and never destroyed) for a
  corridor only one of which can ever be on screen.
- **No intermediate offset groups.** Everything is a direct child of
  the level group, so level space *is* world space and every collider
  number is literally the number that placed the mesh. Level 2 has to
  write `LAB_Z + z` by hand in each of its colliders; with 26 of them
  here that would have been the main source of bugs.
- **One `WALL_RUNS` table generates both the wall meshes and their
  colliders.** Elsewhere in this project a wall plane and its AABB are
  two independent literals that happen to agree. Here they cannot
  drift, because they come from the same four numbers.
- **The yellow lives in the albedo, not the lights**, so a lit pool
  reads as backrooms yellow while the identical material in an unlit
  gap falls to murky olive. That is why this level runs an ambient of
  0.14 where every other room uses 0.37-0.43: its wallpaper is roughly
  2.7x brighter than the Level 2 plaster, so the usual value would
  flatten the dark gaps into flat mustard.
- **Every branch dead-ends, deliberately.** Nine of them now, in four
  shapes: a straight dark stub, a false continuation, bends that fold
  back on themselves, a fork whose both prongs terminate, and one branch
  hanging off another branch's wall. The point is that no path is ever a
  shortcut -- the exit door is the only way on, so exploring can cost
  you time but never progress.
- **One `WALL_RUNS` table generates every wall mesh AND its collider**,
  and every run terminates at the outer face of the perpendicular slab
  it meets, so corners always overlap. A seam here would not show black
  void: the floor and ceiling are single quads spanning the whole
  bounding box, so a gap shows a lit carpeted room the player can walk
  into and then straight off the edge of the world.
- **Decal placement is checked against that same table** at build time
  (`wallBehind`). The corridor's side walls are broken wherever a branch
  opens off, so a decal placed at one of those gaps hangs in mid-air --
  which is exactly what happened to three of them, and to two more the
  moment the maze was expanded. It is a console warning now rather than
  something you find by walking into it.
- **The exit reuses `door.glb`** -- a domestic wooden house door at the
  end of a mono-yellow corridor is wrong in the right way, and it
  visually rhymes with the bedroom door the player already came
  through. Its Blender material bakes a very dark `baseColorFactor`,
  and since a `MeshStandardMaterial` renders `map * color`, the wood
  texture had to be released from that multiply or the door rendered as
  a black rectangle against the bright walls.
- **The entry is not a locked door** -- a locked door implies a key
  exists. It is the *shape* of a door with the wallpaper running
  straight across it, no frame and no handle, and two sets of claw
  marks where someone before you tried.

### Level 3 -- Study (`src/levels/studyLevel.js`)

- **Three door locks**: children of the front door group itself (the
  slab), not the frame. Each lock is mounted directly to the door and
  needs to move with it if the door is ever animated swinging open --
  unlike Level 1's planks/polaroid, which deliberately stay with the
  frame instead.

## Lighting & atmosphere notes

- `src/world/Storm.js` drives two lights: an unstable warm point light
  for the "dim yellow" bulb (random flicker/dip), and a cold blue
  directional light that flashes on an irregular timer to read as
  lightning through the window. `Storm.blowBulb()` is called from the
  Level 1 intro script once the player frees themselves, per the
  story beat where the bulb blows right after standing up.
- `src/world/Rain.js` is a small recycled-particle system sitting just
  outside the bedroom window.
- `src/world/AudioEngine.js` synthesises a low wind drone, a thunder
  hit (fired every lightning flash), and a creak/footstep cue -- all
  generated with the Web Audio API rather than loaded from files. The
  one loaded sound is the breathing loop, on its own gain node, played
  through a looping `AudioBufferSourceNode` (the only reliably gapless
  option) inside a measured `loopStart`/`loopEnd` window. It runs for
  the whole session once audio is unlocked; only its intensity answers
  to the story beats. See the README for the loop-window numbers and
  what happens when the file is missing.
- `src/world/StaticScreenMaterial.js` is a custom `ShaderMaterial`
  (hand-written vertex + fragment stages, not a built-in material)
  used on the basement CCTV monitor. `uTime` is advanced every frame
  from the render loop so the static is animated rather than a frozen
  texture -- see the grading brief's shader requirement.

## Controls (current build)

- `WASD` / arrow keys -- move (disabled during the opening chained
  beat in Level 1, until the paperclip is used)
- Mouse -- look (pointer-locked)
- `E` -- interact with whatever the crosshair is over
- `F` -- toggle the flashlight, once found
- `1` / `2` / `3` -- jump directly to the bedroom / hallway+basement /
  study, for quickly showing a mentor the whole house. Deliberately
  instant rather than faded, and each aborts any transition already in
  flight so a jump taken mid-fade cannot strand the player behind a
  black overlay
- `4` -- jump into the backrooms corridor, routed off the level you
  are currently in
- `R` -- restart the game state without reloading the page
- `C` -- open/close the credits screen
