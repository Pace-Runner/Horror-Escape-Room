# First-person hands

Two gloved hands at the bottom of the screen — rigged, animated, able to hold and
manipulate objects. The gloves are dirty brown leather: worn, scuffed, grime in
the creases.

These hands are the player's entire physical presence. There is no third-person
body during normal play, so every interaction — picking a lock, turning a valve,
lifting a photograph, putting on the visor, holding a torch in the dark — is
communicated through them. They carry the game's tactility.

**Current state: Unit 0 — API contract and scaffolding.** Every module below
exists, the public API is complete and frozen, and every method is safe to call.
Nothing is implemented yet: no geometry, no animation, no material.

---

## Public API

```js
import { Hands } from './systems/hands/hands.js';

const hands = new Hands({ camera, renderer, bus });
await hands.init();                                  // rig + mesh + materials
hands.update(dt, elapsed);                           // once per frame

// poses & clips
hands.setPose('left', 'relaxed');
hands.blendToPose('left', 'grip-cylinder', 0.25);
hands.play('right', 'pickup', { onEvent });
hands.stop('right');
hands.isBusy('right');                               // one-shot still running?

// procedural layers (additive, weight 0..1)
hands.setLayerWeight('tremor', 0.6);                 // both hands; see note
hands.setLayerWeight('breathe', 1.0);
hands.setLayerWeight('walkbob', 0.4);

// attachment
hands.attach('right', object3D, 'grip');             // 'grip'|'pinch'|'flat'|'palm'
hands.detach('right');                               // returns the object3D
hands.getSocket('left', 'grip');                     // Object3D to parent to

// material state
hands.setGrime(0.7);                                 // 0..1, accumulates
hands.setWetness(0.4);                               // rain / basement damp

// lifecycle
hands.setVisible(false);                             // cutscene, CCTV, close-up
hands.dispose();
```

Notes that are easy to get wrong:

- **`setLayerWeight` takes no side.** Breathing, sway, bob and tremor are
  properties of the player, not of one arm. Letting them drift apart per hand
  looks like a bug.
- **`update()` belongs in `Loop`'s per-frame `update`, not `fixedUpdate`.** The
  hands are presentation; animating them at a fixed 60 Hz on a 144 Hz monitor
  throws away smoothness the display could show. Physics stays fixed-step.
- **`detach()` returns the object and does not re-parent it.** The caller
  restores the rigid body at the socket's world transform. This module never
  touches Rapier.
- **Every method is safe before `init()` and after `dispose()`.** Bad names warn
  once and carry on; nothing throws. A typo must not take down a live demo.

---

## Event contract

Clips emit events at specific keyframes. This is how gameplay stays in sync with
animation, and the timing is not cosmetic: an object must attach at the frame the
fingers close, and a thrown object must release at the frame the hand reaches
peak velocity — not before, not after.

Every event fires **both** through the per-play `onEvent` callback and on the
shared bus (`core/Events.js`).

| Event | Fired when | Consumer |
| --- | --- | --- |
| `hands:grasp` | fingers close on target | Interaction parents the object to the socket |
| `hands:release` | fingers open | Interaction unparents |
| `hands:throw-release` | peak of the throw arc | Physics applies the impulse |
| `hands:impact` | tool strikes something | Audio + particles + puzzle state |
| `hands:clip-end` | one-shot finishes | Interaction re-enables input |

Payload: `{ side, name, clip, time }`.

The interaction flow, for reference — the hands module owns none of it beyond
firing the event:

1. Interaction raycasts from the camera and finds a target.
2. Interaction calls `hands.play('right', 'pickup')`.
3. On `hands:grasp`, Interaction makes the rigid body kinematic (or removes it)
   and parents the mesh to `hands.getSocket('right', 'grip')`.
4. On drop/throw, the reverse; on `hands:throw-release` it applies an impulse
   along the camera forward vector.

---

## Joint names

Canonical, exported frozen from `rig.js`. Use the constants, not string literals
— a typo in a pose file does not throw, it silently addresses a joint that does
not exist, and the finger just never moves.

```
wrist
  cuff
  thumb.01  thumb.02
  index.01  index.02  index.03
  middle.01 middle.02 middle.03
  ring.01   ring.02   ring.03
  pinky.01  pinky.02  pinky.03

sockets:
  socket.grip    palm, cylinder axis aligned — torch, crowbar, hammer
  socket.pinch   thumb tip to index tip — key, paperclip, photo
  socket.flat    open palm face — cassette, unfolded letter
  socket.palm    palm centre — pressing buttons, bracing on walls
```

Left and right share these names, namespaced per hand for debug output
(`left.index.02`, via `qualify()`). **There is no `palm` joint** — the palm does
not articulate, so it is geometry parented to `wrist`; each finger's metacarpal
offset is baked into its `.01` local position.

The thumb has **two** phalanges where the fingers have three. Giving it a fake
third is the most common way a code-built hand ends up looking wrong.

---

## Files

```
hands.js            public API, lifecycle, per-hand state    <- start here
rig.js              joint names, hierarchy, FK, pose application
hand-mesh.js        ALL geometry. The swappable seam
materials.js        glove material + onBeforeCompile injection
animator.js         clip playback, crossfade, additive layers, event frames
sockets.js          attachment points
poses/              static pose DATA, plain modules
clips/              animation clip DATA, plain modules
layers/             procedural additive layers
shaders/glove.glsl.js   injected GLSL as template strings
```

