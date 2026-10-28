# Wine Bottles 01 (Poly Haven), the bottle Mark throws

- **Source:** "Wine Bottles 01" by Jurita Burger and Rico Cilliers, https://polyhaven.com/a/wine_bottles_01
- **Licence:** CC0 (public domain). No attribution is required.
- **Downloaded:** 2026-10-27 at 1k through the MCP for Blender addon (`import_asset polyhaven wine_bottles_01 1k`). Kiran picked the Bordeaux bottle of the four.
- **This file:** `wine_bottle_bordeaux_polyhaven_1k.blend` is the Bordeaux bottle only (`wine_bottles_01_bordeaux`), at the origin, trimmed to its two colour maps: the set's diffuse atlas and the label's diffuse. The set's normal, metal, roughness and alpha maps were dropped. They took the file from 7.9 MB to 590 KB, and the game uses none of them: its glass is opaque, not transmissive.

`blender/study/import_bottle.py` turns it into `src/assets/models/study/study_bottle.glb`. It:
- drops the wine inside;
- swaps the transmissive glass for an opaque dark glass;
- decimates it to the size of a throwable;
- puts the origin at the neck, where the hand holds it.
