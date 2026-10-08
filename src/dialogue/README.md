# Dialogue and voice lines

Every caption in the game lives in this folder, one file per part of the game.
Edit a file, save it, and the running game uses the new text straight away.

| File | Covers |
|---|---|
| `level1_bedroom.js` | Level 1 — waking up, the bedroom, getting out |
| `level2_basement.js` | Level 2 — the hallway, the lab, power, CCTV |
| `level3_study.js` | Level 3 — the study, the visor, the locks, the tapes |
| `backrooms.js` | The corridor between levels |
| `endings.js` | The two news reports at the end |

## Change what a line says

1. Find the line: search the file for a few words of it (Ctrl+F). In VS Code,
   Ctrl+Shift+F searches every file in the folder at once.
2. Change the text between the first pair of quotes.
3. Save. Keep `npm run dev` running and the game picks it up without a restart.

```js
export const dialog_pickup_flashlight = ["You pick up the flashlight.", "level1/pickup_flashlight.m4a"];
//                                       ^^^^^^^^^^^^ the caption ^^^^^^^^^^^^   ^^^^^^ the voice clip ^^^^^^
```

## Add a voice line

1. Record the line.
2. Save it under `src/assets/voice/` at the path written in the second item.
   For the example above that is `src/assets/voice/level1/pickup_flashlight.m4a`.
   Make the folder if it is not there yet.
3. That's it. The clip plays when the caption appears. `.m4a`, `.mp3`, `.ogg` and
   `.wav` all work, and the extension doesn't have to match: an `.mp3` answers
   to a line that says `.m4a`.

Every line already has a suggested path, so you can record straight down the
list. You can also point a line at any path you like. A line with no recording
yet just shows its caption silently. That's normal, not an error: the browser
console notes it once.

> Adding a **new audio file** reloads the page, because the game has to learn
> the file exists. Editing **text** does not.

## Lines with more than one caption

Wrap each caption in its own brackets. They play one after another:

```js
export const dialog_freed = [
  ["The lock gives. The cuff opens.", "level1/freed_1.m4a", 3],
  ["You stand up. Somewhere in the dark, floorboards creak.", "level1/freed_2.m4a"]
];
```

To make a one-caption line into three, or three into one, just change the
brackets. No code changes are needed.

## How long a caption stays up

The optional third item is seconds on screen (`3` above). Leave it off and the
game times the line by its length. **If a recording runs longer than the
caption, raise this number** so the text doesn't vanish mid-sentence.

## Words in `{curly braces}`

```js
export const dialog_fuse_taken = ["You take the {amps} fuse.", "level2/fuse_taken.m4a"];
```

The game fills `{amps}` in (with "30A", for example). Reword around it freely,
but keep the `{amps}` itself, spelled the same.

## Rules that keep it working

- **Don't rename** the `dialog_...` part. The game asks for lines by that name.
  If you do rename one by accident, the game shows `[missing dialogue: dialog_x]`
  in place of the caption, so you'll spot it the first time it plays.
- Text goes in **double quotes**. If the line itself contains a double quote,
  write it as `\"`, e.g. `"A note: \"Restore power.\""`. Curly quotes (“ ” ‘ ’)
  and apostrophes need nothing special.
- Each entry ends with `;`, and lines inside a group are separated by `,`.
- A name used in two files is reported in the console, and the later file wins.

## Adding a brand-new line

New text written into these files only appears once some code asks for it by
name, e.g. `showCaption(line('dialog_my_new_line'))`. Write the entry here
first, then hook it up in the level (or ask for it to be hooked up).

## What is not in here

- **Interaction prompts** ("[E] Open the door") are in the level files.
- **Readable documents** (the torn notes, Mark's letter, the sticky note) are
  in `src/story/lines.js`. They're pages, not spoken lines.
- **The objective text** at the top of the screen is in `src/main.js`.
