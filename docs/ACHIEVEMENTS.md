# Chapters and achievements

The main menu's **Chapters** panel (`src/core/ChapterSelect.js`) starts a run
at any level the player has reached in a real run, and lists every
achievement. Both are saved in localStorage under `dontLetItOut.progress.v1`
(`src/core/Progress.js`); "Reset progress" in the panel clears them.

- A level unlocks in `transitionTo()` (main.js), so the debug jumps (1-4, G)
  never unlock anything. The bedroom is always open.
- A chapter start goes through difficulty and headphones, then
  `startChapter()` -> `resetGame({ startLevel })`. It hands over the torch and
  invalidates the leaderboard run.
- Add an achievement: a row in `src/core/achievements.js`, then an
  `achieve('<id>')` call (or `achieveCount('<counter>')` for a counted one) at
  its moment in main.js. Level factories take a callback rather than importing
  Progress, so the Node checks stay headless.

| id | Earned in |
|---|---|
| `level_*` | `transitionTo()`; `level_bedroom` after the opening |
| `room_BL/L/TR/R/C`, `rooms_all` | `backroomsLevel.js` `onRoomEnter` (room leg entered) |
| `power_first_try` | main.js `onFuseSeated`: fuse30 is the first fuse seated this run |
| `clock`, `crest`, `letter` | study `onClockSolved`, `onCrestSolved`, `onReadLetter` |
| `cut_<scene>` | `playCutscene()` |
| `caught_backrooms_*`, `caught_study_1` | the two catch handlers, counted for life |
| `ending_*` | wherever `gameState.endingChosen` is set |
