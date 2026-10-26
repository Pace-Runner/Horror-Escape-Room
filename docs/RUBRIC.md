# Demo guide: the rubric, and where each thing is

For the beta and final demonstrations. Each rubric category lists what to
**show** in the game and **where the code is**, so whoever is asked can open
the file and explain it. The brief says every member must be able to explain
the shader code, so read the Shaders section together before a demo.

Debug keys for getting around quickly (they work but are no longer listed on
the pause screen): `2` Level 2, `3` the study, `4` the backrooms, `G` take the
current level's real exit, `N` free camera.

---

## The three levels, one sentence each

The brief: "be prepared to answer, for each level, *what does this level do
that the others do not?*"

| Level | What only it has |
|---|---|
| **1 -- Bedroom** | An escape-the-room start: chained to the bed in a storm, freeing yourself with a paperclip and working a chain of hidden-object puzzles (lamp code, floorboard, lockbox) to get the door open. |
| **2 -- Basement lab** | A *systems* puzzle and the first threat: restore power in the right order (fuse, generator, breaker routing), then use the CCTV cameras as a tool to read a code you cannot see directly, while the creature is loose. |
| **3 -- Study** | The visor changes what you can see, the truth is revealed (the mirror shows who you are), and you **choose the ending** (release or contain). |
| Between levels -- **Backrooms** | A randomised maze chase: a fresh layout of spawn, exit and hunter every crossing, with safe rooms it cannot enter. |

---

## Viewing (10%)

- **First and third person**: `T`. The third-person camera is a *second camera*,
  not the first one moved back, because the first camera *is* the player
  (sightlines, minimap, torch). It pulls in rather than clip through walls.
  `src/main.js`, `updateThirdPerson()` / `poseThirdCam()`.
- **Minimap**: an orthographic camera looking straight down, with its own
  private light on its own render layer. `src/core/Minimap.js`,
  `src/core/RenderLayers.js`.
- **A second live view in the world**: the study mirror is a real-time
  reflection camera rendered to a texture. `src/world/HauntedMirror.js`.
- **Cutscene camera and free camera** (`N`): `src/core/Cutscene.js`,
  `src/core/FreeCamera.js`.
- **Objects that move with the camera vs the world**: the hands, the held
  item, the torch's two spotlights and the dust in the beam are children of
  the camera; everything else is in the world. `src/main.js`, "first-person
  hands" and the flashlight block.
- **Animated avatars**: the player's body (walk, turn, crouch gait) and the
  creature, one rigged mesh with a monster shape key. `src/systems/OkabeCreature.js`.

## Control & Playability (10%)

- WASD + raw mouse look, smoothed on the frame clock: `src/core/PointerLockPlayer.js`
  (its header explains `unadjustedMovement` and the look drain).
- Sprint with stamina, crouch, and **jump** (Space) -- all three in the same
  file. The jump is projectile motion under gravity with a landing dip, and
  costs stamina so it cannot be spammed.
- Interact (E / right click), hotbar (scroll), drop (Q), hints (H), visor (V).
- **Physics**:
  - Jumping: gravity, semi-implicit Euler. `PointerLockPlayer.js`, `#updateJump`.
  - Dropped items fall, bounce with a coefficient of restitution and lose
    speed to friction, solved so they land exactly on a safe spot.
    `src/world/DropPhysics.js`.
  - Pushable boxes, the rolling instrument trolley, the backrooms doors.
    `src/core/collision.js`, `src/world/InstrumentTrolley.js`.
- **Win and lose**: two endings; every difficulty has a per-room clock
  (Easy 30 min, Medium 15, Hard 8) and running out ends the run.
  `src/core/Difficulty.js`. Being caught by the hunter sets you back.

## 3D Effects (15%)

| Effect | Where |
|---|---|
| Antialiasing | 4x MSAA on the composer's target, `src/world/Postprocessing.js` (note 2) |
| Many light types | point, spot (the torch is two), directional, hemisphere, ambient -- every level file |
| Shadows | PCF soft; the torch casts them; shadow updates skipped for dark lights, `src/world/renderOptimizations.js` |
| Normal, bump, roughness, AO, metalness, displacement maps | the level files, e.g. `src/levels/hallwayBasementLevel.js` (ambientCG materials) |
| Environment map | a procedural dim room environment through PMREM, `src/main.js`, `buildDimEnvironment()` |
| **Reflection** | the study mirror: a real planar reflection, `src/world/HauntedMirror.js` |
| **Refraction** | the crystal decanter on the study desk: refraction with dispersion and Fresnel, `src/world/CrystalDecanter.js` |
| **Smooth vs flat shading** | the decanter body (smooth) and its cut-crystal stopper (flat), same file |
| Dynamic skybox | the animated night sky outside the study, `src/levels/studyExterior.js` (`StudyNightSky`) |
| Fog | the backrooms, `src/levels/backroomsLevel.js` |
| Curves and surfaces | Lathe, Tube, Extrude and CatmullRom geometry throughout (the decanter, cables, trim) |

