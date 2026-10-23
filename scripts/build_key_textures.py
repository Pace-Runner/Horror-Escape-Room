"""
Bakes Level 1's two key finishes (rusted brass and rusted iron) from two photos already in the game:
the lab pipes' bare steel (metal055b, for its fine scratches) and the lab's
rust overlay (texturelabs_metal_190_rust_overlay, a cut-out of rust).

The key stays BRASS: the brass colour carries the steel photo's grain, and the
rust sits on top of it in patches -- the colour of the brass itself is not
changed, only covered where there is rust. Where there is rust the surface is
also rough and stops being metal, which is what makes it read as rust rather
than as a brown stain on shiny metal.

Writes, into src/assets/textures/keys/, for brass_key_rusted and iron_key_rusted:
  <name>.jpg      colour (sRGB)
  <name>_rm.png   roughness in green, metalness in blue -- the channels three.js
                  reads its roughnessMap and metalnessMap from, so one image can
                  serve both

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


def noise(rng, sigma):
    """Tileable smooth noise, roughly -1..1."""
    n = ndi.gaussian_filter(rng.standard_normal((SIZE, SIZE)).astype(np.float32), sigma, mode='wrap')
    return n / (np.abs(n).max() + 1e-6)


def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def bake(name, base, *, rust_strength, rust_shift, polish, base_roughness, base_metalness, tarnish, seed):
    """One key finish: a metal base worn bright in places, tarnished in the
    crevices and rusted in patches."""
    rng = np.random.default_rng(seed)
    steel = load(ASSETS / 'lab' / 'metal055b_color.jpg', 'L')
    grain = ndi.gaussian_filter(steel - steel.mean(), 0.6)

    # Broad blotches of tarnish, and fine scratches that catch the light.
    blotch = noise(rng, 18) * 0.7 + noise(rng, 6) * 0.3
    tarnish_mask = smoothstep(-0.05, 0.55, blotch)
    scratch = ndi.gaussian_filter(rng.standard_normal((SIZE, SIZE)).astype(np.float32), (0.5, 3.0), mode='wrap')
    scratch = np.clip(scratch / (np.abs(scratch).max() + 1e-6), 0, 1)
    shine = np.clip(smoothstep(0.55, 1.0, 0.5 + noise(rng, 9) * 0.9) * 0.7 + scratch * polish, 0, 1)

    colour = np.clip(base[None, None, :] * (1 + 0.9 * grain[..., None]), 0, 1)
    colour = colour * (1 - 0.55 * tarnish * tarnish_mask[..., None])
    colour = np.clip(colour * (1 + 0.3 * shine[..., None]), 0, 1)

    rust = load(ASSETS / 'lab' / 'texturelabs_metal_190_rust_overlay.png', 'RGBA')
    rust = np.roll(rust, rust_shift, axis=(0, 1))
    cover = np.clip(rust[..., 3] * rust_strength, 0, 1)
    cover = np.clip(cover + 0.35 * tarnish * tarnish_mask * rust_strength, 0, 1)[..., None]
    colour = colour * (1 - cover) + rust[..., :3] * cover

    roughness = base_roughness + 0.35 * tarnish * tarnish_mask - 0.16 * shine
    roughness = roughness + (RUST_ROUGHNESS - roughness) * cover[..., 0]
    metalness = np.clip(base_metalness - 0.15 * tarnish * tarnish_mask + 0.1 * shine, 0, 1) * (1 - cover[..., 0])
    rm = np.dstack([np.zeros_like(roughness), np.clip(roughness, 0.05, 1), metalness])

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray((colour * 255).astype(np.uint8)).save(OUT / f'{name}.jpg', quality=90)
    Image.fromarray((rm * 255).astype(np.uint8)).save(OUT / f'{name}_rm.png', optimize=True)
    print('wrote', OUT / f'{name}.jpg', 'and', OUT / f'{name}_rm.png')


def main():
    # The safe key: warm brass, rubbed bright on its edges, dark in the crevices,
    # with rust coming through in patches.
    bake('brass_key_rusted', BRASS * 0.78, rust_strength=0.6, rust_shift=(0, 0), polish=0.9,
         base_roughness=0.3, base_metalness=0.95, tarnish=0.8, seed=11)
    # The bedroom door key: old black iron, worn to bare bright steel where a
    # hand has held it, and heavily rusted everywhere else.
    bake('iron_key_rusted', np.array([0x3a, 0x3d, 0x42]) / 255, rust_strength=0.9, rust_shift=(190, 120),
         polish=1.0, base_roughness=0.34, base_metalness=1.0, tarnish=1.0, seed=29)


if __name__ == '__main__':
    main()
