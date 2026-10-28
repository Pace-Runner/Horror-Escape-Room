# Sofa 02 (Poly Haven), the study's Chesterfield

- **Source:** "Sofa 02" by Kirill Sannikov, https://polyhaven.com/a/sofa_02
- **Licence:** CC0 (public domain). No attribution is required.
- **Downloaded:** 2026-10-27 at 1k through the MCP for Blender addon (`import_asset polyhaven sofa_02 1k`). Kiran picked it over Sofa 03 and a scripted Chesterfield.
- **This file:** `sofa_02_polyhaven_1k.blend` is the two downloaded objects (`sofa_02_Base`, `sofa_02_Seat`) at the origin as they came, with their 1k maps packed (diffuse, roughness, metallic, normal).

`blender/study/import_chesterfield.py` turns it into `src/assets/models/study/study_chesterfield.glb`. It:
- joins the two parts and turns it to face +Y;
- scales it up to 0.9 m tall, so it hides a crouching Mark;
- keeps the colour and roughness maps at 512 px and drops the normal and metallic maps.
