"""
The tin of spare fuses by the desk -- where the second blackout sends Mark.

    exec in the live Blender, or: blender --background --python blender/study/build_fuse_tin.py

Writes blender/study/study_fuse_tin.blend and src/assets/models/study/study_fuse_tin.glb.

Scripted, not from a library: Poly Haven has no fuse tin, and Kiran asked for
one built like the rest. THE CONTRACT is the placeholder in
src/levels/studyBlackout.js: a 22 x 15 cm tin, 7 cm deep, on the boards
against the desk's right-hand end, its lid off and lying beside it. The spare
-- Level 2's fuse.glb -- lies INSIDE it now, not across the top.

One mesh, Fuse_Tin: an open tin with rounded corners, a rolled rim and a few
dents, and its lid on the floor to one side, a printed paper label on top --
FUSES and 5 AMP in block capitals, the way an electrician's tin was sold. Both
textures are GENERATED: the enamel (dark green, chipped to the steel at the
corners and the rim, rusting where it chipped) is "painted steel", which
harmoniseAsset tunes; the label is cream paper, foxed and stained.
"""

import importlib
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hide_and_seek_kit as kit  # noqa: E402
importlib.reload(kit)

NAME = 'study_fuse_tin'
SEED = 1912

W, D, H = 0.22, 0.15, 0.07
WALL = 0.0015
CORNER = 0.012
LID_H = 0.012
LID_GROW = 0.003          # the lid is a little bigger than the tin it closes
LID_AT = (0.2, -0.05)     # beside the tin, as the placeholder had it
LID_TURN = 0.5

GLYPHS = {
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    ' ': ['00000'] * 7,
}


def print_text(canvas, text, cx, cy, cell, ink):
    """Block capitals from GLYPHS, centred on (cx, cy), each glyph pixel `cell` texels."""
    width = len(text) * 6 * cell - cell
    x0, y0 = int(cx - width / 2), int(cy - 3.5 * cell)
    for k, ch in enumerate(text):
        for row, bits in enumerate(GLYPHS[ch]):
            for col, bit in enumerate(bits):
                if bit == '1':
                    x, y = x0 + (k * 6 + col) * cell, y0 + row * cell
                    canvas[y:y + cell, x:x + cell] = ink


def label_image():
    rng = np.random.default_rng(SEED)
    h, w = 128, 256
    paper = np.array([0.80, 0.74, 0.58])
    canvas = np.ones((h, w, 3)) * paper
    canvas *= (0.88 + 0.14 * kit.fbm(rng, h, w, octaves=3, base=3))[..., None]
    red = np.array([0.42, 0.08, 0.06])
    for inset, thick in ((6, 3), (12, 1)):
        canvas[inset:inset + thick, inset:w - inset] = red
        canvas[h - inset - thick:h - inset, inset:w - inset] = red
        canvas[inset:h - inset, inset:inset + thick] = red
        canvas[inset:h - inset, w - inset - thick:w - inset] = red
    print_text(canvas, 'FUSES', w / 2, h * 0.42, 5, np.array([0.12, 0.08, 0.06]))
    print_text(canvas, '5 AMP', w / 2, h * 0.74, 2, red)
    # Foxing and a tea-coloured stain from a damp shelf.
    fox = (kit.value_noise(rng, h, w, 40) > 0.83) * 0.3
    canvas *= (1 - fox)[..., None]
    v, u = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    stain = np.clip(1 - np.hypot((u - 0.78) / 0.25, (v - 0.3) / 0.45), 0, 1)
    canvas = canvas * (1 - 0.25 * stain[..., None]) + np.array([0.55, 0.42, 0.25]) * 0.25 * stain[..., None]
    return kit.painted_image('Fuse tin label 256x128', canvas)


def enamel_image():
    rng = np.random.default_rng(SEED + 1)
    s = 256
    green = np.array([0.10, 0.16, 0.11])
    steel = np.array([0.42, 0.42, 0.40])
    rust = np.array([0.36, 0.16, 0.06])
    chips = kit.fbm(rng, s, s, octaves=4, base=6)
    bare = (chips > 0.75).astype(float)
    rusty = np.clip((chips - 0.70) * 10, 0, 1) * (1 - bare)
    colour = green[None, None, :] * (0.85 + 0.25 * kit.fbm(rng, s, s, octaves=3, base=4))[..., None]
    colour = colour * (1 - rusty[..., None]) + rust * rusty[..., None]
    colour = colour * (1 - bare[..., None]) + steel * bare[..., None]
    return kit.painted_image('Fuse tin enamel 256', colour)


