"""
Generates lab_door.glb: the double-acting double doors into the basement lab,
at the foot of the upstairs hallway's stairs.

After the user's reference of a laser-lab door pair: powder-coated steel
leaves with a raised perimeter rim, a small vision window of lime laser-safety
glass in a black anodised bezel, a vertical stainless pull bar near the
meeting edge, stainless hinges, and a dark steel frame round the lot.

DOUBLE-ACTING. Each leaf swings both ways, like a hospital door, so its pivot
is on the leaf's own mid-plane in the gap beside the jamb rather than on one
face, and there is no door stop in the frame. The hinge barrels sit on that
pivot line, so they look right at any angle. Handles, rims and the bezel are
on both faces.

The two leaves are exported as empties, `labDoorLeafLeft` and
`labDoorLeafRight`, placed on their pivots; everything that moves with a leaf
is parented to its empty. upstairsHallwayLevel.js turns those two nodes about
their Y axis (glTF up) and leaves the frame alone. Positive rotation on the
left leaf, and negative on the right, swings both AWAY from the front (glTF +Z).

Axes: width along X, the front facing Blender -Y (glTF +Z), standing on the
origin with the back of the frame on the wall plane, y = 0. The level's
LAB_DOOR constants mirror OPEN_HALF, OPEN_H, PIVOT_X and LEAF_Y.

Material names are the hook for textures at runtime: LabDoorPowderCoat,
LabDoorTrim and LabDoorFrame take the powder-coat set, LabDoorSteel the
brushed stainless.

Run headless: blender --background --python blender/build_lab_door.py
"""

import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

LEAF_W = 0.88
LEAF_H = 2.08
LEAF_T = 0.05
CENTER_GAP = 0.008              # between the leaves; the gaskets close it
HINGE_GAP = 0.02                # between each leaf and its jamb
FLOOR_GAP = 0.012
HEAD_GAP = 0.012
OPEN_HALF = CENTER_GAP / 2 + LEAF_W + HINGE_GAP
OPEN_H = FLOOR_GAP + LEAF_H + HEAD_GAP
PIVOT_X = CENTER_GAP / 2 + LEAF_W + HINGE_GAP / 2
JAMB_W = 0.09
FRAME_D = 0.12                  # the frame stands this far out from the wall
LEAF_Y = -FRAME_D / 2           # the leaves' mid-plane

# Measured along a leaf from its pivot toward the meeting edge.
LEAF_U0 = HINGE_GAP / 2
LEAF_U1 = LEAF_U0 + LEAF_W
RIM_W = 0.055
RIM_PROUD = 0.005

WINDOW_U = LEAF_U0 + LEAF_W / 2
WINDOW_Z = 1.56
WINDOW_W, WINDOW_H = 0.22, 0.34         # the hole through the leaf
BEZEL_W, BEZEL_H = 0.30, 0.42           # the bezel's outside
BEZEL_PROUD = 0.012

HANDLE_U = LEAF_U1 - 0.09
HANDLE_Z = 1.15
HANDLE_LEN = 0.44
HANDLE_R = 0.0125
HANDLE_STANDOFF = 0.065                 # face to the bar's centre
HANDLE_POST_DZ = 0.19

HINGE_ZS = (0.26, 1.84)
HINGE_BARREL_R = 0.016
HINGE_BARREL_H = 0.12
HINGE_STRAP_LEN = 0.085

POWDER_COAT = (0.50, 0.51, 0.51)
TRIM = (0.66, 0.67, 0.67)
FRAME = (0.20, 0.21, 0.22)
STEEL = (0.62, 0.62, 0.60)
BEZEL = (0.025, 0.025, 0.027)
RUBBER = (0.018, 0.018, 0.018)
GLASS = (0.55, 0.78, 0.10)


def leaf_box(bm, side, u0, u1, z0, z1, y0, y1):
    """A box given by its extents along the leaf (u), up it (z) and through it (y)."""
    x0, x1 = sorted((side * u0, side * u1))
    add_box(bm, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0))


def both_faces(offset, depth):
    """The y extents of a part `depth` thick sitting `offset` off each face."""
    front = -LEAF_T / 2 - offset
    back = LEAF_T / 2 + offset
    return ((front - depth, front), (back, back + depth))


def build_slab(side):
    """The leaf itself, in four pieces round the window's hole."""
    bm = bmesh.new()
    z_bottom, z_top = FLOOR_GAP, FLOOR_GAP + LEAF_H
    hu0, hu1 = WINDOW_U - WINDOW_W / 2, WINDOW_U + WINDOW_W / 2
    hz0, hz1 = WINDOW_Z - WINDOW_H / 2, WINDOW_Z + WINDOW_H / 2
    y0, y1 = -LEAF_T / 2, LEAF_T / 2
    leaf_box(bm, side, LEAF_U0, LEAF_U1, z_bottom, hz0, y0, y1)
    leaf_box(bm, side, LEAF_U0, LEAF_U1, hz1, z_top, y0, y1)
    leaf_box(bm, side, LEAF_U0, hu0, hz0, hz1, y0, y1)
    leaf_box(bm, side, hu1, LEAF_U1, hz0, hz1, y0, y1)
    return bm


