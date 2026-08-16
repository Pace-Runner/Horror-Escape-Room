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

This is the **world foundation** -- the house exists and is navigable
in first person, but the puzzle logic and creature AI are not built
yet. See `docs/WORLD_DESIGN.md` for the full breakdown and the
reasoning behind the scenegraph hierarchy.

- **Level 1 -- the bedroom**: fully modelled and atmospheric. Storm
  lighting (flickering bulb + lightning through the window), rain,
  boarded/locked door with a polaroid stuck to the frame, a bed with a
  chain and cuff, a dresser with half-open drawers, scattered family
  photos, the "Don't let it out" message scratched into the floor, and
  a pickable flashlight. The opening beat (chained → free the cuff
  with the paperclip → stand → bulb blows) is scripted.
- **Level 2 -- hallway + basement lab (blockout)**: navigable and
  dressed (pipes, generators, fuse box, shelves, flickering
  fluorescents, a retro CCTV monitor running a custom static shader),
  but the power-restore puzzle and camera-feed minigame aren't wired
  up yet.
- **Level 3 -- study (blockout)**: navigable and dressed (desk,
  bookshelves, the family portrait, the one uncracked mirror, the
  three-lock front door), but the lock sequence, visor mechanic and
  branching ending aren't implemented yet.
- First-person WASD + mouse look, pointer-locked, with simple
  wall/furniture collision.
- A raycast "examine" system (`E`) already wired to every story prop.
- Restart without reloading the page (`R`), a credits screen (`C`),
  and a loading screen.
- `1` / `2` / `3` jump straight to each level, for quickly showing the
  whole house to a mentor before the level-to-level progression exists.

## Project layout

- `src/main.js` -- entry point: renderer/camera/scene setup, HUD
  wiring, level activation, restart, credits, render loop.
- `src/core/` -- reusable engine bits (pointer-lock player + collision,
  the interaction raycaster, the level/scene manager).
- `src/levels/` -- one file per level, each returning its group,
  interactable list, colliders and spawn point.
- `src/world/` -- procedural textures, the storm/rain/audio systems,
  and the custom CCTV static shader.
- `docs/WORLD_DESIGN.md` -- story-to-hierarchy mapping and design notes.

## No external assets

Every texture is generated on `<canvas>` at runtime and every sound is
synthesised with the Web Audio API -- there are no image or audio
files to path, credit, or break on a case-sensitive server. Three.js
and its `PointerLockControls` example module are the only third-party
code, credited in-game via the credits screen (`C`).

## Deploying to the LAMP server

`vite.config.js` already sets `base: './'` so a production build's
asset URLs stay relative. Build and test locally before uploading:

```
npm run build
npx serve dist
```

Then zip the *contents* of `dist/` (so `index.html` sits at the top
level of the archive) and upload via Moodle, per the project brief.
