# Voice clips

Drop recordings in here and they play automatically. Nothing else has to change.

The filename without its extension is the key, and it must match the `voice`
field of a line in [`src/story/lines.js`](../../story/lines.js):

| File | Line |
|---|---|
| `tape-1.m4a` | Tape 1 — "If you're hearing this, the locks didn't hold." |
| `tape-2.m4a` | Tape 2 — "Do not let it reach the front door." |
| `tape-3.m4a` | Tape 3 — "It can't see what we're seeing…" |
| `tape-4.m4a` | Tape 4 — "If I forget again, don't let me—" |
| `news-released-1.m4a`, `news-released-2.m4a` | Ending 1 news report |
| `news-contained-1.m4a`, `news-contained-2.m4a` | Ending 2 news report |

`.m4a`, `.mp3`, `.ogg` and `.wav` are all picked up.

Only these lines are voiced, because they are the only parts of the story that
are actually *spoken aloud* — the tapes are Annabelle's recordings and the
endings are a news broadcast. Everything else the game says is the player's own
observation, which has no speaker.

## How it works

`AudioEngine` globs this directory, so a **missing clip is not an error**: the
caption still plays, silently, and the console notes it once. That is why the
game can ship text-first and have voice added later without a code change. Do
not switch this to a plain `import` — a plain import of a file that is not there
fails the build for everyone.

The tape lines set their own caption durations in `lines.js`. If a recording
runs longer than the duration written there, raise the `duration` on that line
so the caption does not disappear while the voice is still talking.
