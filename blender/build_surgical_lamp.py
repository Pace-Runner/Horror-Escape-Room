"""
Generates surgical_lamp.glb: the ceiling-hung operating lamp over the
restraint table in the Level 2 basement lab.

A 1970s-80s operating light, after both lab references: a canopy on the
ceiling, a drop tube, a jointed arm out and down, and a shallow enamelled
dome with a cluster of lenses underneath and a sterile handle in the middle
to steer it by.

What is NOT in here, because the level drives it:

  * the light itself -- a spotlight down onto the table;
  * whether the lenses glow. They are their own material, 'LampLens', so
    the level can light them when the lamp is switched on;
  * the click target -- Interaction raycasts non-recursively, so nothing
    inside a loaded .glb can be hit.

Axes: the origin is the mount point on the ceiling and everything hangs
below it. The arm reaches out along +X, so the head's centre is HEAD_X
along from the mount; the level hangs the lamp so that lands over the table.
The level's SURGICAL_LAMP constants mirror HEAD_X, LENS_Z and HANDLE_BOTTOM.

Run headless: blender --background --python blender/build_surgical_lamp.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from common import add_cylinder, add_tube, add_lathe  # noqa: E402

ENAMEL = (0.55, 0.58, 0.52)     # off-white, gone grey-green with age
STEEL = (0.5, 0.51, 0.5)
UNDERSIDE = (0.08, 0.085, 0.085)
LENS = (0.75, 0.8, 0.78)
HANDLE = (0.2, 0.21, 0.2)

HUB_Z = -0.6                    # the joint at the bottom of the drop tube
HEAD_X = 0.55
HEAD_TOP = -0.93
HEAD_RADIUS = 0.32
RIM_Z = -1.08
LENS_Z = -1.092                 # the lenses' faces, where the light leaves

# The layers under the dome, top to bottom, each several millimetres clear of
# the next. They used to share a height -- the dome's flat bottom and the
# dark plate under it were both at -1.088 -- and the two z-fought into
# shimmering streaks across the underside.
LIP_BOTTOM = RIM_Z - 0.02       # the rim stands down past everything inside it
CAVITY_TOP = RIM_Z + 0.012      # the dome is hollow underneath, up to here
UNDERSIDE_BOTTOM = -1.085       # the dark plate the lenses are set into
UNDERSIDE_DEPTH = 0.01
LENS_DEPTH = 0.008
HANDLE_BOTTOM = -1.22


def build_steel():
    bm = bmesh.new()
    # The canopy on the ceiling and the drop tube.
    add_cylinder(bm, (0, 0, -0.02), 0.1, 0.04, 'Z', 24)
    add_cylinder(bm, (0, 0, (HUB_Z - 0.04) / 2), 0.026, -HUB_Z - 0.04, 'Z', 14)
    # The joint, and the arm out and down to the head's yoke.
    add_cylinder(bm, (0, 0, HUB_Z), 0.045, 0.09, 'Z', 18)
    add_tube(bm, [
        (0.02, 0, HUB_Z),
        (0.25, 0, HUB_Z - 0.03),
        (0.45, 0, HUB_Z - 0.09),
        (HEAD_X, 0, HUB_Z - 0.2),
        (HEAD_X, 0, HEAD_TOP + 0.02),
    ], radius=0.022, sides=12, samples_per_segment=4)
    # A spring housing along the arm, as on a real counterbalanced arm.
    add_cylinder(bm, (0.2, 0, HUB_Z - 0.02), 0.032, 0.18, 'X', 14)
    return bm


def build_dome():
    bm = bmesh.new()
    add_lathe(bm, [
        (0.0, HEAD_TOP + 0.01),
        (0.05, HEAD_TOP + 0.01),
        (0.06, HEAD_TOP),
        (0.16, HEAD_TOP - 0.02),
        (0.25, HEAD_TOP - 0.06),
        (0.3, RIM_Z + 0.03),
        (HEAD_RADIUS, RIM_Z),
        (HEAD_RADIUS + 0.008, RIM_Z - 0.006),
        (HEAD_RADIUS + 0.004, LIP_BOTTOM),
        (HEAD_RADIUS - 0.012, LIP_BOTTOM),
        (HEAD_RADIUS - 0.012, CAVITY_TOP),
        (0.0, CAVITY_TOP),
    ], centre=(HEAD_X, 0, 0), segments=40)
    return bm


def build_underside():
    """The dark face under the dome the lenses are set into."""
    bm = bmesh.new()
    add_cylinder(bm, (HEAD_X, 0, UNDERSIDE_BOTTOM + UNDERSIDE_DEPTH / 2), HEAD_RADIUS - 0.015, UNDERSIDE_DEPTH, 'Z', 40)
    return bm


def build_lenses():
    """A ring of six lenses round a seventh, each a shallow disc."""
    bm = bmesh.new()
    positions = [(0.0, 0.0)] + [
        (0.17 * math.cos(2 * math.pi * i / 6), 0.17 * math.sin(2 * math.pi * i / 6)) for i in range(6)
    ]
    for dx, dy in positions:
        radius = 0.06 if (dx, dy) == (0.0, 0.0) else 0.07
        add_cylinder(bm, (HEAD_X + dx, dy, LENS_Z + LENS_DEPTH / 2), radius, LENS_DEPTH, 'Z', 24)
    return bm


def build_handle():
    bm = bmesh.new()
    # Its stem runs up through the centre lens into the plate, so its end is
    # buried rather than sitting flush on the lens face.
    add_cylinder(bm, (HEAD_X, 0, (UNDERSIDE_BOTTOM + HANDLE_BOTTOM) / 2 + 0.01), 0.018,
                 UNDERSIDE_BOTTOM - HANDLE_BOTTOM - 0.02, 'Z', 14)
    add_lathe(bm, [
        (0.0, HANDLE_BOTTOM),
        (0.026, HANDLE_BOTTOM + 0.006),
        (0.03, HANDLE_BOTTOM + 0.03),
        (0.024, HANDLE_BOTTOM + 0.07),
        (0.0, HANDLE_BOTTOM + 0.075),
    ], centre=(HEAD_X, 0, 0), segments=18)
    return bm


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def build():
    common.clear_scene()
    enamel = common.make_material('LampEnamel', ENAMEL, roughness=0.45, metallic=0.1)
    steel = common.make_material('LampSteel', STEEL, roughness=0.35, metallic=0.85)
    underside = common.make_material('LampUnderside', UNDERSIDE, roughness=0.6)
    lens = common.make_material('LampLens', LENS, roughness=0.15)
    handle = common.make_material('LampHandle', HANDLE, roughness=0.5)

    smooth(common.new_object('LampArm', build_steel(), steel))
    smooth(common.new_object('LampDome', build_dome(), enamel))
    common.new_object('LampUnderside', build_underside(), underside)
    common.new_object('LampLenses', build_lenses(), lens)
    smooth(common.new_object('LampHandle', build_handle(), handle))

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'surgical_lamp.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
