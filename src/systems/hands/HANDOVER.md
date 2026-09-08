# Hands module — handover

## ✅ THE HANDS ARE VISIBLE IN THE GAME

Scope for this pass was deliberately narrow: skip Units 4–10, just get hands on
screen. Done. Reference frame: `.hands-capture/game-hands-3.jpg`.

```
36 draw calls · 8536 triangles for the whole frame (both hands = 4 primitives)
16/16 joints bound per hand · npm run test:hands 72/72
build 55 modules · check:deploy PASS · check:assets PASS (1 expected warning)
```

### What was built

- `hand-mesh.js` rewritten: loads `hands.glb`, clones per side with
  `SkeletonUtils.clone` (plain `Object3D.clone` leaves both meshes sharing ONE
  skeleton, so both hands would deform together), maps the armature, aligns it.
- `rig.js` gained `adoptRig()`: wraps an imported armature in the same handle
  shape `buildRig` returns, capturing each bone's current rotation as its rest, so
  `applyPose`/`blendPose` work untouched. `buildRig` stays as the tested reference.
- `main.js` wires `Hands` in: constructed with the camera, `init()` awaited after
  the level, `update(dt)` in the per-frame block.
- Left hand is the same clone with `scale.x = -1`.

### Three bugs worth remembering

1. **`scene.add(camera)` was missing, and camera-parented hands render as
   nothing.** `WebGLRenderer.render()` traverses from `scene`; a camera outside
   that graph is never visited, so its children are silently skipped. No error, no
   warning. That line in `main.js` is load-bearing — do not "tidy" it away.
2. **The glTF exporter strips dots from node names.** `hand.R_010` ships as
   `handR_010`, so a side matcher expecting a separator before the `R` matches
   nothing, no wrist is found, and the hand silently fails to bind — which is
   exactly what happened. What survives is the CASE: the side letter is the only
   uppercase character. `sideOf()` accepts both spellings.
   **My unit test passed while the real asset failed**, because the fixture used
   dotted names. There is now a second fixture using the exact shipped names.
3. **The asset's origin was ~100 units from the wrist**, with fingers pointing up
   and backwards. Hands were being drawn — the triangle count proved it — just
   nowhere near the frustum.

### `alignHand()` — computed, not baked, and deliberately so

`art/README.md` says bake orientation into the asset rather than fix it at
runtime, and for world props that is right. A view model is the exception. The
correction is derived FROM THE ARMATURE at load:

- scale so wrist→fingertip is 0.19 m (came out ×1.2553)
- rotate so fingers run −Z and the pinky side faces +X, via Gram-Schmidt on two
  measured axes
- translate so the wrist lands exactly on the root origin (residual 0.0 m)

So **any replacement asset self-aligns** instead of needing fresh magic numbers —
which is the point of the swappable seam. It measures BONES, never
`geometry.boundingBox`: on a skinned mesh that describes the undeformed base mesh,
which for this asset is ~86× larger than what renders.

### Framing, and what is deliberately still wrong

`HAND_ROOT_POSITION` ±0.17 / −0.20 / −0.33 with `HAND_ROOT_ROTATION`
`[0.28, −0.34, 0.12]` — one set of values for both hands, since the mirror negates
Y and Z rotation for free. At ±0.085 the forearms crossed in the middle of the
screen; real forearms enter from the bottom corners.

Still open, and expected:

- **Fingers are splayed** — that is the bind pose. There is no `relaxed` pose yet
  (Unit 4), and it is the single biggest remaining visual win.
- **Still slightly pale.** Albedo has been darkened twice (`0x8a6a58` → `0x5c4436`);
  a surface 30 cm from the lens catches more light than anything in the room, so
  hand albedo has to sit well below what looks right in a colour picker. Unit 10's
  grime and blood will carry most of this.
- Framing is provisional; Unit 11 owns it and wants `relaxed` to judge against.


**Read this first at the start of every session.** State the unit you are doing
and restate its acceptance criteria before writing any code.

---

## LATEST: art direction changed to bare grimy/bloody hands — and that flips the recommendation

The project owner dropped the glove: **bare hands, grimy and dirty, with a bit of
blood.** That is not a small change, because §3's entire justification for the
rigid-segment approach was that *gloves* excuse the segment bands:

> "Segmented geometry reads as *construction*, not as low budget — unlike
> segmented bare skin, which reads as a mannequin."

Remove the glove and that justification goes with it. Captured frames confirm it:
`.hands-capture/b3-orbit-studio.jpg` reads as a **wooden artist's mannequin** —
tapered tubes with visible joint bands. Fine as a stitched glove, wrong as skin.

### Recommendation: switch to the Rigify skinned hands after all

This reverses the decision taken earlier in the same session, and the trigger is
the art-direction change, not a change of heart. What was a compromise is now the
right answer, because **every one of its weaknesses was glove-specific**:

