# Audio

How the game's sound is built, where each recording plays, how to change one,
and how to check it by ear. Where the files came from, and under what licence,
is [src/assets/audio/SOURCES.md](../src/assets/audio/SOURCES.md).

## The parts

| File | Job |
|------|-----|
| [src/world/AudioEngine.js](../src/world/AudioEngine.js) | The one `AudioContext`. Master volume, pause and resume. The synthesised wind, thunder and creaks. The breathing loop, voice lines and player footsteps. Loading every cue, the three cue buses, ducking. |
| [src/world/audio/spatial.js](../src/world/audio/spatial.js) | Listener sync, the emitter factory (`createEmitter`), the runtime seam builder (`buildSeamlessLoop`) and the shared echo (`createEchoBus`). |
| [src/world/audio/assets.js](../src/world/audio/assets.js) | Globs every file under `src/assets/audio/{amb,sfx,monster,foley}/` by basename, plus `manifest.json`. A missing file is a silent cue, never a failed build. |
| [src/systems/AudioDirector.js](../src/systems/AudioDirector.js) | The rules: who plays when. Every tunable is a named constant at the top with its derivation. |
| [scripts/audio/](../scripts/audio/) | `sources.json` (the cuts) and `build.mjs`, which downloads, cuts, seams, normalises, encodes, re-measures and writes `manifest.json`. |
| [scripts/check-audio.mjs](../scripts/check-audio.mjs) | `npm run check:audio`: the manifest against the files, the windows inside them, and every cue name the code uses. |

`main.js` builds the director once and ticks it every frame, after everything that moves. It also tells the director the few things only `main.js` knows:

- `onLevelActivated(key)` from `activateLevel` (which also serves debug jumps and restart)
- `reset()` from `resetGame`
- `door(position)` from each door's `onDoorOpening`
- `lockbox(position)` when the lockbox opens
- `startStalk()` / `endStalk()` from `showCreatureAt()` and the trailing shadow
- `caught()` from `onHunterCaught`

Everything else the director reads for itself each frame: the hunter's state, the CRT's power and stage, and positions.

Every scheduler runs on the director's own clock. It advances only while the pointer is locked and the context is running, never on `setTimeout`. One-shots that cross a level fade (doors, the sting) are marked `spans` and survive `onLevelActivated`. `reset()` cuts everything except the rain bed, because the restart lands in the bedroom, where the bed plays anyway.

## The cues

Levels are derived, not asserted: "X dBFS at D m" becomes a gain from the file's
measured peak, the panner's own distance law and the equal-power centre loss
(−3 dB). HRTF cues carry a measured trim on top (see `PAN_CENTRE` in the
director). The anchors already in the mix are:

- wind drone ≈ −35 dBFS peak
- base breathing −34.5
- player footstep −25.9
- loudest story-beat breath −14.9

All are pre-master; the default master is 0.5.

