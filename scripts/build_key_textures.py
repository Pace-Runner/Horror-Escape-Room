"""
Bakes Level 1's rusted brass key texture from two photos already in the game:
the lab pipes' bare steel (metal055b, for its fine scratches) and the lab's
rust overlay (texturelabs_metal_190_rust_overlay, a cut-out of rust).

The key stays BRASS: the brass colour carries the steel photo's grain, and the
rust sits on top of it in patches -- the colour of the brass itself is not
changed, only covered where there is rust. Where there is rust the surface is
also rough and stops being metal, which is what makes it read as rust rather
than as a brown stain on shiny metal.

Writes, into src/assets/textures/keys/:
  brass_key_rusted.jpg      colour (sRGB)
  brass_key_rusted_rm.png   roughness in green, metalness in blue -- the
                            channels three.js reads its roughnessMap and
                            metalnessMap from, so one image can serve both

    python scripts/build_key_textures.py

Needs numpy, scipy and Pillow.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / 'src' / 'assets' / 'textures'
OUT = ASSETS / 'keys'
SIZE = 512

# The brass the key has always been (itemMeshes.js's 0xc9a24a), in sRGB 0..1.
BRASS = np.array([0xc9, 0xa2, 0x4a]) / 255
BRASS_ROUGHNESS = 0.32
BRASS_METALNESS = 0.85
RUST_ROUGHNESS = 0.9
# How much of the rust photo's cover is kept: the key is mostly brass.
RUST_STRENGTH = 0.75


def load(path, mode):
    return np.asarray(Image.open(path).convert(mode).resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32) / 255


def main():
    steel = load(ASSETS / 'lab' / 'metal055b_color.jpg', 'L')
    # The steel's light and dark around its own average, softened, as grain.
    grain = ndi.gaussian_filter(steel - steel.mean(), 0.6)
    brass = np.clip(BRASS[None, None, :] * (1 + 0.9 * grain[..., None]), 0, 1)

    rust = load(ASSETS / 'lab' / 'texturelabs_metal_190_rust_overlay.png', 'RGBA')
    cover = np.clip(rust[..., 3] * RUST_STRENGTH, 0, 1)[..., None]
    colour = brass * (1 - cover) + rust[..., :3] * cover

    roughness = BRASS_ROUGHNESS + (RUST_ROUGHNESS - BRASS_ROUGHNESS) * cover[..., 0]
    metalness = BRASS_METALNESS * (1 - cover[..., 0])
    rm = np.dstack([np.zeros_like(roughness), roughness, metalness])

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray((colour * 255).astype(np.uint8)).save(OUT / 'brass_key_rusted.jpg', quality=90)
    Image.fromarray((rm * 255).astype(np.uint8)).save(OUT / 'brass_key_rusted_rm.png', optimize=True)
    print('wrote', OUT / 'brass_key_rusted.jpg', 'and', OUT / 'brass_key_rusted_rm.png')


if __name__ == '__main__':
    main()