## Shaders (10%) -- every member must be able to explain these

| Shader | File | Stages | Uniforms driven by |
|---|---|---|---|
| Study mirror | `src/world/HauntedMirror.js` | vertex: projective texture coordinates (`textureMatrix`); fragment: divide by w, ripple warp, ghost image, foxing | `uReveal` (game state: the letter read), `uTime` |
| Crystal decanter | `src/world/CrystalDecanter.js` | vertex: world position and normal; fragment: `refract()` per colour channel, `reflect()`, Schlick Fresnel, liquid tint, `FLAT_SHADED` normals from `dFdx`/`dFdy` | `uIndexOfRefraction`, `uDispersion`, `uFillHeight` |
| Visor (post-process) | `src/world/VisorPass.js` | full-screen fragment: barrel warp, chromatic fringe, display-space grading, vignette | `uVisor` (wearing it), `uCaught` (being caught), `uBrightness` (settings) |
| Waking up (post-process) | `src/world/WakePass.js` | eyelids, blur, double vision, glow | `uOpen`, `uBlur`, `uDouble`, `uGlow` (the wake-up scene) |
| Rain on the window | `src/world/RainGlassMaterial.js` | vertex + fragment: procedural droplets and trails | `uTime`, `uFlash` (the storm's lightning) |
| CCTV static | `src/world/StaticScreenMaterial.js` | noise, feed mixing | `uTime`, `uPower` (the generator), `uStaticMix` |
| Dust in the torch beam | `src/world/DustMotes.js` | points shader, cone-shaped | `uTime`, `uBeamOn` (torch on/off) |
| Night sky | `src/levels/studyExterior.js` | fbm clouds, moon, stars, drawn at the far plane (`clip.xyww`) | `uTime`, `uMoonDir` |
| Tinted glass | `src/world/TintedGlassMaterial.js` | `onBeforeCompile` edit of the standard shader: opacity rises at grazing angles | -- |

## Gameplay & Experience (25%)

- Story through the opening news report, newspapers between levels, letters
  and documents, Mark's voiced thoughts, the session tape, and the reveal.
- **Text-only lines always show.** The Captions setting is subtitles for
  *spoken* lines; any line without a recording is shown regardless, so the
  story never plays silently. `src/core/CaptionSequencer.js`, `isVoiced`.
- Sound design: `docs/AUDIO.md`.
- Replay value: three difficulties, two endings, a different backrooms maze every crossing.

## Polish (10%)

- Loading screen, main menu, pause menu, restart without reloading (`R`, with a
  confirm), credits (`K`).
- Settings (main menu or pause): volume, sensitivity, captions, **brightness**,
  **graphics quality**, **frame-rate counter**. `src/core/GraphicsQuality.js`,
  `src/core/FrameRateCounter.js`.
- Download about 62 MB, from 163 MB: `scripts/compress-assets.mjs`.
- Memory does not climb across levels or restarts: every room is built once
  and reset in place (`src/core/SceneManager.js`), never rebuilt.

## Innovation (10%)

- The twist is built into the assets: the monster and the man are one mesh
  and one shape key (`blender/import_okabe.py`).
- Blender models generated from scripts (`blender/build_*.py`).
- A maze validator that runs in CI (`npm run check:maze`).
- An in-engine cutscene system with letterboxing and per-frame acting (`docs/CUTSCENES.md`).
- The visor that corrects sight rather than distorting it (`VisorPass.js` header).

## Before each upload (from the brief's checklist)

1. `npm run build`, then serve `dist/` over HTTP and play it through.
2. No absolute `/` paths; asset names match their case exactly (CI builds on Linux).
3. Zip the *contents* of `dist/` so `index.html` is at the top level.
4. Open the published URL in Chrome and check the console for 404s.
5. Turn on Settings > Show frame rate on a lab machine.