| Weakness as a glove candidate | Under the new direction |
| --- | --- |
| Bare, untextured skin | **Now correct** — and untextured is an *asset*: we author grime/dirt/blood ourselves in Unit 10, with no baked textures to fight. That is graded shader work. |
| "Not a glove" | No longer a defect |
| Forearms attached | **Useful** — hides the arm termination, so no cuff is needed at all |
| Crude base mesh | Smooth-skinned, so no segment bands — the mannequin problem disappears |

And the things that made it attractive still hold: clean **Rigify** bone names
mapping **1:1** onto our §5 joints (so the feared retargeting cost is nearly
zero), a **near-neutral rest pose** (max bend 11°, matching our convention),
**already at human scale** (0.99× correction), 8,152 polys, CC-BY. A skinned mesh
is also **1–2 draw calls for both hands** against the 30 our segmented version
needs — which fixes the draw-call criterion Unit 3 failed.

Model: `First Person hands rigged` by **davidfischer**, CC-BY, UID
`547a45535f0c4fe787948f7a7a6a88db`. Licence must be logged and credited.

### DONE: the asset is in the repo and verified

`public/models/characters/hands.glb` — **167 KB**, and it passes both linters.

```
nodes 71 · meshes 2 (2 primitives = 2 draw calls) · materials 2
textures 0 · skins 1 (63 joints) · animations 0
node tools/inspect-glb.mjs  -> PASS, no problems
npm run check:assets        -> PASS (1 expected warning, see below)
```

Joint hierarchy survived the round trip intact and clean:

```
hand.R_010
  palm_index.R_026 -> f_index.01.R_027 -> f_index.02.R_028 -> f_index.03.R_029
  thumb.01.R_023   -> thumb.02.R_024   -> thumb.03.R_025
  (+ palm_middle / palm_ring / palm_pinky chains)
```

