# Don't Let It Out

A Three.js horror escape room built for COMS3006A/COMS3025A (Computer
Graphics and Visualisation). See `Storyline Overview.pdf` for the full
story this world is built from.

## Run

```
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173/).

## What's here right now

The house exists and is navigable in first person. Levels 1 and 2 are
playable end to end; Level 3's lock sequence, the visor mechanic, the
creature AI and the branching ending are still to come. See
`docs/WORLD_DESIGN.md` for the full breakdown and the reasoning behind
the scenegraph hierarchy.

- **Level 1 -- the bedroom**: fully modelled and atmospheric. Storm
  lighting (flickering bulb + lightning through the window), rain,
  boarded/locked door with a polaroid stuck to the frame, a bed with a
  chain and cuff, a dresser with half-open drawers, scattered family
  photos, the "Don't let it out" message scratched into the floor, and
  a pickable flashlight. The opening beat (chained → free the cuff
  with the paperclip → stand → bulb blows) is scripted.
- **Level 2 -- hallway + basement lab**: navigable and dressed (pipes,
  generator, fuse box, breaker panel, shelves, flickering fluorescents,
  a retro CCTV monitor running a custom static shader), and the
  **power chain is fully playable**: find the 30A fuse among four to
  light the lab and wake the cameras, go for the metal door and have
  someone throw the main on you, restart the generator in the right
  order, then route the breaker panel's 60A across the circuits that
  actually matter. Lights, CCTV and the door bolts all come back
  together. The cameras are then load-bearing rather than a cutscene:
  the metal door holds behind a security code hidden in the panelling of
  the study's front door, countable only through camera four. See
  `docs/LEVEL2_POWER_CHAIN.md` for the full breakdown.
- **Level 3 -- study (blockout)**: navigable and dressed (desk,
  bookshelves, the family portrait, the one uncracked mirror, the
  three-lock front door), but the lock sequence, visor mechanic and
  branching ending aren't implemented yet.
- **The backrooms corridor -- the space between levels**: leaving a
  level no longer cuts straight to the next one. The screen fades to
  black and you come up in a short, wrong-feeling yellow corridor --
  damp wallpaper, a drop ceiling, mostly-dead fluorescents -- and it
  is a warren, unguided. The route turns seven times, and each turn is a
  T-junction where carrying straight on is the mistake; several decoys
  fork, so a wrong turn can offer a choice of its own and one dead end
  sits two wrong turns deep. But the corridor graph is a tree, so every
  wrong turn is a guaranteed dead end rather than a shortcut. About
  54 m, roughly 27 seconds if you never take one. Nothing marks the
  route -- no arrows, no signage -- so it is found (or lost) on sight
  alone. The way you came in has wallpaper running straight across it.
- **A radar-style mini-map**, top-right of the HUD: a live top-down view
  centred on the player, showing nearby geometry and a facing arrow. It
  is lit by its own private light rather than the room's actual (and
  often near-black) lighting, so it stays readable everywhere without
  touching a single level's tuned brightness -- see the `MINIMAP_LAYER`
  note in `src/main.js`.
- **An inventory HUD**, bottom-left: lists whatever story items are
  currently carried (flashlight, crowbar, visor, keys), added and
  removed at the same points the story already picks them up or spends
  them. See `ITEMS` in `src/core/GameState.js`.
- First-person WASD + mouse look, pointer-locked, with simple
  wall/furniture collision. The look asks for **raw** mouse input
  (`unadjustedMovement`) so the OS pointer-acceleration curve is not
  applied on top, and is smoothed on the frame clock rather than being
  written straight from the mouse event -- see the header comment in
  `src/core/PointerLockPlayer.js` for why both matter.
- A raycast "examine" system (`E`) already wired to every story prop.
- Restart without reloading the page (`R`), a credits screen (`C`),
  and a loading screen.
- `1` / `2` / `3` jump straight to each level, and `4` drops you into
  the backrooms corridor routed off wherever you currently are -- for
  quickly showing the whole house to a mentor. They are deliberately
  instant rather than faded.

## Project layout

- `src/main.js` -- entry point: renderer/camera/scene setup, HUD
  wiring, level activation, restart, credits, render loop.
- `src/core/` -- reusable engine bits (pointer-lock player + collision,
  the interaction raycaster, the level/scene manager, the transition
  fade).
- `src/levels/` -- one file per level, each returning its group,
  interactable list, colliders and spawn point. `backroomsLevel.js` is
  the interstitial rather than a numbered level: one instance, armed
  with a destination by `setRoute()` before each crossing.
- `src/world/` -- procedural textures, the storm/rain/audio systems,
  and the custom CCTV static shader.
- `docs/WORLD_DESIGN.md` -- story-to-hierarchy mapping and design notes.

## Assets

Every texture is generated on `<canvas>` at runtime, so there are no
image files to path, credit, or break on a case-sensitive server. Wind,
thunder and creaks are synthesised with the Web Audio API. The models
(bed, dresser, door, flashlight, hands) are Blender-authored `.glb`
files in `src/assets/models/`, imported as `?url` so Vite hashes them
and rewrites the path for the subdirectory deploy. Three.js and its
`PointerLockControls` example module are the only third-party code,
credited in-game via the credits screen (`C`).

### The breathing loop -- the one audio file

`src/assets/audio/breathing.m4a` (AAC-LC, 48 kHz, 61.2 s) is the only
audio file in the project. It loops continuously from the moment audio
is unlocked on the start screen until the tab closes, on its own gain
node, and survives a restart (`R`) without a gap or a second copy
stacking on top.

The loader globs `breathing.*`, so re-exporting as `.mp3`, `.ogg` or
`.wav` needs no code change -- and if the file is missing entirely the
game still runs, warning once to the console. `AudioEngine` deliberately
does not `import` it directly, so a build never fails over a missing
asset.

Two things worth knowing about the file as it stands: at 1.5 MB (48 kHz
stereo, 192 kbps) it is the largest single asset in the build, and its
two channels are bit-identical, so a mono re-export at ~96 kbps would be
roughly a quarter of the size with nothing audible lost. And AAC decodes
in Chrome, Edge and Safari, and in Firefox on Windows and macOS via the
platform decoders -- an `.ogg` or `.wav` export is the safer choice if a
Linux Firefox without system codecs ever has to play it.

Two things to know if the recording is ever replaced:

- `BREATH_LOOP_START` / `BREATH_LOOP_END` at the top of
  `src/world/AudioEngine.js` are the loop window in seconds, currently
  `3.69` -> `59.7`. They are measured off *this* recording: they cut a
  handling thump at 1.39 s and a fading tail, and land on the quiet gaps
  between breaths so the seam is inaudible. A different file needs a
  different window (or `0` / `0` to loop the whole buffer, if it has
  already been trimmed to a clean loop -- whole number of breath cycles,
  zero crossings at both ends, no lead-in silence).
- `BREATH_MAKEUP` in the same file compensates for how quiet the
  recording is (peak -23.7 dBFS); re-measure it for a louder file.

The track is credited in-game: fill in the placeholder breathing-loop
line in the `CREDITS` array in `src/main.js` with its source, author and
licence (or delete that line if the team recorded it themselves).

## Deploying to the LAMP server

`vite.config.js` already sets `base: './'` so a production build's
asset URLs stay relative. Build and test locally before uploading:

```
npm run build
npx serve dist
```

Then zip the *contents* of `dist/` (so `index.html` sits at the top
level of the archive) and upload via Moodle, per the project brief.
