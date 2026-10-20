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
| 1 | **Missing fuse** | Find the 30A fuse among four, seat it in the fuse box | The lab's lights come up -- nothing else. The CCTV desk and the door stay dead. |
| 2 | **The lit window** | Look around, fast | 20-30 s to see where the generator and breaker panel are |
| 3 | **Blackout** | Nothing -- or go for the door or the CCTV desk | A lever is thrown and the lights die, whichever comes first |
| 4 | **Generator** | Work three controls in the order on the plate | Current reaches the breaker panel, nothing else |
| 5 | **Breaker panel** | Set the three circuits that fit the 60A rating | Nothing yet -- the panel is dead until the main goes in |
| 6 | **Main lever** | Push it up | The bolts come live, the CCTV desk wakes for the first time, and the whole house lights up |
| 7 | **Session tape** *(the story, not a lock)* | Take the tape from the camcorder on the floor, press PLAY on the deck | What happened on the restraint table |
| 8 | **Security code** | Count the panels on the study door through CAM 4, enter it at the door | The lockout releases |
| 9 | **Exit** | Open the door | On to the study |

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
DEAD ──30A fuse──> LIT ──clock / door / desk──> BLACKOUT ──generator──> RUNNING ──breakers──> ROUTED
```

| Stage | Lab lights | CCTV | Door bolts | Meaning |
|-------|-----------|------|------------|---------|
| `DEAD` | off | off | dead | No fuse, or a wrong one |
| `LIT` | **on** | off | dead | The 30A is in. It only ever fed this section's lights |
| `BLACKOUT` | off | off | dead | The main was thrown, by hand, at the far wall |
| `RUNNING` | off | off | dead | Generator restarted; current at the panel, routed nowhere |
| `ROUTED` | **on** | **on** | **live** | The panel is committed. Everything is fed |

Power is the *last* electrical stage, not the last obstacle: the door still
holds behind a security code (below).

Everything reads the stage through one function, `isCircuitLive(circuitId)`.
It answers differently on each side of the panel, which is the point: before
`ROUTED` there are no circuits to speak of -- the 30A fuse feeds this
section's lights and nothing more, so LIGHTING is effectively closed and
everything else, the CCTV desk included, is open. After it, the breakers
themselves are the answer. The desk is dead until the panel is routed: the
fuse lights the room so the player can find the generator, and that is all
it does.

Four named predicates sit on top of it, and nothing outside them tests the
stage directly:

- `hasMainsPower()` -- anything live at all. `LIT` or `ROUTED`.
- `isLabLightingOn()` -- the strip lights, the ambient term, and the surgical
  lamp over the restraint table, which the player switches on by its handle
  and which, like the monitor, stays switched on through a blackout and comes
  back with the power.
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

### The fuse box and the fuses themselves

The box is `fuse_box.glb`, built by `blender/build_fuse_box.py` after a
four-way cartridge fuse board: sloped inner walls, a screwed backplate, four
pairs of copper spring clips, wires out through grommets top and bottom (the
generator cable goes into the bottom one, a conduit leaves the top one for
the ceiling), and a **hinged, transparent cover**.

- **Four slots, one empty.** Three glass fuses are part of the box model
  itself and never move. The third slot is empty, and it is the only one the
  player ever fills.
- **The cover is its own click.** The first E opens it; only then does the
  slot take a fuse. The dirty pane lets the player see the empty clips
  before touching anything. **It closes again** from a click on the open
  cover itself (`setFuseCoverOpen`), and reopening restores whatever the
  slot was offering.
- **An open cover is solid.** While it stands out into the room it has a
  collider (`setSwingCollider`), added on opening and removed on closing.
  The player used to walk straight through it.
- **Every fuse is the same glass cartridge** (`blender/glass_fuse.py`):
  nickel caps, a glass tube, blue end sleeves and an S-shaped element, about
  the size of a toilet-roll tube (4.8 cm by 10 cm). The four loose ones are
  clones of `fuse.glb`, and the rating stamped round their caps
  (`createFuseCapStampTexture`) is the only thing that tells them apart.
  They used to differ in thickness instead.
- **A fuse is seen in the slot.** Whatever the player installs stands in the
  empty clips, right or wrong, until it is pulled.
- **Only an under-rated fuse blows.** A 15A or 20A soots its glass and snaps
  its element the moment it goes (`setFuseScorched`), and stays that way
  where it lands on the floor. The 45A whites the room out but comes back out
  intact. A restart puts every fuse back to whole and closes the cover.

Two practical rules: the slot and clip positions and the fuse's size are
written in BOTH the Blender scripts and the level (`FUSE_BOX_*`, `FUSE_*`),
so change them together. And the
click target is an invisible box over the front, not the model, because
Interaction raycasts non-recursively and never reaches inside a loaded
`.glb`.

### The CRT monitor and its power button

The monitor is `crt_monitor.glb` (`blender/build_crt_monitor.py`), a beige
CRT after four reference photos. The picture is still the static/feed shader,
now on a slightly bowed plane set into the bezel's recess.

- **It has no power until the panel is routed.** The fuse lights the room and
  nothing on the desk; the `powerRestored` caption says so ("Only the lights.
  The desk and the door at the far end are as dead as before.").
- **It starts switched off**, and stays dark until the player presses the
  power button under the screen -- or presses PLAY on the deck beside it,
  which switches it on and over to the tape itself.
- **The button only works with power.** Pressed while the desk is dead it
  does nothing and says so. That is the clearest "no power" message, and it
  means the monitor can never end up switched on unseen.
- **When it is on, the button glows green**, along with the LED beside it and
  a faint green light on the bezel. The picture opens out from a thin bright
  line and collapses back to one when it goes off (`uPower` in
  `StaticScreenMaterial.js`).
- **Its input rocker**, in the middle of the chin under a label-maker strip
  reading CAMERAS / TAPE, chooses between the camera switcher and the deck.
  PLAY sets it to TAPE; the rocker and the remote's buttons set it back.
- The remote needs a picture, not just power. Pressed with the monitor off,
  it says the monitor is switched off.

**Vents and cables.** The holes down each side follow a close photo of a
real CRT: a crescent of round holes in arcs, under a pressed crease, with a
plain skirt below. The top of the casing carries rows of cooling slots. Both
are textures (`createCrtVentTexture`, `createCrtTopVentTexture`) on faces
given their own UVs, because over a thousand modelled holes would cost more
than the rest of the monitor. Three cables leave the sockets on its back
panel (`CRT_PORTS`): power, off the back of the desk to a socket low on the
wall; video, up the wall into a conduit to the ceiling; and the remote's
lead, round the monitor's right side on the desk top. They are decoration
only and are not clickable.

`isMonitorShowing()` (switched on AND the CCTV circuit live) is the one test;
`syncMonitor()` puts the button glow, the remote and both prompts in line
with it, and is called wherever the power stage changes.

---

## Puzzle 2 -- the blackout

### Three ways the main gets thrown

Once the 30A is in, the lit window ends the first time any of these happens:

| Cause | What the player did | Where |
|-------|---------------------|-------|
| `timer` | Nothing in particular -- the window simply runs out | 20-30 s after the fuse seats, a fresh draw each time (`BLACKOUT_TIMER_RANGE_IN_SECONDS`) |
| `door` | Went for the metal door | its approach lane, or E on the door |
| `desk` | Went for the CCTV desk | the box in front of it, or E on anything on it |

All three are gated on `powerStage === LIT`, so the trip cannot happen before
the fuse gives the player something to lose, and cannot happen twice.

### Why all three

This used to be **caused, not timed**: only walking to the door threw the main.
That design had two arguments against a timer -- a silent timer reads as the
game cheating, and it would eventually fire in the middle of a CCTV sighting.
The second no longer applies: the CCTV desk has no power in the lit window at
all, so there is nothing on it to interrupt.

The first is answered by keeping the triggers. A player who goes for the exit
or for the desk -- the two things the lit room seems to offer -- is cut off the
moment they try, which reads as being *watched*, not as a clock. The timer is
for the player who does neither: someone in this house will not leave the
lights on for them, and the draw between 20 and 30 s means a second playthrough
cannot count it down. Either way the lit window is a short, frightened look at
the room -- long enough to see where the generator and the breaker panel are,
which is the whole reason it exists.

### Why it fits the story

The creature in this house is Annabelle, hiding *from* the player and trying to
stop them escaping (see `Storyline Overview.pdf`). The power going the instant
the player reaches for the exit or the cameras reads on a first play as the
house turning hostile, and on a replay as exactly what it is: a sister cutting
the power to keep her brother from the front door, and from seeing what is on
the monitors. The beat shows nobody -- only the lever and the breathing. The
sticky note on the monitor -- *"Restore power and pray it doesn't hear you"* --
is the warning.

### The trigger volumes

Both are **boxes**, not radii, in world coordinates (everything else in the file
is lab-local, but the player position arrives in world space).

The door's lane is no wider than the doorway:

```js
PLAYER_BODY_RADIUS_IN_METRES        = 0.35
DOOR_WIDTH_IN_METRES                = 1.1
DOOR_APPROACH_HALF_WIDTH_IN_METRES  = 1.1 / 2 + 0.35   // 0.90
DOOR_APPROACH_DEPTH_IN_METRES       = 1.6
```

The desk's runs the width of the desk plus a margin either side, out into the
room from its front edge:

```js
DESK_APPROACH_SIDE_MARGIN_IN_METRES = 0.4
DESK_APPROACH_DEPTH_IN_METRES       = 1.4
```

The two used to be kept apart on purpose -- a build-time warning fired if the
desk crept into the door's lane, because standing at the monitor must not trip
the blackout. Now standing at the monitor is meant to, so the warning is gone.

### Reaching, not just walking

The interaction raycast reaches 3.2 m, past the edge of either volume, so a
player could press E on the door or the monitor from outside it. Both are
closed: the door's own `onInteract` throws the main first, and **every click
target that belongs to the desk** (found by walking up from each target to the
desk group, so a prop added to the desk later is covered automatically) is
wrapped to do the same while the lab is LIT.

### What it does

`triggerBlackout(cause)` sets the stage, then drops `powerLevel` to `0`
**immediately** rather than letting the ramp ease it down -- a hand pulling a
main breaker is not a fade. It knocks every breaker and the main down, kills the
generator (its fuel valve is found shut), relabels the door, and passes `cause`
to `onBlackout`.

The player keeps their flashlight, so the dark lab stays navigable.

---

## Puzzle 3 -- the generator

The generator is `generator.glb` (`blender/build_generator.py`): an
**enclosed diesel standby set, right for the 1980s**. That means a sheet-steel
cabinet in worn teal paint (`createPaintedSteelTexture`, the shared finish for
painted machinery), a latched access door, louvres, and a steel skid with
forklift pockets rather than modern casters. Its control panel faces the room
and is laid out for period hardware: three analogue gauges (volts, Hz, amps),
a pilot lamp over each control, and a maker's plate dated 1983. A ribbed
exhaust hose runs from the roof outlet to a vent high on the wall behind.

Three controls in a row across the control panel, worked in the order given
by the plate under them:

```
GENERATOR_RESTART_SEQUENCE = ['valve', 'primer', 'starter']
```

- **Each control moves when worked**: the fuel valve's red lever turns a
  quarter, the primer plunger goes in and springs back, and the pull-start's
  T-handle rips out on its rope and snaps back.
- **Correct step** -> that control's pilot lamp lights green, and a caption
  acknowledges it.
- **The pull-start takes `STARTER_PULLS_TO_CATCH = 3` pulls** once primed.
  The first coughs, the second roars for a second and dies, each shaking the
  cabinet harder; the third catches. That's the real price of restarting a
  diesel in a house you are hiding in.
- **Wrong step** -> `generatorStepsCompleted` resets to `0`, every light
  goes dark, a spark fires: *"It coughs, floods and dies."*
- **Third correct step** -> `startGenerator()` moves the stage to
  `RUNNING`.

The green lights exist so the player can see how far into the sequence
they are without having to remember, which matters when the room is dark.

**Running vs dead.** `isGeneratorRunning()` is true in every stage but the
blackout. While running, the cabinet vibrates, all three lamps are green, the
fuel valve is open, and the needles sit at 230 V and 50 Hz; the ammeter reads
the real load (35A off the fuse, the routed breakers' total after the panel).
The blackout kills it: the needles fall, the lamps go out, and **the fuel
valve is found shut**, another sign that a hand, not a fault, did this.

Outside `BLACKOUT` the controls only talk: before the main is thrown the
generator is already turning over, and afterwards it is running. Neither
state has anything to restart.

Each control is pushed into `interactables` **individually**, not as a
parent group -- `Interaction` raycasts non-recursively
(`intersectObjects(this.targets, false)`), so a parent group with three
children would never register a hit. Same reasoning as the CCTV remote.

---

## Puzzle 4 -- the breaker panel

Five labelled circuits, a load chart on the wall, and a **main lever** on the
side of the box that commits whatever the breakers are set to.

### The panel itself

`breaker_panel.glb` (`blender/build_breaker_panel.py`) is a white consumer
unit after reference photos: five black breaker modules **in one row**, spaced
wider than a real unit so each one is easy to aim at, and vent slots below.
Each module has a **chunky green lever** after a modern RCD's, built in the
level as an extruded profile, and its own **black label plate with white
capitals** after a marine switch panel (`createSwitchLabelTexture`), drawn
from `BREAKER_CIRCUITS` so it always matches the load chart.

- **A smoked cover, hinged along the top, lifts up to reach the breakers.**
  The first press lifts it; a press on the raised cover lowers it again
  (`setBreakerCoverOpen`). Its click target rides on a stand-in for the
  hinge, so it is always wherever the cover is. While raised it sticks out
  at head height, so it gets a collider just like the fuse box cover.
- **The main is a lever on the right-hand side**, a steel arm on a screwed
  plate with a green-over-red handle, after a photo of an old one. Up is on.
- **Every breaker and the lever start UP**, because until the blackout this
  is a working panel and the problem was upstream of it. **The blackout knocks
  them all down**, so the player finds the panel the way whoever threw the
  main left it. The flag above each toggle shows green when it is up and red
  when it is down.
- Before the blackout, the toggles and the lever refuse with "Whatever is
  wrong down here, it is not this panel."

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

### The main lever

Flicking a breaker never trips and never routes. The panel is dead until the
main goes in, so setting breakers is a **plan laid out against the load chart**,
not a live experiment -- the player has to do the arithmetic before they get
any feedback, which is the difference between a puzzle and a slot machine.

Throwing the main does one of three things:

- **over capacity** -> `tripBreakerPanel()`: every breaker drops open and the
  lever falls with them, a spark fires, the room blows out white for
  `BREAKER_TRIP_GLARE_IN_SECONDS = 1.1`.
- **a required circuit still open** -> the lever goes up and drops straight
  back, and the caption *names which circuit*. The puzzle is the budget, not
  guessing which systems matter.
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
| `LIT` (fuse only) | *(desk unpowered)* | *(desk unpowered)* |
| `BLACKOUT` / `RUNNING` | dark | dark |
| `ROUTED` | **lit** | **lit** |

**Since the fuse stopped reaching the desk, the player never sees the `LIT`
row**: the monitor's first picture comes with the routed panel, every room lit.
The feeds still model it, so it costs nothing to keep, and it comes back if the
desk is ever given the fuse's power again. What it was for: the fuse fed *this
section of the lab only*, so from the moment the monitor woke, the player saw
one working camera and four black rooms stamped:

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

> *"SECURITY LOCKOUT. I will forget this. The study door will not. In what it
> wears, top row down, lies your way out."*

Phrased as a riddle, but only in one place. A security note that spelt out
"count the panels" would be a note that defeats the lock it belongs to, which
is reason enough in the fiction for it to be oblique -- so the **what** is
riddled and left for the player to see for themselves, since panels are
obvious the moment anyone looks at that door.

What is **not** riddled: *"the study"* and *"top row down"*. Those are the two
facts a player cannot recover by looking harder -- there are five cameras and
two directions to read in -- and being refused after counting correctly is the
worst failure this puzzle can produce. Atmosphere is worth a player's second
look; it is not worth their being stuck. The direction sits *inside* the
sentence rather than appended to it, so the one plain instruction still reads
as part of the riddle.

It is also in Mark's voice, which is what the first line buys. It gives the
note a reason to exist -- a man who knows his memory is going, leaving himself
a way back in -- and it lands twice: procedure on a first read, and on a
second the player's own handwriting, from before they forgot.

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

## The session tape

The level's story, told by the lab's own equipment. Not a lock: nothing needs
it to open the door.

### What the player does

1. **Finds the camcorder.** It lies on its left side on the floor off the foot
   of the restraint table, toward the entrance -- where a camera on a tripod
   filming the table would have stood, and where it landed when it was knocked
   over. In the dark before the fuse, its battery lamp winking red at floor
   level is the only light in the lab, and the only nudge it gets.
2. **E on it** looks at it and springs the cassette door; **E again** takes the
   tape, SESSION 14 -- 14.1.87, into the inventory (`sessionTape`).
3. **Presses PLAY on the deck** beside the monitor -- once the panel is routed,
   because the desk has no power before then. With the tape on them, PLAY loads
   it, switches the monitor on and over to its TAPE input, and plays it. (The
   flap also takes the tape on its own, and EJECT gives it back.)
4. The tape **comes up in front of them**, seventy per cent of the screen
   (`core/TapePlayerUI.js`), dressed as the monitor shows it. **E** steps back
   at any point; stepping back rewinds it, and PLAY runs it again.

Sessions 1 to 13 are stacked on the desk behind the deck. The fourteenth is the
one still in the camera on the floor.

### What is on it

`src/story/sessionTape.js` holds the subtitles with their timings. A sedated
subject on the table, a scientist dictating the session behind the camera, and
a woman beside him. The subject wakes, does not know them, and comes at the
camera; it goes over, and the rest is sound -- something heavy moving away,
glass, an alarm. The only name spoken is "Mark".

The two voices are never seen and the woman is never named: she is Annabelle,
and the only thing that may tell the player so is the letter in Level 3.

### The footage

`world/SessionTapeSource.js` plays `src/assets/video/session_14.mp4` if it
exists -- found with an `import.meta.glob`, so dropping the file in is the whole
change. Until then it paints a placeholder (tape noise, the camcorder's date
stamp, the deck's PLAY marker, the tumble when the camera goes over, the roll
into static) and `AudioEngine` plays stand-in sounds at the cue sheet's times.
Subtitles always show over the silent placeholder; over real footage they follow
the captions setting.

### Props

| Model | Script |
|-------|--------|
| `camcorder.glb` | `blender/build_camcorder.py` -- a 1985-86 Video8 shoulder camcorder, lens cracked, viewfinder knocked crooked; `CassetteDoor` hinged on its bottom edge |
| `video8_cassette.glb` | `blender/build_video8_cassette.py` -- the tape, with its handwritten label |
| `video8_deck.glb` | `blender/build_video8_deck.py` -- the player; `DeckFlap`, `DeckPlayButton`, `DeckEjectButton` and `DeckPowerLamp` are moved and lit by the level |
| `video8_tape_stack.glb` | `blender/build_video8_tape_stack.py` -- Sessions 1-13 in their cases |

No maker's name on any of them, only the format's own marks. Lettering is real
geometry (`common.make_text_mesh`), not textures. The deck's counter is painted
by `world/DeckCounterDisplay.js`; the input rocker's label strip by
`createDymoLabelTexture`.

### Hints and the nudge

Two hint stages, `findTape` and `playTape`, sit after the breakers. They count
as done once the tape is watched **or** the security lockout is cleared, so a
player who skips the tape can still be hinted the code. When the panel routes,
a player who has not watched it hears one line toward wherever it is.

---

## Integration points

### Callbacks on `createHallwayBasementLevel`

The level owns its own lights, screen and labels. These fire for everything
**outside** the level that a beat drives -- story captions, audio, the
creature, and the one flag that outlives the level.

| Callback | Fires when |
|----------|-----------|
| `onPowerRestored` | the 30A fuse is seated (pre-existing) |
| `onBlackout` | the main is thrown. Passed `{ cause }`: `'timer'`, `'door'` or `'desk'` |
| `onGeneratorRunning` | the restart sequence completes |
| `onOverload` | the breaker panel trips |
| `onPowerRouted` | the main switch commits |
| `onEnterSecurityCode` | the player uses the door with the lockout still on. Passed `{ code, onSolved }` |
| `onTapeTaken` / `onTapeInserted` / `onTapeEjected` | the session tape moves between the camera, the inventory and the deck |
| `onPlayTape` | the deck is playing and the monitor is on its input. Passed `{ source }` |
| `onTapeEnded` | the tape has run out, with its picture still up |

And one question the level asks: `isCarrying(id)`, whether the inventory holds
an item -- the deck takes the tape from the inventory, not only from the hand.

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
promising the player a way out the fuse does not open. It now ends *"Only the
lights. The desk and the door at the far end are as dead as before."*

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
setAllBreakers(true);                  // all back UP, as before the blackout
setMainLever(true, { instant: true });
closeBreakerCover();
hasViewedAnyFeed = false;
hasHesitatedAtDoor = false;
if (!interactables.includes(doorNote)) interactables.push(doorNote);
```

