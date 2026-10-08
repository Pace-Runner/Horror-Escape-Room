# World Design -- "Don't Let It Out"

This document explains how the current world maps to the storyline in
`Storyline Overview.pdf`, and the reasoning behind the scenegraph
hierarchy each level uses. It exists mainly to answer the brief's
requirement: *"you should be able to explain why a given object is a
child of another."*

## Scope of this pass

The full story is built, from the opening chained beat through both
endings. It delivers:

- A fully modelled, atmospheric **Level 1 bedroom**, matching the
  storyline beat for beat (chained wake-up, storm lighting, blown
  bulb, flashlight, scratched message, boarded door, polaroid).
- A dressed, puzzle-complete **Level 2** (hallway + basement lab): the
  power-restore puzzle (fuse box) and the CCTV camera-feed minigame,
  both wired up and gating the locked basement door.
- A dressed, puzzle-complete **Level 3** (study): the three-lock front
  door sequence, the visor mechanic, and the branching ending
  (release or contain).
- An unguided **backrooms maze** between levels -- see its own section
  below.
- First-person movement and look (WASD + mouse, pointer-locked), with
  sprint/stamina, crouch, and collision against walls and furniture.
- A raycast "examine" interaction system wired to every prop called
  out in the storyline.
- A fog-of-war overview minimap for the backrooms, and a radar-style
  follow minimap everywhere else.
- One custom GLSL shader (the basement CCTV monitor's static).
- Procedural textures and synthesised audio, so the binary assets are
  few enough to list: the `.glb` models and the audio clips. All but one
  model is generated from a script in `blender/` and needs no credit.
  The exception is `hands.glb`, which is third-party (`First Person hands
  rigged` by davidfischer, Sketchfab, **CC BY 4.0**) and therefore DOES
  need attribution -- it is in the `CREDITS` array in `main.js`, and it
  must stay there for as long as the asset does.

**Level 2's power-restore puzzle is built in full** -- fuse,
blackout, generator restart and breaker panel, documented separately in
`docs/LEVEL2_POWER_CHAIN.md`.

Levels 1 and 2's creature appearances (CCTV sightings, the hallway flash, the
corner reveal) stay scripted set-pieces on purpose -- the player is placed to
be shown the thing, and a script guarantees they see it. `src/systems/CreatureAI.js`'s
patrol/watch/flee/block state machine takes over once the letter is read in
Level 3: she guards the front doorway while staying out of reach, and being
caught fades to black and sends the player back to the study's own spawn
point rather than ending the game -- see the `onCaught` handler in `main.js`
and CreatureAI.js's own header for why a kill would break the story.

### The creature is now a model, and why that is still one body

> **Update:** the generated `creature.glb` and `Creature.js` have since been
> replaced everywhere by the imported Okabe model (`src/systems/OkabeCreature.js`,
> `okabe.glb`), which uses the same one-body/one-shape-key idea with a
> `Monster` shape key. The history below is kept for the reasoning.

`src/systems/Creature.js` used to build the figure out of capsules and boxes,
and its header argued at length that it should never become a `.glb`: two
models would have to be SWAPPED, and a swap is a cut -- the player would see
one thing replaced by another, which says "the game changed what is there",
where lerping says "you are seeing it correctly now".

That argument was right about the principle and wrong about the mechanism, and
the file now loads `src/assets/models/creature.glb`. There is still exactly one
body. The Hollow is a **shape key** -- a per-vertex delta on the same mesh, the
same skeleton, the same UVs -- so "both readings are the same body" is true by
construction rather than asserted across two files. What changed is that a rig
made of capsules cannot wear a lab coat, and the coat turned out to be the
design:

- in the **human** reading the hem runs 0.648-0.700 m and the fingertips sit at
  0.707, so the hands are at pocket height and the arms vanish into one clean
  column;
- in the **Hollow** reading the torso grows, the hem rides up to 0.709-0.769,
  and the arms grow so the fingertips fall to 0.419.