| # | Cue | Plays | Spatial | Level (measured) |
|---|-----|-------|---------|------------------|
| 1 | `laugh_distant`, one laugh phrase at a time, never one of the last two, 80 ms fades, plus the echo send | Levels 1–3, first ≥75 s after entry, then every 90–180 s (L1) / 60–150 (L2) / 75–160 (L3). Defers 10–20 s while a caption, cutscene, transition, catch, hunter or monster cue (or ≤20 s after one) is active | Random bearing (never within 30° of the last), 9–22 m away, 1.2–2.2 m up. Through a wall: −6 dB and a 900 Hz low-pass. In the open: 3.5 kHz darkening to ≈2 kHz at 22 m. Equal-power, inverse, ref 3 | −26.0 dBFS at 15 m |
| 2 | `hunter_breath`: the user's 0–8 s, seamed at runtime | Backrooms, hunter in **chase only**. Kept running muted through chase/hunt flips, so it never restarts from the top; 0.25 s in, 0.9 s out, 60 ms cut on catch or stop | Follows the hunter at 1.5 m. HRTF, **linear**, ref 2.5, max 14 | −14.0 at ≤2.5 m, silent at 14 m |
| 4 | `crt_static` | Level 2 from entry until `powerStage === 'routed'`, then fades over 0.6 s and stays off; back after R. Level = 0.3 + 0.7 × the tube's `uPower` | At `monitorBody`. Equal-power, inverse, ref 0.8, rolloff 1.6, ramped out from 8 to 10 m | −30.2 at 1 m at full picture |
| 5 | `rain_bed`, a 5:00 loop | Levels 1 and 3, 3 s in and 2.5 s out. Level 1 starts at the top, Level 3 at a random point. Survives R | 2D, ambience bus | −33 dBFS peak (≈ −52 LUFS) |
| 6 | `caught_sting` | Exactly once per backrooms catch, first thing in `onHunterCaught`. Not on the study's Annabelle catch (`STING.onStudyCatch`). Cuts 2 and 13; ducks the bed and breathing 12 dB for its length, then a 1.5 s release | 2D, SFX bus | −8.0 |
| 7 | `breathing.m4a` | Whole session (unchanged API) | 2D | −34.5 at the base level, −14.9 at 0.95 |
| 8 | `steps_metal` | Walking in Level 2 (`setFootstepSurface`). Sprint keeps the run set; crouch keeps its duck | Existing step system | `STEP_TARGET_PEAK`, as the other sets |
| 9 | `candle`, one loop per flame, each at a random offset | Level 1 only | At each flame. Equal-power, inverse, ref 0.35, rolloff 2, ramped out from 4 to 5 m | −40.0 at 1 m |
| 10 | `lockbox_open` | The instant the lid starts; cut if the room resets | At the box. Equal-power, inverse, ref 0.8, rolloff 1.2 | −16.0 at 1.5 m |
| 11 | `door_open` | The instant each of the four doors starts to open: bedroom, Level 2 metal door, study front door, backrooms exit. Once per open, and it plays across the fade | At the door, 1.1 m up. Equal-power, inverse, ref 1.5 | −14.0 at the door |
| 12 | `stalk_breath`: a fresh 4 s window from 0:05–0:20 each appearance (0.1 s steps, never within 1.5 s of the last start), seamed and looped | Level 1 window glimpse (for the flash), Level 2 hallway sighting (3 s) and corner (while it stands), the backrooms trailing shadow (1st crossing). **Refused** while the hunter runs, and for the whole hunting crossing | On the body at 1.4 m; behind the listener if there is no body. HRTF, inverse, ref 2 | −20 at 2 m, −15 dB at 11 m |
| 13 | `hunter_steps`: a 5–9 s stretch in recorded order, starting in the walk | Backrooms, hunter in **search or hunt** only. First 4–8 s after entering it, then gaps of 7–18 s; never overlaps itself. Fades 0.25 s if a chase starts, cut on catch | Follows the hunter at 0.3 m. HRTF, inverse, ref 3, ramped out from 24 to 28 m, low-pass 8 kHz → 1.2 kHz with distance | −22 at 3 m |

### Routing (the code's truth)

| Situation | 12 stalk | 2 breathing | 13 steps | 1 laughter | 6 sting |
|---|---|---|---|---|---|
| House appearance | yes | – | – | held 20 s | – |
| Backrooms, 1st crossing, shadow visible | yes | – | – | – | – |
| Backrooms, hunter `search` / `hunt` | **never** | muted | yes | – | – |
| Backrooms, hunter `chase` | **never** | yes | fades | – | – |
| Caught | cut | cut | cut | – | yes |

| Level | Bed | Candles | Static | Step set | Laughter |
|---|---|---|---|---|---|
| `bedroom` | yes | yes | – | default | yes |
| `hallwayBasement` | – | – | until `routed` | metal | yes |
| `study` | yes | – | – | default | yes |
| `backrooms` | – | – | – | default | – |

At most one scare cue (1, 12, 13) plays at a time.

### Level 2's three-second sighting

`CREATURE_LINGER_SECONDS = 3` and `showCreatureAt()` in `main.js` are the shared
way in for Level 2 and any future level. The helper places the creature facing
the player, starts its aura, and counts the linger down on the frame clock.

