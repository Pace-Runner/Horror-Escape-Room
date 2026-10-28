# Level 3 hide-and-seek

The study goes dark and the monster searches for Mark. He hides behind
furniture, in the wardrobe or behind a curtain, and throws books and bottles
to send it somewhere else. This page is the team's reference: the story
framing Kiran decided on (2026-10-27), the rules the code keeps, the tuning,
and what is still placeholder.

Branch: `level3-hide-and-seek`, cut from `level3-fixes`.

## The story framing

**The seeker is Annabelle, searching to sedate Mark.** The rule in
`systems/CreatureAI.js` still holds: the thing in the house is not hunting
him. Mark has reached the archive (the records, the visor, the truth about
Project HOLLOW), and Annabelle promised him that if he became dangerous she
would keep him contained. So when the lights go she comes to find him and
put him under (the archive's own record says *Containment Sedation*).
Through his broken eyes she is the monster. Through the visor she flickers,
for a few frames, back into a sixteen-year-old girl.

- **First playthrough:** a monster is hunting you in the dark.
- **Second playthrough:** a sister keeping a promise. The letter says it outright: "I'm not hunting you... I would keep you contained here."

**Being caught is being sedated, never killed.** He comes round slumped
in her chair's corner, still in the dark, with everything he had done
still done.

**The storm causes both blackouts, by coincidence.** Annabelle didn't cut
the power. She uses the dark.

## The two blackouts

| | Blackout 1, the teaser | Blackout 2, the hunt |
|---|---|---|
| Fires when | the shadow crest is solved | the visor is lifted out of the archive |
| She comes from | the entry door, toward the crest (the latch she heard) | her chair corner, up the stair toward the archive (the compartment she heard) |
| Her senses | softer: shorter sight, slower, gives up sooner, rarely opens a hide spot | the full difficulty tuning |
| Ends when | Mark throws the **loft breaker** (it teaches where it is) | the strike **blew the breaker's fuse**: the spare is in a tin on the floor by the desk's right-hand end, downstairs. Fit it, then throw the breaker |
| Afterwards | she withdraws into the dark and is gone | the same; the letter and the mirror can be used again |

The letter and the mirror refuse during a blackout ("Not in the dark."), so
the reveal cutscene can never start with her in the room.

**What stays lit:** the moon through the three left-wall casements (one
spot light), the one candle the gust missed, and the lightning. That candle
is on the mantel by her chair. The fire in the grate dies to embers. Nothing
lit is near the crest's three dials.

**How dark it gets:** the dark's fill is a quarter of the first tuning
(`BLACKOUT_FILL` in `studyBlackout.js`; Kiran, 2026-10-28). That covers the
ambient, the moon, the night outside the windows (the exterior's sky and
moon lights) and the scene's environment light, which main.js scales by the
blackout's `fill`. The candle, the embers, the lightning and the torch are
light sources, not fill, and are left alone. One number, so it's easy to
retune.

The loft used to have a second surviving candle, but its sconce sat right
over the breaker and was removed (2026-10-28).

## The rules (systems/StudySeeker.js)

- **Hearing:** sprinting is heard far off and from the other floor. Walking
  is heard close up. **Crouch-walking is silent at any range.**
- **Thrown lures:** heard where they **land**, up to the item's own radius.
  A book is quiet, about 6.5 m. Glass is loud, about 14 m and both floors,
  and it shatters. She goes to the landing, finds nothing, and searches
  around it.
- **Sight needs three things:** Mark is in front of her (a 60° half-angle),
  nothing is between them, and he is close enough *for the light he's in*:
  - Dark: about 3 m.
  - Lit (a surviving candle's pool, a lightning flash, his own torch): about 12 m.
  - **The torch pointed at her** is seen whichever way she faces.
- **Cover:**
  - **Low** (Chesterfield, sheeted armchair and sofa) hides Mark only while
    he crouches.
  - **Tall** (folding screen, sheeted cabinet, wardrobe) hides him standing.
  - The loft floor hides him except across the open well at the front.
- **Hide spots:**
  - Inside the wardrobe (E in, E out, peek through the gap between the
    doors) or behind one of the two curtains, she cannot see him at all.
  - When she searches she may open them. Opening the one he's in is a catch.
  - If she loses him mid-chase right beside a spot, she always opens it.
- **Her chase is always slower than his sprint,** on every difficulty, so
  breaking contact is always possible.
- **Her cues:** 3D breathing and footsteps (the director's stalk cue) and
  caption-only whispers ("Mark...?", "Please come out."). The voice
  recordings were removed, so these are text until new ones exist.

## Catch scares (core/jumpScares/)

Each study catch plays one of three new scares at random, never the same
one twice running. They are tagged `pool: 'study'`, so the backrooms never
draws them and the study never draws the backrooms' scares.

| Scare | What happens |
|---|---|
| `sedate.js` (3.2 s) | She runs at him from two metres. Her hands hit his chest and he goes over backwards. She comes down over him and pins his shoulders while his hands shove at her arms. Her right hand comes back with the syringe; he grabs her wrist; she forces it into his neck and the plunger goes down. The wake pass runs backwards (lids, blur, double vision), his head rolls away along the floor, and the caption reads "Sleep, Mark..." |
| `lightningFace.js` (2.0 s) | The dark room; he glances off to his left. Then three strikes: she is running at him; she is an arm's length off and his hands are up in front of his face; she has his head in her hands and wrenches it. A hard cut to black. |
| `dragged.js` (3.35 s) | A hand round his ankle: he looks down his own body at her, low at his feet. She yanks the leg and he goes over backwards, then hauls him away a heave at a time, walking backwards, while his hands claw at the boards and his free leg kicks. It ends where the respawn begins. |

**They are played in Mark's own body.** Each scare borrows the player's
body (main.js `playerBody`), and the lens rides in its head (`JumpScare.js`,
"MARK'S BODY"). So the camera moves because the body does: it tips over on
its heels, lies on the boards, steps backwards and is hauled. Both figures'
arms are solved onto each other every frame by two-bone IK:
- **Her hands** are on his chest, his shoulders, his neck and his ankle.
- **His hands** are on her arms and her wrist.

Her walk runs backwards when she hauls (`OkabeCreature.setBackwards`). The
camera's knocks are functions of time (`rig.ring`, `rig.wobble`), so a
frozen frame shows what a played one would.

**They keep the blackout's light.** In a blackout, the light every scare
puts on her face is turned down to a fifth and tinted the moon's colour.
With his body in view, it hangs over her face (`rig.lightOverHer`) instead
of under the lens, where it lit his own hands bright white. The study mirror
holds its last picture during a catch, because its pass re-poses both
figures and would wipe the scare's pose.

Then `comeRound` plays under the mantel candle, and she starts again from
the far side about four seconds later.

## Tuning (StudySeeker.js, `STUDY_SEEKER_TUNING`)

| Difficulty | Hear sprint | Hear walk | Sight dark / lit | Speed | Gives up after | Opens a hide spot |
|---|---|---|---|---|---|---|
| Easy | 7 m | 2.2 m | 2.6 / 10 m | x0.92 | 22 s | 35% |
| Medium | 9 m | 3.2 m | 3.2 / 12 m | x1.00 | 32 s | 60% |
| Hard | 12 m | 4.2 m | 3.8 / 14 m | x1.08 | 45 s | 85% |

The teaser scales these down further: sight x0.7, speed x0.85, give-up
x0.45, hide-spot checks x0.35. Her paces are a fraction of the player's
(`MoveSpeeds.js`):

- Patrol: 0.55 walk.
- Investigate: 0.85 walk.
- Chase: sprint / 1.3, the backrooms hunter's ratio, capped at 0.9 sprint.

## Controls

- **Left click:** throw the book or bottle in hand, up to about 8 m, where
  the crosshair is. It lobs in an arc solved to land on that spot
  (`DropPhysics.js` with a launch speed).
- **Q** still drops.
- Up to **three books** (one hotbar slot, with the count on it) and one
  bottle can be carried. A thrown book's next one comes up into the hand.
  Every thrown book stays where it lands: copies of a stack are tracked
  separately (`droppedItems`, keyed `studyBook#n`).
- The first book and the first bottle each show a tip: **Left click** throws.
- A thrown item lands on whatever surface is under where it comes down,
  read off the geometry. It used to use the level's `groundAt`, which on
  the stair answered for the nearest floor, so a book thrown onto the
  treads ended up under the stair, out of sight (fixed 2026-10-28).
- **E** on the wardrobe hides; **E** again steps out.

## Where the code is

| File | What |
|---|---|
| `src/levels/studyBlackout.js` | The moon and lightning lights (built at boot, intensity only), the power fade, survivor candles, the breaker and the fuse tin |
| `src/levels/studyHideProps.js` | Placeholder cover, the wardrobe, the curtains, sheeted furniture, and the book and bottle piles |
| `src/world/hideAndSeekItems.js` | The book, bottle and fuse meshes, shared by the room and the hand |
| `src/systems/StudySeeker.js` | Her state machine: `patrol -> investigate -> search -> chase -> caught`, plus `withdraw`, the senses, and the walking graph over both floors and the stair |
| `src/core/jumpScares/{sedate,lightningFace,dragged}.js` | The three catch scares |
| `src/main.js` | The **LEVEL 3 HIDE-AND-SEEK** block: the blackout beats, the wardrobe, throwing (`throwHeldItem`), lure landings, the visor glimpse and the catch |
| `scripts/check-study-seeker.mjs` (`npm run check:seeker`) | Headless proof that: <br>- the light count holds<br>- every nav edge is walkable<br>- she climbs to the archive<br>- she goes to a book's landing<br>- crouching is silent and walking is heard<br>- low cover works<br>- her chase is slower than a sprint<br>- open and curtain catches work<br>- the scare pools stay separate |

## Pass 2: the models

Built 2026-10-27, one Python script per model in `blender/study/`, run in a live Blender (`hide_and_seek_kit.py` has the shared helpers and says how). Each writes a `.blend` beside Daniel's study models and a GLB in `src/assets/models/study/`. Rebuild one and re-run `npm run compress:assets`.

| Model | Script | Tris | What the game reaches by name |
|---|---|---|---|
| Wardrobe | `build_wardrobe.py` | 2.1k | `Door_L` / `Door_R`, origins on their hinges (doors swing for entering, leaving and her check, and stay wide for a catch inside) |
| Folding screen | `build_folding_screen.py` | 1.9k | (static; on the rug toward its corner nearest the fireplace, turned 45 degrees to face into the room, and collided as a chain of small boxes along its diagonal) |
| Curtain, used twice | `build_curtain.py` | 1.9k | `Strip_0..3`, origins on the rod (sway when Mark steps behind one, or she pulls it back) |
| Dust sheets | `build_dust_sheets.py` (cloth-simulated) | 9.1k for all three, with the furniture | `Sheet_Armchair`, `Sheet_Sofa`, `Sheet_Cabinet`, each with the furniture it hides joined in: a velvet seat on walnut legs, or a walnut cabinet on its plinth |
| Books, 4 covers | `build_books.py` | 52 each | `Book_0..3`, each with a `FrontCover` hinged on the spine (a thrown book's cover falls open as it lands) |
| Breaker board | `build_breaker_board.py` | 1.4k | `LeverPivot` (0 is ON, +2.3 rad OFF), `FuseSeat` (Level 2's `fuse.glb` is seated there) |
| Fuse tin | `build_fuse_tin.py` | 0.5k | (static; the spare fuse lies inside it, its printed lid beside it) |
| Chesterfield | `import_chesterfield.py`, from Poly Haven "Sofa 02" (CC0) | 2.7k | (static; scaled to 0.9 m tall so it hides a crouch, 2.3 x 1.04 m) |
| Wine bottle | `import_bottle.py`, from Poly Haven "Wine Bottles 01", the Bordeaux (CC0) | 0.9k | `Bottle`, origin at the neck (the glass made opaque, the wine inside removed) |

The two library models were Kiran's picks from side-by-side renders. Their downloads and licences are in `blender/source/sofa_02/` and `blender/source/wine_bottles_01/` (see `SOURCE.md` in each).

How they follow the study's conventions:
- Wood is named `walnut` with no image, so `studySurfaces.harmoniseAsset` gives it the room's wood. Brass and cream are tuned the same way.
- The fabrics (damask, velvet, linen, book cloth) are generated from a fixed seed in each script and shipped as 512 px WebP.
- There are no normal maps.
- The placeholder sizes are kept, so the colliders, the cover boxes and `check:seeker` are unchanged.

## Still to do

- **Annabelle:** a walk/search clip, so the visor glimpse is not her standing pose sliding along.
- **Monster clips:** search, listen, reach behind cover. The catches are posed in code (`core/jumpScares/`).
- **Recorded whispers,** if the team wants voice for them.
- **Tuning:** distances and times from playtests.