def build_rim(side):
    """The raised perimeter frame on both faces."""
    bm = bmesh.new()
    z_bottom, z_top = FLOOR_GAP, FLOOR_GAP + LEAF_H
    for y0, y1 in both_faces(0.0, RIM_PROUD):
        leaf_box(bm, side, LEAF_U0, LEAF_U0 + RIM_W, z_bottom, z_top, y0, y1)
        leaf_box(bm, side, LEAF_U1 - RIM_W, LEAF_U1, z_bottom, z_top, y0, y1)
        leaf_box(bm, side, LEAF_U0 + RIM_W, LEAF_U1 - RIM_W, z_top - RIM_W, z_top, y0, y1)
        leaf_box(bm, side, LEAF_U0 + RIM_W, LEAF_U1 - RIM_W, z_bottom, z_bottom + RIM_W, y0, y1)
    return bm


def build_bezel(side):
    """The window's black frame, on both faces, and a liner round the hole between them."""
    bm = bmesh.new()
    ou0, ou1 = WINDOW_U - BEZEL_W / 2, WINDOW_U + BEZEL_W / 2
    oz0, oz1 = WINDOW_Z - BEZEL_H / 2, WINDOW_Z + BEZEL_H / 2
    iu0, iu1 = WINDOW_U - WINDOW_W / 2, WINDOW_U + WINDOW_W / 2
    iz0, iz1 = WINDOW_Z - WINDOW_H / 2, WINDOW_Z + WINDOW_H / 2
    for y0, y1 in both_faces(0.0, BEZEL_PROUD):
        leaf_box(bm, side, ou0, ou1, iz1, oz1, y0, y1)
        leaf_box(bm, side, ou0, ou1, oz0, iz0, y0, y1)
        leaf_box(bm, side, ou0, iu0, iz0, iz1, y0, y1)
        leaf_box(bm, side, iu1, ou1, iz0, iz1, y0, y1)
    liner = 0.008
    y0, y1 = -LEAF_T / 2, LEAF_T / 2
    leaf_box(bm, side, iu0, iu1, iz1 - liner, iz1, y0, y1)
    leaf_box(bm, side, iu0, iu1, iz0, iz0 + liner, y0, y1)
    leaf_box(bm, side, iu0, iu0 + liner, iz0, iz1, y0, y1)
    leaf_box(bm, side, iu1 - liner, iu1, iz0, iz1, y0, y1)
    return bm


def build_glass(side):
    bm = bmesh.new()
    leaf_box(bm, side, WINDOW_U - WINDOW_W / 2, WINDOW_U + WINDOW_W / 2,
             WINDOW_Z - WINDOW_H / 2, WINDOW_Z + WINDOW_H / 2, -0.004, 0.004)
    return bm


def build_gaskets(side):
    """The seal down the meeting edge, closing the gap to the other leaf, and the sweep along the bottom."""
    bm = bmesh.new()
    leaf_box(bm, side, LEAF_U1, LEAF_U1 + CENTER_GAP / 2 - 0.0003,
             FLOOR_GAP, FLOOR_GAP + LEAF_H, -0.012, 0.012)
    leaf_box(bm, side, LEAF_U0 + 0.01, LEAF_U1 - 0.01, 0.003, FLOOR_GAP, -0.008, 0.008)
    return bm


def build_handles(side):
    """A stainless pull bar on each face, on two posts with round roses."""
    bm = bmesh.new()
    x = side * HANDLE_U
    for face in (-1, 1):
        y_face = face * LEAF_T / 2
        y_bar = face * (LEAF_T / 2 + HANDLE_STANDOFF)
        add_cylinder(bm, (x, y_bar, HANDLE_Z), HANDLE_R, HANDLE_LEN, 'Z', 20)
        for dz in (-HANDLE_POST_DZ, HANDLE_POST_DZ):
            z = HANDLE_Z + dz
            add_cylinder(bm, (x, (y_face + y_bar) / 2, z), HANDLE_R * 0.85, HANDLE_STANDOFF, 'Y', 16)
            add_cylinder(bm, (x, y_face + face * 0.003, z), 0.021, 0.006, 'Y', 20)
        # Chamfered ends on the bar.
        for end in (-1, 1):
            z = HANDLE_Z + end * (HANDLE_LEN / 2 + 0.004)
            add_cylinder(bm, (x, y_bar, z), HANDLE_R if end > 0 else HANDLE_R * 0.6, 0.008, 'Z', 20,
                         radius2=HANDLE_R * 0.6 if end > 0 else HANDLE_R)
    return bm


