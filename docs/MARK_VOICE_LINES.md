# Mark's voice lines

All 29 of Mark's spoken lines have recordings as of 2026-10-28. They were
generated with ElevenLabs in the voice Daniel set up for Mark, and each one
plays with its caption, with no code change (see `src/dialogue/README.md`).

- **Mark's thoughts** were already recorded. All 69 in
  `src/story/markThoughts.js` have their clip in
  `src/assets/audio/Dont Let it out Mark voice/`.
- **The 29 lines below** are Mark speaking or thinking out loud in
  `src/dialogue/`. They were the only lines in his voice with no recording.
- **The other 340 captions** in `src/dialogue/` aren't Mark (see the end), so
  they stay caption-only.

## How they were made

Make a new or replacement line the same way, so it matches the rest. Use the
ElevenLabs **Text to Speech** page with these settings:

| Setting | Value |
|---|---|
| Voice | Tate Dalton - Grounded Male Lead, from the voice library (ID `QZ1okeFI43NQd6lXAzQ5`). Some screens call it "Michael Dalton - Modern Male Lead". |
| Model | Eleven v4 |
| Stability | 70% |
| Similarity | 61% |
| Clone strength | 0% (the default) |
| Audio effects | Space: Small Room |
| Output format | MP3 44.1 kHz (128 kbps) |

- **Two takes per line:** the page currently makes two takes of every line,
  one from Eleven v4 and one from an experimental v4. You only pay for one.
  Keep the Eleven v4 take: in History, set the Model filter to "Eleven v4" and
  download it from there.
- **Volume:** the takes come out between -20 and -25 LUFS (-22.7 on average).
  That matches the recorded thoughts (-20 to -23.5). The one exception is
  `study_mirror_dark`, a much quieter read at -29.
- **Caption time:** if a take outlasts its caption, give the line its seconds
  as a third item (see "How long a caption stays up" in
  `src/dialogue/README.md`). Nine lines have one. The Small Room effect adds a
  short tail, so a take runs a little past the last word.