Test harness: `dev/hands.html` + `dev/hands-harness.js`, served over HTTP.

---

## The upgrade seam

The rig and animation layers know **nothing** about what the hands look like.
The visual mesh is an implementation detail behind one function.

v1 builds the hands as **rigid segment meshes** — palm, three phalanges per
finger, two per thumb, a wrist cuff — parented in a bone-like tree and animated
by rotating the parent nodes. No skinning, no weights, no `SkinnedMesh`. This is
deliberate:

- No Blender round-trip to iterate. Change a knuckle radius, see it in two
  seconds.
- **Gloves justify it visually.** A leather work glove genuinely has stitched
  panels and seams at the joints, so segmented geometry reads as *construction*.
  The same treatment on bare skin reads as a mannequin.
- The game is nearly black. Hands lit by a torch at close range are carried by
  silhouette, material response and motion, not by joint continuity.
- It stays in code, in git, diffable and reviewable by the whole team.

To replace it with a sculpted or skinned model, implement `buildHandMesh()` in
`hand-mesh.js` with the same signature, bind to the same joint names, and return
the same handle shape. Nothing else changes.

---

## Rules this module lives under

1. **No absolute paths.** Never a path starting with `/` — the game is served
   from a subdirectory and a leading slash resolves to the server root.
   `tools/check-deploy.mjs` fails the build over it.
2. **Lowercase, hyphen-separated filenames.** The lab server is Linux and
   case-sensitive. (Note: this module uses lowercase filenames per the brief,
   while the rest of `src/` uses PascalCase. Intentional; see `HANDOVER.md`.)
3. **Zero allocation in the frame loop.** No `new THREE.Vector3()`, no array or
   object literals, no per-frame closures. Scratch objects at module scope,
   reused. Event payloads are the one documented exception — events fire a
   handful of times per interaction, not sixty times a second, and a reused
   mutable payload crossing the bus is a worse bug than the garbage it saves.
4. **Everything disposable.** Every geometry, material, texture and render target
   is released by `dispose()`, verified with `renderer.info.memory` returning to
   baseline. `dispose()` is idempotent.
5. **No `localStorage` / `sessionStorage`.** All state in memory.
6. **No new npm dependencies** without asking. `three` and its `addons/` only.
7. **The hands are not physical.** No colliders, no rigid bodies, no Rapier
   import — ever. That boundary is what makes the module testable in isolation.

Texture assets live in `public/assets/hands/` (relative paths, lowercase, 1024 px
max, both maps together under ~1 MB), because `public/` is the runtime asset root
that Vite copies verbatim and that both linters scan.

---

## Handedness convention

The **flashlight lives in the left hand; interactions happen with the right.**
This lets the player keep light on a target while working, which matters
enormously in a dark game.

Two-handed clips (`inspect`, `don-visor`, `doff-visor`, `cover-mouth`)
temporarily override the left hand and must stash and restore whatever it was
holding — the `stashed` / `stashedSocket` fields on each hand record, implemented
in Unit 9.

---

## Adding a pose or a clip

Poses and clips are **data**, kept as plain modules so they can be tweaked
without touching engine code and so a non-programmer on the team can adjust one.

**A pose** maps joint name to `[x, y, z]` Euler in radians, listing only the
joints that differ from rest:

```js
export const relaxed = Object.freeze({
  'index.01': [-0.30, 0, 0.02],
  'index.02': [-0.45, 0, 0],
});
```

1. Open `dev/hands.html`, drag the joints in the inspector.
2. Press **copy pose as JSON** — it emits exactly this shape.
3. Paste into a new module in `poses/`, add one line to `poses/index.js`.

Registry keys are the public names, so `grip-cylinder` is the key while the JS
binding is `gripCylinder` (an identifier cannot contain a hyphen). Keep them in
step.

**A clip** is an ordered list of keyframes plus event frames. Times are in
**seconds**, not normalised — normalised times mean retiming a clip silently
moves every event, which is exactly the bug where an object attaches two frames
before the fingers close.

```js
export const pickup = Object.freeze({
  name: 'pickup',
  duration: 0.62,
  loop: false,
  keys: [
    { t: 0.00, pose: relaxed,      ease: 'out' },
    { t: 0.34, pose: gripCylinder, ease: 'inout' },
    { t: 0.62, pose: relaxed,      ease: 'in' },
  ],
  events: [{ t: 0.34, name: 'hands:grasp' }],
});
```

Add the module to `clips/`, import it in `clips/index.js`, add one line to
`CLIPS`. Nothing else in the module changes.

---

## Why `onBeforeCompile` and not `ShaderMaterial`

**Every team member will be asked this in the demo, so the full answer is written
into the header of `materials.js`.** In short: a raw `ShaderMaterial` replaces
Three.js's entire shader program, which means giving up its lighting, shadow
mapping, PBR BRDF, tone mapping and fog, then re-implementing all of it by hand
to get back to where you started. `onBeforeCompile` hands us the built-in
`MeshStandardMaterial` source just before compilation so we can splice our own
GLSL into it — we keep every one of those features and add grime on top. The cost
is that we patch strings against Three.js's internal chunk names, which is why
`three` is pinned to `0.185.1` and must not be bumped mid-project.

Unit 10 writes the real material: procedural grime biased by a baked per-vertex
crease mask, wear sheen on knuckles and fingertips from the inverse of that mask,
and `uGrime` / `uWetness` uniforms driven by game state. Grime 0 is a *used*
working glove, not a new one — these hands have been through something.
