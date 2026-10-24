"""
Builds Annabelle's textures from the model she is made from: "Victorian Child -
Low Poly Character Model" by _memo on Sketchfab, CC-BY 4.0, kept untouched at
blender/source/annabelle/victorian_child.glb.

The source is a boy in a grey nightshirt. Annabelle is a girl of about sixteen
in a cream nightgown that has been through a lot, so:

  - the nightshirt (every cool, unsaturated mid-grey pixel of the colour atlas)
    is recoloured to cream linen, its own shading kept;
  - the black shorts under it are linen too, so the gown's side slits show gown;
  - all of that cloth is then dirtied: grime soaked in from its seams and edges,
    tea-brown water marks, and a few small, old bloodstains;
  - the skirt, which is added in code (src/levels/annabelleFigure.js), gets its
    own linen of the same cream, dirtier toward the hem where it drags.

The reshaping -- her height, her arms, her hips, her hair -- is in
annabelleFigure.js, not here: this only changes pixels.

Writes:
  src/assets/models/study/annabelle.glb             the source, with the new atlas
  src/assets/textures/study/annabelle_skirt_linen.png

    python scripts/build_annabelle.py

Needs numpy and Pillow.
"""
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SOURCE = ROOT / 'blender' / 'source' / 'annabelle' / 'victorian_child.glb'
OUT_MODEL = ROOT / 'src' / 'assets' / 'models' / 'study' / 'annabelle.glb'
OUT_SKIRT = ROOT / 'src' / 'assets' / 'textures' / 'study' / 'annabelle_skirt_linen.png'

CREAM = np.array([222, 210, 186], np.float32)
GRIME = np.array([86, 70, 50], np.float32)     # earth and old soot
STAIN = np.array([122, 92, 56], np.float32)    # tea-brown water marks
BLOOD = np.array([84, 30, 26], np.float32)     # dried, nearly brown


# ---------- the GLB ----------

def read_glb(path):
    data = path.read_bytes()
    json_len = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len + 8
    bin_len = struct.unpack_from('<I', data, 20 + json_len)[0]
    return gltf, data[bin_start:bin_start + bin_len]


def write_glb(path, gltf, views):
    """Lays the buffer views out again, each 4-byte aligned, and writes the GLB."""
    blob = bytearray()
    for view, payload in zip(gltf['bufferViews'], views):
        while len(blob) % 4:
            blob.append(0)
        view['byteOffset'] = len(blob)
        view['byteLength'] = len(payload)
        blob += payload
    while len(blob) % 4:
        blob.append(0)
    gltf['buffers'] = [{'byteLength': len(blob)}]
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(blob))
    out += struct.pack('<II', len(text), 0x4E4F534A) + text
    out += struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    path.write_bytes(out)


# ---------- noise and stains ----------

