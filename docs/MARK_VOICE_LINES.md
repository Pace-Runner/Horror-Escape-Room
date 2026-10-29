# Mark's voice lines

Mark's 29 lines in `src/dialogue/` all have recordings, made 2026-10-28 with
ElevenLabs in the voice Daniel set up for Mark. 21 of them play in the game,
spoken as Mark's thoughts are. The other 8 are kept in
`audio-source/mark-voice-takes/`, and the tables below say why.

- **Mark's thoughts** were recorded before these: the entries in
  `src/story/markThoughts.js`, with their clips in
  `src/assets/audio/Dont Let it out Mark voice/`.
- **The 29 lines below** are Mark speaking or thinking out loud in
  `src/dialogue/`. They were the only lines in his voice with no recording.
- **The other 340 captions** in `src/dialogue/` aren't Mark (see the end), so
  they stay caption-only.

## How a take plays

Mark has one voice in the game: `systems/MarkThoughts.js`, which plays the
entries of `MARK_THOUGHTS` (one line at a time, by priority). A line from
`src/dialogue/` gets his voice like this:

1. **The file:** the take goes in `src/assets/audio/Dont Let it out Mark
   voice/`, in its level's folder (`ALL LEVELS/` for lines that can come
   anywhere).
2. **The thought:** an entry in `MARK_THOUGHTS`, `id: [file, text]`, with
   the line's text as the caption.
3. **The link:** `dialog_key: 'id'` in `MARK_SPOKEN` in `src/main.js`.
4. **The call:** the call site says the line with `markSays(key)` (levels get
   it as a callback, as they get `onThought`). It plays the thought,
   repeatable. When his voice can't take it right then (another of his
   lines, a story caption, a document, a cutscene), it shows the old
   caption-only line instead, as every line did before.
5. **The check:** `npm run check:voices`. It fails on a recording in that
   folder that no thought maps, and on a thought nothing triggers. It also
   fails on any recording left in `src/assets/voice/` that nothing maps.

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

In the tables, the File column is under `src/assets/audio/Dont Let it out
Mark voice/` for the lines that play, and the thought that plays them is
named after it. The lines that don't play give their take's place in
`audio-source/mark-voice-takes/` and the reason.

## Anywhere (`src/dialogue/anywhere.js`)

| Line | Mark says | Plays when | File |
|---|---|---|---|
| `dialog_wrong_code_1` | "I can't guess randomly. There are too many combinations." | A wrong code on any keypad (one of five, at random) | `ALL LEVELS/line_wrong_code_1.mp3` (thought `any_wrong_code_1`) |
| `dialog_wrong_code_2` | "Maybe there is a clue around the room." | " | `ALL LEVELS/line_wrong_code_2.mp3` (thought `any_wrong_code_2`) |
| `dialog_wrong_code_3` | "This isn't right." | " | `ALL LEVELS/line_wrong_code_3.mp3` (thought `any_wrong_code_3`) |
| `dialog_wrong_code_4` | "I am missing something." | " | `ALL LEVELS/line_wrong_code_4.mp3` (thought `any_wrong_code_4`) |
| `dialog_wrong_code_5` | "I need some sort of hint for this puzzle." | " | `ALL LEVELS/line_wrong_code_5.mp3` (thought `any_wrong_code_5`) |
| `dialog_inspect_empty_hand` | "I'm not holding anything." | I (inspect) with an empty hand | `ALL LEVELS/line_inspect_empty_hand.mp3` (thought `any_empty_hand`) |

## Level 1, the bedroom (`src/dialogue/level1_bedroom.js`)

| Line | Mark says | Plays when | File |
|---|---|---|---|
| `dialog_open_door_locked_1` | "I need to unlock this door so I can find Annabelle." | Trying the boarded or locked door | `LEVEL 1/l1_line_door_locked_1.mp3` (thought `l1_door_locked_1`) |
| `dialog_open_door_locked_2` | "I need to find something to break down these planks of wood." | Trying the door while it's still boarded | `LEVEL 1/l1_line_door_locked_2.mp3` (thought `l1_door_locked_2`) |
| `dialog_open_door_locked_3` | "It is still locked. The key might be hidden." | Trying the door once the planks are off | `LEVEL 1/l1_line_door_locked_3.mp3` (thought `l1_door_locked_3`) |

## The backrooms (`src/dialogue/backrooms.js`)

