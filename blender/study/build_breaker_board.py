"""
The study's breaker -- an old slate switchboard on the loft's back wall, the way
out of each blackout.

    exec in the live Blender, or: blender --background --python blender/study/build_breaker_board.py

Writes blender/study/study_breaker_board.blend and src/assets/models/study/study_breaker_board.glb.

NOT LEVEL 2's breaker_panel.glb. That is a modern consumer unit, right for a
basement lab; the study is older than the lab, and what was put into a room
like this when it was first wired is a slate panel on a wooden board, a brass
knife switch and a porcelain fuse carrier.

THE CONTRACT (src/levels/studyBlackout.js, where the placeholder was): a
0.5 x 0.66 m board on the wall, its centre 1.45 m above the loft floor.
Unlike the furniture this one FACES -Y in Blender (+Z in the game): it hangs
on the back wall, looking into the room. The origin is the middle of the
board's back, on the wall plane.

NODES the game reaches by name:
  Breaker_Board  the board, the slate, the jaws, the carrier, the conduit
  LeverPivot     the switch's two blades and their handle, its ORIGIN ON THE
                 HINGE at the foot of the blades. At rest (0) the blades are
                 up in the jaws: ON. A positive turn about X drops them out
                 and down toward the room: OFF.
  FuseSeat       an empty where the fuse lies between its clips, along X.
                 The game seats a clone of Level 2's fuse.glb there.
"""

import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hide_and_seek_kit as kit  # noqa: E402
importlib.reload(kit)

NAME = 'study_breaker_board'

BOARD_W, BOARD_H, BOARD_T = 0.5, 0.66, 0.025
SLATE_W, SLATE_H, SLATE_T = 0.42, 0.56, 0.012
FACE = -(BOARD_T + SLATE_T)          # the slate's face, out from the wall (-Y)
HINGE_Z = -0.05
JAW_Z = 0.17
POLES = (-0.06, 0.06)
FUSE_Z = -0.17
FUSE_LEN = 0.10                       # Level 2's fuse.glb


def cylinder_into(bm, radius, depth, matrix, segments=10, caps=True):
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=segments, radius1=radius, radius2=radius, depth=depth, matrix=matrix)


def main():
    kit.clear_scene()
    walnut = kit.material('Breaker walnut', (0.20, 0.11, 0.06), roughness=0.75)
    slate = kit.material('Breaker slate', (0.055, 0.06, 0.068), roughness=0.6)
    porcelain = kit.material('Breaker porcelain', (0.86, 0.84, 0.78), roughness=0.3)
    brass = kit.material('Breaker brass', (0.62, 0.47, 0.22), roughness=0.4, metallic=0.85)
    ebonite = kit.material('Breaker ebonite', (0.02, 0.018, 0.016), roughness=0.35)
    mats = [walnut, slate, porcelain, brass, ebonite]
    W, S, P, B, E = range(5)

    bm = bmesh.new()
    kit.box_into(bm, (-BOARD_W / 2, -BOARD_T, -BOARD_H / 2), (BOARD_W / 2, 0.0, BOARD_H / 2), W)
    kit.box_into(bm, (-SLATE_W / 2, FACE, -SLATE_H / 2), (SLATE_W / 2, -BOARD_T, SLATE_H / 2), S)
    # Brass screws at the slate's corners, domed.
    for sx in (-1, 1):
        for sz in (-1, 1):
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=4, radius=0.009,
                                      matrix=Matrix.Translation((sx * (SLATE_W / 2 - 0.02), FACE, sz * (SLATE_H / 2 - 0.02))))
    # The switch: a brass jaw at the top of each pole, a hinge block at the foot.
    for x in POLES:
        kit.box_into(bm, (x - 0.014, FACE - 0.012, JAW_Z - 0.02), (x - 0.006, FACE, JAW_Z + 0.02), B)
        kit.box_into(bm, (x + 0.006, FACE - 0.012, JAW_Z - 0.02), (x + 0.014, FACE, JAW_Z + 0.02), B)
        kit.box_into(bm, (x - 0.018, FACE - 0.008, HINGE_Z - 0.02), (x + 0.018, FACE, HINGE_Z + 0.02), B)
    # The fuse carrier: a porcelain block with two brass clips the length of the fuse apart.
    kit.box_into(bm, (-0.085, FACE - 0.02, FUSE_Z - 0.035), (0.085, FACE, FUSE_Z + 0.035), P)
    for x in (-FUSE_LEN / 2 + 0.008, FUSE_LEN / 2 - 0.008):
        kit.box_into(bm, (x - 0.008, FACE - 0.052, FUSE_Z - 0.026), (x + 0.008, FACE - 0.02, FUSE_Z + 0.026), B)
    # The supply coming down the wall in a brass conduit, into the ceiling.
    cylinder_into(bm, 0.013, 1.56, Matrix.Translation((0.17, -0.016, BOARD_H / 2 + 0.78)), segments=8)
    # The faces created by create_uvsphere / create_cone come out with material 0; brass them.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        c = f.calc_center_median()
        if f.material_index == 0 and (c.y < -BOARD_T - 0.001 or c.z > BOARD_H / 2 + 0.001):
            f.material_index = B
    board = kit.mesh_object('Breaker_Board', bm, mats)
    for poly in board.data.polygons:
        poly.use_smooth = poly.material_index == B
    kit.bevel(board, width=0.0025)

    # The blades and their handle, hinged at the foot.
    bm = bmesh.new()
    blade_len = JAW_Z - HINGE_Z
    for x in POLES:
        kit.box_into(bm, (x - 0.004, FACE - 0.010, HINGE_Z), (x + 0.004, FACE - 0.004, HINGE_Z + blade_len + 0.02), B)
    # A brass cross-bar near the top, and the ebonite handle standing off it.
    kit.box_into(bm, (POLES[0] - 0.01, FACE - 0.016, JAW_Z + 0.022), (POLES[1] + 0.01, FACE - 0.006, JAW_Z + 0.034), B)
    cylinder_into(bm, 0.008, 0.05, Matrix.Translation((0, FACE - 0.04, JAW_Z + 0.028)) @ Matrix.Rotation(math.pi / 2, 4, 'X'), segments=8)
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.016,
                              matrix=Matrix.Translation((0, FACE - 0.07, JAW_Z + 0.028)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        c = f.calc_center_median()
        f.material_index = E if c.y < FACE - 0.02 else B
    lever = kit.mesh_object('LeverPivot', bm, mats)
    for poly in lever.data.polygons:
        poly.use_smooth = poly.material_index == E
    kit.set_origin(lever, (0.0, FACE - 0.007, HINGE_Z))

    seat = bpy.data.objects.new('FuseSeat', None)
    seat.empty_display_type = 'ARROWS'
    seat.empty_display_size = 0.05
    seat.location = (0.0, FACE - 0.04, FUSE_Z)
    bpy.context.scene.collection.objects.link(seat)

    objects = [board, lever, seat]
    kit.report(objects)
    return objects


if __name__ == '__main__':
    OBJECTS = main()
    if bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
