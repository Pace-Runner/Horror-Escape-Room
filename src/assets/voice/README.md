# Voice clips

Recordings go in here, in the subfolder each dialogue line names:
`level1/`, `level2/`, `level3/`, `backrooms/`, `endings/`.

Which file belongs to which line, and how to add or change lines, is all in
[`src/dialogue/README.md`](../../dialogue/README.md). The short version: every
line in `src/dialogue/*.js` ends with a path like `"level1/wake_1.m4a"`. Save
your recording at `src/assets/voice/level1/wake_1.m4a` and it plays with that
caption.

A missing clip is not an error. The caption still shows, silently, and the
console notes it once. That's how the game ships text-first and gets voice
later without a code change. `AudioEngine` finds clips with an
`import.meta.glob`, so don't replace that with a plain `import`: a plain import
of a file that isn't there fails the build for everyone.
