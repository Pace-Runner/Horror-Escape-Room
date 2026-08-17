"""
Generates dresser.glb: a beveled body, small feet, and three raised-panel
drawer fronts (same inset+bevel technique as the bed's headboard) pulled
out at different amounts -- the storyline calls for "drawers half-open",
so all three sit slightly proud of the body, the middle one furthest.

Run headless: blender --background --python blender/build_dresser.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402

WOOD = (0.085, 0.05, 0.03)
DRAWER_WOOD = (0.07, 0.04, 0.024)
BRASS = (0.35, 0.24, 0.08)

BODY_W, BODY_D, TOTAL_H = 1.1, 0.5, 0.9
FOOT_H = 0.08
BODY_H = TOTAL_H - FOOT_H
BODY_FRONT_Y = -BODY_D / 2  # the face drawers sit in


def build():
    common.clear_scene()
    wood_mat = common.make_material('DresserWood', WOOD, roughness=0.55)
    drawer_mat = common.make_material('DrawerWood', DRAWER_WOOD, roughness=0.6)
    brass_mat = common.make_material('Brass', BRASS, roughness=0.35, metallic=0.8)

    body = common.make_box('body', (BODY_W, BODY_D, BODY_H), wood_mat, bevel_ratio=0.015)
    body.location = (0, 0, FOOT_H + BODY_H / 2)

    for fx, fy in [(-0.48, -0.19), (0.48, -0.19), (-0.48, 0.19), (0.48, 0.19)]:
        foot = common.make_cylinder('foot', 0.035, FOOT_H, wood_mat, segments=10)
        foot.location = (fx, fy, FOOT_H / 2)

    drawer_specs = [
        ('drawerTop', 0.68, 0.08),
        ('drawerMid', 0.42, 0.16),
        ('drawerBottom', 0.16, 0.08),
    ]
    for name, floor_z, pullout in drawer_specs:
        front_y = BODY_FRONT_Y - pullout
        panel = common.make_panel_frame(
            name, 0.92, 0.2, drawer_mat,
            depth=0.035, frame_w=0.045, inset_depth=0.01, bevel_width=0.005
        )
        panel.location = (0, front_y, floor_z)

        handle = common.make_cylinder(f'{name}Handle', 0.008, 0.14, brass_mat, segments=8)
        handle.rotation_euler = (0, 0, 1.5708)  # lay the cylinder on its side, along X
        handle.location = (0, front_y - 0.02, floor_z)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'dresser.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
