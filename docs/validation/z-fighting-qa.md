# Chair and Backrooms frame z-fighting

Fresh branch `codex/z-fighting-fixes` from updated main `e8d7363`. The interrupted attempt left no tracked changes; none were carried into this branch. Existing untracked teammate/devlog files are preserved.

## Repairs

- Annabelle wingback: clipped one coplanar triangle against its overlapping neighbour on the right wing. The same exterior surface remains, with interpolated original UVs/normals.
- Covered armchair: clipped overlaps in 17 velvet bevel triangles beneath the cloth. Only the armchair primitive is edited; shared accessors are cloned first so the covered sofa/cabinet are unchanged. The sheet itself is unchanged.
- Desk chair: narrowed the back from 420 to 416 mm, leaving a 2 mm reveal per side instead of coplanar side faces overlapping the seat.
- Backrooms frames: moved each top rail 2 mm forward from its overlapping posts, applying through the common model-loading path to exit doors and room frames. Room frames also sit 2 mm off the wallpaper so their rear faces do not fight the wall. Door hinges, colliders and interactions are unchanged. No global depth/render-setting workaround.

The reusable `check-chair-coplanar-faces.mjs` audits the two affected meshes; `--write` reproduces the targeted repairs on an uncorrected asset. It subtracts only positive-area, same-facing coplanar overlap and retains the union; original attributes stay intact and interpolated vertices are added only at cut boundaries. The 1e-7 projected-area tolerance excludes float32 boundary noise. Unreferenced accessor copies are discarded on save.

## Validation

- PASS: coplanar-overlap audit for wingback and covered armchair.
- PASS: 2,304 ray comparisons against pre-fix main assets; original vertex attributes, embedded texture hashes and transforms retained; unrelated covered furniture indices unchanged.
- PASS: study reveal, study seeker, study surfaces, gameplay camera regression, maze validator/self-tests, shortcut and Backrooms camera regressions.
- PASS: production build, 22.44 s; existing chunk-size warning only.
- Existing `check-batch-three.mjs:29` failure concerns unchanged caption visibility and is outside this fix.
- Inspected headless WebGL previews of the wingback, covered chair, desk chair and door frame (`artifacts/zfight-qa/`). These are isolated asset previews, not a complete in-game walkthrough or temporal flicker measurement.

No audio, caption, puzzle, AI or player movement code changed. Blender source files are untouched; the shipped GLBs contain the local mesh corrections.