def noise(h, w, scale, seed):
    """Smooth value noise: a random field resized up to `scale` px."""
    r = np.random.default_rng(seed).random((h // scale + 3, w // scale + 3)).astype(np.float32)
    im = Image.fromarray((r * 255).astype(np.uint8)).resize((w + 3 * scale, h + 3 * scale), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32)[:h, :w] / 255


def fbm(h, w, seed):
    return 0.5 * noise(h, w, 96, seed) + 0.3 * noise(h, w, 32, seed + 1) + 0.2 * noise(h, w, 8, seed + 2)


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blotches(h, w, n, rmin, rmax, seed):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    for _ in range(n):
        cy, cx, rad = r.uniform(0, h), r.uniform(0, w), r.uniform(rmin, rmax)
        d = np.hypot((yy - cy) / rad, (xx - cx) / (rad * r.uniform(0.6, 1.6)))
        out = np.maximum(out, np.clip(1 - d, 0, 1) ** 1.5 * r.uniform(0.5, 1))
    return out


def dirty(base, mask, seed, edge_px=26, hem=None, blood=0, stains=10):
    """Grime from the cloth's edges in, water marks with a tide line, old blood, grain."""
    h, w = mask.shape
    m = Image.fromarray((mask * 255).astype(np.uint8))
    inner = np.asarray(m.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(edge_px)), np.float32) / 255
    edge = np.clip(1 - inner, 0, 1) * mask
    amount = np.clip(0.32 * fbm(h, w, seed) + 0.5 * edge ** 1.2, 0, 1)
    if hem is not None:
        amount = np.clip(amount + hem, 0, 1)
    out = base.copy()
    for c in range(3):
        out[..., c] = out[..., c] * (1 - amount * 0.68) + GRIME[c] * amount * 0.68
    st = blotches(h, w, stains, 25, 70, seed + 5) * smooth(fbm(h, w, seed + 9), 0.35, 0.6)
    ring = np.clip(st * (1 - st) * 4, 0, 1) * 0.3 + st * 0.16
    for c in range(3):
        out[..., c] = out[..., c] * (1 - ring) + STAIN[c] * ring
    if blood:
        b = blotches(h, w, blood, 6, 18, seed + 11) * 0.5 * smooth(fbm(h, w, seed + 13), 0.3, 0.55)
        for c in range(3):
            out[..., c] = out[..., c] * (1 - b) + BLOOD[c] * b
    out += ((noise(h, w, 2, seed + 20) - 0.5) * 14)[..., None]
    return np.where(mask[..., None] > 0, np.clip(out, 0, 255), base)


# ---------- the atlas ----------

def girl_atlas(png_bytes):
    im = np.asarray(Image.open(io.BytesIO(png_bytes)).convert('RGB')).astype(np.float32)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx, mn = im.max(-1), im.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    # The nightshirt: a cool mid grey. Skin is pink, hair a dark plum, the background white.
    cloth = (sat < 0.22) & (mx > 55) & (mx < 200) & (b >= r - 6)
    out = im.copy()
    med = np.median(lum[cloth])
    for c in range(3):
        out[..., c] = np.where(cloth, np.clip(lum / med * CREAM[c], 0, 255), im[..., c])
    # The shorts: the black V island at the right of the atlas.
    yy, xx = np.mgrid[0:im.shape[0], 0:im.shape[1]]
    under = (xx >= 690) & (xx <= 1010) & (yy >= 410) & (yy <= 660) & (mx < 70)
    shade = 0.78 + 0.22 * np.clip((lum - lum[under].min()) / max(1, np.ptp(lum[under])), 0, 1)
    for c in range(3):
        out[..., c] = np.where(under, shade * CREAM[c] * 0.9, out[..., c])
    out = dirty(out, (cloth | under).astype(np.float32), 3, blood=4, stains=14)
    buf = io.BytesIO()
    Image.fromarray(out.astype(np.uint8)).save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def skirt_linen(size=512):
    yy, xx = np.mgrid[0:size, 0:size]
    base = np.ones((size, size, 3), np.float32) * CREAM + ((np.sin(xx * 1.9) + np.sin(yy * 1.9)) * 3.0)[..., None]
    # Row 0 is the hem: the skirt's lathe starts its v at the ankle, and three.js
    # reads a GLB-style texture (flipY off) from the top row down.
    v = yy / (size - 1)
    hem = np.clip(1 - v / 0.45, 0, 1) ** 1.4 * (0.55 + 0.45 * fbm(size, size, 40))
    out = dirty(base, np.ones((size, size), np.float32), 41, edge_px=4, hem=hem, blood=2, stains=8)
    # Seamless round the skirt: the right edge blends into the left.
    k = 24
    for i in range(k):
        t = i / k
        out[:, i] = out[:, i] * t + out[:, size - k + i] * (1 - t)
    return Image.fromarray(out.astype(np.uint8))


def main():
    gltf, blob = read_glb(SOURCE)
    views = [blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in gltf['bufferViews']]
    colour = gltf['textures'][gltf['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
    view = gltf['images'][colour]['bufferView']
    views[view] = girl_atlas(views[view])
    gltf['asset'].setdefault('extras', {})['modified'] = (
        'Recoloured and dirtied for Annabelle by scripts/build_annabelle.py; reshaped in src/levels/annabelleFigure.js.'
    )
    write_glb(OUT_MODEL, gltf, views)
    skirt_linen().save(OUT_SKIRT, optimize=True)
    print(f'wrote {OUT_MODEL.relative_to(ROOT)} and {OUT_SKIRT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
