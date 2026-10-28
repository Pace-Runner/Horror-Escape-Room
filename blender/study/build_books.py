"""
The study's hardback books -- the lure Mark throws. Four covers, one model each.

    exec in the live Blender, or: blender --background --python blender/study/build_books.py

Writes blender/study/study_books.blend and src/assets/models/study/study_books.glb.

THE CONTRACT is src/world/hideAndSeekItems.js's buildStudyBook(), which these
replace: 16 x 23.5 cm, 4.5 cm thick, standing up with the origin at the foot
of the book, the spine on the -Z side in the game (+Y here). That is the
canonical frame world/itemMeshes.js hands to the hand and the floor alike, so
the held book and the thrown one are the same shape as the piles.

NODES: Book_0 .. Book_3 (oxblood, navy, green, brown cloth, the placeholder's
colours), each with a child FrontCover* whose ORIGIN IS ON THE SPINE HINGE: a
turn about the book's vertical axis opens it. A thrown book that lands swings
its cover open (main.js), so a landed book reads as a book across the room.

One GENERATED atlas for all four (Book cloth): a column per book, the cloth
wrapped back cover -> spine -> front cover, with gilt bands and a title label
on the spine, a blind-stamped border on the boards, and the corners and edges
rubbed paler with handling. The pages are plain cream.
"""

import importlib
import math
import os
import sys

import bmesh
import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hide_and_seek_kit as kit  # noqa: E402
importlib.reload(kit)

NAME = 'study_books'
SEED = 1871

HEIGHT = 0.235
WIDTH = 0.16          # across the cover, spine to fore-edge
THICK = 0.045
BOARD = 0.004
R = THICK / 2         # the spine's round
SPINE_Y = WIDTH / 2
COVERS = [(0.353, 0.122, 0.106), (0.137, 0.220, 0.310), (0.184, 0.290, 0.165), (0.290, 0.204, 0.125)]
WRAP = WIDTH + math.pi * R + WIDTH   # back cover, spine, front cover


def cloth_atlas():
    rng = np.random.default_rng(SEED)
    h, w = 512, 512
    atlas = np.zeros((h, w, 3))
    cw = w // 4
    rows = np.arange(h)[:, None] / h
    up = 1.0 - rows                                   # 0 at the foot of the book, 1 at the head
    cols = np.arange(cw)[None, :] / cw
    s = cols * WRAP                                   # where on the wrap this texel is
    on_spine = (s > WIDTH) & (s < WIDTH + math.pi * R)
    on_board = ~on_spine
    gold = np.array([0.72, 0.56, 0.24])
    for k, base in enumerate(COVERS):
        grain = 0.9 + 0.12 * kit.value_noise(rng, h, cw, 64) + 0.05 * kit.value_noise(rng, h, cw, 128)
        colour = np.array(base)[None, None, :] * grain[..., None]
        # Rubbed paler at the head, the foot and the fore-edges.
        edge = np.minimum(np.minimum(up, 1 - up) * HEIGHT, np.minimum(s, WRAP - s))
        rub = np.clip(1.0 - edge / 0.006, 0, 1)
        colour = colour * (1 - 0.35 * rub[..., None]) + np.array([0.55, 0.50, 0.42]) * 0.35 * rub[..., None]
        # A blind-stamped border on each board: a darker line 1 cm in.
        for a, b in ((0.0, WIDTH), (WIDTH + math.pi * R, WRAP)):
            inset = 0.01
            line = ((np.abs(s - (a + inset)) < 0.0012) | (np.abs(s - (b - inset)) < 0.0012)) & (up * HEIGHT > inset) & (up * HEIGHT < HEIGHT - inset)
            line |= ((np.abs(up * HEIGHT - inset) < 0.0012) | (np.abs(up * HEIGHT - (HEIGHT - inset)) < 0.0012)) & (s > a + inset) & (s < b - inset)
            colour[line] *= 0.7
        # Gilt on the spine: two bands at the head, two at the foot, and a title label.
        band = np.zeros((h, cw), bool)
        for c in (0.07, 0.10, 0.90, 0.93):
            band |= np.abs(up - c) < 0.006
        label = (up > 0.60) & (up < 0.74)
        lettering = label & (kit.value_noise(rng, h, cw, 40) > 0.55) & (np.abs(up - 0.67) < 0.035)
        gilt = on_spine & (band | (label & ~lettering & ((np.abs(up - 0.60) < 0.004) | (np.abs(up - 0.74) < 0.004))))
        colour[gilt] = gold * (0.8 + 0.3 * rng.random(gilt.sum()))[:, None]
        title = on_spine & lettering
        colour[title] = gold * 0.85
        atlas[:, k * cw:(k + 1) * cw] = colour
    return kit.painted_image('Book cloth 512', atlas)


