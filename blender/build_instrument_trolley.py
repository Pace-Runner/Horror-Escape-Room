"""
Generates instrument_trolley.glb: the two-tier steel instrument trolley
beside the restraint table in the Level 2 basement lab.

After the second lab reference: a tubular frame on four castors, a lipped
tray on top and another underneath, and a push handle at one end. Laid out
on the top tray are the instruments -- scalpels, forceps, scissors, a
retractor, a syringe and a bloodied gauze pad -- and on the lower one a
steel bowl and a few brown medicine bottles. One scalpel has been knocked
off and lies on the floor by a castor.

The trolley can be pushed, and pushed far enough it tips over and throws
everything off it -- so what lies on it is NOT merged into it. Each loose
thing is its own object named `Loose_*`, with its origin at its own centre
so it spins about itself as it flies; the level finds them by that prefix.
A loose thing made of two materials (the syringe and its needle, the gauze
and its stain) is one `Loose_*` object with the second part parented to it.
The scalpel already on the floor is `Floor_Scalpel`: the level leaves it
where it lies rather than carrying it along with the trolley. The frame,
castors and the stain dried onto the top tray are merged per material, as
before.

Axes: the trolley's length runs along X with the push handle at -X. The
origin is the floor under its centre. The level's INSTRUMENT_TROLLEY
constants mirror LENGTH, DEPTH and TOP_Z.

Run headless: blender --background --python blender/build_instrument_trolley.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from common import add_box, add_cylinder, add_tube, add_lathe, add_ring, add_blob  # noqa: E402

STEEL = (0.52, 0.53, 0.53)
TOOL = (0.78, 0.79, 0.8)
RUBBER = (0.02, 0.02, 0.02)
GAUZE = (0.72, 0.7, 0.62)
STAIN = (0.004, 0.0008, 0.0006)  # dried blood, almost black: a red edge only in direct light
AMBER = (0.22, 0.09, 0.02)
PLASTIC = (0.7, 0.72, 0.68)

LENGTH, DEPTH = 0.7, 0.45
TOP_Z = 0.85
SHELF_Z = 0.32
LEG_X, LEG_Y = LENGTH / 2 - 0.025, DEPTH / 2 - 0.025
CASTOR_R = 0.035
TRAY_Z = TOP_Z + 0.006          # the top tray's upper surface, where the tools lie


def at(x, y, z, turn=0.0):
    """A frame on a tray: a point to lay a tool at, turned about Z."""
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(turn, 4, 'Z')


def tray(bm, z):
    add_box(bm, (0, 0, z), (LENGTH, DEPTH, 0.012))
    for side in (-1, 1):
        add_box(bm, (0, side * (DEPTH / 2 - 0.004), z + 0.016), (LENGTH, 0.008, 0.032))
        add_box(bm, (side * (LENGTH / 2 - 0.004), 0, z + 0.016), (0.008, DEPTH, 0.032))


def build_frame():
    """The flat steel: trays and castor forks. Flat-shaded, unlike the round
    parts below -- smoothing a box shades it like a pillow."""
    bm = bmesh.new()
    tray(bm, TOP_Z)
    tray(bm, SHELF_Z)
    for sx in (-1, 1):
        for sy in (-1, 1):
            # The castor's swivel plate and fork.
            add_box(bm, (sx * LEG_X, sy * LEG_Y, CASTOR_R * 2 + 0.012), (0.04, 0.04, 0.008))
            for fy in (-1, 1):
                add_box(bm, (sx * LEG_X, sy * LEG_Y + fy * 0.014, CASTOR_R + 0.012), (0.012, 0.004, 0.05))
    return bm


def build_round_steel():
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_cylinder(bm, (sx * LEG_X, sy * LEG_Y, (TOP_Z + CASTOR_R * 2 + 0.02) / 2),
                         0.012, TOP_Z - CASTOR_R * 2 - 0.02, 'Z', 12)
    # The push handle at -X, a hoop standing up off the top tray's corners.
    add_tube(bm, [
        (-LEG_X, -LEG_Y, TOP_Z),
        (-LEG_X - 0.06, -LEG_Y, TOP_Z + 0.12),
        (-LEG_X - 0.07, 0, TOP_Z + 0.14),
        (-LEG_X - 0.06, LEG_Y, TOP_Z + 0.12),
        (-LEG_X, LEG_Y, TOP_Z),
    ], radius=0.011, sides=10, samples_per_segment=4)
    return bm


def build_rubber():
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_cylinder(bm, (sx * LEG_X, sy * LEG_Y, CASTOR_R), CASTOR_R, 0.022, 'Y', 16)
    return bm


def scalpel(bm, frame):
    add_box(bm, (0, 0, 0.003), (0.11, 0.011, 0.005), transform=frame)
    add_box(bm, (0.07, 0, 0.002), (0.035, 0.008, 0.002), transform=frame)


def forceps(bm, frame):
    for side in (-1, 1):
        add_box(bm, (0, side * 0.007, 0.003), (0.13, 0.005, 0.004),
                transform=frame @ Matrix.Rotation(side * 0.05, 4, 'Z'))


def scissors(bm, frame):
    for side in (-1, 1):
        blade = frame @ Matrix.Rotation(side * 0.12, 4, 'Z')
        add_box(bm, (0.05, 0, 0.003 + (side + 1) * 0.002), (0.09, 0.007, 0.003), transform=blade)
        add_ring(bm, (-0.025, side * 0.022, 0.004), 0.013, 0.003, 'Z', 14, 6, transform=frame)


def retractor(bm, frame):
    add_box(bm, (0, 0, 0.004), (0.15, 0.012, 0.006), transform=frame)
    add_box(bm, (0.074, 0, 0.016), (0.008, 0.03, 0.03), transform=frame)
    add_box(bm, (-0.074, 0, 0.016), (0.008, 0.03, 0.03), transform=frame)


def loose(name, bm, material, parent=None, smooth_shading=False):
    """
    One loose thing as its own object, re-centred so its origin is the middle
    of its own bounding box: built in trolley space like everything else,
    then moved so it can spin about itself once the level throws it.
    """
    lo = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts), min(v.co.z for v in bm.verts)))
    hi = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts), max(v.co.z for v in bm.verts)))
    centre = (lo + hi) / 2
    bmesh.ops.translate(bm, verts=bm.verts, vec=-centre)
    obj = common.new_object(name, bm, material)
    if smooth_shading:
        smooth(obj)
    if parent is None:
        obj.location = centre
    else:
        # Parented without an inverse matrix, so its location is simply its
        # offset from the parent's origin.
        obj.parent = parent
        obj.location = centre - parent.location
    return obj


def one(build_part):
    """A fresh bmesh with one part built into it."""
    bm = bmesh.new()
    build_part(bm)
    return bm


def build_loose(materials):
    """Everything that leaves the trolley when it goes over."""
    tool, plastic, gauze, stain, steel, amber = materials
    z = TRAY_Z

    loose('Loose_Scalpel_1', one(lambda bm: scalpel(bm, at(0.18, 0.12, z, 0.1))), tool)
    loose('Loose_Scalpel_2', one(lambda bm: scalpel(bm, at(0.2, 0.07, z, -0.05))), tool)
    loose('Loose_Forceps', one(lambda bm: forceps(bm, at(0.02, 0.13, z, 0.3))), tool)
    loose('Loose_Scissors', one(lambda bm: scissors(bm, at(-0.15, 0.1, z, -0.4))), tool)
    loose('Loose_Retractor', one(lambda bm: retractor(bm, at(0.05, -0.12, z, 0.15))), tool)

    def bone_saw(bm):
        # A bone saw, because a lab this far gone does not stop at scalpels: a
        # steel D-frame over a straight blade.
        saw = at(-0.12, -0.11, z, -0.2)
        add_box(bm, (0, 0, 0.003), (0.2, 0.025, 0.003), transform=saw)
        frame_points = [(-0.1, 0.012, 0.006), (-0.1, 0.05, 0.008), (0.1, 0.05, 0.008), (0.1, 0.012, 0.006)]
        add_tube(bm, [saw @ Vector(p) for p in frame_points], radius=0.004, sides=6, samples_per_segment=2)
    loose('Loose_BoneSaw', one(bone_saw), tool)

    def syringe(bm):
        # Barrel, plunger rod and thumb plate.
        add_cylinder(bm, (0.19, -0.02, z + 0.012), 0.011, 0.09, 'X', 14)
        add_cylinder(bm, (0.125, -0.02, z + 0.012), 0.004, 0.05, 'X', 8)
        add_cylinder(bm, (0.1, -0.02, z + 0.012), 0.012, 0.004, 'X', 14)
    barrel = loose('Loose_Syringe', one(syringe), plastic, smooth_shading=True)
    loose('SyringeNeedle', one(lambda bm: add_cylinder(bm, (0.26, -0.02, z + 0.012), 0.0012, 0.05, 'X', 6)),
          tool, parent=barrel)

    def gauze_pads(bm):
        add_box(bm, (-0.2, -0.02, z + 0.006), (0.1, 0.09, 0.012), transform=at(0, 0, 0, 0.2))
        add_box(bm, (-0.23, -0.05, z + 0.004), (0.08, 0.07, 0.008), transform=at(0, 0, 0, -0.35))
    pad = loose('Loose_Gauze', one(gauze_pads), gauze)
    loose('GauzeStain', one(lambda bm: add_blob(bm, (-0.2, -0.02, z + 0.0125), 0.035, seed=4, wobble=0.75,
                                                points=28, transform=at(0, 0, 0, 0.2))),
          stain, parent=pad)

    # The lower shelf: the steel bowl and the brown bottles.
    loose('Loose_Bowl', one(lambda bm: add_lathe(bm, [
        (0.0, 0.0), (0.06, 0.0), (0.11, 0.03), (0.13, 0.07), (0.135, 0.075),
        (0.125, 0.072), (0.105, 0.035), (0.055, 0.008), (0.0, 0.008),
    ], centre=(0.12, 0.0, SHELF_Z + 0.006), segments=32)), steel, smooth_shading=True)
    for i, (x, y) in enumerate(((-0.2, 0.1), (-0.13, 0.13), (-0.16, 0.04))):
        h = 0.11 if i != 1 else 0.08

        def bottle(bm, x=x, y=y, h=h):
            add_cylinder(bm, (x, y, SHELF_Z + 0.006 + h / 2), 0.026, h, 'Z', 16)
            add_cylinder(bm, (x, y, SHELF_Z + 0.006 + h + 0.012), 0.012, 0.024, 'Z', 10)
        loose(f'Loose_Bottle_{i + 1}', one(bottle), amber, smooth_shading=True)

    # The one that was knocked off already: on the floor, beside the -Y castor
    # at +X. It stays where it is when the trolley moves.
    loose('Floor_Scalpel', one(lambda bm: scalpel(bm, at(LEG_X + 0.12, -LEG_Y - 0.1, 0.0, 0.7))), tool)


def build_stain():
    """The stain dried onto the top tray itself, which goes wherever the tray goes."""
    bm = bmesh.new()
    add_blob(bm, (0.05, 0.05, TRAY_Z + 0.0005), 0.05, seed=12, wobble=0.75, points=28, stretch=(1.4, 0.7))
    return bm


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def build():
    common.clear_scene()
    steel = common.make_material('TrolleySteel', STEEL, roughness=0.35, metallic=0.9)
    tool = common.make_material('TrolleyTool', TOOL, roughness=0.2, metallic=1.0)
    rubber = common.make_material('TrolleyRubber', RUBBER, roughness=0.8)
    gauze = common.make_material('TrolleyGauze', GAUZE, roughness=0.95)
    stain = common.make_material('TrolleyStain', STAIN, roughness=0.35)
    amber = common.make_material('TrolleyAmber', AMBER, roughness=0.15)
    plastic = common.make_material('TrolleyPlastic', PLASTIC, roughness=0.4)

    common.new_object('TrolleyFrame', build_frame(), steel)
    smooth(common.new_object('TrolleyRoundSteel', build_round_steel(), steel))
    smooth(common.new_object('TrolleyCastors', build_rubber(), rubber))
    common.new_object('TrolleyStain', build_stain(), stain)
    build_loose((tool, plastic, gauze, stain, steel, amber))

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'instrument_trolley.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
