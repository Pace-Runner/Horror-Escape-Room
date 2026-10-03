"""Builds the Level 1 bedroom exit door as a compact horror-game prop.

The exported ``doorLeaf`` empty is deliberately named: bedroomLevel.js parents
that single leaf to its existing hinge, while the outer frame stays static.
This keeps the original key, crowbar, interaction hitbox, and exit behaviour
independent from the door's visual construction.

Run headless: blender --background --python blender/build_door.py
"""

import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402


DOOR_WIDTH_METRES = 1.0
DOOR_HEIGHT_METRES = 2.0
DOOR_DEPTH_METRES = 0.06
FRAME_DEPTH_METRES = 0.10


def make_sphere(name, radius, material):
    """Create a modestly smooth brass knob sphere without viewport operators."""
    mesh_builder = bmesh.new()
    bmesh.ops.create_uvsphere(mesh_builder, u_segments=16, v_segments=8, radius=radius)
    sphere = common.new_object(name, mesh_builder, material)
    for polygon in sphere.data.polygons:
        polygon.use_smooth = True
    return sphere


def add_leaf_box(name, size, location, material, leaf):
    """Create a beveled movable leaf detail and parent it to ``doorLeaf``."""
    detail = common.make_box(name, size, material, bevel_ratio=0.045)
    detail.location = location
    detail.parent = leaf
    return detail


def add_leaf_cylinder(name, radius, depth, location, material, leaf):
    """Create a movable round leaf detail and parent it to ``doorLeaf``."""
    detail = common.make_cylinder(name, radius, depth, material, segments=12)
    detail.location = location
    detail.parent = leaf
    return detail


def build():
    common.clear_scene()

    door_wood = common.make_material('DoorWood', (0.075, 0.040, 0.022), roughness=0.78)
    frame_wood = common.make_material('DoorFrameWood', (0.050, 0.026, 0.014), roughness=0.84)
    panel_wood = common.make_material('DoorPanelWood', (0.060, 0.030, 0.016), roughness=0.82)
    brass = common.make_material('DoorBrass', (0.31, 0.18, 0.045), roughness=0.38, metallic=0.82)
    iron = common.make_material('DoorIron', (0.055, 0.040, 0.030), roughness=0.57, metallic=0.76)
    glass = common.make_material('DoorFrostedGlass', (0.16, 0.135, 0.095), roughness=0.68)
    void = common.make_material('DoorWindowVoid', (0.008, 0.006, 0.005), roughness=1.0)
    glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.62
    glass.surface_render_method = 'DITHERED'

    # Static heavy casing: old, ordinary timber rather than an ornate doorway.
    for name, size, location in [
        ('doorFrameLeft', (0.14, FRAME_DEPTH_METRES, 2.16), (-0.57, -0.05, 1.08)),
        ('doorFrameRight', (0.14, FRAME_DEPTH_METRES, 2.16), (0.57, -0.05, 1.08)),
        ('doorFrameTop', (1.28, FRAME_DEPTH_METRES, 0.16), (0.0, -0.05, 2.08)),
        ('doorFrameHeader', (1.40, 0.12, 0.12), (0.0, -0.07, 2.20)),
    ]:
        frame = common.make_box(name, size, frame_wood, bevel_ratio=0.035)
        frame.location = location

    # The hierarchy is the complete moving leaf. The JS hinge attaches this
    # one object, so the visual upgrade cannot alter the existing pivot logic.
    leaf = bpy.data.objects.new('doorLeaf', None)
    bpy.context.collection.objects.link(leaf)
    add_leaf_box('doorPanel', (DOOR_WIDTH_METRES, DOOR_DEPTH_METRES, DOOR_HEIGHT_METRES), (0.0, -0.035, 1.0), door_wood, leaf)

    # Stiles and rails turn a flat slab into a plain constructed bedroom door.
    for name, size, location in [
        ('doorLeafStileLeft', (0.13, 0.07, 1.88), (-0.415, -0.082, 1.0)),
        ('doorLeafStileRight', (0.13, 0.07, 1.88), (0.415, -0.082, 1.0)),
        ('doorLeafRailTop', (0.74, 0.07, 0.11), (0.0, -0.082, 1.90)),
        ('doorLeafRailMid', (0.74, 0.07, 0.10), (0.0, -0.082, 0.77)),
        ('doorLeafRailBottom', (0.74, 0.07, 0.12), (0.0, -0.082, 0.12)),
        ('lowerPanelLeft', (0.055, 0.045, 0.50), (-0.30, -0.095, 0.42)),
        ('lowerPanelRight', (0.055, 0.045, 0.50), (0.30, -0.095, 0.42)),
        ('lowerPanelTop', (0.65, 0.045, 0.055), (0.0, -0.095, 0.67)),
    ]:
        add_leaf_box(name, size, location, panel_wood, leaf)

    # Barred upper window. Its dark void provides a safe future silhouette
    # surface without adding any new monster/gameplay system today.
    window_center_height = 1.42
    add_leaf_box('windowVoid', (0.56, 0.018, 0.47), (0.0, -0.102, window_center_height), void, leaf)
    add_leaf_box('doorWindowGlass', (0.50, 0.012, 0.40), (0.0, -0.116, window_center_height), glass, leaf)
    for name, size, location in [
        ('windowFrameTop', (0.64, 0.050, 0.055), (0.0, -0.130, 1.66)),
        ('windowFrameBottom', (0.64, 0.050, 0.055), (0.0, -0.130, 1.18)),
        ('windowFrameLeft', (0.055, 0.050, 0.53), (-0.32, -0.130, window_center_height)),
        ('windowFrameRight', (0.055, 0.050, 0.53), (0.32, -0.130, window_center_height)),
    ]:
        add_leaf_box(name, size, location, iron, leaf)
    for index, x_position in enumerate([-0.20, -0.10, 0.0, 0.10, 0.20]):
        add_leaf_cylinder(f'windowBar{index}', 0.015, 0.43, (x_position, -0.148, window_center_height), iron, leaf)

    # Dull brass hardware retains legacy part names as a safe fallback.
    add_leaf_box('lockBackplate', (0.105, 0.045, 0.24), (0.34, -0.122, 0.88), brass, leaf)
    knob_plate = add_leaf_cylinder('knobPlate', 0.046, 0.018, (0.34, -0.150, 1.00), brass, leaf)
    knob_plate.rotation_euler = (math.pi / 2, 0.0, 0.0)
    knob_handle = make_sphere('knobHandle', 0.052, brass)
    knob_handle.location = (0.34, -0.185, 1.00)
    knob_handle.parent = leaf
    keyhole = add_leaf_cylinder('keyhole', 0.012, 0.010, (0.34, -0.150, 0.825), void, leaf)
    keyhole.rotation_euler = (math.pi / 2, 0.0, 0.0)
    add_leaf_box('keyholeSlot', (0.012, 0.012, 0.045), (0.34, -0.156, 0.795), void, leaf)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'door.glb'))
    common.export_glb(output_path)


if __name__ == '__main__':
    build()
