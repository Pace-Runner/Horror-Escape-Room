"""
Generates door.glb: a beveled frame around a two-panel raised door (the
classic stile-and-rail look, via the same inset+bevel panel technique as
the bed headboard and dresser drawers) plus a turned knob, in place of a
single flat slab.

Run headless: blender --background --python blender/build_door.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402

DOOR_WOOD = (0.09, 0.05, 0.03)
FRAME_WOOD = (0.06, 0.035, 0.022)
BRASS = (0.35, 0.24, 0.08)

SLAB_W, SLAB_H, SLAB_T = 1.0, 2.0, 0.06
FRAME_FRONT_Y = -SLAB_T / 2  # the face the panels/knob sit proud of


def build():
    common.clear_scene()
    door_mat = common.make_material('DoorWood', DOOR_WOOD, roughness=0.7)
    frame_mat = common.make_material('DoorFrameWood', FRAME_WOOD, roughness=0.8)
    brass_mat = common.make_material('DoorBrass', BRASS, roughness=0.3, metallic=0.85)

    frame = common.make_box('frame', (1.15, 0.1, 2.15), frame_mat, bevel_ratio=0.02)
    frame.location = (0, 0, 1.075)

    slab = common.make_box('slab', (SLAB_W, SLAB_T, SLAB_H), door_mat, bevel_ratio=0.01)
    slab.location = (0, 0, 1.0)

    # classic two-panel door: a shorter lower panel and a taller upper one
    # with a real gap (mid-rail) between them, both raised proud of the
    # slab face -- deeper inset/bevel than the bed/dresser panels since a
    # door is seen close-up and dead-on, where a subtle relief reads as
    # nothing at all.
    panel_specs = [
        ('panelLower', 0.62, 0.68, 0.49),
        ('panelUpper', 0.62, 0.92, 1.39),
    ]
    panel_mat = common.make_material('DoorPanelWood', (0.13, 0.075, 0.045), roughness=0.65)
    for name, w, h, cz in panel_specs:
        panel = common.make_panel_frame(
            name, w, h, panel_mat,
            depth=-0.045, frame_w=0.075, inset_depth=0.03, bevel_width=0.014
        )
        panel.location = (0, FRAME_FRONT_Y, cz)

    # knob: a turned backplate + a small round handle
    backplate = common.make_cylinder('knobPlate', 0.045, 0.015, brass_mat, segments=14)
    backplate.rotation_euler = (1.5708, 0, 0)
    backplate.location = (0.38, FRAME_FRONT_Y - 0.007, 1.0)

    knob = common.make_cylinder('knob', 0.03, 0.05, brass_mat, segments=14)
    knob.rotation_euler = (1.5708, 0, 0)
    knob.location = (0.38, FRAME_FRONT_Y - 0.04, 1.0)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'door.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
