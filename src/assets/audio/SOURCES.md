# Where every recording came from

Every audio file the game ships, where it was downloaded from, what licence the
upload states, the exact cut used and what was done to it. The game deploys
publicly, so this table is the record that keeps each file defensible, or tells
you which ones are not.

Rebuild any of the files below with `node scripts/audio/build.mjs` (see
[docs/AUDIO.md](../../../docs/AUDIO.md)). The cuts are in
[scripts/audio/sources.json](../../../scripts/audio/sources.json), and the measured
results the game reads are in [manifest.json](manifest.json).

Fetched 2026-10-16 with `yt-dlp --no-playlist -f bestaudio`. The licence column
is copied from YouTube's licence field and the upload's description. It is what
the uploader states, not a legal opinion.

## The director's cues and the breathing

| # | File | Source | Title / uploader | Licence as listed | Cut used (source seconds) |
|---|------|--------|------------------|-------------------|---------------------------|
| 1 | `amb/laugh_distant.m4a` | [gstQeQVW848](https://www.youtube.com/watch?v=gstQeQVW848) | "Evil Laughing Woman Sound - Woman Laugh Sound Effect \| Ver. 1", Distorted Room | Standard YouTube licence. Description: *"Use this sound effect only with the prior approval of the author."* **Unverified, permission needed** | 1.90 to 52.63 (50.73 s, all eleven laughs) |
| 2 | `monster/hunter_breath.m4a` | [CrjPD3Fg3Wk](https://www.youtube.com/watch?v=CrjPD3Fg3Wk) | "Scary Sound Effect #3", Best Sound Effects | Standard YouTube licence. Description credits *"Cthulhu growl" by cyclon8472, CC 4.0, freesound.org*. **Unverified:** the CC variant is not named, and freesound was not checked | 0.00 to 8.30. Loops 0 to 8 s, as asked |
| 4 | `sfx/crt_static.m4a` | [wf2Ojwq4gYU](https://www.youtube.com/watch?v=wf2Ojwq4gYU) | "TV STATIC (4K 60FPS)", The Fowl Owl | **Creative Commons Attribution**, plus the author's note: *"YOU CAN USE THIS CLIP… I'M NOT GONNA CARE IF U CREDIT ME OR NOT"* | 0.40 to 9.90, loop 0.50 to 9.50 |
| 5 | `amb/rain_bed.m4a` | [QH-3GwAVI5o](https://www.youtube.com/watch?v=QH-3GwAVI5o) | "Night Rainstorm Over Quiet Town \| Watching from a Small House Window \| Soft Rain & Gentle Thunder", Cowboys in Rain | Standard YouTube licence; *"Copyright © Cowboys in Rain"*. **Unverified** | 30.5 to 336.0, loop 31.0 to 331.0 (5:00). Only the first 25 min of the 11-hour video were fetched |
| 6 | `sfx/caught_sting.m4a` | [CfOU2Erb1b0](https://www.youtube.com/watch?v=CfOU2Erb1b0) | "BioShock 2 \| Harvesting a Little Sister ♪ [Sound Effect]", Bond Factory | Standard YouTube licence; the audio is from the game BioShock 2 (2K Games). **Unverified, commercial game audio** | 8.71 to 13.71 (5.0 s) |
| 7 | `breathing.m4a` | [AnXnuZk7A18](https://www.youtube.com/watch?v=AnXnuZk7A18) | "Sound Effect - Man Freezing Breathing", FUNBOON | Standard YouTube licence. **Unverified** | 1.00 to 14.20, loop 1.52 to 13.45 |
| 8 | `foley/steps_metal.m4a` | [FZuRjlZqrrg](https://www.youtube.com/watch?v=FZuRjlZqrrg) | "Gmod/TF2 SFX - Metal Footsteps Sound Effect", Autisticblood5 | Standard YouTube licence; the audio is from Team Fortress 2 / Garry's Mod (Valve). **Unverified, commercial game audio** | 0.01 to 3.79 (silence trimmed) |
| 9 | `amb/candle.m4a` | [dxbQYNy_k20](https://www.youtube.com/watch?v=dxbQYNy_k20) | "Candle flicker // free sound effects", Macc III Audio & Digital Production | Standard YouTube licence. "Free" is in the title, but no licence is given. **Unverified** | 0.50 to 22.00, loop 1.18 to 21.18 |
| 10 | `sfx/lockbox_open.m4a` | [mMBHFswOBik](https://www.youtube.com/watch?v=mMBHFswOBik) | "Chest Opening SOUND Effect", SOUND Effects Public Domain (No Copyrights) | Description: *"free and Public Domain… Safe for personal & commercial use… use freely"* | 0.10 to 4.84 (silence trimmed, 4.74 s) |
| 11 | `sfx/door_open.m4a` | [IX3wIor-4OY](https://www.youtube.com/watch?v=IX3wIor-4OY) | "Creepy Wooden Door Creaking Sound Effect – Realistic Horror Ambience Audio", Sound Around | Description: *"Sound Effect by freesound_community from Pixabay… royalty-free and may be reused… Please credit Sound Around"* | 2.07 to 5.48 (silence trimmed, 3.41 s) |
| 12 | `monster/stalk_breath.m4a` | [a9QCiMuyVjQ](https://www.youtube.com/watch?v=a9QCiMuyVjQ) | "Scary Breathing And Heartbeat Sound Effects / Hombre aterrado, respiración", Scary Sound Effects | Standard YouTube licence. **Unverified** | 4.80 to 20.50. A fresh 4 s window starting in 5.0 to 16.0 is used each appearance |
| 13 | `monster/hunter_steps.m4a` | [3SUAdgqPv3E](https://www.youtube.com/watch?v=3SUAdgqPv3E) | "CREEPY FOOTSTEPS (& RUNNING), HORROR SOUND EFFECT -FREE", DARKLIT STUDIO | **Creative Commons Attribution** | 4.90 to 35.38 (silence trimmed) |

Track 3 ("Annabelle singing", [lsWNnvJY6No](https://www.youtube.com/watch?v=lsWNnvJY6No))
is **not in the game and was not downloaded**: it belongs to a long hallway that
does not exist yet. See "Deferred" in docs/AUDIO.md.

## Processing (all of the above)

Every file went through the same chain, in this order:

1. The cut above.
2. Mono (a straight L+R average).
3. 20 Hz high-pass.
4. For loops, a baked equal-power seam: 0.25 s (0.3 s on the candle, 4 s on the rain), padded either side with 0.15 s of the loop itself.
5. Peak-normalised to −3 dBFS true peak.
6. AAC-LC, 48 kHz mono: 96 kbps, or 80 kbps for the rain.

One-shots get 5 ms fade-ins and 20 ms fade-outs. The sting fades out over its last 0.6 s.

Measured after encoding (from manifest.json):

| File | Length | Peak (dBFS) | Loudness (LUFS) | Loop seam (wrap step / median step) |
|------|--------|-------------|-----------------|--------------------------|
| laugh_distant | 50.73 s | −3.0 | −24.9 | – |
| hunter_breath | 8.30 s | −3.0 | −21.0 | built at runtime |
| crt_static | 9.30 s | −3.2 | −13.1 | 0.01× |
| rain_bed | 300.31 s | −3.0 | −22.1 | 1.84× |
| caught_sting | 5.01 s | −2.9 | −19.7 | – |
| breathing | 12.25 s | −3.3 | −23.2 | 0.96× |
| steps_metal | 3.78 s | −2.6 | −28.6 | – |
| candle | 20.31 s | −3.1 | −33.8 | 0.01× |
| lockbox_open | 4.74 s | −2.8 | −30.4 | – |
| door_open | 3.41 s | −3.1 | −18.9 | – |
| stalk_breath | 15.70 s | −2.9 | −19.4 | built at runtime |
| hunter_steps | 30.49 s | −3.0 | −25.2 | – |

Two of the sources were clipped before they reached us: the laughter had 1,352
samples at full scale and the monster breathing 542. Normalising down cannot undo
that, so any harshness in their loudest moments is in the source.

## Recordings that predate this table

| File | Source |
|------|--------|
| `walking_audio.mp3`, `running_audio.mp3` | Added in d906a0b. **Source, author and licence not recorded** |
| `trolley_roll.m4a`, `trolley_crash.m4a` | Added in 9937ee5 / 6ae89ef. **Source, author and licence not recorded** |
