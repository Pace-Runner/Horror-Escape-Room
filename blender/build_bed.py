"""
Generates bed.glb: the bed's rigid wood-frame parts (turned corner posts,
raised-panel headboard/footboard, side rails, base) as one procedurally
built Blender mesh set, exported for GLTFLoader in the game.

Run headless, no GUI needed:
    blender --background --python blender/build_bed.py

Soft goods (mattress, blanket, pillow) and anything the game code needs to
toggle at runtime (the chain + handcuff) stay as procedural Three.js meshes
in bedroomLevel.js -- this script only covers the parts that actually read
as "blocky": the rigid wood frame.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402
import math  # noqa: E402

WOOD_COLOR = (0.085, 0.05, 0.03)


def build():
    common.clear_scene()
    wood_mat = common.make_material('BedWood', WOOD_COLOR, roughness=0.55)

    # Matches the layout in bedroomLevel.js's bedGroup local space (X
    # across the bed, Z along its length, Y up). Blender's glTF exporter
    # converts Blender's Z-up axes to glTF/Three.js's Y-up by mapping
    # Blender Y -> Three.js Z with a sign flip, so every Y below is the
    # NEGATION of the intended Three.js Z (confirmed empirically: without
    # this, headboard/footboard swap ends up on the wrong wall).
    head_post_l = common.make_turned_post('headPostL', 1.1, wood_mat)
    head_post_l.location = (-0.6, 0.95, 0.55)
    head_post_r = common.make_turned_post('headPostR', 1.1, wood_mat)
    head_post_r.location = (0.6, 0.95, 0.55)

    foot_post_l = common.make_turned_post('footPostL', 0.55, wood_mat, foot_r=0.045, shaft_r=0.02, cap_r=0.036)
    foot_post_l.location = (-0.6, -0.95, 0.275)
    foot_post_r = common.make_turned_post('footPostR', 0.55, wood_mat, foot_r=0.045, shaft_r=0.02, cap_r=0.036)
    foot_post_r.location = (0.6, -0.95, 0.275)

    # Headboard is taller and its top extended into a flat shelf lip (an
    # extra box on top) rather than just a raised panel -- gives it real
    # height above the mattress/pillows and somewhere for small objects to
    # actually sit, instead of just a panel flush with the posts.
    # make_panel_frame already builds width along local X and height along
    # local Z (Blender's own vertical axis) with thickness as the local Y
    # extrude -- exactly the orientation a vertical panel needs with NO
    # object rotation. An earlier version of this script rotated it 90
    # degrees anyway, which actually swapped the height and thickness axes
    # (confirmed via the exported mesh's bounding box: a supposedly 1.15m
    # tall panel measured only 0.04m tall and 1.15m *deep* instead) --
    # every previous headboard/footboard export has been a near-flat slab,
    # not a standing panel. No rotation needed here at all.
    headboard = common.make_panel_frame('headboard', 1.5, 1.15, wood_mat, depth=0.06, frame_w=0.09, inset_depth=0.02)
    headboard.location = (0.0, 0.97, 1.07)

    shelf = common.make_box('headboardShelf', (1.42, 0.14, 0.03), wood_mat, bevel_ratio=0.08)
    shelf.location = (0.0, 0.9, 1.66)

    footboard = common.make_panel_frame('footboard', 1.5, 0.32, wood_mat, depth=0.05, frame_w=0.055, inset_depth=0.014)
    footboard.location = (0.0, -0.95, 0.4)

    rail_l = common.make_box('railL', (0.05, 1.75, 0.07), wood_mat)
    rail_l.location = (-0.6, 0.0, 0.62)
    rail_r = common.make_box('railR', (0.05, 1.75, 0.07), wood_mat)
    rail_r.location = (0.6, 0.0, 0.62)

    base = common.make_box('bedBase', (1.5, 2.0, 0.35), wood_mat)
    base.location = (0.0, 0.0, 0.35)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'bed.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