**Key decision: the asset is ONE right hand + forearm, not a pair.** The left arm
was cut away (keyed on dominant vertex group, not on position, so the split
follows the skinning rather than a guessed plane). Our code instantiates it twice
with a mirrored transform — which is exactly what Unit 9 was already specced to do
*("mirror the rig for the left hand — mirror the transform, do not duplicate the
pose data")*. Three benefits: it matches our two-independent-rigs architecture, we
position each hand ourselves so the model's ~0.87 m arm spread stops mattering,
and it halves the poly count.

**4076 polys for one hand + forearm**, so ~8.2k for both — and 2 primitives means
roughly 2–4 draw calls for both hands against the 30 our segmented version needed.
That clears the draw-call budget Unit 3 failed.

The `check:assets` warning ("skin but no animation clips") is **expected and
correct**: this project drives the rig from code and deliberately wants no baked
clips.

#### A measurement trap that cost real time — read this before trusting any number

Blender's `bound_box`, `dimensions` and object `matrix_world @ v.co` do **not**
agree on a skinned mesh, and here they differed by **~86×**:

```
vertex[0] local   = (-8.98, -2.88, 95.01)   <- BASE mesh space
bound_box world   = [-0.5027, +0.4973]      <- EVALUATED, and the correct 1.0 m
```

`bound_box`/`dimensions` report the **evaluated** mesh after the armature
modifier; `v.co` and bone rest data are in **base** space. I concluded twice that
these models had "mangled" rest data, and both times I was comparing the two
spaces. **Measure via `obj.evaluated_get(depsgraph)`** for anything you intend to
believe. glTF exports base mesh plus inverse bind matrices, so the round trip is
faithful regardless.

### Remaining work: the JavaScript side

1. Import, keep the forearms, decide the wrist/arm treatment — the arms come
   spread ~1 m apart, so either pose the arm bones inward or split the armature
   into two independent hands to match our existing two-rig architecture.
2. Export to `public/models/characters/hands.glb`, **+Y Up**, **Bone Influences =
   4 with "Include All Bone Influences" OFF** (three only reads
   `JOINTS_0`/`WEIGHTS_0`; extra influences stretch vertices to the origin), no
   animation export, and do **not** apply modifiers (that would destroy skinning).
3. Verify with `node tools/inspect-glb.mjs` and `npm run check:assets`.
4. Rewrite `hand-mesh.js` to load the GLB and bind the skin — **map bones by
   walking the hierarchy outward from the hand bone, not by parsing names.** One
   candidate rig numbered index phalanges distally and ring phalanges proximally
   *in the same rig*; name parsing would have mapped half the fingers backwards,
   silently.
5. `rig.js` keeps its joint names, `applyPose`, `blendPose` and tests. Rest
   orientations come from the imported armature instead of `RIG_SPEC`.

`core/Disposer.js` already disposes `Skeleton.boneTexture`, which plain
`dispose()` misses, so a `SkinnedMesh` tears down correctly.

**What gets discarded:** the segment builders in `hand-mesh.js`, `RIG_SPEC`'s
lengths and rest values, the baked crease/wear mask (replaced by shader-authored
grime), and the geometry section of the tests.

---

## Unit 3b done anyway (kept as the fallback)

Tuned the three faults from the captured frames, before the art direction
changed. `npm run test:hands` → **73/73**, 2,948 triangles.

- **Palm**: the slab look was *resolution*, not radius — at 11 mm rounding on a
  34 mm box with 6 segments per axis each vertex row is ~5.7 mm, so the rounded
  band got barely two rows and the Minkowski projection chamfered instead of
  curving. Radius 11→15 mm, per-axis segments (10/8/12), and — the change that
  actually mattered — a **taper toward the wrist**, because a constant
  cross-section is the most box-like thing about a box.
- **Cuff**: was a trumpet, and a 40 mm tube against an 86 mm palm made a hard
  step. Now starts **wide** (26 mm) so it grows out of the palm, with the flare
  and length cut.
- **Exposure**: the pale-wood look was over-lighting, not a wrong albedo. Torch
  8→4.5 cd (the 8 was calibrated against a *flat proxy*, exactly as the Unit 1
  notes warned) plus a darker albedo.

Palm and exposure are clearly fixed in the captures. The cuff still reads as a
cylinder stepping off the wrist, and the finger banding remains — which is what
makes the skinned model the better answer now.

---

## Unit 3 — Geometry and placeholder material: SPLIT, first half done

Branch: `feat/hands-u03` · three `0.185.1`

**Unit 3 is NOT complete.** The structure is done and measured; the FORM is not
good enough yet. Split per the brief's rule for units that turn out larger than
one session:

- **Unit 3a (done, committed):** segment construction, provable joint overlap,
  crease/wear mask, Stage-1 material, disposal, triangle budget, and the capture
  tooling that made the visual check possible at all. `npm run test:hands` →
  **73/73**.
- **Unit 3b (next):** make it actually read as a glove. Specifics below.

### What it looks like, and what is wrong with it

I built a way to get frames out of the harness (`Save frame`, see below) and
looked at it. It does **not** read as a gloved hand yet. Named faults, worst
first:

1. **The palm is an obvious rectangular slab.** The Minkowski rounding is not
   reading at all — flat faces meeting at near-square edges. At 11 mm radius on a
   34 mm-thick box with 6 segments per axis, the rounded band gets roughly one
   row of vertices, so it chamfers instead of rounding. Needs a much larger
   radius, more segments across the rounded band, or a different base shape
   entirely. It currently reads as a brick with sausages attached.
2. **The cuff is a trumpet.** Far too flared and too large, and it meets the palm
   as a hard step because a 40 mm-diameter tube abuts an 86 mm-wide slab. It
   reads as a megaphone, not the opening of a garment. Shrink the flare hard, and
   either widen the near end to blend into the palm or oval it.
3. **The colour is pale tan, not dirty brown leather.** It reads as wood or
   flesh-coloured plastic. The albedo itself is defensible (`0x4a3728`, linear
   ~0.04–0.07, which is right for dark leather) so this is an EXPOSURE problem:
   the torch is over-lighting it. My Unit 1 calibration landed the knuckle at
   mean 102/255 which sounded like a good mid-tone, but the sample region was
   small and the eye disagrees. Re-tune the torch down against these frames.
4. **Fingers are too uniform** — even, straight tubes. The taper is there
   numerically but is not reading; the segment banding reads as segments rather
   than as stitched panels.
5. **The thumb barely reads.** Its rest rotation needs a proper look by eye — as
   flagged in Unit 2, it was always the value most likely to need adjusting.

Reference frames are in `.hands-capture/` (gitignored): `01-player-flat`,
`02-player-fist`, `03-orbit-studio`, `04-orbit-torch`. **In player framing it is
much more convincing than the close-ups** — the silhouette at the bottom of the
screen is plausible — which matters, because that is the only view the player
ever gets. Judge 3b against `01`/`02` primarily and use the orbit shots for
diagnosis.

### Acceptance results

| Criterion | Result |
| --- | --- |
| Reads unmistakably as a gloved hand under flashlight lighting | **FAIL** — verified by looking, not by assumption. Five named faults above. |
| Fingers flex to a full fist with no gaps at any joint, no broken self-intersection | **PASS, and provably so** — see "gap-freeness" below. Full fist buries no fingertip in the palm (0.0 mm penetration). |
| Draw calls for a single hand ≤ 8 | **FAIL — 15.** This criterion conflicts with the brief's own design. See below. |
| Triangles ≤ 4000 | **PASS — 2196 per hand** |
| `dispose()` returns `renderer.info.memory.geometries` to its pre-init value | **PASS** — measured in-browser: geo 32 → 2 → 32, "stable" |

Measured in the browser, both hands at once: **32 rendered draw calls, 4396
triangles**. Gloves at the knuckle under the default torch preset: mean
luminance **102/255, max 126**, fully covering the sample — good mid-tones with
headroom for Unit 10's sheen. Torch-only 108, studio 89, pitch-dark 0.

### The draw-call criterion cannot be met as specified

The brief asks for two incompatible things. §3 and Unit 3 both say to build rigid
segments and **"parent each segment to its joint node"**; the acceptance list says
**≤ 8 draw calls per hand** (§14: ≤ 16 for both). One mesh per articulating joint
is 15 meshes — palm+cuff merged, 2 thumb, 3 × 4 fingers — and one mesh is one
draw call. Reaching 8 by merging would mean merging whole fingers, which removes
the curl the same acceptance list requires.

I built the parented design the brief describes, and the number is 15 per hand,
30 for both. **What I recommend, and why I did not just do it:**

- `THREE.BatchedMesh` gets this to **1 draw call per hand** with full per-segment
  geometry and full articulation, and I verified it works in r185: distinct
  geometries in one batch, per-instance matrices, and it accepts the `color`
  attribute Unit 10's mask needs. The rig would not change at all; the batch just
  reads the joint world matrices instead of the scene graph doing it.
- The reason to hold off is **Unit 10 risk**. `BatchedMesh` patches the shader
  with its own batching chunks, and the graded shader work depends on
  `onBeforeCompile` injection into `MeshStandardMaterial`. That interaction is
  untested. Breaking the flagship shader unit to save draw calls that almost
  certainly do not matter is the wrong trade.
- **30 draw calls is very unlikely to be a real cost.** Draw-call overhead bites
  in the hundreds to thousands, not at 30, and the hands are 4400 triangles.
  Unit 16 profiles on lab hardware and is the right place to decide with numbers.

**Decision needed:** leave at 15/hand and revisit in Unit 16 (my recommendation),
or take BatchedMesh now and prove the shader interaction early.

### Two bugs found by measuring, both fixed

1. **`castShadow` was costing 30 draw calls for nothing.** Rendered calls were
   **62** rather than 32, because every shadow-casting mesh is drawn again into
   the shadow map. The torch is held *in the hand*, so it is effectively
   co-located with the geometry and the shadows fall directly away from the
   viewer, behind the hands that cast them. Now `castShadow = false`.
   `receiveShadow` is also false: a shadow map spanning a room resolves to well
   under a pixel per knuckle, so what it produces is acne, not shadow — blotchy
   speckle exactly where Unit 10 is carefully *placing* dirt.
2. **The harness's Rebuild memory report was crying "DRIFT — disposal is
   leaking" on a clean teardown.** `renderer.info.memory` counts what has been
   *uploaded to the GPU*, not what exists in JS, so a freshly rebuilt geometry is
   not counted until something draws it. It now renders a frame before sampling.
   A false leak alarm is worse than no alarm.

### Gap-freeness is provable, not eyeballed

Each capsule's cylinder runs exactly from its own joint to the next, and its
hemispherical caps overhang **both** ends by the segment radius. So the parent's
far cap and the child's near cap are **concentric spheres centred on the shared
pivot** — and two concentric spheres overlap at every possible rotation. No
flexion angle can open a gap, at all, by construction. The test asserts the
premise: that all 9 multi-segment joint pairs share a pivot exactly (worst offset
< 1e-12 m).

### Other decisions

- **Palm + cuff merged** into one geometry on `wrist`. Neither articulates and no
  clip targets `cuff`, so they cost one draw call instead of two. This is the
  merge to undo if a later unit ever animates the cuff.
- **The cuff is a lathed profile, not a cylinder.** Its job is to hide the fact
  that the arm simply stops; a straight tube ending in a hard circle advertises
  it, whereas a flare that turns back into a rim reads as the opening of a
  garment. ~170 triangles, and it is the most glove-like shape on the hand.
- **The palm is a Minkowski-rounded box** (clamp each vertex into the shrunk box,
  push back out along the displacement). `mergeVertices` first, because
  BoxGeometry duplicates vertices along face boundaries and rounding them
  independently leaves a hard crease exactly where the round should be smoothest.
- **Radii taper along every digit.** Three equal cylinders read as a mechanical
  linkage no matter how good the material is.
- **The mask is in the standard `color` attribute** (R = crease, G = wear, B
  reserved), as the brief specifies, so it survives a glTF round-trip and a future
  Blender-authored replacement can carry it out of vertex-paint mode. The cost:
  Three's `color_fragment` chunk would multiply it into the albedo and tint the
  glove blotchy dark red, so **`material.vertexColors` stays FALSE** and Unit 10
  must *replace* that chunk rather than let it run. Tested: crease reaches 1.0 on
  the palm side at joints, wear reaches 1.0 on the knuckle side of the same
  joint, and mid-span creases less than the joint does.
- **`frustumCulled = false`** on every segment. Geometry parented to the camera
  can be wrongly culled against that same camera's frustum, and hands blinking
  out at certain angles is the classic symptom.

---

## Also fixed this session: the camera snapping bug (outside the hands module)

Reported as "the camera snaps when you look up and down". Diagnosed by driving
`Player.updateLook()` headlessly and measuring.

**The rotation math was never the problem** — with even input the angular step is
identical to six decimal places (max/min ratio exactly `1.000000`) and horizon
roll is exactly zero, so no gimbal flip and no Euler-order fault.

**The actual bug:** `spawn()` set `yaw` and `pitch`, but *nothing ever wrote them
to the camera*. `updateCamera()` set position only, and `updateLook()` returns
early when the mouse has not moved. So the camera's orientation was a piece of
state in its own right rather than a view of `yaw`/`pitch`, and the two silently
disagreed after every spawn: `spawn()` resets `pitch` to 0 while the camera
visually stayed where it was. Look up, reload the level with `L` — which is bound
and used constantly for the leak test — then twitch the mouse, and the view
slammed back down. **Measured: a one-pixel mouse movement moved the view 89.93°.**

**The fix:** `updateCamera()` now derives the *entire* camera transform —
position and rotation — from `(body position, yaw, pitch)` every frame, so the
two cannot drift apart at all: not on spawn, not on level reload, not on a
teleport a later unit adds. `updateLook()` only updates `yaw`/`pitch`. Verified:
after a simulated spawn the camera points where `yaw` says it should, and a
one-pixel move now moves the view 0.09° (expected 0.0859°).

**Not committed, deliberately.** `src/systems/Player.js` already carried
unrelated uncommitted work (`MAX_PITCH` retuned from 88.85° to 85°, plus the
`Input.js` sensitivity and clamp changes — themselves earlier attempts at the
same complaint). Committing would either sweep that in or produce a file that
does not match what I tested. The fix is in the working tree and verified; commit
it with the rest of that work, or ask for it on its own branch.

A **regression test would be worth adding** — this is exactly the class of bug
that comes back — but `Player.js` belongs to another owner and has no test
harness, so I did not invent one there.

---

## Unit completed earlier: Unit 2 — Rig and forward kinematics

Branch: `feat/hands-u02` · three `0.185.1` · vite `8.2.1`

Previous units: Unit 0 (API contract) `feat/hands-u00` · Unit 1 (dev harness)
`feat/hands-u01`.

A working skeleton with no visual mesh: 16 joints per hand at real
anthropometric proportions, plus `applyPose` / `blendPose` with zero per-call
allocation.

### Acceptance results

| Criterion | Result |
| --- | --- |
| Harness shows a recognisable hand skeleton in axes helpers | **PASS structurally — visual confirmation outstanding.** 32 `AxesHelper`s attach to the correct joints (16 per hand) and dispose back to 0. Proportions verified numerically, not by eye — see the caveat below. |
| A hand-authored test pose visibly and correctly rotates the intended joints | **PASS** — a full curl moves the index fingertip 118 mm, downward (−Y), and the middle finger is provably untouched to 1e-9 |
| Blending at t = 0, 0.5, 1 is smooth, no flipping or gimbal artefacts | **PASS** — see numbers below |
| An assertion confirms `applyPose` does zero allocations across 1000 calls | **PASS** — exactly **0** garbage collections across 1000 calls, plus a source-level check that cannot be fooled |

`npm run test:hands` → **54/54**. Game build unchanged (`index-BSzZ4L1Y.js`,
33 modules), `check:deploy` PASS, harness console silent.

Measured values now locked in by the test suite:

```
hand length  (wrist -> middle fingertip)   0.1963 m   (adult hand ~0.19)
palm length  (wrist -> middle knuckle)     0.0957 m   (brief says 9-10 cm)
knuckle span (index -> pinky)              0.0650 m
finger reach   index 0.091  middle 0.101  ring 0.094  pinky 0.074  thumb 0.064
blend smoothness   step max/mean 1.09   max/min 1.26   path/chord 1.21
```

**The visual caveat, stated plainly.** The browser pane was never displayed in
this session either, so `requestAnimationFrame` does not fire and screenshots
time out. I verified the skeleton by driving frames through
`window.HARNESS.step()` and asserting on world-space geometry — that the middle
finger is longest, that each phalanx is shorter than the one before it, that the
thumb is opposed on the correct side, that the rest pose is flat and palm-down,
that the fingers fan outward. Those are the properties that make a skeleton read
as a hand, and they are all correct. But **"recognisable" is a judgement only a
human looking at it can make.** Run `npm run dev:hands`, switch on **Joint
axes**, and drag **Curl all** before trusting the framing or the thumb rest
rotation, which is the value most likely to need a nudge.

---

## The axis convention — derived, not chosen

This is the most consequential decision in the unit, because every pose file in
the game inherits it, so the reasoning is in the `rig.js` header too.

```
bones run along local -Z, children at (0, 0, -parentLength)
+Y is the BACK of the hand; the rest pose is a flat hand, PALM DOWN
FLEXION is a NEGATIVE rotation about local X
SPLAY is rotation about local Y
+X is the pinky side, -X the thumb side (right hand)
```

It follows from the brief's own example pose, `'index.01': [-0.30, 0, 0.02]`,
which has flexion as a *negative* X value. Rotating (0,0,−1) by a negative angle
about X sends it toward −Y, so for negative-X to read as a curl rather than a
backward bend, −Y must be the palm side. Had I assumed palm-up, every pose in the
game would have needed its X sign flipped later.

**Poses are offsets from rest, not absolute local rotations:**
`node.quaternion = rest * poseOffset`. Rest holds splay only — no droop, so zero
always means a clean checkable reference. The natural resting curl belongs in the
`relaxed` *pose* (Unit 4), not baked into the skeleton. If poses were absolute,
flexing `pinky.01` would silently wipe out its rest splay; there is a test for
exactly that.

---

## Decisions taken, and why

1. **`rig.order[]` alongside `rig.joints` Map.** `applyPose` walks a flat
   pre-resolved array, not the Map — 32 hash lookups per frame for a joint set
   that never changes after construction is waste. The Map stays for lookup by
   name, keyed by **bare** names so one set of pose files drives both hands.

2. **`RIG_SPEC` carries a `length` per joint,** read by `hand-mesh.js` in Unit 3
   to size its capsules. Better here than duplicated in the mesh layer, where it
   would drift.

3. **Composed into scratch, copied to the node once.** Writing
   `node.quaternion.copy(rest).multiply(offset)` fires Three.js's onChange twice
   per joint, and each one runs a full `Euler.setFromQuaternion` matrix
   decomposition to keep `node.rotation` in step — 64 decompositions a frame for
   two hands, for nothing. Composing in `_result` and copying once halves it.

4. **Left hand is NOT mirrored yet.** Unit 9 owns that ("mirror the transform, do
   not duplicate the pose data"). For now both sides build the same right-handed
   skeleton, offset to either side by `HAND_ROOT_POSITION` so the harness shows
   two hands. `HAND_ROOT_POSITION` is **provisional** — Unit 11 owns final
   framing.

5. **Committed a test suite at `dev/hands-tests.mjs`** (`npm run test:hands`),
   zero dependencies, matching the `tools/check-*.mjs` house style. Unit 5 needs
   an allocation assertion too and now has somewhere to put it.

6. **A harness "Curl all" slider.** Drives every finger's flexion from one
   control, with non-uniform per-depth multipliers because a real finger closes
   furthest at the middle phalanx and least at the tip. It is both the one-drag
   proof that the rig articulates and a genuine authoring shortcut for Unit 4.

---

## Two of my own tests were wrong. Both are worth knowing about

1. **"index is longer than ring" — false.** In most hands the ring finger is
   marginally the longer of the two; the ratio is the well-studied 2D:4D digit
   ratio, typically below 1. The spec was right and the assertion was wrong. It
   now checks that they are within 5 mm with middle clearly above and pinky
   clearly below, which is what actually reads visually.

2. **"t=0.5 is equidistant from both endpoints" — wrong quantity.** Slerp
   guarantees equal *angular* distance. It does not put the fingertip
   equidistant between the two endpoint *positions*, because the tip is driven by
   two chained joints and traces a compound curve. The test failed by 8.7 mm,
   which was the test misunderstanding the geometry. It now asserts angular
   equidistance per joint (exact to 1e-6) and reports the positional offset as
   context.

---

## The allocation test took four attempts. Read this before writing another one

The brief asks for an assertion that `applyPose` allocates nothing. Getting a
*trustworthy* one was most of the unit's difficulty, and every wrong version
**passed or failed for the wrong reason**:

1. **`heapUsed` before/after.** Meaningless: it is a snapshot, and the collector
   runs *inside* the measured window precisely because allocation provokes it, so
   the garbage is gone before the second sample. It reported `blendPose` (strictly
   more work) allocating *less* than `applyPose`, which cannot be true.
2. **Enlarging the young generation** (`--max-semi-space-size=64`) to hold the
   collector off. Moved the problem rather than solving it; the allocating control
   still registered almost nothing.
3. **Counting GC events via `perf_hooks`.** The right idea, but two bugs made it
   lie in both directions: my own forced `gc()` calls are reported
   *asynchronously* and landed inside the measurement window as exactly 2 phantom
   collections; and one `setImmediate` after the loop was not enough to flush
   real entries, so a control that had demonstrably allocated millions of objects
   reported **zero**.
4. **A control that actually allocates.** `new THREE.Euler()` / `new
   THREE.Quaternion()` inside a loop are *elided by V8's escape analysis* when
   they do not escape — and a `sink = q` assignment is not enough either, because
   nothing reads it, so the stores are dead-eliminated and escape analysis comes
   back. The control now stores into a long-lived heap array that is read
   afterwards.

**What the suite now asserts, and what it deliberately does not:**

- **A source-level check** — `applyPose.toString()` and `blendPose.toString()`
  contain no `new` expression and no array/object literal, with comments stripped
  so future prose cannot fail the build. Deterministic, immune to VM behaviour,
  and this is the check that keeps `rig.js`'s promise that adding a `new` breaks
  the test.
- **Exactly 0 collections across the brief's 1000 calls.**
- **At 200 000 calls: naive control 293 collections, `applyPose` 14, `blendPose`
  20** — an order of magnitude apart at identical call counts.
- **It does NOT assert an absolute zero at 200 000 calls.** Measured: the GC
  floor tracks the loop's *wall-clock duration*, not its allocation, because V8's
  background collector runs on a schedule. An allocation-free plain-quaternion
  loop finishes 200k iterations in ~36 ms and shows ~6 collections; `applyPose`
  does sixteen joints of real work per call, takes ~600 ms, and shows ~14.
  Comparing those as like-for-like is comparing a 36 ms window with a 600 ms one,
  and an earlier version of this test did that and failed clean code.

A useful side-finding: **the zero-allocation discipline cannot be justified by
"the JIT would have fixed it anyway."** Sometimes it does. Relying on it is
fragile — escape analysis gives up on megamorphic call sites and anything it
cannot prove local, which is most of a real frame.

---

## Answered — glove style is now settled (asked and confirmed, end of Unit 2)

The brief's §13 questions about glove style were put to the project owner and
answered. **These are decisions now, not assumptions — build to them:**

- **A thick leather WORK GLOVE with a slightly flared gauntlet cuff** past the
  wrist. Chunky panels and visible seams, which is precisely what justifies the
  rigid-segment approach (seams read as *construction*, not as budget) and gives
  Unit 10's grime somewhere believable to collect. The `cuff` joint is already
  positioned behind the wrist for exactly this.
- **No skin at the wrist** — the cuff closes it off entirely. One material, no
  skin shader, nothing to look wrong under a torch at close range, and it hides
  the fact that the arm simply stops.

Hand proportions were settled within Unit 2 from anthropometry and the brief's
own palm figure; see `RIG_SPEC`.

## Still unanswered — needs a human

- **Unit 15 integration conflict.** `systems/Interaction.js` already pins carried
  objects in front of the camera at `HOLD_DISTANCE`; the hands contract expects it
  to parent to a **hand socket** on `hands:grasp`. Incompatible as written — agree
  with that file's owner before Unit 15.
- **`EffectComposer` still not in the render path.** Unit 11's starting condition.
- **Owner letter** for this module is still absent from the project README table.

---

## Getting frames out of the harness — new, and it unblocks visual review

The browser pane has not composited a frame in any session so far, so
`computer{screenshot}` times out and "does it read as a hand" stayed
unanswerable for three units. It is answerable now:

1. `npm run serve:hands`
2. Press **Save frame** in the harness's Debug section.
3. The frame lands in `.hands-capture/<name>.jpg`.

The page encodes the canvas and POSTs it to the dev server
(`tools/serve-hands.mjs`), which writes it to disk. The encode has to happen in
the **same task** as the render — WebGL does not preserve the drawing buffer
between tasks, so a `toDataURL()` one tick later comes back blank. Outside
`serve:hands` the fetch fails harmlessly and the button just says "No server".

Do not try to move a frame out as base64 through a chat message: a 6 KB image
does not survive it intact, and a half-corrupt image is worse than none.

---

## DIRECTION CHANGE: Unit 3b is cancelled — we are swapping in a premade rigged glove

Decided by the project owner after seeing the captured frames. **Unit 3b (tuning
the code-built geometry) is dropped.** We take a premade, pre-rigged glove model
instead, sourced from Sketchfab, licence logged.

**This is the seam working as designed, not a retreat.** §3 named it explicitly:
*"Any future replacement — Blender-sculpted, skinned, purchased — implements the
same function signature and the same joint names, and everything else keeps
working untouched."* All mesh construction was isolated in `hand-mesh.js` for
exactly this moment.

**And the timing is close to ideal.** Unit 4 (pose authoring) had not started, so
**no pose or clip work is wasted.** The same decision after Units 4–14 would have
meant re-authoring roughly forty clips against a new skeleton. This is the
cheapest point in the whole schedule at which to do it.

### What survives, and what goes

**Survives** — the bulk of Units 0–2:

- The canonical §5 joint names, `JOINT_PARENTS`, `FINGERS`, `qualify()`.
- `applyPose` / `blendPose`, the offset-from-rest semantics, the slerp work and
  the whole zero-allocation discipline and its tests.
- The §4 public API, the event contract, the animator / socket / layer
  architecture, the dev harness, and the structural half of the test suite.

**Goes:**

- `hand-mesh.js`'s segment builders — the capsules, the Minkowski rounded box,
  the lathed cuff (~400 lines). Superseded.
- `RIG_SPEC`'s bone lengths and rest orientations, replaced by the model's own
  armature. **The joint NAMES stay.**
- The baked crease/wear mask, and the geometry section of the tests. A decent
  model ships normal/roughness/AO maps, which is a better input for Unit 10 than
  a procedural mask.

### The real work is retargeting, not geometry

A third-party rig will not use our §5 names, will not have a flat palm-down rest,
and its bones will not necessarily flex about local X — so the axis convention
derived in Unit 2 does not transfer for free. The swap therefore needs a bone
mapping layer that renames the imported bones to the §5 names and re-derives rest
orientations from the armature. `applyPose` then works untouched, and the pose
library (Unit 4) gets authored against the real rig — which is better than
authoring against a placeholder and re-doing it later.

Also note: `core/Disposer.js` **already** handles `Skeleton.boneTexture`, which
plain `dispose()` misses. A `SkinnedMesh` will tear down correctly; the project
anticipated this.

### New tool: `tools/inspect-glb.mjs`

```bash
node tools/inspect-glb.mjs path/to/model.glb   # structure + ARMATURE
node tools/inspect-glb.mjs --self-test         # verify the parser
```

Dumps the joint hierarchy as an indented tree plus a flat name list ready to
paste into the bone map, and checks the model against the same budgets as
`check-assets.mjs` (2048 px texture ceiling, 4 MB model, 24 primitives, 8
materials), flagging external texture references and unsupported glTF extensions
as blocking. Zero dependencies, self-tested against a synthetic Mixamo-style rig.

`check-assets.mjs` reports budgets and says nothing about bones; this is the
companion that answers "what are the bones called and how are they nested",
which is the question that has to be answered before any mapping code exists.

### Blocked on one manual step

Blender is running (PID checked) but its MCP server is **not** started, so I
cannot search Sketchfab. In Blender: **View3D → sidebar (`N`) → BlenderMCP tab**,
tick **Use assets from Sketchfab**, paste a Sketchfab API key, then start the
server (port 9876). The addon refuses to run in background mode, so the window
has to stay open.

## Deferred until the model lands: Unit 4 — Pose library *(1 session)*

Author and commit every static pose the game needs, using the harness's joint
inspector.

Acceptance criteria to restate at the start of that session:

- `relaxed`, `open`, `fist`, `point`, `pinch`, `grip-cylinder`, `grip-flat`,
  `reach`, `press`, `brace` — each a module in `poses/`, registered in
  `poses/index.js`. All ten stub files already exist.
- Every pose selectable in the harness.
- Each anatomically plausible, **no hyperextension**.
- `grip-cylinder` visibly forms a tube of roughly torch diameter (**~35 mm**).
- `pinch` brings thumb and index tips into contact **without interpenetration**.

Practical notes for that session:

- **Author in the harness, not in a text editor.** Pick a joint, drag X/Y/Z, then
  **Copy pose as JSON** — it emits a module-ready statement with the binding name
  derived from the selected pose, joints in `JOINT_NAMES` order, all-zero joints
  omitted. Paste into the module, add one line to `poses/index.js`.
- **Start from `Curl all`**, then adjust. Most poses are "everything closed about
  this far, then fix the thumb".
- Flexion is **negative X**; splay is **Y**. Rest is a flat palm-down hand, and a
  pose is an *offset* from rest, so a pose that only touches the thumb leaves
  finger splay intact.
- `pinch` is the one to author **last** — it depends on the segment radii in
  `hand-mesh.js`, so it is the pose most sensitive to the geometry underneath it.
- `relaxed` is the most load-bearing pose in the module: every clip starts and
  ends there. A hand at rest is **not** flat — fingers settle into a gentle curl,
  pinky slightly more than index.
- Consider adding a pose assertion to `dev/hands-tests.mjs`: no joint beyond
  anatomical range, and `pinch` tip-to-tip distance within a few mm of touching.
  The geometry helpers to measure that already exist in the Unit 3 section.
- The pane must be **displayed** for `requestAnimationFrame`; otherwise use
  `window.HARNESS.step(1/60)`.