- **The first seven lines** (`study_books_full`, the five wrong-code lines and
  `inspect_empty_hand`) came from a flow in Kiran's account, "Mark voice lines
  (Don't Let It Out)". It runs a voice node into a Small Room effect node with
  the same settings. ElevenLabs started refusing flow runs as "too many
  requests" after a few, so the Text to Speech page is the quicker way.

The paths in the File columns are under `audio-source/mark-voice-takes/`.
The takes are not in the game yet. They were made for the dialogue lines
below, but Mark's voice now plays through `src/story/markThoughts.js`, with
its recordings in `src/assets/audio/Dont Let it out Mark voice/`, and
`npm run check:voices` refuses any recording in `src/assets/voice/` that
nothing maps. To use a take, add it there and map it the same way.

## Anywhere (`src/dialogue/anywhere.js`)

| Line | Mark says | Plays when | File |
|---|---|---|---|
| `dialog_wrong_code_1` | "I can't guess randomly. There are too many combinations." | A wrong code on any keypad (one of five, at random) | `all/wrong_code_1.mp3` |
| `dialog_wrong_code_2` | "Maybe there is a clue around the room." | " | `all/wrong_code_2.mp3` |
| `dialog_wrong_code_3` | "This isn't right." | " | `all/wrong_code_3.mp3` |
| `dialog_wrong_code_4` | "I am missing something." | " | `all/wrong_code_4.mp3` |
| `dialog_wrong_code_5` | "I need some sort of hint for this puzzle." | " | `all/wrong_code_5.mp3` |
| `dialog_inspect_empty_hand` | "I'm not holding anything." | I (inspect) with an empty hand | `all/inspect_empty_hand.mp3` |

## Level 1, the bedroom (`src/dialogue/level1_bedroom.js`)

| Line | Mark says | Plays when | File |
|---|---|---|---|
| `dialog_open_door_locked_1` | "I need to unlock this door so I can find Annabelle." | Trying the boarded or locked door | `level1/open_door_locked_1.mp3` |
| `dialog_open_door_locked_2` | "I need to find something to break down these planks of wood." | Trying the door while it's still boarded | `level1/open_door_locked_2.mp3` |
| `dialog_open_door_locked_3` | "It is still locked. The key might be hidden." | Trying the door once the planks are off | `level1/open_door_locked_3.mp3` |

## The backrooms (`src/dialogue/backrooms.js`)

| Line | Mark says | Plays when | File |
|---|---|---|---|
| `dialog_backrooms_roam` | "This room looks familiar. It reminds me of a movie I watched." | After wandering the maze a while | `backrooms/roam_10sec.mp3` |
| `dialog_dead_end_1` | "A dead end. I'll try another way." | At a dead end (one of three) | `backrooms/dead_end_1.mp3` |
| `dialog_dead_end_2` | "This isn't the way out." | " | `backrooms/dead_end_2.mp3` |
| `dialog_dead_end_3` | "I should go back to another room." | " | `backrooms/dead_end_3.mp3` |
| `dialog_look_at_monster_1` | "Hello? Who are you? Are you okay? ... Okay. It's a fucking ghost." | Looking at the hunter (one of three) | `backrooms/look_monster_1.mp3` |
| `dialog_look_at_monster_2` | "I feel like I'm losing my mind. I know it's there, but it just disappears." | " | `backrooms/look_monster_2.mp3` |
| `dialog_look_at_monster_3` | "Who the fuck are you? Do you know my sister Annabelle? ... I'm losing it." | " | `backrooms/look_monster_3.mp3` |

## Level 3, the study (`src/dialogue/level3_study.js`)

| Line | Mark says | Plays when | File |
|---|---|---|---|
| `dialog_study_blackout_teaser` | "The lights. All of them at once." | The first blackout (the crest is solved) | `level3/study_blackout_teaser.mp3` |
| `dialog_study_blackout_hunt` | "No. Not again. Not now." | The second blackout (the visor is taken) | `level3/study_blackout_hunt.mp3` |
| `dialog_study_breaker_thought` | "There was a breaker up on the loft. On the back wall." | A few seconds into the first blackout | `level3/study_breaker_thought.mp3` |
| `dialog_study_fuse_thought` | "The fuse went with it. There were spares in a tin, by the desk." | A few seconds into the second blackout | `level3/study_fuse_thought.mp3` |
| `dialog_study_power_back_teaser` | "The power's back. Whatever that was, it's gone." | The breaker thrown, first blackout | `level3/study_power_back_teaser.mp3` |
| `dialog_study_power_back_hunt` | "Light. She's gone back into the dark." | The breaker thrown, second blackout | `level3/study_power_back_hunt.mp3` |
| `dialog_study_come_round` | "My neck... something in my neck. Everything's slow." | Coming round after the first catch | `level3/study_come_round.mp3` |
| `dialog_study_come_round_again` | "Again. She put me here again." | Coming round after any later catch | `level3/study_come_round_again.mp3` |
| `dialog_study_books_full` | "Three is all I can carry." | Taking a fourth book | `level3/study_books_full.mp3` |
| `dialog_study_bottle_carried` | "I already have a bottle." | Taking a second bottle | `level3/study_bottle_carried.mp3` |
| `dialog_study_letter_dark` | "I can't read it in this dark." | The letter during a blackout | `level3/study_letter_dark.mp3` |
| `dialog_study_mirror_dark` | "Not now. Not in the dark." | The mirror during a blackout | `level3/study_mirror_dark.mp3` |
| `dialog_study_letter_read_it` | "I need to read this." | The study's prompt toward the letter | `level3/study_letter_read_it.mp3` |

## In the files but never played

These sound like Mark, but no code plays them, so they have no take. Make
them the same way only if they come back into the game.

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
