"""
Generates lab_chair.glb: the swivel stool knocked over beside the restraint
table in the Level 2 basement lab.

After the stool in the first lab reference: a round padded seat in dark teal
vinyl on a gas column, a five-star base on castors, and a small curved
backrest on a bent steel bar.

It is modelled standing up. The level tips it onto its side -- it was
knocked over, and the level is where the room's story is told -- so the
dimensions it needs to rest it on the floor are mirrored there as LAB_CHAIR.

Axes: the origin is the floor under the column, with the backrest behind
the seat at Blender +Y (glTF -Z). One leg of the star points along +X, the
side the level lays it down on, so that leg's castor is one of the two
points it rests on.

Run headless: blender --background --python blender/build_lab_chair.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
from common import add_box, add_cylinder, add_tube, add_lathe  # noqa: E402

VINYL = (0.03, 0.09, 0.08)
STEEL = (0.5, 0.51, 0.5)
BLACK = (0.02, 0.02, 0.02)

LEG_REACH = 0.27                # star leg tip, at the castor's axle
CASTOR_R = 0.025
SEAT_RADIUS = 0.212
SEAT_BOTTOM = 0.45
SEAT_TOP = 0.52
BACK_RADIUS = 0.24              # the backrest's curve, round the column
BACK_SPAN = 0.5                 # radians either side of straight behind
BACK_CENTRE_Z = 0.71
BACK_HEIGHT = 0.15


def build_star():
    """The five legs and the hub -- black cast metal."""
    bm = bmesh.new()
    add_cylinder(bm, (0, 0, 0.09), 0.045, 0.06, 'Z', 18)
    for k in range(5):
        leg = Matrix.Rotation(2 * math.pi * k / 5, 4, 'Z')
        mid = (LEG_REACH + 0.03) / 2
        add_box(bm, (mid, 0, 0.075), (LEG_REACH - 0.02, 0.04, 0.03),
                transform=leg @ Matrix.Rotation(0.06, 4, 'Y'))  # sloping down to the tip
        # The castor's fork under the leg tip, and its wheel.
        add_box(bm, (LEG_REACH, 0, CASTOR_R + 0.025), (0.03, 0.03, 0.03), transform=leg)
        add_cylinder(bm, (LEG_REACH, 0, CASTOR_R), CASTOR_R, 0.022, 'Y', 14, transform=leg)
    # The column's shroud.
    add_cylinder(bm, (0, 0, 0.21), 0.032, 0.2, 'Z', 16)
    return bm


def build_steel():
    bm = bmesh.new()
    # The chrome column out of the shroud, and the plate under the seat.
    add_cylinder(bm, (0, 0, 0.37), 0.022, 0.14, 'Z', 14)
    add_cylinder(bm, (0, 0, SEAT_BOTTOM - 0.01), 0.11, 0.02, 'Z', 20)
    # The bent bar that carries the backrest.
    add_tube(bm, [
        (0, 0.05, SEAT_BOTTOM - 0.015),
        (0, 0.17, SEAT_BOTTOM - 0.02),
        (0, BACK_RADIUS - 0.01, SEAT_BOTTOM + 0.04),
        (0, BACK_RADIUS - 0.005, BACK_CENTRE_Z),
    ], radius=0.013, sides=10, samples_per_segment=4)
    return bm


def build_seat():
    bm = bmesh.new()
    add_lathe(bm, [
        (0.0, SEAT_BOTTOM),
        (SEAT_RADIUS - 0.02, SEAT_BOTTOM),
        (SEAT_RADIUS, SEAT_BOTTOM + 0.02),
        (SEAT_RADIUS + 0.002, SEAT_BOTTOM + 0.04),
        (SEAT_RADIUS - 0.012, SEAT_TOP - 0.004),
        (0.0, SEAT_TOP),
    ], segments=36)
    return bm


def build_back():
    """
    The backrest: one curved slab round an arc behind the seat. Built as a
    single closed shape rather than a row of boxes, which bevelled into a row
    of separate slats.
    """
    bm = bmesh.new()
    steps = 12
    thickness = 0.045
    bottom, top = BACK_CENTRE_Z - BACK_HEIGHT / 2, BACK_CENTRE_Z + BACK_HEIGHT / 2
    columns = []
    for i in range(steps + 1):
        a = -BACK_SPAN + 2 * BACK_SPAN * i / steps
        ring = []
        for radius, z in ((BACK_RADIUS, bottom), (BACK_RADIUS + thickness, bottom),
                          (BACK_RADIUS + thickness, top), (BACK_RADIUS, top)):
            ring.append(bm.verts.new((radius * math.sin(a), radius * math.cos(a), z)))
        columns.append(ring)
    for a, b in zip(columns, columns[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(columns[0])
    bm.faces.new(list(reversed(columns[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build():
    common.clear_scene()
    vinyl = common.make_material('ChairVinyl', VINYL, roughness=0.45)
    steel = common.make_material('ChairSteel', STEEL, roughness=0.3, metallic=0.9)
    black = common.make_material('ChairBlack', BLACK, roughness=0.6, metallic=0.3)

    common.new_object('ChairStar', build_star(), black)
    steel_obj = common.new_object('ChairSteel', build_steel(), steel)
    for p in steel_obj.data.polygons:
        p.use_smooth = True
    seat = common.new_object('ChairSeat', build_seat(), vinyl)
    for p in seat.data.polygons:
        p.use_smooth = True
    back = common.new_object('ChairBack', build_back(), vinyl)
    bevel = back.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.012
    bevel.segments = 2

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'lab_chair.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
