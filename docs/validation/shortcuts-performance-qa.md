# Shortcut removal and conservative performance review

Branch: `codex/shortcuts-safe-performance`, created from `main` (`174a5ab`).

## Keyboard changes

Removed keyboard bindings for level previews (1–4/numpad/L), study reveal tests (5/6), handoff test (9/numpad9), puzzle/exit/ending bypass (G), opening-news bypass (K), and developer free camera (N, including its filming/time/freeze commands). Unused developer utility functions remain in source; the camera no longer installs input listeners. No developer shortcuts remain bound in development or production.

Preserved Controls-menu inputs: WASD/arrows, jump/SPACE, sprint, crouch, E/right-click, inventory scrolling, Q, I, F, V, H, T, R/restart confirmation, K/credits, Escape and menu navigation. Keypad digit/numpad entry, text fields, photo board, newspaper and intentional SPACE waking/letter skips are unchanged. No normal numeric hotbar binding existed in the inspected handlers; numeric input was not globally intercepted or disabled.

## Performance review

Reviewed shared frame/render/scene activation paths, interaction raycasts, level update entry points across all five scenes, menus and cutscenes. Existing inactive-scene gates and rendering settings remain unchanged. No lighting, shadow, reflection, shader, postprocessing, asset-quality, physics, AI, audio or timing changes were attempted.

One small implementation change: reuse Three.js's optional raycast output array in `Interaction.update`, then clear it after filtering so old scene objects are not retained. Raycast geometry, ordering, range, availability predicates, priority selection and prompts are identical. This removes exactly one temporary array per interaction update (about 60 arrays/sec at 60 updates/sec). Filtered results remain independent.

Targeted CPU benchmark, not end-to-end game FPS: 100 real Three.js mesh targets, 4,000 updates, median of seven alternating runs. Before editing: 143.1 ms baseline / 134.8 ms candidate. Final regression run: 104.5 ms baseline / 106.1 ms candidate. Timings vary; no consistent CPU or FPS gain is claimed. The deterministic improvement is reduced array allocation. Differential checks compare selected object and prompt across 200 changing viewpoints, priorities, visibility/enabled flags, target-list changes and disabled interaction.

## Validation and limits

- PASS: updated startup/shortcut regression executes the actual gameplay handler against removed digit/numpad/G/L/N keys in every scene, verifies normal player keys still invoke their actions, and confirms no opening report key bypass or camera listener registration.
- PASS: interaction differential regression and allocation benchmark.
- Existing checks: 30/35 passed (all `check-*.mjs` except the inventory report generator, excluded to avoid rewriting the separate voice report). Includes gameplay, restraints, puzzles, maze, seeker, menus, leaderboard, cutscenes/endings and voice regressions.
- Five failures in untouched expectations: `check-batch-one.mjs:16` (photograph handler shape), `check-batch-three.mjs:29`, `check-caption-policy.mjs:46`, `check-dialogue-cleanup.mjs:4`, `check-dialogue-ui-batch2.mjs:27` (caption visibility/text). Left unchanged.
- PASS: production build, 16.92 s; existing large-chunk warning only. No production source changed after that build.
- No complete browser walkthrough or GPU/frame-time profile was performed. No claim of visually measured end-to-end FPS improvement. The changes do not touch voice/caption source, UI markup/CSS, assets or rendering configuration. Existing untracked teammate/devlog files were preserved.

Changed production files: `src/main.js` (keyboard bindings only), `src/core/FreeCamera.js` (remove listener registration), `src/core/Interaction.js` (temporary array reuse). Regression files: `scripts/check-startup-shortcuts.mjs`, `scripts/check-interaction-performance.mjs`.

## Requested Backrooms camera follow-up

Added camera-only floor/ceiling slabs using the existing maze bounds and 2.35 m ceiling. The existing shoulder-boom collision code pulls the camera inside the room when looking down/up, preventing an exterior view through the ceiling/floor. No player movement colliders, other levels, voice or caption logic changed. Regression: actual slab definitions tested over 537 standing/crouching/jumping pitch combinations, plus clear-view/in-place output cases; existing camera and maze checks pass. No browser visual verification was performed. This follow-up is a separate commit from the performance pass.
Follow-up production build: PASS, 21.66 s; existing chunk-size warning only.
