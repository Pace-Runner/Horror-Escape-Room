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

The house is fully navigable in first person and the story's puzzle
logic is built end to end, from the opening chained beat through both
endings. See `docs/WORLD_DESIGN.md` for the full breakdown and the
reasoning behind the scenegraph hierarchy.

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
- **Level 3 -- study**: navigable and dressed (desk, bookshelves, the
  family portrait, the one uncracked mirror, the three-lock front
  door). The three-lock sequence (keyed deadbolt, combination pin-pad,
  and a containment lock gated on the visor), the visor mechanic, and
  the branching ending (release or contain) are all implemented. The
  mirror is a real-time planar reflection (`src/world/HauntedMirror.js`,
  three's `Reflector` with our own shader) that only comes alive once the
  last cupboard's letter has been read: it fades in, swims, then settles,
  and shows the player's own body standing in the room.
- **The bedroom and the upstairs hallway are one space**: the hallway is
  built onto the bedroom's door, so when it opens there is no fade or load
  -- you walk through, the door shuts behind you, and the thing is already
  standing at the end of the hall.
- **The backrooms corridor -- the space between levels**: leaving a
  level no longer cuts straight to the next one. The screen fades to
  black and you come up in a short, wrong-feeling yellow corridor --
  damp wallpaper, a drop ceiling, mostly-dead fluorescents -- and it
  is a warren, unguided. The layout is the team's own 10 x 10 grid maze,
  transcribed wall by wall into `GRID` in `src/levels/backroomsMaze.js`
  (6.4 m per cell), with five larger rooms; the two inside the maze have
  a door frame to come in by and another to leave by. It is crossed
  twice: down the upstairs hallway's stairs (a fall, and you come round on
  the carpet), out to Level 2; then from Level 2, out to Level 3. Every
  crossing is drawn fresh: you come round at a random dead end, the way out
  is a door in a random room at least 80 m away on foot, and on the second
  crossing the monster starts at least 45 m away. Nothing marks the route --
  no arrows, no signage -- so it is found (or lost) on sight alone. The way
  you came in has wallpaper running straight across it. Annabelle's four
  rooms are safe: the monster cannot follow you in, and it roars when you
  get there first. `npm run check:maze` validates the layout and every
  spawn and exit spot.
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
- **Hints in Level 1** (H): a hint for whichever bedroom puzzle the
  player is on, vaguer first and more direct on each press, and a
  one-time "press H" offer after 90 s stuck on one puzzle. The bedside
  lamp can also be examined, which points at its flickering code. See
  `src/core/HintSystem.js` and `src/levels/bedroomHints.js`; the wording
  is in `src/dialogue/level1_bedroom.js`.
- First-person WASD + mouse look, pointer-locked, with simple
  wall/furniture collision. The look asks for **raw** mouse input
  (`unadjustedMovement`) so the OS pointer-acceleration curve is not
  applied on top, and is smoothed on the frame clock rather than being
  written straight from the mouse event -- see the header comment in
  `src/core/PointerLockPlayer.js` for why both matter.
- A raycast "examine" system (`E`) already wired to every story prop.
- Restart without reloading the page (`R`), a credits screen (`K`),
  and a loading screen.
- **Difficulty** gives every room its own clock: Easy 30 minutes,
  Medium 15, Hard 8 (`src/core/Difficulty.js`). Run out and the run ends.
- **Settings**, from the main menu or the pause screen: volume, mouse
  sensitivity, captions, **brightness** (100% is the light the levels were
  tuned to), **graphics quality** (Low / Medium / High: resolution,
  antialiasing and the mirror's resolution, `src/core/GraphicsQuality.js`)
  and a **frame-rate counter** (`src/core/FrameRateCounter.js`). Saved in
  localStorage.
- `1` / `2` / `3` jump straight to each level, and `4` drops you into
  the backrooms corridor routed off wherever you currently are -- for
  quickly showing the whole house to a mentor. They are deliberately
  instant rather than faded.
- **Cutscenes**, filmed in-engine with the game's own models and lights
  through a camera of their own: shots, cuts, lens moves, letterbox and
  per-frame acting, frozen by Esc like everything else. The first is the
  hallway reveal, when the bedroom door opens on the thing at the end of
  the hall. Shots are directed with the free camera (`N`, then `M` to mark
  a framing, `J` to record a move). See `docs/CUTSCENES.md`, which also
  covers getting references out of the game for AI video and playing a
  clip on the CCTV monitor.

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

Many textures are generated on `<canvas>` at runtime; the rest are image
files in `src/assets/textures/` (photographed materials from ambientCG and
Texture Labs, plus textures made for the project). Who made what, and under
which licence, is on the in-game credits screen (`CREDIT_SECTIONS` in
`src/main.js`). Wind,
thunder and creaks are synthesised with the Web Audio API; everything that
is a performance rather than a signal (breathing, footsteps, doors, the
monster) is a recording -- see Audio below. The models
(bed, dresser, door, flashlight, hands) are Blender-authored `.glb`
files in `src/assets/models/`, imported as `?url` so Vite hashes them
and rewrites the path for the subdirectory deploy. Three.js and its
`PointerLockControls` example module are the only third-party code,
credited in-game via the credits screen (`C`).

### Audio

Every recording lives in `src/assets/audio/`: the breathing loop, the
player's footsteps and the trolley at the top level, and the audio
director's cues -- doors, the lockbox, candles, the CRT's static, the rain
bed, distant laughter, the monster's breathing, footsteps and stalking aura,
and the caught sting -- in `amb/`, `sfx/`, `monster/` and `foley/`.

- **How it works, where each cue plays, how to retune or swap one, and a
  listening checklist:** [docs/AUDIO.md](docs/AUDIO.md).
- **Where each file came from, its licence, and the cut used:**
  [src/assets/audio/SOURCES.md](src/assets/audio/SOURCES.md). Several are
  marked *licence unverified* -- read that before a public release.
- **Rebuilding them:** `node scripts/audio/build.mjs` (needs `ffmpeg` and
  `yt-dlp`; the processed files are committed, so nobody else needs either).
  `npm run check:audio` checks the files against the measured
  `manifest.json` without any tools.

Every file is loaded through a glob, never imported, so a missing one is a
silent cue and a console line, never a failed build. The breathing loop runs
for the whole session, on its own gain node, and survives a restart (`R`)
without a gap; its loop window and makeup gain are measured off the file and
explained at the top of `src/world/AudioEngine.js`. AAC decodes in Chrome,
Edge and Safari, and in Firefox on Windows and macOS via the platform
decoders -- `.ogg` is the safer export if a Linux Firefox without system
codecs ever has to play them.

### Keeping the download small

Textures ship as WebP, not PNG: `npm run compress:assets`
(`scripts/compress-assets.mjs`) re-encodes the images inside every model in
`src/assets/models/` and writes a `.webp` beside each PNG the code uses,
pointing the import at it. Every image is measured against its original and
kept only if it looks the same (see the script's header). This took the build
from 163 MB to about 62 MB.

**Run it after re-exporting any model from Blender, or regenerating a
texture** -- an export comes out with PNGs again. CI runs
`npm run check:assets` and fails the deploy, naming the files, if you forget.

## Deploying to the LAMP server

`vite.config.js` already sets `base: './'` so a production build's
asset URLs stay relative. Build and test locally before uploading:

```
npm run build
npx serve dist
```

Then zip the *contents* of `dist/` (so `index.html` sits at the top
level of the archive) and upload via Moodle, per the project brief.
