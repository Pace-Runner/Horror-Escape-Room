# Contained ending sound sources

`l3_credits_score.wav` is an original synthesized instrumental cue created for this game, with no sampled recordings. Rebuild it with `node scripts/generate-ending-score.mjs`. Slow minor/add9 chords, soft bowed harmonics and sparse bell tones form overlapping 14-second phrases; the ending controller ducks it beneath the news and stops it on exit/reset.

Retrieved 2026-10-28 from Mixkit's **sound effects** collection (not stock music).
[Sound Effects Free License](https://mixkit.co/license/modal/sfxFree/) permits incorporation in commercial and noncommercial video games. These excerpts are incorporated into the game and its mixed preview; do not redistribute as a standalone sound pack.

| Game asset | Mixkit sound | Source cut (seconds) | Role |
|---|---|---|---|
| `l3_contained_tension.wav` | [Cinematic suspense ambience](https://assets.mixkit.co/active_storage/sfx/2510/2510.wav) (Mixkit 2510) | 30.00?45.00 | Continuous tonal tension under the player POV and reveal |
| `l3_contained_rise.wav` | [Cinematic suspense swell](https://assets.mixkit.co/active_storage/sfx/786/786.wav) (Mixkit 786) | 0.35?3.55 | Single crescendo ending at claw contact |
| `l3_contained_hit.wav` | [Suspence cinematic impact](https://assets.mixkit.co/active_storage/sfx/2917/2917.wav) (Mixkit 2917) | 6.02?9.62 | Deep hit and decay across the blackout |
| `l3_contained_aftermath.wav` | [Cinematic glass hit suspense](https://assets.mixkit.co/active_storage/sfx/677/677.wav) (Mixkit 677) | 0.40?2.60 | Quiet muffled resonance after contact |
| `l3_contained_radio_tune.wav` | [Broken radio frequency signal](https://assets.mixkit.co/active_storage/sfx/2563/2563.wav) (Mixkit 2563) | 2.95?4.85 | Receiver finds the news broadcast after the aftermath |

All cuts: stereo PCM16 at 44.1 kHz, peak scaling with headroom, 4 ms entry / 35 ms exit boundary fades. Runtime envelopes and exact timing are in `src/cutscenes/studyEndingAudioConfig.js`; no loops or full-length source playback.

Source SHA-256 fingerprints and measured cut durations:

```json
[
  {
    "file": "l3_contained_tension.wav",
    "mixkitId": 2510,
    "source": "https://assets.mixkit.co/active_storage/sfx/2510/2510.wav",
    "sourceSha256": "bd10c956cbcb55d9547d65545cc82b40a204b10264182745d2a115af5603e129",
    "cut": [
      30,
      45
    ],
    "duration": 15.0,
    "peakCeiling": 0.85,
    "processing": "PCM16 stereo; peak scaled, 4ms/35ms boundary fades"
  },
  {
    "file": "l3_contained_rise.wav",
    "mixkitId": 786,
    "source": "https://assets.mixkit.co/active_storage/sfx/786/786.wav",
    "sourceSha256": "6cff66e20e1731cd4ecd183795f7decc3cc5a0450fc4c87da98fe31641af6bcf",
    "cut": [
      0.35,
      3.55
    ],
    "duration": 3.2,
    "peakCeiling": 0.85,
    "processing": "PCM16 stereo; peak scaled, 4ms/35ms boundary fades"
  },
  {
    "file": "l3_contained_hit.wav",
    "mixkitId": 2917,
    "source": "https://assets.mixkit.co/active_storage/sfx/2917/2917.wav",
    "sourceSha256": "15583cbc68c0f6c93991aa06c288cc6e68dff28bb7bb35235fb06cc7f83bd2f7",
    "cut": [
      6.02,
      9.62
    ],
    "duration": 3.6,
    "peakCeiling": 0.9,
    "processing": "PCM16 stereo; peak scaled, 4ms/35ms boundary fades"
  },
  {
    "file": "l3_contained_aftermath.wav",
    "mixkitId": 677,
    "source": "https://assets.mixkit.co/active_storage/sfx/677/677.wav",
    "sourceSha256": "75def6245c7235b852b33125a3bd062f3d94bdade66f1c7235a571b368d3ff8c",
    "cut": [
      0.4,
      2.6
    ],
    "duration": 2.2,
    "peakCeiling": 0.8,
    "processing": "PCM16 stereo; peak scaled, 4ms/35ms boundary fades"
  },
  {
    "file": "l3_contained_radio_tune.wav",
    "mixkitId": 2563,
    "source": "https://assets.mixkit.co/active_storage/sfx/2563/2563.wav",
    "sourceSha256": "85c27d23c4adb161796acca506fa1b58e76b1c74c899adba67762e389ecfa314",
    "cut": [
      2.95,
      4.85
    ],
    "duration": 1.9,
    "peakCeiling": 0.65,
    "processing": "PCM16 stereo; peak scaled, 4ms/35ms boundary fades"
  }
]
```

## Replacement creature performance ? 2026-10-28

These replace the legacy ending roar, lunge and claw in the **contained** branch. Same [Mixkit Sound Effects Free License](https://mixkit.co/license/modal/sfxFree/).

| Asset | Recording | Original cut (s) |
|---|---|---|
| `l3_hollow_breath.wav` | [Terrifying Creature Breath](https://assets.mixkit.co/active_storage/sfx/2234/2234.wav) (Mixkit 2234) | 0.18?1.43 |
| `l3_hollow_growl.wav` | [Monster calm growl](https://assets.mixkit.co/active_storage/sfx/1956/1956.wav) (Mixkit 1956) | 0.16?1.36 |
| `l3_hollow_roar.wav` | [Aggressive beast roar](https://assets.mixkit.co/active_storage/sfx/13/13.wav) (Mixkit 13) | 0.08?1.20 |
| `l3_hollow_claw.wav` | [Sword gore slash hit](https://assets.mixkit.co/active_storage/sfx/2796/2796.wav) (Mixkit 2796) | 0.10?1.00 |
| `l3_hollow_rush.wav` | [Fast sword whoosh](https://assets.mixkit.co/active_storage/sfx/2792/2792.wav) (Mixkit 2792) | 0.00?0.18 |

Cuts are peak-scaled stereo PCM16, with 3 ms / 25 ms boundary fades. Runtime source windows overlap: breath ? low growl ? short attack roar ? air slash ? claw/tear and deep hit. Scene voices cut at contact; the deep decay crosses into the film title. News is played once underneath the credit crawl.

```json
[
  {
    "file": "l3_hollow_breath.wav",
    "mixkitId": 2234,
    "source": "https://assets.mixkit.co/active_storage/sfx/2234/2234.wav",
    "cut": [
      0.18,
      1.43
    ],
    "duration": 1.25,
    "peakCeiling": 0.8,
    "sourceSha256": "69f78ac2760d5cd990fac4da2206989d92b9532eb59b941ecb14ac64f88f7392"
  },
  {
    "file": "l3_hollow_growl.wav",
    "mixkitId": 1956,
    "source": "https://assets.mixkit.co/active_storage/sfx/1956/1956.wav",
    "cut": [
      0.16,
      1.36
    ],
    "duration": 1.2,
    "peakCeiling": 0.8,
    "sourceSha256": "27db2223d190802a1d74ef7864320f99f79b89b38556cfb6cabe65cf0db1d8ac"
  },
  {
    "file": "l3_hollow_roar.wav",
    "mixkitId": 13,
    "source": "https://assets.mixkit.co/active_storage/sfx/13/13.wav",
    "cut": [
      0.08,
      1.2
    ],
    "duration": 1.12,
    "peakCeiling": 0.86,
    "sourceSha256": "4a6a388da410e548c0f559d163f99360503b868a276e13aa0ea6cfd258835f0f"
  },
  {
    "file": "l3_hollow_claw.wav",
    "mixkitId": 2796,
    "source": "https://assets.mixkit.co/active_storage/sfx/2796/2796.wav",
    "cut": [
      0.1,
      1.0
    ],
    "duration": 0.9,
    "peakCeiling": 0.88,
    "sourceSha256": "717d2259ae38f014410247fd228d53bd3b36fd3e0bed161d9c185fb0986bf344"
  },
  {
    "file": "l3_hollow_rush.wav",
    "mixkitId": 2792,
    "source": "https://assets.mixkit.co/active_storage/sfx/2792/2792.wav",
    "cut": [
      0,
      0.18
    ],
    "duration": 0.18,
    "peakCeiling": 0.82,
    "sourceSha256": "e1de4e011ee6369aed772202a979590f03261e3607147bd2f04eda58ba5746eb"
  }
]
```

## Shared final slash and both ending branches ? 2026-10-28

The final slash is now shared by Released and Contained. `l3_hollow_slash.wav` combines a short dry strike with a quieter tearing layer; `l3_hollow_swipe.wav` is an accelerating blade-through-air excerpt leading into contact. Both branches retain their own dialogue and news recording.

| Asset/layer | Source | Cut |
|---|---|---|
| Slash: dry strike | [Swift Sword Strike, Mixkit 2166](https://assets.mixkit.co/active_storage/sfx/2166/2166.wav) | 0.10?0.64 s |
| Slash: tear, delayed 12 ms | [Sword cutting flesh, Mixkit 2788](https://assets.mixkit.co/active_storage/sfx/2788/2788.wav) | 0.045?0.505 s |
| Air sweep | [Sword blade swish, Mixkit 1506](https://assets.mixkit.co/active_storage/sfx/1506/1506.wav) | 0.25?0.72 s |

Same [Mixkit Sound Effects Free License](https://mixkit.co/license/modal/sfxFree/). Original source fingerprints and mix weights:

```json
{
  "slash": {
    "file": "l3_hollow_slash.wav",
    "layers": [
      {
        "mixkit": 2166,
        "cut": [
          0.1,
          0.64
        ],
        "gain": 0.65
      },
      {
        "mixkit": 2788,
        "cut": [
          0.045,
          0.505
        ],
        "gain": 0.27,
        "delay": 0.012
      }
    ]
  },
  "swipe": {
    "file": "l3_hollow_swipe.wav",
    "mixkit": 1506,
    "cut": [
      0.25,
      0.72
    ]
  },
  "sourceSha256": {
    "2166": "916312df2b375604edd13277fd2a1f002157088af54f1ec8edc53c35cf534110",
    "2788": "6431d922be41aee9ccc07f9e3b2834db06b6be960865a663e1614f7e34f59a99",
    "1506": "74b90982cb531017f25fd8c0304884d9ca29fd8614fa61d2249708284b8763ad"
  }
}
```