def rounded_rect(hw, hd, r, segments=4):
    """The outline of a rounded rectangle, counter-clockwise from the right side."""
    points = []
    for cx, cy, a0 in ((hw - r, hd - r, 0), (-hw + r, hd - r, 90), (-hw + r, -hd + r, 180), (hw - r, -hd + r, 270)):
        for k in range(segments + 1):
            a = math.radians(a0 + 90 * k / segments)
            points.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return points


def open_box(bm, hw, hd, height, r, wall, mat, floor=True):
    """
    A tray: outer wall, rim, inner wall and floor, every surface with some
    thickness. Without `floor` it is only a band -- the rolled rim, which must
    not cap the tin's opening.
    """
    outer = rounded_rect(hw, hd, r)
    inner = rounded_rect(hw - wall, hd - wall, max(0.002, r - wall))
    n = len(outer)
    ob = [bm.verts.new((x, y, 0.0)) for x, y in outer]
    ot = [bm.verts.new((x, y, height)) for x, y in outer]
    it = [bm.verts.new((x, y, height)) for x, y in inner]
    ib = [bm.verts.new((x, y, wall)) for x, y in inner]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((ob[i], ob[j], ot[j], ot[i])))     # outside
        faces.append(bm.faces.new((ot[i], ot[j], it[j], it[i])))     # rim
        faces.append(bm.faces.new((it[i], it[j], ib[j], ib[i])))     # inside
    if floor:
        faces.append(bm.faces.new(list(reversed(ob))))               # underneath
        faces.append(bm.faces.new(ib))                               # the floor inside
    else:
        for i in range(n):
            j = (i + 1) % n
            faces.append(bm.faces.new((ib[i], ib[j], ob[j], ob[i]))) # the band's lower edge
    for f in faces:
        f.material_index = mat
    return ob + ot + it + ib


def main():
    kit.clear_scene()
    rng = np.random.default_rng(SEED)
    enamel = kit.material('Fuse tin painted steel', (1, 1, 1), roughness=0.55, metallic=0.3, image=enamel_image())
    label = kit.material('Fuse tin label paper', (1, 1, 1), roughness=0.9, image=label_image())
    bm = bmesh.new()
    # The tin, and a rolled rim: a slightly fatter band round its top.
    tin_verts = open_box(bm, W / 2, D / 2, H, CORNER, WALL, 0)
    rim = open_box(bm, W / 2 + 0.0015, D / 2 + 0.0015, 0.004, CORNER + 0.0015, 0.0015 + WALL, 0, floor=False)
    bmesh.ops.translate(bm, vec=(0, 0, H - 0.004), verts=rim)
    # A few dents: the outside walls pushed in here and there.
    for v in tin_verts:
        if 0.01 < v.co.z < H - 0.01 and (abs(v.co.x) > W / 2 - 0.0005 or abs(v.co.y) > D / 2 - 0.0005):
            v.co.x *= 1 - 0.02 * max(0.0, math.sin(v.co.z * 90 + v.co.y * 40))
            v.co.y *= 1 - 0.03 * max(0.0, math.sin(v.co.x * 70 + 1.3))
    # The lid, upside up on the boards beside it, its label on top.
    lid = open_box(bm, W / 2 + LID_GROW, D / 2 + LID_GROW, LID_H, CORNER + LID_GROW, WALL, 0)
    # Lid is a tray: turned over, its open side is down and its top is the label face.
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, LID_H)) @ Matrix.Rotation(math.pi, 4, 'X'), verts=lid)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((LID_AT[0], LID_AT[1], 0)) @ Matrix.Rotation(LID_TURN, 4, 'Z'),
                        verts=lid)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    kit.box_uvs(bm, density=4.0)
    # The label is printed on the lid's whole top, as a tin's was: no paper
    # layer standing a millimetre proud of it to z-fight (5 mm rule, CLAUDE.md).
    uv = bm.loops.layers.uv.verify()
    lw, ld = W + 2 * LID_GROW, D + 2 * LID_GROW
    rot = Matrix.Rotation(-LID_TURN, 4, 'Z') @ Matrix.Translation((-LID_AT[0], -LID_AT[1], 0))
    lid_set = set(lid)
    for f in bm.faces:
        if f.normal.z < 0.9 or f.calc_center_median().z < LID_H - 1e-4 or not all(v in lid_set for v in f.verts):
            continue
        f.material_index = 1
        for loop in f.loops:
            p = rot @ loop.vert.co
            loop[uv].uv = ((p.x + lw / 2) / lw, (p.y + ld / 2) / ld)
    tin = kit.mesh_object('Fuse_Tin', bm, [enamel, label], uvs=False, smooth=False)
    kit.report([tin])
    print('  size', tuple(round(v, 3) for v in tin.dimensions))
    return [tin]


if __name__ == '__main__':
    OBJECTS = main()
    if bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