One lightning strike is dark again in half a second, so `refs.stutter(3)` in the
level keeps it catching. The light re-strikes every 0.7–1.3 s over a flickering
floor of 1.6 (dipping to 0.64 at its lowest, measured), and cuts out on the
frame the figure goes.

The sighting's captions now start with the strike. Line 1 holds 2.6 s, so line 2
arrives at 2.98 s, as the figure vanishes.

## Engine API

```js
audio.cue(name)                 // decoded AudioBuffer or null (logs once)
audio.emit(bus, opts)           // createEmitter on 'amb' | 'sfx' | 'monster'
audio.echoInput()               // the shared echo's input node
audio.updateListener(object3D)  // the ears, once a frame
audio.duck(['amb','breath'], -12, { attack, hold, release })
audio.clearDucks()
audio.setFootstepSurface(levelKey)
// unchanged: startBreathing, stopBreathing, setBreathing, BREATH_BASE_LEVEL, playVoice, updateFootsteps...
```

An emitter (`createEmitter`) returns `{ setPosition(x,y,z,tau), setGain(g,tau), setLowpass(hz,tau), stop(fade), alive, stopping, level, position }` and tears its nodes down on `ended`.

## Swapping or retuning

- **Retune a level:** change `peakDb` (and `at`) on the cue's spec at the top of `AudioDirector.js`. The gain re-derives itself.
- **Change timing or ranges:** same place, next to the derivation.
- **Swap a recording:**
  1. Edit its entry in `scripts/audio/sources.json` (URL and cut).
  2. Run `node scripts/audio/build.mjs --cache <dir> --download --only <name>`. It needs `ffmpeg` and `yt-dlp`, via `FFMPEG` / `YTDLP` or the PATH.
  3. Run `npm run check:audio`.
  4. For the breathing, also copy the new loop window into `BREATH_LOOP_START/END` and re-derive `BREATH_MAKEUP` (the boot check and `check:audio` both warn if you forget).
  5. For an HRTF cue, re-measure its `hrtfTrimDb`.
- **Drop one in by hand:** put `<name>.m4a` (or `.ogg` / `.wav` / `.mp3`) in the right subfolder. It needs a `manifest.json` entry for anything that reads measured numbers (loops, the lockbox, excerpt lists).
- **Remove one:** delete the file. Its cue goes silent with one `console.info`. The lockbox keeps its timing from the manifest.

## Measured (verification, 2026-10-16)

Offline (ffmpeg / numpy), and in headless Chrome 155 against `npm run dev`:

- **Every file:** mono, peak −2.6 to −3.3 dBFS, no clipping. Chrome decodes each 1–19 ms shorter than ffmpeg (inside the 25 ms bar). The breathing file's circular padding is intact in the browser decode, so its seam holds.
- **Loop seams:** the wrap step is 0.01×–1.84× the median sample step.
- **Footstep slicer:** walking 8 onsets at a 0.56 s median and running 61 at 0.27 s, unchanged. Metal steps 6 at 0.66 s, with a 0.25 s per-file refractory.
- **Gain against distance:** an OfflineAudioContext running the same graph.
  - Hunter breathing: monotonic, −14.3 dB at ≤2.5 m, −35.5 at 13 m, silent at 14 m.
  - Static: 1 m to 6 m drops 18.2 dB.
  - Stalk: 2 m to 11 m drops 14.8 dB.
  - Candle: −26.8 dB from ref to 4 m.
- **Worst-case overlap:** bed + breathing at 0.95 + hunter breathing at 2.5 m + sting, all at once, master at 100%: −7.9 dBFS peak (−8.0 with the cut and duck). No limiter needed.
- **Hunter matrix:** 308 samples through search, chase and a catch, with zero rule violations. 1000 of 1000 stalk requests were refused while it ran, and 100 of 100 (then 1000 of 1000) in the caught gap. The sting fired exactly once. The bed and breathing ducked to 0.251 (−12 dB) and were back at 1.0 by 8 s.
- **Level 2 sighting:** visible 3.0 s ± 1 frame on the game's frame clock (it vanishes on the frame caption line 2 starts, at 2.98 s). Frames rendered at ≈0.2, 1, 2 and 2.9 s show it lit throughout; the frame after shows the empty corridor.
- **Lockbox:** the lid reaches 4% at the latch (1.05 s) and lands at 4.28 s. The crowbar reaches the hand at 70.3% travel (3.08 s); the glove is still empty at 60%.

