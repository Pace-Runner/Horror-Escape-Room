# Continuous Level 3 wallpaper and ceiling

Generated with the built-in image-generation tool. Original textures remain available.

- `continuous_damask_1k.webp`: compact 1024px source, referenced by `studySurfaces.js`. At load, `studySurfaceSampling.js` selects one complete 276 x 358 floral period at (128, 640) and smoothly matches its opposite edges. It is uploaded once as one shared repeating texture, with world-aligned UVs across wall/window sections. No additional per-frame shader work.
- `continuous_plaster_v2.webp`: one 1390 x 1132 continuous plaster image, mapped once across the main ceiling using clamp-to-edge wrapping.
- Measured linear-albedo tint corrections preserve the previous average RGB brightness within 2%; light sources and exposure are unchanged.

## Wallpaper prompt

Edit this existing Victorian damask wallpaper game texture into a professionally seamless repeatable albedo tile. Preserve the same aged dark brown/taupe/olive palette, similar worn floral damask ornament scale, restrained contrast and finely weathered paper material. Fix the technical problem: the existing square tile has uneven dark borders, lighting patches and ornamental edges that visibly form a square grid when repeated over large walls. Make average background tone UNIFORM across the image, no vignette or baked light/shadow, no rectangular patches or horizontal/vertical seams. Regular small authentic Victorian damask floral repeats, complete motifs precisely continuing across opposite edges; design seamless periodicity in both directions. Flat orthographic front-on material scan, square composition, approximately 1024?2048px. Fine soft grain only, understated irregular wear, no strong stains, no squares, no borders, no panels, no typography, no furnishings. This must feel like one continuous roll of old wallpaper when tiled, not many photographs in a grid. Texture asset only.

Reference: `option_a_damask_512.jpg`.

## Ceiling prompt

Edit this plaster ceiling albedo texture for a Victorian study at night. Preserve the reference warm grey-taupe aged matte plaster and similar average brightness. Remove the visible evenly spaced repeated/crackle patches that form an underlying square/diamond grid. Replace with one genuinely continuous natural plaster expanse: fine softly irregular trowel grain, VERY subtle nonperiodic low contrast clouding, only a few scattered thin hairline cracks with organic irregular spacing, no repeated shapes or regularly spaced texture features. This is one complete 16x13 metre ceiling mapped once, NOT a repeated tile. Material detail should read small over a large surface. Uniform even diffuse albedo lighting, no vignette, no bright areas, no dark border, no baked directional light, no beams, no joints, no panels, no tiles, no grid, no furnishings, no text. Flat orthographic material surface filling image, landscape 16:13 aspect, about 1536?2048 pixels wide. Natural restrained subtle texture; no dramatic peeling or chunky damage. Photorealistic plaster material scan.

Reference: `continuous_ceiling_plaster.webp`.
