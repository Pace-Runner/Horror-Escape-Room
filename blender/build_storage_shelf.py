"""
Generates storage_shelf.glb: one unit of the boltless steel shelving along
the east wall of the Level 2 basement lab.

After the user's reference of a five-tier rivet shelving unit: four slotted
angle-iron uprights, and five steel shelves, each on a beam front and back
and a shorter one at each end, riveted into the uprights' slots.

The slots are real holes, not painted on: each flange is built as two thin
rails with short rungs between the slots, so a torch shone through the unit
shows the room behind it -- which is what makes this read as shelving and
not as a grey box.

Axes: the unit's length runs along X, its depth along Blender Y (glTF Z),
and it stands on the origin. The level places three: the two end units with
a short side to the wall, the middle one with its long side to it. The
level's STORAGE_SHELF constants mirror WIDTH, DEPTH and HEIGHT.

Run headless: blender --background --python blender/build_storage_shelf.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

UPRIGHT = (0.4, 0.41, 0.42)
BOARD = (0.5, 0.5, 0.49)
RIVET = (0.3, 0.3, 0.3)

WIDTH, DEPTH, HEIGHT = 1.2, 0.5, 1.83
LEVELS = (0.1, 0.52, 0.94, 1.36, 1.78)   # the top face of each shelf

FLANGE = 0.035                  # each leg of the angle iron
GAUGE = 0.0018                  # the steel's thickness
SLOT_W, SLOT_H, SLOT_PITCH = 0.011, 0.024, 0.038
SLOT_START = 0.04               # the first slot's bottom, up from the floor
BEAM_H = 0.04
BOARD_T = 0.016


def flange(bm, centre_x, centre_y, along_x):
    """
    One leg of an upright, full height, with its slots punched through: two
    rails either side of the slot column, and a rung between each pair of
    slots. `along_x` says which way the leg runs across its face.
    """
    rail = (FLANGE - SLOT_W) / 2
    offsets = (-(SLOT_W + rail) / 2, (SLOT_W + rail) / 2)
    for o in offsets:
        if along_x:
            add_box(bm, (centre_x + o, centre_y, HEIGHT / 2), (rail, GAUGE, HEIGHT))
        else:
            add_box(bm, (centre_x, centre_y + o, HEIGHT / 2), (GAUGE, rail, HEIGHT))
    # The rungs: solid steel from the floor to the first slot, between every
    # slot, and from the last slot to the top.
    bottoms = []
    s = SLOT_START
    while s + SLOT_H < HEIGHT - 0.02:
        bottoms.append(s)
        s += SLOT_PITCH
    edges = [0.0] + [e for b in bottoms for e in (b, b + SLOT_H)] + [HEIGHT]
    for lo, hi in zip(edges[0::2], edges[1::2]):
        z = (lo + hi) / 2
        if along_x:
            add_box(bm, (centre_x, centre_y, z), (SLOT_W + 0.0004, GAUGE, hi - lo))
        else:
            add_box(bm, (centre_x, centre_y, z), (GAUGE, SLOT_W + 0.0004, hi - lo))


def build_uprights():
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            corner_x, corner_y = sx * WIDTH / 2, sy * DEPTH / 2
            # The leg facing front or back, running in from the corner along X...
            flange(bm, corner_x - sx * FLANGE / 2, corner_y - sy * GAUGE / 2, along_x=True)
            # ...and the leg facing the end, running in along Y.
            flange(bm, corner_x - sx * GAUGE / 2, corner_y - sy * FLANGE / 2, along_x=False)
            # A foot plate under the angle.
            add_box(bm, (corner_x - sx * FLANGE / 2, corner_y - sy * FLANGE / 2, 0.002), (FLANGE + 0.006, FLANGE + 0.006, 0.004))
    return bm


def build_shelves():
    """Each shelf board, and the beams round it that it sits on."""
    bm = bmesh.new()
    inner_w = WIDTH - 2 * FLANGE
    inner_d = DEPTH - 2 * FLANGE
    for top in LEVELS:
        add_box(bm, (0, 0, top - BOARD_T / 2), (WIDTH - 0.006, DEPTH - 0.008, BOARD_T))
        # The front and back beams, flush with the uprights' faces, and the
        # shorter end beams: the steel edge round each shelf.
        for sy in (-1, 1):
            add_box(bm, (0, sy * (DEPTH / 2 - 0.0025), top - BEAM_H / 2), (inner_w, 0.005, BEAM_H))
        for sx in (-1, 1):
            add_box(bm, (sx * (WIDTH / 2 - 0.0025), 0, top - BEAM_H / 2 + 0.005), (0.005, inner_d, BEAM_H - 0.01))
    return bm


def build_rivets():
    """The rivet heads where each beam's end locks into an upright's slots."""
    bm = bmesh.new()
    for top in LEVELS:
        for sx in (-1, 1):
            for sy in (-1, 1):
                x = sx * (WIDTH / 2 - FLANGE / 2)
                for dz in (-0.012, -0.03):
                    add_cylinder(bm, (x, sy * (DEPTH / 2 + 0.0012), top + dz), 0.004, 0.003, 'Y', 8)
    return bm


def build():
    common.clear_scene()
    # Barely metallic, for all that they are steel: the lab has no reflections
    # for a metal to show, so a properly metallic shelf renders near-black.
    upright = common.make_material('ShelfUpright', UPRIGHT, roughness=0.55, metallic=0.3)
    board = common.make_material('ShelfBoard', BOARD, roughness=0.6, metallic=0.25)
    rivet = common.make_material('ShelfRivet', RIVET, roughness=0.4, metallic=0.9)

    common.new_object('ShelfUprights', build_uprights(), upright)
    common.new_object('ShelfBoards', build_shelves(), board)
    rivets = common.new_object('ShelfRivets', build_rivets(), rivet)
    for p in rivets.data.polygons:
        p.use_smooth = True

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'storage_shelf.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