## Deferred: Track 3, Annabelle singing

The user's spec:

> "this will be part of the new hallway after you exit level 1, Anabelle can be
> heard singing at the end of the hallway possibly behind the door, the hallway
> will be strangely long and the audio of Annabelle singing will get louder. IF
> THE HALLWAY ISNT IN THE GAME DO NOT ADD YET"

Source: <https://www.youtube.com/watch?v=lsWNnvJY6No>.

As of `d0662e4` that hallway does not exist. Level 2's hallway is
`HALL_LEN = 5.5` m, the transition after Level 1 is the backrooms, and no branch
or code mentions singing. So nothing was added and the file was not downloaded.

When the hallway exists, the generic emitter covers it:

- a looped `createEmitter` at the far door
- the `inverse` law for the swell
- a director-side range ramp for "only audible from partway down"
- `setLowpass` around 900 Hz while the door is shut, opened up when it opens

## Listening checklist (needs a human ear)

In the dev build, `window.__game.audioDirector` has these hooks:

- `audition(name)` plays any cue 2 m in front of you; call it with no name for the list.
- `debug()` lists what is playing, where, and at what gain.
- `state` shows the schedulers.
- `scheduleLaughIn(s)` brings the next laugh forward.
- `forceActive = true` runs the schedulers without pointer lock.

`__game.showCreatureAt({x, z})` places the creature.

| Cue | Where to stand / how to trigger | Listen for |
|-----|-------------------------------|------------|
| Breathing | Anywhere; it is always on | No click or gulp every 11.9 s at the loop seam. Level 1 should read as background; the door beats (0.72) and Level 2 blackout (0.9) should read as close. It is a cold, shivering breath now, not the old one: is that the character you want? |
| Rain bed | Level 1, then Level 3 | Sits under the wind, under every caption. No seam at the 5:00 wrap (or 3 s after reaching Level 3 at a random point). Its thunder is not synced to the lightning; does that bother you? |
| Candles | Bedroom, walk to the headboard shelf and the vanity | Crackle only within a couple of metres; the two do not sound like one candle |
| Laughter | Any house level, `audioDirector.scheduleLaughIn(1)` | Reads as "elsewhere in the house": distant, dull through walls, an echo tail that is not cut off. Never louder than a voice line |
| Static | Level 2 from entry; switch the monitor on after the 30A fuse | Faint from the dead tube, swelling as the CRT warms, gone once the breakers route. Does not mask captions at the desk |
| Metal steps | Walk in Level 2; then sprint and crouch | One clean footfall per step (heel and toe together), no lone toe-clicks. Sprint should still be the old run |
| Door | Each of the four doors (or `audition('door_open')`) | Starts as the door moves; the 3.4 s tail is longer than the visible swing, so decide whether to trim it |
| Lockbox | Solve the corkboard, open the box with the brass key | Latch clicks, then the creak as the lid swings, the knock as it lands. Does the motion match? The crowbar arrives as the lid is mostly open |
| Stalk aura | Level 2 entry (hallway sighting), camera five (corner), the first backrooms crossing (trailing shadow), the Level 1 window flash | Comes from the body, not the screen centre; each appearance a different stretch of breathing; never in the hunting crossing |
| Hunter breathing | Backrooms, second crossing; let it see you | Silent beyond ~14 m, swelling as it closes, fading when it loses you, never restarting from the top on re-sighting |
| Hunter steps | Same crossing; stay out of sight | Random walking, sometimes into running, directionally honest across the maze; stops when it sees you |
| Caught sting | Let it catch you | Lands on the catch, not after the caption. Is 8.71 s into the source the right moment? The rest of the mix drops under it and comes back |
| Volume and pause | Settings slider, Esc | Every cue scales; everything freezes and resumes together |