The hands end up hanging **29 cm** clear of the hem's lowest point -- 35 cm
clear of its highest -- on a coat that has become a short jacket.

**The hem is a RANGE now, and the numbers above are not the ones this section
first carried.** It used to quote a single hem height and a 24 cm gap. Two
later passes moved both: the hem was a dead-flat horizontal cut in profile
until `HEM_SWEEP` gave it 52 mm of uneven hang, so there is no one hem height
to quote; and the fingertips fell another 112 mm once the monster's fingers
were curled into a claw rather than left pointing, which is the change that
stopped the hand reading as a garden fork. Both figures are re-measured on the
posed rig rather than estimated -- the Hollow's hem rides up because the BONES
lift the hips, not because the shape key touches it, so a measurement taken
from the key alone reports the two readings as identical.

The coat is a ruler the viewer measures the distortion against, which is a far
stronger cue than long arms on a bare body -- a bare arm has nothing to be long
relative to.

**The work is split by what each tool can physically do.** Bones move the
JOINTS; the shape key stretches and thins the FLESH. That division is not a
style choice: in a skinned mesh, moving a child bone moves only the vertices
weighted to that child, so lengthening the forearm by moving the hand bone
leaves a 0.27 m forearm with its hand floating 0.17 m past the end of it. Both
halves are driven from the one `setCorrection` dial and read off the one
HUMAN/HOLLOW table, so a half-corrected figure is a coherent in-between.

The capsule rig is still in the file as the fallback: `main.js` places the
creature synchronously during scripted beats, and a 350 KB asset arrives
whenever it arrives.

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
- **Generator controls and breaker toggles**: added to the `lab` group
  directly and pushed into `interactables` *individually*, deliberately
  **not** parented under their generator / panel mesh. This is the one
  place the "child of the thing it sits on" rule is broken on purpose:
  `Interaction` raycasts non-recursively
  (`intersectObjects(this.targets, false)`), so a parent group with
  children would never register a hit. Same constraint as the CCTV
  remote's five buttons.

The level's power puzzle -- fuse, blackout, generator, breaker panel --
has its own reference: `docs/LEVEL2_POWER_CHAIN.md`.

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
- **The layout is a list of corridor rectangles, and the walls are
  derived from it.** `CORRIDORS` is the only description of the maze;
  `buildWallRuns()` sweeps a grid over their union and emits a wall
  wherever an inside cell meets an outside one. The level used to
  hand-author 52 wall runs and cut each branch mouth as a manually
  computed gap in one of them, which is what put three decals in mid-air
  and two more the moment the walls moved. Editing the maze is now
  editing eight numbers.
- **Every junction must be DECLARED, and that is asserted at boot.**
  This used to read "the graph must be a tree", and the reasoning was
  sound: an undeclared junction means some dead end quietly rejoins the
  route. What changed is that there are now three ways to reach the one
  exit, so some dead ends rejoin the route *on purpose* -- `d4a` runs the
  last 3.2 m it used to stop short of, and `d2c` runs 4.8 m further north,
  which turns the two longest punishments in the maze into the second and
  third routes through. Those joins are declared in a `links` field, so
  an UNDECLARED overlap is still exactly as wrong as it ever was. The
  parent pointers are still a spanning tree over every corridor, which is
  what the primary (lamp-lit) route is still derived from; `links` are
  extra edges on top of it.
- **"More than one way through" is checked as a property, not counted.**
  Counting loops cannot fail usefully -- every declared link adds one by
  construction whether or not it goes anywhere near the exit. The
  validator instead deletes each route corridor in turn and asks whether
  the exit is still reachable; six of the eleven are. Break a link and
  the corridors all still validate perfectly, because the maze is simply
  a tree again -- that check is the only thing that notices.
- **Three rooms, 6.4 x 8.0, entered through a 1.4 m neck.** Empty on
  purpose: no door, no pickup, no beat. They exist for scale, because
  every other space in the level is 3.2 m across. The neck is what makes
  the entrance a *doorway* -- hung straight off a corridor, a room's whole
  near side is the opening, since the wall builder walls the boundary of
  the corridor union and there is no boundary where two rects overlap.
  The neck pierces the 1.6 m wall between them and leaves a 1.1 m gap;
  `backroomsLevel` drops a soffit over it for the top edge. Their
  positions were *searched* rather than chosen -- at that size exactly
  three sites in the whole maze clear MIN_WALL on all four sides.
