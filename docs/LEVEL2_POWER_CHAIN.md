# Level 2 -- The Power Chain

Reference for the basement lab's electrical puzzle: what the player does,
how the state machine is wired, every tuned number, and why the design
choices are the way they are.

Everything here lives in `src/levels/hallwayBasementLevel.js` unless
another file is named. See `docs/WORLD_DESIGN.md` for the scenegraph
reasoning behind the rest of the level, and `Gameplay Puzzle Ideas.pdf`
for the brief this implements ("Puzzle 1 -- Missing Fuse", "Puzzle 2 --
Generator", "Puzzle 3 -- Breaker / Circuit Panel").

---

## The chain, end to end

| # | Beat | Player action | Result |
|---|------|---------------|--------|
| 1 | **Missing fuse** | Find the 30A fuse among four, seat it in the fuse box | Lights and CCTV come up. The door stays bolted. |
| 2 | **The lit window** | Cross the room | The generator and breaker panel are only findable while the lights are on |
| 3 | **Blackout** | Go for the metal door | A lever is thrown. Lights *and* cameras die together |
| 4 | **Generator** | Work three controls in the order on the plate | Current reaches the breaker panel, nothing else |
| 5 | **Breaker panel** | Set the three circuits that fit the 60A rating | Nothing yet -- the panel is dead until the main goes in |
| 6 | **Main switch** | Throw it | The bolts come live, and the whole house lights up |
| 7 | **Security code** | Read the claw tally off CAM 4, enter it at the door | The lockout releases |
| 8 | **Exit** | Open the door | On to the study |

The design brief's Level 2 identity is *"environmental systems rather
than hidden keys."* Before this pass the entire level was one fuse and
then a run of scripted beats; the generator was a decorative box with a
collider and there was no breaker panel at all.

---

## The state machine

`powerStage` replaced a single `powerRestored` boolean. The two questions
that boolean used to answer -- *"do the lights work?"* and *"are the door
bolts fed?"* -- stopped being the same question the moment the fuse alone
was no longer enough to get out.

```
DEAD ──30A fuse──> LIT ──reach the door──> BLACKOUT ──generator──> RUNNING ──breakers──> ROUTED
```

| Stage | Lab lights | CCTV | Door bolts | Meaning |
|-------|-----------|------|------------|---------|
| `DEAD` | off | off | dead | No fuse, or a wrong one |
| `LIT` | **on** | **on** | dead | The 30A is in. It only ever fed one section |
| `BLACKOUT` | off | off | dead | The main was thrown, by hand, at the far wall |
| `RUNNING` | off | off | dead | Generator restarted; current at the panel, routed nowhere |
| `ROUTED` | **on** | **on** | **live** | The panel is committed. Everything is fed |

Power is the *last* electrical stage, not the last obstacle: the door still
holds behind a security code (below).

Everything reads the stage through one function, `isCircuitLive(circuitId)`.
It answers differently on each side of the panel, which is the point: before
`ROUTED` there are no circuits to speak of -- the 30A fuse feeds one section
of the lab wholesale, so LIGHTING and CCTV are effectively closed and
everything else is open. After it, the breakers themselves are the answer.

Four named predicates sit on top of it, and nothing outside them tests the
stage directly:

- `hasMainsPower()` -- anything live at all. `LIT` or `ROUTED`.
- `isLabLightingOn()` -- the strip lights and the ambient term.
- `isCctvPowered()` -- the monitor, the remote, and whether `feeds.update()`
  bothers redrawing.
- `isDoorPowered()` -- the bolts.

`hasMainsPower()` lists its live stages **explicitly** rather than testing
"not one of the dead ones", so a stage added later cannot silently switch the
lights on in itself by default.

`refs.powerStage` exposes the stage read-only. `refs.powerRestored` is kept as
an alias for `hasMainsPower()` so nothing outside the level broke.

---

## Puzzle 1 -- the fuse (pre-existing, two changes)

Unchanged: four fuses (15A / 20A / 30A / 45A), a maintenance log giving
the rating, under-rated fuses blowing with a spark, the 45A whiting the
room out until it is pulled.

**Changed:** seating the 30A now moves the stage to `LIT`, not to
"everything is on". The door label deliberately does *not* become
`Open the door`.

**Changed:** once the 30A is seated it **cannot be pulled back out**. The
fuse box's `onInteract` returns early on `puzzleState.slotFuse ===
CORRECT_FUSE_AMPS` with a caption pointing further down the line. Without
this guard the blackout sends players back to re-solve a puzzle that was
never the problem -- the classic failure mode of taking a reward away.

`CORRECT_FUSE_AMPS` is a named constant; four branches used to test the
bare string `'30A'`.

---

## Puzzle 2 -- the blackout

### Why it is caused, not timed

The original sketch for this beat was a timer: power fails "a while
after" the fuse goes in. Two problems killed that:

1. **A silent timer reads as the game cheating.** The player solved the
   fuse, got the reward, and the game took it back for no visible reason.
2. **It would eventually fire mid-CCTV.** The scripted camera sightings
   in `main.js` (the hallway dash, the figure standing in the basement,
   the creature in the corner) are the best content in the level. A
   wall-clock timer will sooner or later detonate in the middle of one.

So the trip is **caused by the player walking to the door**, and the
reward it takes away was never full: the fuse gave lights and cameras,
never the exit.

The delay is still there, but it is *spatial*. The player has to cross a
lit lab to reach the door, and that lit window is the only time the
generator and the breaker panel are easy to see. The blackout does not
just remove something -- it hands over the next two objectives first.

### Why it fits the story

The creature in this house is Annabelle, hiding *from* the player and
trying to stop them escaping (see `Storyline Overview.pdf`). Someone
throwing the main the instant the player goes for the exit reads on a
first play as the house turning hostile, and on a replay as exactly what
it is: a sister cutting the power to keep her brother away from the front
door. The beat shows nobody -- only the lever and the breathing.

### The trigger volume

A **box**, not a radius, and no wider than the doorway:

```js
PLAYER_BODY_RADIUS_IN_METRES        = 0.35
DOOR_WIDTH_IN_METRES                = 1.1
DOOR_APPROACH_HALF_WIDTH_IN_METRES  = 1.1 / 2 + 0.35   // 0.90
DOOR_APPROACH_DEPTH_IN_METRES       = 1.6
```

`isPlayerAtDoor(playerPosition)` is true when
`|x| <= 0.90 && z >= doorWorldZ - 1.6`. World coordinates, because that
is what the player position arrives in; everything else in the file is
lab-local. Height is ignored -- the player never leaves the floor.

**Why not a radius:** the CCTV desk stands about 2 m from the door. Any
sphere large enough to catch someone walking up to the door also catches
someone standing at the monitor. Half the door's width plus the player's
own body radius is the narrowest volume they cannot pass through without
their shoulders crossing the doorway.

A **build-time `console.warn`** fires if the desk ever moves inside the
lane, so this cannot regress silently into a blackout that eats the
camera scenes. The current margin is thin on purpose: the desk's near
edge is at x = 0.95 against a 0.90 lane.

### Two ways to trigger it

Both mean "going for the door":

1. **Walking into the lane** -- checked in `update(dt, playerPosition)`.
2. **Interacting with the door** -- checked in the door's `onInteract`.

The second closes a real hole found during testing: the interaction
raycaster reaches 3.2 m, so a player standing off to one side (past a
lane only as wide as the doorway) could look at the door and press `E`
from outside the volume, and the blackout would never fire.

Both paths are gated on `powerStage === LIT`, so the trip cannot happen
before the fuse gives the player something to lose, and cannot happen
twice.

### What it does

`triggerBlackout()` sets the stage, then drops `powerLevel` to `0`
**immediately** rather than letting the ramp ease it down -- a hand
pulling a main breaker is not a fade. The ramp in `updateLabLighting`
then simply holds it there. It also pushes the CCTV shader back to full
static, unlights the feed buttons, and relabels the monitor and the door.

The player keeps their flashlight, so the dark lab stays navigable.

---

## Puzzle 3 -- the generator

Three controls in a row across the generator's front face, worked in the
order given by a plate bolted above them:

```
GENERATOR_RESTART_SEQUENCE = ['valve', 'primer', 'starter']
```

- **Correct step** -> that control lights green, caption acknowledges it.
- **Wrong step** -> `generatorStepsCompleted` resets to `0`, every light
  goes dark, a spark fires: *"It coughs, floods and dies."*
- **Third correct step** -> `startGenerator()` moves the stage to
  `RUNNING`.

The green lights exist so the player can see how far into the sequence
they are without having to remember, which matters when the room is dark.

Outside `BLACKOUT` the controls only talk: before the main is thrown the
generator is already turning over, and afterwards it is running. Neither
state has anything to restart.

Each control is pushed into `interactables` **individually**, not as a
parent group -- `Interaction` raycasts non-recursively
(`intersectObjects(this.targets, false)`), so a parent group with three
children would never register a hit. Same reasoning as the CCTV remote.

---

## Puzzle 4 -- the breaker panel

Five labelled circuits, a load chart on the wall, and a **main switch** below
the column that commits whatever the breakers are set to.

| Circuit | Load | Required? | What it is |
|---------|-----:|-----------|------------|
| DOOR | 25A | **yes** | the bolts on the metal door |
| CCTV | 15A | **yes** | the five cameras |
| LIGHTING | 20A | **yes** | every light in the building, this lab included |
| LOCKS | 40A | no | the house's locks and alarm |
| VENT | 30A | no | air handling (pure flavour) |
| **Capacity** | **60A** | | |

### Every circuit is a distinct system

An earlier pass had a `LAB` circuit sitting alongside `CCTV` and `LIGHTING`,
which was incoherent: LAB is a *room*, and it contains the other two, so
"LAB off, CCTV on" meant nothing. It also had a `SECURITY` circuit that
referred to nothing in the game at all -- a label lifted from the brief's
suggestion list with no referent, existing only to not fit the budget.

`LOCKS` replaced a briefly-tried `CONTAINMENT`, which had the same problem in
a milder form: it names something real in the story, but the player does not
learn what containment *is* until Mark's letter in Level 3, so at the panel it
reads as noise. `LOCKS` is legible on sight -- the player has been fighting
locks since Level 1 -- and lands harder on a replay for exactly the same
reason it was worth planting.

### The shape of the puzzle

**DOOR + CCTV + LIGHTING = 60A, exactly the capacity.** There is no slack, so
the decoys are not merely unnecessary, they are unaffordable.

**LOCKS draws 40A, so LOCKS + DOOR is 65A and the panel physically cannot
carry both.** Nothing special-cases this; it falls out of the arithmetic. A
player who wants out switches off the system holding the house shut, without
being asked to think about it -- the ending rehearsed three levels early, in a
switch they will not remember throwing. The letter later names "the three
containment locks", which is what the breaker was.

### One LIGHTING circuit, not two

An intermediate design split this into a `LIGHTING` circuit for the lab and a
`HOUSE` circuit for upstairs, with only enough spare capacity for one -- a real
choice, carried into Level 3 by dimming the study.

**It was cut, because it put the game's best reveal on a switch the player
could turn off.** Camera five looks at the basement and shows a figure standing
exactly where the player is standing; that shot is the whole point of the CCTV
system and half the point of the level. A design where the player can leave the
basement dark can also make that reveal a black screen. Losing an invented
choice is a much cheaper price than losing that.

So LIGHTING now feeds the whole building, and `gameState.housePowered` and the
study's dimming were both removed rather than left as code that could never
fire.

Two **build-time `console.warn`s** guard the arithmetic: the required circuits
must come to *exactly* the capacity (over is unsolvable, under lets a decoy be
left on and still solve it), and LOCKS must not fit alongside DOOR.

### The main switch

Flicking a breaker never trips and never routes. The panel is dead until the
main goes in, so setting breakers is a **plan laid out against the load chart**,
not a live experiment -- the player has to do the arithmetic before they get
any feedback, which is the difference between a puzzle and a slot machine.

Throwing the main does one of three things:

- **over capacity** -> `tripBreakerPanel()`: every breaker drops open, a spark
  fires, the room blows out white for `BREAKER_TRIP_GLARE_IN_SECONDS = 1.1`.
- **a required circuit still open** -> refuses, and *names which one*. The
  puzzle is the budget, not guessing which systems matter.
- **otherwise** -> `routePower()`.

During the trip glare, flicks are refused out loud (*"The panel has not reset
yet."*). Swallowing input silently reads as a broken switch.

### The glare is deliberately shared

The trip reuses the `OVERLOAD_*` constants and ramp that the over-rated 45A
fuse already drives, rather than adding a second whiteout. The player only ever
has to learn one visual for *"you pushed this circuit too hard."*
`updateLabLighting` targets `puzzleState.overloaded ||
breakerTripTimeRemainingInSeconds > 0` -- a persistent source and a timed one,
sharing one ramp and one look.

---

## The cameras as the panel's readout

The player has to *want* the LIGHTING breaker before they reach it, and the
level already had the thing that could tell them: five cameras pointed at rooms
they cannot otherwise see.

`FEED_ROOM_ZONE` in `src/world/CctvFeeds.js` maps each camera to the part of
the building it watches -- kitchen, hallway, porch and study to `house`,
camera five to `lab`. Both end up on the same LIGHTING breaker, but they light
up at different *moments*, which is the whole trick:

| Stage | Camera 5 (basement) | Cameras 1-4 (house) |
|-------|--------------------|---------------------|
| `LIT` (fuse only) | **lit** | dark |
| `BLACKOUT` / `RUNNING` | dark | dark |
| `ROUTED` | **lit** | **lit** |

The fuse feeds *this section of the lab only*, so from the moment the monitor
wakes, the player sees one working camera and four black rooms stamped:

```
        -- NO POWER --
       CIRCUIT: LIGHTING
```

That gap is what tells them the house has power of its own to find, long
before they see a panel. The circuit is named on screen on purpose -- they read
the word here, then find it printed on a switch two puzzles later.

The veil is drawn **over the room render but under the camera's own OSD**, so
the label and timestamp stay bright. That ordering matters -- a feed that
dimmed everything would read as a *failing camera* rather than an *unlit room*,
and the player would go looking for the wrong fix.

Camera five is never dark while the player can act on it, which is the point of
the redesign above.

---

## Puzzle 5 -- the security code

Power alone does not open the metal door. It holds behind a keypad, and the
code is the **panelling of the study's front door**, three rooms away,
readable only through camera four.

### The door design

An ordinary panelled door: three rows of raised rectangular panels, a
different number in each row, read top to bottom.

```
 ┌───────────────┐
 │  ▭▭▭    ═══   │  2   ← top row
 │  ▯▯▯▯   ═══   │  4   ← middle          code: 243
 │  ▭▭▭    ═══   │  3   ← bottom
 └───────────────┘
      panels     locks (stile)
```

Rows read downward the way any other stack does, so the order needs no second
clue. The counts are distinct so no two rows are confusable, and none exceeds
4 -- five narrow panels across a 1 m door stop looking like joinery and stop
being countable through grain.

### Why panels and not a marking

An earlier version scored claw marks into this door and asked the player to
count those. Panels are better for a reason that has nothing to do with looks:

**A panelled door needs no justification at all.** Marks scratched into a door
raise the question of who made them and why they happen to be countable.
Panels are simply what doors are like. The information hides in plain sight
instead of being planted, which is the difference between a clue and a prop
labelled CLUE.

They are also far easier to read at 320x240. A panel is a large rectangle with
a hard edge -- the one thing a low-contrast interlaced feed renders well. Thin
strokes smear into each other; the narrowest panel here is 14px wide.

### One source of truth

`src/world/doorPanels.js` exports `DOOR_PANEL_ROWS` and derives `SECURITY_CODE`
from it. Three files that otherwise have no reason to know about each other
consume it: the CCTV painter, the study level, and the basement's keypad check.

It also exports `getPanelSpans(count)`, which returns each panel's position and
width as fractions of the row. **Both the 3D door and the CCTV painter lay out
from it**, so they share a visual rhythm rather than merely a count. Two
hand-tuned layouts that happened to look similar would drift the moment either
was adjusted -- and here "drift" means the door the player was shown stops
matching the door they counted.

If any two consumers disagreed the puzzle would not merely break, **it would
lie**: the player counts correctly and is refused, with no way to tell a
miscount from a bug.

### Panel field and lock stile

The panels take the left 62% of the door and the locks the right. That is what
real joinery does -- a lock goes through the stile, never through a panel --
and it is also what keeps the puzzle readable: a lock bar crossing a panel
would break the rectangle the player is counting, and an uncountable row is
worse than no row.

Verified rather than eyeballed: on the feed the panels end at 177px and the
lock stile starts at 181px; on the real door the panels stop at x = 0.189
against lock bodies beginning at 0.30.

### The feed had to be fixed first

Camera four's door was **45px wide with 5px lock bars at 26px spacing**. The
thin dark bars left four fat light gaps, so the eye read the *gaps* as the
objects -- a stack of pale blocks, no door, no locks.

Widened to 96px. The lock bars are now **6px of `INK.dark`** rather than 11px
of `INK.black`: at the heavier weight they were the loudest thing in frame and
pulled the eye off the panels, which are what the player actually has to read.
Hardware should register as hardware and then get out of the way. Each panel
gets a two-tone treatment -- a face plus a lit top and left edge -- because two
tones is all it takes to read as proud of the surface, and edges survive grain
where a shading gradient would not.

### The same door in Level 3

`studyLevel.js` builds the panels as real geometry on the slab -- raised 14mm
boxes, children of the **slab** rather than of `frontDoor`, because the panels
are the door and swing with it while the locks are bolts seated in the frame.

Raised rather than recessed on purpose: a proud panel catches the study's lamp
along its top edge, which is what makes it legible as a separate rectangle from
across the room. A recess would read as shadow and merge with its neighbours.

So the player meets that door twice: once at 320x240 through static, counting
rows to get out of a basement, and once in person at the end of the game.

### The note

The only statement anywhere of the rule. Without it a player sees a perfectly
ordinary panelled door and has no reason to count anything -- which is exactly
the point of hiding the code in something that needs no explanation for being
there.

> *"SECURITY LOCKOUT. The security code is on the study door design. Top to
> bottom."*

It deliberately does **not** name the camera. There are five and only one shows
the study, so "the study door" is already enough to find it; leaving the player
to make that one connection is the difference between a clue and an
instruction.

### What this replaced

A one-time "your hand stops on the bolt" hesitation at the door, plus a note
telling the player to check the cameras. Both existed to push players toward
content that was optional and therefore skippable. The cameras are mandatory
now, so the nudge had nothing left to do and is gone.

### Ordering falls out for free

The house feeds stay dark until the panel is routed, so camera four is
unreadable before that point and readable after it. Power -> cameras -> code
-> door, with no extra sequencing work.

---

## Integration points

### Callbacks on `createHallwayBasementLevel`

The level owns its own lights, screen and labels. These fire for everything
**outside** the level that a beat drives -- story captions, audio, the
creature, and the one flag that outlives the level.

| Callback | Fires when |
|----------|-----------|
| `onPowerRestored` | the 30A fuse is seated (pre-existing) |
| `onBlackout` | the main is thrown at the door |
| `onGeneratorRunning` | the restart sequence completes |
| `onOverload` | the breaker panel trips |
| `onPowerRouted` | the main switch commits |
| `onEnterSecurityCode` | the player uses the door with the lockout still on. Passed `{ code, onSolved }` |

### `main.js`

`onBlackout` plays `audio.creak()` + `audio.spark()` and pushes breathing to
`0.9` -- it is close, and the audio says so without showing anything.

### `src/core/PinPadUI.js`

Reused, not rewritten -- it was already generic over code and length for the
bedroom's lamp-drawer lock. The level says *what* the code is and what happens
when it is right; `main.js` decides how it is typed, because the keypad is DOM
and needs the player lock/unlock that only the host owns.

### `src/world/CctvFeeds.js`

`FEED_ROOM_ZONE` maps each camera to the part of the building it watches.
`setRoomPower({ house, lab })` drives it, and redraws all five feeds rather
than only the visible one -- the player switches cameras with the remote and
each has to be correct the instant it appears. `houseLit` and `labLit` read
back. `reset()` returns the house to dark and the basement to lit.

Every stage that changes the power calls `syncFeedRoomPower()`, the blackout
included. It has nothing to show at that moment (the screen is pure static),
but leaving the feeds believing the basement is lit means the first frame
after power returns paints a stale image.

### `src/story/lines.js`

New beats: `blackout`, `generatorRunning`, `powerRouted`, `breakerOverload`.

`BEATS.powerRestored` was **corrected**, not just added to. It said *"The
generator catches. Lights come up in stages down the room."* at the point the
fuse goes in -- a line that now belongs to a later beat, and that was
promising the player a way out the fuse does not open. It now ends *"The
cameras are live. The door at the far end is not."*

Level captions stay terse and sensory; the `BEATS` scripts carry the
interpretation. The blackout is the clearest case: the level says *"The room
goes out. All of it, in one snap."* and the beat that follows tells the player
it was a hand on a lever, not a fault. They feel it, then understand it a
second later.

### `src/core/SceneManager.js`

`update(dt)` became `update(dt, playerPosition)` and forwards both to the
active level. `main.js` passes `camera.position`. Levels that do not declare a
second parameter are unaffected, and the basement's proximity check is
`playerPosition`-optional so a caller that omits it simply never fires the trip.

---

## Reset

`reset()` restores everything the new puzzles own:

```js
powerStage = POWER_STAGE.DEAD;
generatorStepsCompleted = 0;
updateGeneratorControlLights();
breakerTripTimeRemainingInSeconds = 0;
resetAllBreakers();
mainSwitch.rotation.z = BREAKER_OFF_TILT_IN_RADIANS;   // + emissive, + label
hasViewedAnyFeed = false;
hasHesitatedAtDoor = false;
if (!interactables.includes(doorNote)) interactables.push(doorNote);
```

Without these an `R` after a solved panel restarts the level with the
generator's sequence half-entered, every breaker showing green, the main
latched in, the door's one-time nudge already spent, and the door note gone
from the target list. Door labels come from the `DOOR_LABELS` table keyed by
stage, so the reset cannot drift out of sync with the stage it resets to.

---

## Verification

A headless harness (stubbed canvas + DOM, driving the level's own
`interactables` and `update()` the way a player would) covers 24 checks, all
passing:

**The chain**
- Dead circuit: the door does not open, and walking to it does nothing.
- Wrong fuses: the 45A never restores power and never arms the blackout.
- The 30A lights the lab, leaves the door locked, and cannot be removed.
- **Standing at the CCTV desk does not trip the blackout**; walking into the
  lane does; it fires exactly once; reaching the door from *outside* the lane
  still trips it.
- CCTV and the feed buttons both go dead across the blackout.
- Both generator failure orders reset; the right order starts it.

**The panel**
- The house feeds are dark from the moment the screen wakes, while camera five
  (the basement) is already lit -- the gap that teaches the player HOUSE power
  exists to be found.
- Camera five goes dark with the blackout and comes back with the panel; it is
  never switchable off on its own.
- Closing every required breaker does **not** route on its own.
- The main refuses an incomplete panel, and names what is still open.
- LOCKS + DOOR trips; the trip drops every breaker.
- The required three plus VENT reads 90A and trips the main.
- The required three alone route, and light the lab and the house together.
- The main switch latches.

**The door**
- The note sits dead centre in x, at eye level (y = 1.55), facing back down
  the room -- and stops being an interaction target once read, so it cannot
  block the door it is taped to. `reset()` puts it back.
- The nudge stops the first attempt, points at the cameras, and opens on the
  second -- and never fires for a player who already looked.
- `reset()` returns every one of the above to its starting state.

`npx vite build` is clean. The harness is not in the repo -- the project has
no test setup to hang it on.

---

## Known trade-offs

- **The lane margin is thin.** The desk's near edge sits at x = 0.95 against a
  0.90 m lane. It is guarded by a build-time warning rather than by slack,
  because widening the lane re-introduces the problem it exists to solve and
  narrowing it lets players slip past the door edge.
- **Four power puzzles now stand between the player and the exit.** The
  generator is deliberately three steps and the panel five switches plus a
  main, to keep that stretch short. If playtesting says it drags, the
  generator is the piece to cut.
- **VENT is inert flavour.** It exists so the panel reads as a panel rather
  than as exactly the circuits the puzzle needs plus one trap. It refers to
  nothing else in the game, which is the same criticism that killed SECURITY
  -- the defence is only that a ventilation circuit in a sealed basement lab
  is self-explanatory in a way "security" was not.
- **The CCTV sightings can still happen before the blackout.** A player who
  works through all five feeds while the lab is in `LIT` sees the
  creature-in-the-corner beat before the exit opens, which is out of storyline
  order. This predates the change and is not made worse by it, but it is the
  obvious next thing to sequence properly.
