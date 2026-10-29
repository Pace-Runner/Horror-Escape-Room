# Final voice trigger QA

Scope: all 120 active voice mappings in `voice-dialogue-inventory.json`, covering Levels 1–3, upstairs hallway, Backrooms, opening/tape/letter narration, reveal and endings. No audio, dialogue wording, caption policy, descriptive setting, static text or caption UI changed. The five intentionally unused recordings remain unused.

Corrections:
- Bulb shatter: `l1_05` takes story priority over the still-playing cuff result and subsequent pickups; its existing spoken subtitle follows the audio.
- Level 2 and Backrooms arrivals: start after transition/control handoff, once per run; Level 2's initial-power follow-up retains its state guard. Menu, scene change and reset cancel pending arrivals.
- Backrooms: protect `03 → 04` and the room-recognition `05` continuation from incidental corridor reactions.
- Study: permit the evidence reaction while its document is open; finish `l3_07` before corrected-visor recognition `l3_05`.
- All Mark thoughts: recheck current ownership and gameplay eligibility when decoding completes, preventing obsolete speech from starting.

Validation:
- PASS: `npm run check:voices` (207 audio assets; 120 active voice mappings; no missing mappings or measured duration differences).
- PASS: `check-final-voice-triggers.mjs`, extended `check-mark-voice.mjs`, `check-dialogue-triggers.mjs` (execute shipped callback bodies and arrival wiring).
- PASS: stealth voice, cassette reminders, Level 2 tape/blackout, letter narration, ending audio/dialogue/news, release and reseal regression checks. Existing creature-escape interruption and scene cleanup remain intact.
- PASS: production build (existing bundle-size warning).
- Existing failures: `check-dialogue-ui-batch2.mjs:27`, `check-batch-three.mjs:29`, `check-dialogue-cleanup.mjs:4` expect unrecorded interaction/hint visibility with descriptions off. They fail in unchanged caption-policy code before reaching the voice fixes; this task explicitly prohibits changing that behavior.

Gameplay verification is recorded below. Automated callbacks and audio mocks do not constitute a complete player walkthrough. Exact auditory transcription of every recording, every optional/replay path, and full Hallway/Level 3/ending gameplay remain unverified.

Headless gameplay attempt: launched Chrome against local Vite with the real paperclip/cuff and room-transition harness. First run reloaded during source edits; the stable retry did not complete level preparation within the QA budget. No browser gameplay assertions are claimed as passed. All gameplay paths remain unverified by a completed real-time walkthrough.
