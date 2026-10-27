# Don't Let It Out — project context for Claude

A first-person Three.js (r169) + Vite horror escape room. It's a university group project (COMS3006A/3025A, Computer Graphics). The team is Kiran (owner), Daniel Passos, Owen and Sanele. Read this first. Read only the files the task needs. The big ones (`src/main.js` ~6k lines, `src/levels/studyLevel.js` ~2.5k, `src/levels/bedroomLevel.js` ~3.8k) are expensive, so grep before you read.

## Run and check

- `npm install`, then `npm run dev` (http://localhost:5173). `.claude/launch.json` has a `game` config.
- Fast checks, which are preferred over long browser probes:
  - `npx vite build`
  - `node scripts/check-study-reveal.mjs`: builds the study in Node with a stub canvas, so level build code may only use `document.createElement('canvas')` and its 2D context.
  - `npm run check:maze`, `check:okabe`, `check:audio`, `check:assets`
- New PNGs need `npm run compress:assets`. New imported assets need `node scripts/generate-level-assets.mjs`.
- `docs/RUBRIC.md` maps every rubric category to code. Add a row for anything new and demo-worthy. `docs/WORLD_DESIGN.md`, `CUTSCENES.md`, `AUDIO.md` and `LEVEL2_POWER_CHAIN.md` go deeper.

## Layout

| Path | What |
|---|---|
| `src/main.js` | Wiring for everything: renderer, levels, transitions, warm-up, audio and story beats. `window.__game` is the dev hook. |
| `src/levels/` | One factory per room: `bedroomLevel` (L1), `hallwayBasementLevel` (L2), `studyLevel` (L3) plus its `study*.js` helpers, `backroomsLevel` (between levels) and `upstairsHallwayLevel`. Each returns `{ group, interactables, colliders, groundAt?, spawn, spawnYaw, refs, reset(), update(dt, playerPos) }`. |
| `src/core/` | Player (`PointerLockPlayer`), `SceneManager` (only the active level is ticked), `Interaction` (centre-screen raycast over `userData.interact = { label, onInteract }`), `HeldItems`/`GameState` (inventory and hotbar), `collision.js` (2D box colliders, `resolveCircle`, `segmentBlocked`), `Script.js` (cancellable timed beats: use it, never a bare `setTimeout`), `Cutscene`, `FreeCamera` |
| `src/systems/` | `OkabeCreature` (the only monster rig, also the player's body), `CreatureAI` (house creature), `BackroomsHunter` (the one AI that actually chases), `AudioDirector` |
| `src/world/` | Shared visuals: `CandleFlames` (instanced live flames, wind and a light pool), `HearthFire`, `wallSconce`, `CrystalDecanter`, `HauntedMirror`, `DropPhysics` (thrown and dropped item arcs), `itemMeshes`, `Postprocessing` |
| `blender/` | Python build scripts and `.blend` sources for the GLBs in `src/assets/models` |

## Rules that bite

- **CRLF.** Source files are CRLF. Git Bash `sed -i` silently converts a whole file to LF. Edit with the Edit tool or Python (`newline=''`), then check with `b.count(b'\n') - b.count(b'\r\n') == 0`.
- **Lights are baked into shaders.** The light count is part of every lit program, and main.js pre-compiles every room at boot (a 1.5–4 minute warm-up). Create lights synchronously at level build time. Never add, remove or hide them later; flicker by intensity only. Keep `castShadow` false unless a light truly needs it.
- **Frame budget is tight.** The study mirror re-renders the whole scene. Prefer `InstancedMesh` and `mergeGeometries`, and reuse cached materials (`studySurfaces.woodMaterial(shade, family)`). Avoid new shader variants (`setColorAt`, `flatShading`, `vertexColors`, clearcoat).
- **Transparent DoubleSide** quads need `forceSinglePass = true`. Meshes posed in a shader need `frustumCulled = false` and a big `boundingSphere`.
- **Layers.** Use `MAIN_ONLY` (`core/RenderLayers.js`) to keep effects off the minimap.
- **No coplanar faces.** Leave at least 5 mm between parallel visible faces; z-fighting has been a recurring teammate complaint.
- **Assets.** RoundedBoxGeometry plus `studySurfaces.alignSurfaces` gives bad UV strips, so use plain BoxGeometry for wood trim. Imported models should be PS2/PS3 style, ≤10k triangles, with 1980–2000 clothing. CC-BY assets need a credits row (main.js `CREDIT_SECTIONS`).
- **Puzzle-critical props.** The 9 panels on the study exit door are the basement keypad code (`DOOR_PANEL_ROWS`, 2/4/3) and must stay countable. The shadow crest's three lamp dials ("THREE LIGHTS GUARD THE ARCHIVE") shouldn't have lights near them. No clocks on the mantel (the clock puzzle) and no extra mirrors (the study mirror is the only unbroken one).
- **The dev server reloads** the page on any level or world file save, and a reload means a full warm-up. `vite.config.js` ignores `.claude/` and `.tmp-*/`.

## Staging a view in the browser (dev)

Wait for `#loading-screen.is-done`, then:

```js
document.querySelector('#start-screen').classList.add('hidden');
const g = __game, lvl = g.activateLevel('study');        // or 'bedroom', 'hallwayBasement', 'backrooms'
g.player.setLookBounds(null);
g.player.groundY = 0;            // 3.1 to stand on the study loft (spawn keeps the current floor)
g.player.spawn(x, z, yaw, pitch); // yaw 0 looks down -Z; face A from B: atan2(-(ax-bx), -(az-bz))
g.hands.root.visible = false;
```

- To stage puzzle beats, trigger the real interactables: `lvl.interactables.find(o => o.userData.interact.label === '...').userData.interact.onInteract()`. `lvl.refs` exposes the puzzle state.
- A hidden or background tab gets no `requestAnimationFrame`. Either keep the tab in front, or step it by hand with `lvl.update(1/30, g.player.object.position); g.postFX.render();` and then screenshot.

## Study (Level 3) geometry cheat sheet

- The room is x −8..8, z −6.5..6.5, height 6.4.
- The loft floor is at `LOFT_Y` 3.1 over z −6.5..−0.7 (front rail at z −0.7).
- The stair runs along x 6.5..8, from z 2.6 (floor) to z −1.88 (loft). The landing is z < −1.88.
- Wall positions:
  - Front exit door at (0, 6.45) on the front wall z = 6.5.
  - Entry door on the right wall around z 4.05..5.55.
  - Windows on the left wall x = −8.
- Props:
  - Fireplace at (−5.3, −6.26).
  - Mirror at x 4.8 on the back wall.
  - Grandfather clock at (7.74, −5.3).
  - Shadow crest at (−4.3, 1.65, 6.36).
  - Annabelle's chair at (−6.98, −4.98).
- The room is still on a "temporary bright testing setup" (ambient 3.5 plus fills of 10–24) near `studyLevel.js` ~215.

## Story constraint (read before any monster work)

`systems/CreatureAI.js` opens with a rule: the creature in the HOUSE is not hunting the player. It's Annabelle, hiding from you and trying to keep you inside. Only `BackroomsHunter.js` actually hunts, and its header explains why it was kept separate. Any new chasing behaviour in the house has to be reconciled with that twist (see the next section).

## Next feature: Level 3 hide-and-seek (not started)

The idea (Kiran's): the lights go out in the study and the monster searches for the player. The player hides behind objects. Books can be picked up and thrown, and the monster runs to where they land instead of towards the player.

Building blocks that already exist:
- **Blackout:** the light pool (`CandleFlames.setExtinguished` / `gust` / `setLit`), and the bedroom/hallway blackout in main.js `setHouseLightsOut`. The study has no blackout yet.
- **Monster:**
  - `OkabeCreature` rig, plus the study's own `annabelleMonster` / `updateStudyCreature`.
  - `BackroomsHunter` for chase and search logic.
  - `collision.segmentBlocked` for line of sight.
  - Walkable floors via `groundAt` (stairs, loft).
- **Throwing:**
  - Pickup and hotbar: `GameState`, `HeldItems`, `itemMeshes`.
  - Arcs: `DropPhysics` (`onImpact` gives you the landing spot for a noise event).
  - Book meshes: `studyDecor.js book()` builds procedural ones (decor only).
- **Timed beats:** `Script.js` for the sequence, `Storm` lightning for reveal flashes.

Still needed:
- **Code:** a study blackout trigger, a monster state machine (patrol → listen → investigate noise → search cover → chase → catch → lose interest), a hide/cover check (the monster's line of sight versus cover boxes, crouch and darkness), noise events (sprinting, thrown books, traps), a throw action, waypoints across both floors and the stairs, and catch/reset handling.
- **Models** (≤10k tris each):
  - **Cover:** high-backed Chesterfield sofa, three-panel folding screen, wardrobe the player can enter and peek from, floor-length curtains, dust-sheeted furniture, steamer trunks or tea chests, an upright piano.
  - **Throwables:** a pick-up hardback book in a few covers (it could flop open on impact), book piles, a library book trolley. Glass items could be louder lures.
  - **Noise traps:** broken glass, a creaky board, a music box.
  - **Monster extras:** creature animation clips (search, listen, reach behind cover, sprint, grab) and possibly a lantern it carries.
  - **Atmosphere:** a study breaker box (Level 2's `breaker_panel.glb` can be reused).

Decide the story framing with the team first. One option: the blackout is Annabelle's doing and the "monster" is her trying to stop you reaching the exit, which keeps the existing twist.

## Git

- `main` is the team branch. Teammates push directly and through PRs from Pace-Runner/Horror-Escape-Room.
- Work on a feature branch. Keep commits focused, with a message that explains why.
- `level3-fixes` (pushed) holds the candles, fireplace, railing, exit door and key-hook fixes. Base hide-and-seek on it until it's merged.