- **A seam would not show black void.** The floor and ceiling are single
  quads spanning the whole bounding box, so a gap shows the lit carpeted
  room next door, which the player can walk into and then straight off
  the edge of the world. Hence the T/2 padding on every generated run.
- **Decal placement is checked against that same table** at build time
  (`wallBehind`). The corridor's side walls are broken wherever a branch
  opens off, so a decal placed at one of those gaps hangs in mid-air --
  which is exactly what happened to three of them, and to two more the
  moment the maze was expanded. It is a console warning now rather than
  something you find by walking into it.
- **The ceiling fixtures are one shared troffer, not a box.** A
  surface-mounted pan that flares out toward its opening, two
  cylindrical tubes with the electrode ends blackened by however worn
  that fixture is, four lampholders, a ballast cover, and -- on about
  three in five -- a prismatic lens with dead insects piled behind it.
  The insects are the point: they are only visible as silhouettes while
  the fixture is lit, and they are what make a ceiling light read as
  abandoned rather than merely old. All forty-three share one merged
  geometry and turn a quarter turn for the corridors running the other
  way, so a dozen boxes per fixture still costs one buffer. The pan
  hangs *below* the grid because the ceiling is one unbroken plane:
  anything modelled above it is behind an opaque surface and is never
  seen.
- **The lit fixtures carry an additive glare sprite.** There is no
  bloom in the post chain, so an emissive tube clamps at white and
  stops; without the sprite every lit fixture was exactly as bright as
  its own texture and read as light painted onto a ceiling. It is
  billboarded rather than a quad under the fixture, which would
  foreshorten to nothing at exactly the angle the player spends most of
  their time at. Tube, lens and halo are all driven off the same
  flicker value, because three surfaces disagreeing about how lit one
  fixture is read as three objects.
- **Puddles are a depth field, not a shape.** One greyscale mask per
  pattern produces the colour, alpha, roughness and normal maps
  together, so they cannot disagree about where the water is. The
  roughness map is what sells it -- a glossy middle inside a matte damp
  fringe, lit by a torch that moves -- because with no environment map
  in the scene, the near-black near-mirror this obviously wants to be
  renders as a hole cut in the floor. Eight patterns, each a different
  answer to *why there is water here* (pool, spill, seep, drips, tide
  ring, wall streak, drag smear, and a live one still being dripped
  into) rather than one outline stretched eight ways.
- **The leak under the fallen tile is the one thing that moves on its
  own.** A drop falls from the hole in the grid into the puddle below
  it on a loop, on a quadratic so it accelerates. It also answers the
  fallen ceiling tile: water came through here, which is why the tile
  is on the floor.
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

- **Three door locks**: children of the `frontDoor` group, so they stay
  seated in the frame while the slab swings on its hinge -- unlike
  Level 1's planks/polaroid, which deliberately stay with the frame for
  the same reason.

  They sit at local **z = -0.05**, on the study side. They used to be at
  +0.05, the porch side, which broke them twice for a player standing in
  the room: the slab (z -0.035..+0.035) hid them completely, and
  `frontDoorSlabHit` -- an invisible 0.2 m deep box reaching forward to
  z = -0.05 -- was always the nearer raycast hit, so aiming at a lock
  gave the prompt "The front door". The three locks the level is built
  around were neither visible nor clickable from inside the study.
- **The door panels**: children of the door SLAB rather than of
  `frontDoor`, the one place these two part company. The panels are the
  door and swing with it; the locks are bolts in the frame and do not.
  Their counts come from `src/world/doorPanels.js`, shared with the
  Level 2 camera feed the player reads the security code off -- see
  `docs/LEVEL2_POWER_CHAIN.md`.

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
