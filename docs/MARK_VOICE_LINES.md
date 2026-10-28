# Mark's voice lines still to record

Checked 2026-10-28 against the files on disk, after merging main (a script read every line in
`src/dialogue/*.js` and `src/story/markThoughts.js`, then looked for each one's
recording).

- **Mark's thoughts are all recorded.** All 69 in `src/story/markThoughts.js`
  have their clip in `src/assets/audio/Dont Let it out Mark voice/`, and every
  thought the game plays is in that table.
- **None of the dialogue lines has a recording yet.** That is 369 captions in
  `src/dialogue/`. Most aren't Mark: they're narration ("The drawer slides
  open."), hints, notes and signs read off the walls, the news reports at the
  end, and Annabelle's whispers in the study. The 29 below are Mark speaking or
  thinking out loud, and the game plays every one of them.

To add one, save the recording at `src/assets/voice/` + the path in the last
column. A `.mp3`, `.ogg` or `.wav` works as well as `.m4a`. It plays with its
caption, with no code change. See `src/dialogue/README.md`.

## Anywhere (`src/dialogue/anywhere.js`)

| Line | Mark says | Plays when | Save as |
|---|---|---|---|
| `dialog_wrong_code_1` | "I can't guess randomly. There are too many combinations." | A wrong code on any keypad (one of five, at random) | `all/wrong_code_1.m4a` |
| `dialog_wrong_code_2` | "Maybe there is a clue around the room." | " | `all/wrong_code_2.m4a` |
| `dialog_wrong_code_3` | "This isn't right." | " | `all/wrong_code_3.m4a` |
| `dialog_wrong_code_4` | "I am missing something." | " | `all/wrong_code_4.m4a` |
| `dialog_wrong_code_5` | "I need some sort of hint for this puzzle." | " | `all/wrong_code_5.m4a` |
| `dialog_inspect_empty_hand` | "I'm not holding anything." | I (inspect) with an empty hand | `all/inspect_empty_hand.m4a` |

## Level 1, the bedroom (`src/dialogue/level1_bedroom.js`)

| Line | Mark says | Plays when | Save as |
|---|---|---|---|
| `dialog_open_door_locked_1` | "I need to unlock this door so I can find Annabelle." | Trying the boarded or locked door | `level1/open_door_locked_1.m4a` |
| `dialog_open_door_locked_2` | "I need to find something to break down these planks of wood." | Trying the door while it's still boarded | `level1/open_door_locked_2.m4a` |
| `dialog_open_door_locked_3` | "It is still locked. The key might be hidden." | Trying the door once the planks are off | `level1/open_door_locked_3.m4a` |

## The backrooms (`src/dialogue/backrooms.js`)

| Line | Mark says | Plays when | Save as |
|---|---|---|---|
| `dialog_backrooms_roam` | "This room looks familiar. It reminds me of a movie I watched." | After wandering the maze a while | `backrooms/roam_10sec.m4a` |
| `dialog_dead_end_1` | "A dead end. I'll try another way." | At a dead end (one of three) | `backrooms/dead_end_1.m4a` |
| `dialog_dead_end_2` | "This isn't the way out." | " | `backrooms/dead_end_2.m4a` |
| `dialog_dead_end_3` | "I should go back to another room." | " | `backrooms/dead_end_3.m4a` |
| `dialog_look_at_monster_1` | "Hello? Who are you? Are you okay? ... Okay. It's a fucking ghost." | Looking at the hunter (one of three) | `backrooms/look_monster_1.m4a` |
| `dialog_look_at_monster_2` | "I feel like I'm losing my mind. I know it's there, but it just disappears." | " | `backrooms/look_monster_2.m4a` |
| `dialog_look_at_monster_3` | "Who the fuck are you? Do you know my sister Annabelle? ... I'm losing it." | " | `backrooms/look_monster_3.m4a` |

## Level 3, the study (`src/dialogue/level3_study.js`)

| Line | Mark says | Plays when | Save as |
|---|---|---|---|
| `dialog_study_blackout_teaser` | "The lights. All of them at once." | The first blackout (the crest is solved) | `level3/study_blackout_teaser.m4a` |
| `dialog_study_blackout_hunt` | "No. Not again. Not now." | The second blackout (the visor is taken) | `level3/study_blackout_hunt.m4a` |
| `dialog_study_breaker_thought` | "There was a breaker up on the loft. On the back wall." | A few seconds into the first blackout | `level3/study_breaker_thought.m4a` |
| `dialog_study_fuse_thought` | "The fuse went with it. There were spares in a tin, by the desk." | A few seconds into the second blackout | `level3/study_fuse_thought.m4a` |
| `dialog_study_power_back_teaser` | "The power's back. Whatever that was, it's gone." | The breaker thrown, first blackout | `level3/study_power_back_teaser.m4a` |
| `dialog_study_power_back_hunt` | "Light. She's gone back into the dark." | The breaker thrown, second blackout | `level3/study_power_back_hunt.m4a` |
| `dialog_study_come_round` | "My neck... something in my neck. Everything's slow." | Coming round after the first catch | `level3/study_come_round.m4a` |
| `dialog_study_come_round_again` | "Again. She put me here again." | Coming round after any later catch | `level3/study_come_round_again.m4a` |
| `dialog_study_books_full` | "Three is all I can carry." | Taking a fourth book | `level3/study_books_full.m4a` |
| `dialog_study_bottle_carried` | "I already have a bottle." | Taking a second bottle | `level3/study_bottle_carried.m4a` |
| `dialog_study_letter_dark` | "I can't read it in this dark." | The letter during a blackout | `level3/study_letter_dark.m4a` |
| `dialog_study_mirror_dark` | "Not now. Not in the dark." | The mirror during a blackout | `level3/study_mirror_dark.m4a` |
| `dialog_study_letter_read_it` | "I need to read this." | The study's prompt toward the letter | `level3/study_letter_read_it.m4a` |

## In the files but never played

These sound like Mark, but no code plays them. Record them only if they come
back into the game.

- `dialog_the_choice[0]`, "I need to get out." (`level3/the_choice_1.m4a`)
- `dialog_tape_1` to `dialog_tape_4`, "If you're hearing this, the locks didn't
  hold." and the rest (`level3/tape_1.m4a` to `tape_4.m4a`). The session tape
  that does play is `src/story/sessionTape.js`, and its voices are recorded.

## Not Mark

These are in the files too, but they aren't Mark's voice:
- **Annabelle:** the study's whispers (`dialog_study_whisper_*`, "Sleep, Mark...").
  They're caption-only by design until new recordings exist
  (`docs/LEVEL3_HIDE_AND_SEEK.md`).
- **The newsreader:** the two endings (`src/dialogue/endings.js`).
- **Read off the walls:** the notes, signs and charts in quotes, such as
  `dialog_door_note`, `dialog_load_chart`, `dialog_maintenance_log`,
  `dialog_restart_plate` and `dialog_torn_notes`.
- **The game itself:** everything in the second person ("You pick up the
  flashlight.") and the H hints.
