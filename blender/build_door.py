"""
Generates door.glb: a beveled frame that sits flush in the wall, with a simple
door panel inside. The frame has no depth extending past the wall, and the door
panel sits within it.

Run headless: blender --background --python blender/build_door.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402

DOOR_WOOD = (0.13, 0.08, 0.05)
FRAME_WOOD = (0.09, 0.06, 0.04)
BRASS = (0.35, 0.24, 0.08)

# Door dimensions (width, thickness, height)
DOOR_W = 1.0
DOOR_T = 0.04
DOOR_H = 2.0

# Frame dimensions (sits flush in wall, no protrusion)
FRAME_T = 0.08  # total frame border thickness
FRAME_DEPTH = 0.06  # depth into the wall


def build():
    common.clear_scene()
    door_mat = common.make_material('DoorWood', DOOR_WOOD, roughness=0.7)
    frame_mat = common.make_material('DoorFrameWood', FRAME_WOOD, roughness=0.8)
    brass_mat = common.make_material('DoorBrass', BRASS, roughness=0.3, metallic=0.85)

    # Create door frame as a simple border that sits in the wall
    # Frame outer dimensions
    frame_outer_w = DOOR_W + FRAME_T * 2
    frame_outer_h = DOOR_H + FRAME_T * 2
    frame_outer_z = 1.0  # center height

    # The frame is just a hollow border - we'll make it by creating a box
    # and then positioning it so it sits flush (negative Y to go into wall)
    frame = common.make_box('doorFrame', (frame_outer_w, FRAME_DEPTH, frame_outer_h), frame_mat, bevel_ratio=0.01)
    frame.location = (0, -FRAME_DEPTH / 2, frame_outer_z)

    # Create the door panel (the slab that goes in the frame)
    door_panel = common.make_box('doorPanel', (DOOR_W, DOOR_T, DOOR_H), door_mat, bevel_ratio=0.005)
    door_panel.location = (0, -DOOR_T / 2 - 0.005, 1.0)

    # Create a knob (simple brass knob)
    knob_backplate = common.make_cylinder('knobPlate', 0.035, 0.012, brass_mat, segments=12)
    knob_backplate.rotation_euler = (1.5708, 0, 0)
    knob_backplate.location = (0.35, -0.035, 1.0)

    knob_handle = common.make_cylinder('knobHandle', 0.025, 0.04, brass_mat, segments=12)
    knob_handle.rotation_euler = (1.5708, 0, 0)
    knob_handle.location = (0.35, -0.055, 1.0)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'door.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