| Line | Mark says | Plays when | File |
|---|---|---|---|
| `dialog_backrooms_roam` | "This room looks familiar. It reminds me of a movie I watched." | After wandering the maze a while | `BACKROOMS/backrooms_line_roam.mp3` (thought `backrooms_roam`) |
| `dialog_dead_end_1` | "A dead end. I'll try another way." | At a dead end (one of three) | `BACKROOMS/backrooms_line_dead_end_1.mp3` (thought `backrooms_dead_end_1`) |
| `dialog_dead_end_2` | "This isn't the way out." | " | `BACKROOMS/backrooms_line_dead_end_2.mp3` (thought `backrooms_dead_end_2`) |
| `dialog_dead_end_3` | "I should go back to another room." | " | `BACKROOMS/backrooms_line_dead_end_3.mp3` (thought `backrooms_dead_end_3`) |
| `dialog_look_at_monster_1` | "Hello? Who are you? Are you okay? ... Okay. It's a fucking ghost." | Looking at the hunter (one of three) | `BACKROOMS/backrooms_line_look_1.mp3` (thought `backrooms_look_1`) |
| `dialog_look_at_monster_2` | "I feel like I'm losing my mind. I know it's there, but it just disappears." | " | `BACKROOMS/backrooms_line_look_2.mp3` (thought `backrooms_look_2`) |
| `dialog_look_at_monster_3` | "Who the fuck are you? Do you know my sister Annabelle? ... I'm losing it." | " | `BACKROOMS/backrooms_line_look_3.mp3` (thought `backrooms_look_3`) |

## Level 3, the study (`src/dialogue/level3_study.js`)

| Line | Mark says | Plays when | File |
|---|---|---|---|
| `dialog_study_blackout_teaser` | "The lights. All of them at once." | The first blackout (the crest is solved) | `level3/study_blackout_teaser.mp3`. Not played: Daniel's recorded whisper `l3_stealth_01` says it at the same moment. |
| `dialog_study_blackout_hunt` | "No. Not again. Not now." | The second blackout (the visor is taken) | `level3/study_blackout_hunt.mp3`. Not played: the second blackout is gone (one encounter now). |
| `dialog_study_breaker_thought` | "There was a breaker up on the loft. On the back wall." | A few seconds into the first blackout | `level3/study_breaker_thought.mp3`. Not played: the whisper `l3_stealth_05` says it. |
| `dialog_study_fuse_thought` | "The fuse went with it. There were spares in a tin, by the desk." | A few seconds into the second blackout | `level3/study_fuse_thought.mp3`. Not played: the second blackout is gone. |
| `dialog_study_power_back_teaser` | "The power's back. Whatever that was, it's gone." | The breaker thrown, first blackout | `level3/study_power_back_teaser.mp3`. Not played: the whisper `l3_stealth_07` says it. |
| `dialog_study_power_back_hunt` | "Light. She's gone back into the dark." | The breaker thrown, second blackout | `level3/study_power_back_hunt.mp3`. Not played: the second blackout is gone; its text changed too. |
| `dialog_study_come_round` | "My neck... something in my neck. Everything's slow." | Coming round after the first catch | `LEVEL 3/l3_line_come_round.mp3` (thought `l3_come_round`) |
| `dialog_study_come_round_again` | "Again. She put me here again." | Coming round after any later catch | `level3/study_come_round_again.mp3`. Not played: the line now says "It put me here again"; the take says "She". Caption-only until a new take. |
| `dialog_study_books_full` | "Three is all I can carry." | Taking a fourth book | `LEVEL 3/l3_line_books_full.mp3` (thought `l3_books_full`) |
| `dialog_study_bottle_carried` | "I already have a bottle." | Taking a second bottle | `LEVEL 3/l3_line_bottle_carried.mp3` (thought `l3_bottle_carried`) |
| `dialog_study_letter_dark` | "I can't read it in this dark." | The letter during a blackout | `LEVEL 3/l3_line_letter_dark.mp3` (thought `l3_letter_dark`) |
| `dialog_study_mirror_dark` | "Not now. Not in the dark." | The mirror during a blackout | `LEVEL 3/l3_line_mirror_dark.mp3` (thought `l3_mirror_dark`) |
| `dialog_study_letter_read_it` | "I need to read this." | The study's prompt toward the letter | `level3/study_letter_read_it.mp3`. Not played: an unprompted hint, and spoken hints come only with H (studyLevel.js). |

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