def book_objects(k, cloth, pages):
    """Book_k (back board, spine, page block) and its FrontCover, hinged on the spine."""
    u0 = k / 4
    def uv_of(sv, z):
        return (u0 + (sv / WRAP) / 4, z / HEIGHT)

    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    # The back board: its outside (-X) is cloth on the wrap; its inside is endpaper.
    x0, x1 = -THICK / 2, -THICK / 2 + BOARD
    back = kit.box_into(bm, (x0, -WIDTH / 2, 0.0), (x1, SPINE_Y, HEIGHT), 0)
    # The page block, set in from the boards and the fore-edge.
    page_faces = kit.box_into(bm, (x1 + 0.001, -WIDTH / 2 + 0.003, 0.003), (-x1 - 0.001, SPINE_Y - 0.001, HEIGHT - 0.003), 1)
    # The rounded spine: a half tube from the back board round to the front.
    segs = 8
    ring_lo, ring_hi = [], []
    for i in range(segs + 1):
        a = math.pi - math.pi * i / segs           # from the back (-X) round to the front (+X)
        x, y = R * math.cos(a), SPINE_Y + R * math.sin(a)
        ring_lo.append(bm.verts.new((x, y, 0.0)))
        ring_hi.append(bm.verts.new((x, y, HEIGHT)))
    spine_faces = []
    for i in range(segs):
        f = bm.faces.new((ring_lo[i], ring_lo[i + 1], ring_hi[i + 1], ring_hi[i]))
        f.material_index = 0
        spine_faces.append((f, i))
    bm.normal_update()
    for f in back:
        f.normal_update()
    # UVs: the wrap for the cloth faces, a plain patch of cloth for the board edges.
    for f in back:
        for loop in f.loops:
            co = loop.vert.co
            if f.normal.x < -0.5:                  # outside of the back board
                loop[uv].uv = uv_of(SPINE_Y - co.y, co.z)
            else:
                loop[uv].uv = uv_of(WIDTH * 0.5, 0.5 * HEIGHT)
        if f.normal.x > 0.5:
            f.material_index = 1                   # the endpaper side
    for f, i in spine_faces:
        for loop in f.loops:
            co = loop.vert.co
            a = math.atan2(co.y - SPINE_Y, co.x)
            loop[uv].uv = uv_of(WIDTH + (math.pi - a) * R, co.z)
    for f in page_faces:
        for loop in f.loops:
            loop[uv].uv = (0.5, 0.5)
    bmesh.ops.recalc_face_normals(bm, faces=[f for f, _ in spine_faces])
    body = kit.mesh_object(f'Book_{k}', bm, [cloth, pages], uvs=False)
    for poly in body.data.polygons:
        poly.use_smooth = False

    # The front cover: its own node, hinged on the spine edge.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    fx0, fx1 = THICK / 2 - BOARD, THICK / 2
    front = kit.box_into(bm, (fx0, -WIDTH / 2, 0.0), (fx1, SPINE_Y, HEIGHT), 0)
    for f in front:
        f.normal_update()
        for loop in f.loops:
            co = loop.vert.co
            if f.normal.x > 0.5:
                loop[uv].uv = uv_of(WIDTH + math.pi * R + (SPINE_Y - co.y), co.z)
            else:
                loop[uv].uv = uv_of(WRAP - WIDTH * 0.5, 0.5 * HEIGHT)
        if f.normal.x < -0.5:
            f.material_index = 1
    cover = kit.mesh_object('FrontCover', bm, [cloth, pages], uvs=False)
    kit.set_origin(cover, (THICK / 2 - BOARD / 2, SPINE_Y, 0.0))
    kit.parent_keep(cover, body)
    return [body, cover]


def main():
    kit.clear_scene()
    cloth = kit.material('Book cloth', (1, 1, 1), roughness=0.85, image=cloth_atlas())
    pages = kit.material('Book pages cream', (0.80, 0.75, 0.62), roughness=0.95)
    objects = []
    for k in range(4):
        objects += book_objects(k, cloth, pages)
    kit.report(objects)
    return objects


if __name__ == '__main__':
    OBJECTS = main()
    if bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