It also clears the lit window's clock (`blackoutTimerSecondsLeft`) and puts the
session tape back: in the camera on the floor, its door shut, the deck empty and
the monitor on its cameras (`resetSessionTape`).

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
- The lit window ends three ways, each checked in the running game: standing
  in front of the CCTV desk, standing in the door's lane, and staying away from
  both until the clock runs out. It fires exactly once, and reaching the door
  from *outside* the lane still trips it.
- The CCTV desk is dead under the fuse and wakes with the routed panel.
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
- The main lever stays up once the panel routes.
- Before the blackout every breaker and the lever are up; after it, all down.

**The door**
- The note sits dead centre in x, at eye level (y = 1.55), facing back down
  the room -- and stops being an interaction target once read, so it cannot
  block the door it is taped to. `reset()` puts it back.
- The nudge stops the first attempt, points at the cameras, and opens on the
  second -- and never fires for a player who already looked.
- `reset()` returns every one of the above to its starting state.

**The session tape** (headless Chrome against the running game, through the
real crosshair raycast)
- Two presses on the camcorder take the tape into the inventory.
- PLAY with the tape carried loads it and brings it up; the tape runs to its
  end, and stepping back mid-tape rewinds it. EJECT gives it back. The remote
  returns the monitor to the cameras.
- A restart puts the tape back in the camera and the monitor on its cameras.

`npx vite build` is clean. The harnesses are not in the repo -- the project has
no test setup to hang them on.

---

## Known trade-offs

- **The lit window is short on purpose**, and a player who misses the
  generator and the panel in it has to find them by torchlight. The H-key
  hints name both.
- **Four power puzzles now stand between the player and the exit.** The
  generator is deliberately three steps and the panel five switches plus a
  main, to keep that stretch short. If playtesting says it drags, the
  generator is the piece to cut.
- **VENT is inert flavour.** It exists so the panel reads as a panel rather
  than as exactly the circuits the puzzle needs plus one trap. It refers to
  nothing else in the game, which is the same criticism that killed SECURITY
  -- the defence is only that a ventilation circuit in a sealed basement lab
  is self-explanatory in a way "security" was not.
- **The camera five teaching gap is gone** (see "The cameras as the panel's
  readout"): with the desk dead under the fuse, the player never sees the one
  lit camera among four dark ones. LIGHTING is still named on the panel and in
  the hints.