def build_hinge_straps(side):
    """The hinges' leaf-side straps, on both faces, with three screw heads each."""
    bm = bmesh.new()
    for z in HINGE_ZS:
        for (y0, y1), face in zip(both_faces(0.0, 0.004), (-1, 1)):
            leaf_box(bm, side, 0.0, HINGE_STRAP_LEN, z - 0.045, z + 0.045, y0, y1)
            y_head = (y1 if face > 0 else y0) + face * 0.0012
            for u, dz in ((0.035, -0.025), (0.035, 0.025), (0.065, 0.0)):
                add_cylinder(bm, (side * u, y_head, z + dz), 0.006, 0.0024, 'Y', 10)
    return bm


def build_frame():
    """The jambs, the head, and a back flange that laps the wall round the opening."""
    bm = bmesh.new()
    top = OPEN_H + JAMB_W
    for sx in (-1, 1):
        x = sx * (OPEN_HALF + JAMB_W / 2)
        add_box(bm, (x, -FRAME_D / 2, top / 2), (JAMB_W, FRAME_D, top))
    add_box(bm, (0, -FRAME_D / 2, OPEN_H + JAMB_W / 2), (2 * OPEN_HALF, FRAME_D, JAMB_W))
    # A shallow architrave, so the frame reads as set into the wall.
    lap = 0.035
    for sx in (-1, 1):
        x = sx * (OPEN_HALF + JAMB_W + lap / 2)
        add_box(bm, (x, -0.009, (top + lap) / 2), (lap, 0.018, top + lap))
    add_box(bm, (0, -0.009, top + lap / 2), (2 * (OPEN_HALF + JAMB_W), 0.018, lap))
    return bm


def build_frame_steel():
    """The hinge barrels, on the pivot lines, and the threshold plate."""
    bm = bmesh.new()
    for sx in (-1, 1):
        for z in HINGE_ZS:
            add_cylinder(bm, (sx * PIVOT_X, LEAF_Y, z), HINGE_BARREL_R, HINGE_BARREL_H, 'Z', 16)
            for end in (-1, 1):
                add_cylinder(bm, (sx * PIVOT_X, LEAF_Y, z + end * (HINGE_BARREL_H / 2 + 0.004)),
                             HINGE_BARREL_R * 0.7, 0.008, 'Z', 16)
    add_box(bm, (0, -FRAME_D / 2, 0.002), (2 * OPEN_HALF, FRAME_D + 0.04, 0.004))
    return bm


def smooth(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def bevel(obj, width):
    modifier = obj.modifiers.new('Bevel', type='BEVEL')
    modifier.width = width
    modifier.segments = 2
    modifier.limit_method = 'ANGLE'
    return obj


def build():
    common.clear_scene()
    powder = common.make_material('LabDoorPowderCoat', POWDER_COAT, roughness=0.62, metallic=0.15)
    trim = common.make_material('LabDoorTrim', TRIM, roughness=0.58, metallic=0.15)
    frame = common.make_material('LabDoorFrame', FRAME, roughness=0.6, metallic=0.2)
    steel = common.make_material('LabDoorSteel', STEEL, roughness=0.3, metallic=0.85)
    bezel = common.make_material('LabDoorBezel', BEZEL, roughness=0.45, metallic=0.4)
    rubber = common.make_material('LabDoorRubber', RUBBER, roughness=0.95)
    glass = common.make_material('LabDoorGlass', GLASS, roughness=0.08)
    glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.55
    glass.surface_render_method = 'BLENDED'

    bevel(common.new_object('LabDoorFrameBody', build_frame(), frame), 0.004)
    smooth(common.new_object('LabDoorHingeBarrels', build_frame_steel(), steel))

    for name, side in (('labDoorLeafLeft', 1), ('labDoorLeafRight', -1)):
        pivot = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(pivot)
        # Left leaf: pivot at -X, the leaf running +X from it to the middle.
        pivot.location = (-side * PIVOT_X, LEAF_Y, 0.0)
        parts = [
            common.new_object(name + 'Slab', build_slab(side), powder),
            bevel(common.new_object(name + 'Rim', build_rim(side), trim), 0.0015),
            common.new_object(name + 'Bezel', build_bezel(side), bezel),
            common.new_object(name + 'Glass', build_glass(side), glass),
            common.new_object(name + 'Gaskets', build_gaskets(side), rubber),
            smooth(common.new_object(name + 'Handles', build_handles(side), steel)),
            common.new_object(name + 'HingeStraps', build_hinge_straps(side), steel),
        ]
        for part in parts:
            part.parent = pivot

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'lab_door.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
