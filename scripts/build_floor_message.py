"""
Builds Level 1's floor message, DON'T LET IT OUT, from a photo of a carved
wooden alphabet (src/assets/textures/bedroom/carved_alphabet.jpg).

Each letter is cut out of the photo with its carving -- the dark groove and
the pale cut faces either side of it -- and the wood round it is made
transparent, so in the game the bedroom's own floorboards show between the
strokes. The letters are laid out in one line with a little wobble in angle,
height and size, the way a hand cutting into a floor would leave them.

Writes, next to the photo:
  floor_message.png         the letters, RGBA
  floor_message_normal.png  a normal map from the grooves, so they catch the torch

    python scripts/build_floor_message.py

Needs numpy, scipy and Pillow.
"""
import random
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
TEXTURES = HERE.parent / 'src' / 'assets' / 'textures' / 'bedroom'
SOURCE = TEXTURES / 'carved_alphabet.jpg'

MESSAGE = "DON'T LET IT OUT"
# The decal is 1.7 x 0.85 m in bedroomLevel.js; the canvas keeps that 2:1.
CANVAS = (2048, 1024)
# How much bigger than in the photo the letters are drawn.
LETTER_SCALE = 1.3
LETTER_GAP = 14
SPACE_WIDTH = 70

# Each letter's box in the photo: x0, x1, y0, y1. Found from the photo's own
# carving (see find_strokes); only the letters the message uses.
LETTER_BOXES = {
    'D': (300, 388, 285, 458),
    'E': (392, 461, 285, 458),
    'I': (701, 737, 285, 458),
    'L': (974, 1044, 285, 458),
    'N': (1147, 1220, 285, 458),
    'O': (41, 141, 522, 705),
    'T': (503, 595, 522, 705),
    'U': (603, 687, 522, 705),
}

# How far a pixel has to differ from the wood round it to count as carving.
CARVING_THRESHOLD = 0.07


def load_photo():
    rgb = np.asarray(Image.open(SOURCE).convert('RGB')).astype(np.float32) / 255
    luminance = rgb.mean(axis=2)
    # The plain wood under the letters: a median wider than any stroke wipes
    # the carving out and leaves the boards' own light and grain.
    wood = ndi.median_filter(luminance, size=45)
    return rgb, luminance - wood


def find_strokes(deviation, box):
    """The carving inside `box`: every stroke that reaches its middle half, so a
    sliver of the neighbouring letter at the box's edge is left out."""
    x0, x1, y0, y1 = box
    carved = np.abs(deviation[y0:y1, x0:x1]) > CARVING_THRESHOLD
    # Opened to drop specks of grain, then closed hard: the middle of a groove
    # is nearly the wood's own shade, and closing fills it back in between its
    # dark floor and pale faces without spreading the letter outward.
    carved = ndi.binary_opening(carved, iterations=1)
    carved = ndi.binary_closing(carved, iterations=4)
    labels, count = ndi.label(carved)
    width = x1 - x0
    middle = np.zeros_like(carved)
    middle[:, width // 4: width - width // 4] = True
    keep = np.zeros_like(carved)
    for label, extent in enumerate(ndi.find_objects(labels), start=1):
        part = labels == label
        tall = extent[0].stop - extent[0].start
        # A seam between the boards is long and flat; no stroke is.
        if part.sum() > 40 and tall > 14 and (part & middle).any():
            keep |= part
    return keep


def cut_letter(rgb, deviation, letter):
    x0, x1, y0, y1 = LETTER_BOXES[letter]
    strokes = find_strokes(deviation, LETTER_BOXES[letter])
    # Feathered, so the edge fades into the floor instead of stopping.
    alpha = ndi.gaussian_filter(strokes.astype(np.float32), 1.1)
    alpha = np.clip(alpha * 1.6, 0, 1)
    # How deep each pixel is: the dark bottom of the groove deepest.
    depth = ndi.gaussian_filter(np.clip(-deviation[y0:y1, x0:x1] / 0.25, 0, 1) * strokes, 1.2)
    rgba = np.dstack([rgb[y0:y1, x0:x1], alpha])
    return rgba, depth


def to_image(array):
    return Image.fromarray((np.clip(array, 0, 1) * 255).astype(np.uint8))


def apostrophe_from(i_rgba, i_depth):
    """The photo has no apostrophe: the top of the I, short and leaning."""
    top = int(i_rgba.shape[0] * 0.32)
    return i_rgba[:top], i_depth[:top]


def main():
    rng = random.Random(1987)
    rgb, deviation = load_photo()
    glyphs = {letter: cut_letter(rgb, deviation, letter) for letter in set(MESSAGE) if letter.isalpha()}
    glyphs["'"] = apostrophe_from(*glyphs['I'])

    colour = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    height = Image.new('F', CANVAS, 0.0)

    # Lay the line out first, to centre it.
    placed = []
    x = 0
    for character in MESSAGE:
        if character == ' ':
            x += SPACE_WIDTH
            continue
        rgba, depth = glyphs[character]
        scale = LETTER_SCALE * rng.uniform(0.94, 1.06)
        angle = rng.uniform(-4, 4)
        lift = rng.uniform(-10, 10)
        image = to_image(rgba)
        size = (round(image.width * scale), round(image.height * scale))
        image = image.resize(size, Image.LANCZOS).rotate(angle, Image.BICUBIC, expand=True)
        relief = Image.fromarray(depth.astype(np.float32)).resize(size, Image.BICUBIC).rotate(angle, Image.BICUBIC, expand=True)
        if character == "'":
            lift -= 0.45 * LETTER_SCALE * 170
        placed.append((x, lift, image, relief))
        x += image.width + LETTER_GAP
    line_width = x - LETTER_GAP
    left = (CANVAS[0] - line_width) // 2
    for x, lift, image, relief in placed:
        top = round(CANVAS[1] / 2 - image.height / 2 + lift)
        colour.alpha_composite(image, (left + x, top))
        layer = Image.new('F', CANVAS, 0.0)
        layer.paste(relief, (left + x, top))
        height = Image.fromarray(np.maximum(np.asarray(height), np.asarray(layer)))

    colour.save(TEXTURES / 'floor_message.png', optimize=True)

    # Normal map, OpenGL convention (+Y up the image), from the depth: grooves
    # are below the surface, so the surface height is minus the depth.
    surface = -np.asarray(height) * 6.0
    dy, dx = np.gradient(surface)
    normal = np.dstack([-dx, dy, np.ones_like(surface)])
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    to_image(normal * 0.5 + 0.5).save(TEXTURES / 'floor_message_normal.png', optimize=True)
    print('wrote', TEXTURES / 'floor_message.png', 'and its normal map;', f'line {line_width}px of {CANVAS[0]}')


if __name__ == '__main__':
    main()
