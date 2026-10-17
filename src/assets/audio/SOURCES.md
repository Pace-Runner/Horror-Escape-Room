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
| 3 | `amb/annabelle_singing.m4a` | [lsWNnvJY6No](https://www.youtube.com/watch?v=lsWNnvJY6No) | "Daisy Bell But I Made It Even More Unsettling", LARA'S HORROR SOUNDS | **Creative Commons Attribution** (YouTube's CC BY 3.0); credited in the game's `CREDITS`. Fetched 2026-10-17 | 0.40 to 50.20 (silence trimmed, 49.78 s). Not looped: sung through, a 3 to 7 s pause, then again |
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

## Free sound effects (tracks 101+)

Found and added 2026-10-17. Everything here is **CC0** (Kenney, or Freesound
uploads marked CC0) or **public domain** (PDSounds.org recordings, via Wikimedia
Commons), so none of it needs credit or permission. They are credited in the
game's `CREDITS` anyway. The Freesound files are the site's high-quality MP3
previews, which need no account; the originals are on each linked page.

Fetched by `scripts/audio/build.mjs --download` straight from the URLs in
`sources.json` (`download.direct`, or `download.zip` for a member of a Kenney
pack). The same chain as above applies, peak-normalised to −3 dBFS; where they
play and how loud is `SFX` and the loop specs in `src/systems/AudioDirector.js`.

| # | File | Source | Author | Licence | Cut used | Length |
|---|------|--------|--------|---------|----------|--------|
| 101 | `sfx/door_locked_rattle.m4a` | [Door handle creaking](https://commons.wikimedia.org/wiki/File:Door_handle_creaking.ogg) | stephan | Public domain (PDSounds, via Wikimedia Commons) | 0.00 to 2.60 (silence trimmed) | 2.58 s |
| 102 | `sfx/metal_door_open.m4a` | [Open metallic door](https://commons.wikimedia.org/wiki/File:Open_metallic_door.ogg) | hc | Public domain (PDSounds, via Wikimedia Commons) | 1.60 to 5.30 (silence trimmed) | 3.70 s |
| 105 | `sfx/latch.m4a` | [metalLatch](https://kenney.nl/assets/rpg-audio) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.26 s |
| 106 | `sfx/metal_click.m4a` | [metalClick](https://kenney.nl/assets/rpg-audio) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.43 s |
| 107 | `sfx/deadbolt_open.m4a` | [Unlock Deadbolt](https://freesound.org/people/alegemaate/sounds/364683/) | alegemaate | CC0 (Freesound) | whole file (silence trimmed) | 1.49 s |
| 108 | `sfx/padlock_open.m4a` | [opening Padlock](https://freesound.org/people/NachtmahrTV/sounds/553258/) | NachtmahrTV | CC0 (Freesound) | whole file (silence trimmed) | 4.36 s |
| 109 | `sfx/gate_open.m4a` | [cemeterygate8](https://freesound.org/people/celadon_noise/sounds/399460/) | celadon_noise | CC0 (Freesound) | 0.00 to 4.50 (silence trimmed) | 4.50 s |
| 110 | `sfx/gate_locked.m4a` | [CHAIN & LOCK ON FENCE SOUND](https://freesound.org/people/metrostock99/sounds/345070/) | metrostock99 | CC0 (Freesound) | whole file (silence trimmed) | 3.56 s |
| 111 | `sfx/keypad_press.m4a` | [select_002](https://kenney.nl/assets/interface-sounds) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.04 s |
| 112 | `sfx/keypad_wrong.m4a` | [error_004](https://kenney.nl/assets/interface-sounds) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.10 s |
| 113 | `sfx/keypad_accept.m4a` | [confirmation_002](https://kenney.nl/assets/interface-sounds) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.54 s |
| 114 | `sfx/switch_click.m4a` | [switch_003](https://kenney.nl/assets/interface-sounds) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.29 s |
| 115 | `sfx/visor_on.m4a` | [maximize_002](https://kenney.nl/assets/interface-sounds) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.26 s |
| 116 | `sfx/visor_off.m4a` | [minimize_002](https://kenney.nl/assets/interface-sounds) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.26 s |
| 117 | `sfx/cctv_glitch.m4a` | [glitch_004 + glitch_002 + glitch_001](https://kenney.nl/assets/interface-sounds) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | 3 files joined, 0.03 s apart, each to the same peak | 0.18 s |
| 118 | `sfx/breaker_on.m4a` | [Circuit Breaker 1 SP](https://freesound.org/people/sribubba/sounds/130152/) | sribubba | CC0 (Freesound) | whole file (silence trimmed) | 0.54 s |
| 119 | `sfx/breaker_off.m4a` | [Circuit Breaker 2 DP](https://freesound.org/people/sribubba/sounds/130153/) | sribubba | CC0 (Freesound) | whole file (silence trimmed) | 0.73 s |
| 120 | `sfx/main_lever.m4a` | [Kill Switch (Large Breaker Switch)](https://freesound.org/people/EchoCinematics/sounds/131599/) | EchoCinematics | CC0 (Freesound) | whole file (silence trimmed) | 1.76 s |
| 121 | `sfx/spark_pop.m4a` | [Spark](https://freesound.org/people/elliott.klein/sounds/189630/) | elliott.klein | CC0 (Freesound) | whole file (silence trimmed) | 0.17 s |
| 122 | `sfx/panel_trip.m4a` | [Electricity Sound](https://freesound.org/people/NachtmahrTV/sounds/556717/) | NachtmahrTV | CC0 (Freesound) | whole file (silence trimmed) | 2.20 s |
| 123 | `sfx/tubes_start.m4a` | [Lights Flicker On](https://freesound.org/people/mmaruska/sounds/232447/) | mmaruska | CC0 (Freesound) | 0.00 to 3.00 | 3.00 s |
| 124 | `sfx/power_down.m4a` | [Power Down](https://freesound.org/people/peepholecircus/sounds/169994/) | peepholecircus | CC0 (Freesound) | whole file (silence trimmed) | 4.23 s |
| 125 | `sfx/generator_stop.m4a` | [engine2_down](https://freesound.org/people/ReadeOnly/sounds/186938/) | ReadeOnly | CC0 (Freesound) | whole file (silence trimmed) | 4.54 s |
| 126 | `amb/overload_buzz.m4a` | [Aggressive electric buzzing](https://commons.wikimedia.org/wiki/File:Aggressive_electric_buzzing.ogg) | stephan | Public domain (PDSounds, via Wikimedia Commons) | 0.20 to 6.00, looped (4.50 s, 0.4 s seam) | 4.80 s |
| 127 | `amb/tube_hum.m4a` | [Fluorescent Lightbulb Hum](https://freesound.org/people/ftpalad/sounds/119910/) | ftpalad | CC0 (Freesound) | 0.50 to 31.00, looped (20.00 s, 1 s seam) | 20.30 s |
| 128 | `amb/generator_idle.m4a` | [Diesel engine idling](https://freesound.org/people/chungus43A/sounds/705386/) | chungus43A | CC0 (Freesound) | 0.30 to 9.40, looped (8.00 s, 0.5 s seam) | 8.30 s |
| 129 | `amb/thunder_1.m4a` | [Storm thunderbolts](https://commons.wikimedia.org/wiki/File:Storm_thunderbolts.ogg) | stephan | Public domain (PDSounds, via Wikimedia Commons) | 4.60 to 17.50 (silence trimmed) | 12.90 s |
| 130 | `amb/thunder_2.m4a` | [Storm thunderbolts](https://commons.wikimedia.org/wiki/File:Storm_thunderbolts.ogg) | stephan | Public domain (PDSounds, via Wikimedia Commons) | 34.40 to 41.00 (silence trimmed) | 6.59 s |
| 131 | `amb/thunder_3.m4a` | [Storm thunderbolts](https://commons.wikimedia.org/wiki/File:Storm_thunderbolts.ogg) | stephan | Public domain (PDSounds, via Wikimedia Commons) | 51.60 to 58.00 (silence trimmed) | 6.40 s |
| 132 | `amb/thunder_4.m4a` | [Storm thunderbolts](https://commons.wikimedia.org/wiki/File:Storm_thunderbolts.ogg) | stephan | Public domain (PDSounds, via Wikimedia Commons) | 66.60 to 81.00 (silence trimmed) | 14.38 s |
| 133 | `amb/thunder_5.m4a` | [Storm thunderbolts](https://commons.wikimedia.org/wiki/File:Storm_thunderbolts.ogg) | stephan | Public domain (PDSounds, via Wikimedia Commons) | 87.60 to 101.50 (silence trimmed) | 13.90 s |
| 134 | `amb/rain_glass.m4a` | [Rain against the window](https://commons.wikimedia.org/wiki/File:Rain_against_the_window.ogg) | cori | Public domain (PDSounds, via Wikimedia Commons) | 0.50 to 81.00, looped (70.00 s, 3 s seam) | 70.30 s |
| 135 | `sfx/drawer_open.m4a` | [Drawer Opening & Closing](https://freesound.org/people/quantumriver/sounds/552153/) | quantumriver | CC0 (Freesound) | 0.20 to 1.75 (silence trimmed) | 1.55 s |
| 137 | `sfx/planks_pry.m4a` | [Planks Clattering](https://freesound.org/people/Fission9/sounds/478238/) | Fission9 | CC0 (Freesound) | 0.00 to 1.20 (silence trimmed) | 0.89 s |
| 138 | `sfx/wood_creak.m4a` | [Wood Creak Single V3](https://freesound.org/people/Rudmer_Rotteveel/sounds/502511/) | Rudmer_Rotteveel | CC0 (Freesound) | whole file (silence trimmed) | 0.99 s |
| 139 | `sfx/chair_scrape.m4a` | [Pushing chair.wav](https://freesound.org/people/santiagogra/sounds/532983/) | santiagogra | CC0 (Freesound) | whole file (silence trimmed) | 1.65 s |
| 140 | `sfx/keys_pickup.m4a` | [Picking Up Keys](https://freesound.org/people/WeeJee_vdH/sounds/267711/) | WeeJee_vdH | CC0 (Freesound) | whole file (silence trimmed) | 1.20 s |
| 141 | `sfx/paper.m4a` | [Turning a page](https://commons.wikimedia.org/wiki/File:Turning_a_page.ogg) | planish | Public domain (PDSounds, via Wikimedia Commons) | whole file (silence trimmed) | 3.35 s |
| 142 | `sfx/chain_drop.m4a` | [Chains.wav](https://freesound.org/people/cribbler/sounds/370877/) | cribbler | CC0 (Freesound) | 0.00 to 2.40 (silence trimmed) | 2.40 s |
| 143 | `sfx/lockpick.m4a` | [Tiny metal/lockpicking](https://freesound.org/people/cappellacciocrew/sounds/639086/) | cappellacciocrew | CC0 (Freesound) | 45.00 to 48.40 (silence trimmed) | 3.36 s |
| 144 | `sfx/hinge_creak.m4a` | [creak1](https://kenney.nl/assets/rpg-audio) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.64 s |
| 145 | `sfx/cloth.m4a` | [cloth1](https://kenney.nl/assets/rpg-audio) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | whole file (silence trimmed) | 0.66 s |
| 148 | `sfx/gasp.m4a` | [Gasp.](https://freesound.org/people/bacruz666/sounds/341908/) | bacruz666 | CC0 (Freesound) | whole file (silence trimmed) | 0.94 s |
| 149 | `monster/sniff.m4a` | [Sniffing.wav](https://freesound.org/people/spookymodem/sounds/202101/) | spookymodem | CC0 (Freesound) | whole file (silence trimmed) | 2.31 s |
| 150 | `sfx/drip.m4a` | [Water Drop 01](https://freesound.org/people/LilMati/sounds/348022/) | LilMati | CC0 (Freesound) | whole file (silence trimmed) | 0.19 s |
| 151 | `foley/steps_carpet.m4a` | [footstep_carpet_000-004](https://kenney.nl/assets/impact-sounds) (Kenney pack) | Kenney (kenney.nl) | CC0 (Kenney) | 5 files joined, 0.45 s apart, each to the same peak | 3.21 s |

## Recordings that predate this table

| File | Source |
|------|--------|
| `walking_audio.mp3`, `running_audio.mp3` | Added in d906a0b. **Source, author and licence not recorded** |
| `trolley_roll.m4a`, `trolley_crash.m4a` | Added in 9937ee5 / 6ae89ef. **Source, author and licence not recorded** |
