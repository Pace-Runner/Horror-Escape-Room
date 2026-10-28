# Audio sources

Recordings kept for the team that the game does not load. They sit outside
`src/assets/`, so the voice checks (`npm run check:voices`) and the build
leave them alone.

- `mark-voice-takes/`: Mark's lines from the old dialogue files
  (`src/dialogue/*.js`), generated in ElevenLabs. The recipe and the line-to-file
  table are in `docs/MARK_VOICE_LINES.md`. To use one, map it through
  `src/story/markThoughts.js` as Mark's other recordings are.
