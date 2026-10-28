"""
The study wardrobe -- the hide spot Mark gets into, and the one she opens.

    exec in the live Blender, or: blender --background --python blender/study/build_wardrobe.py

Writes blender/study/study_wardrobe.blend and src/assets/models/study/study_wardrobe.glb.

THE CONTRACT (src/levels/studyHideProps.js): a 1.2 x 0.6 m carcass, 2.1 m to
its top and 2.19 m to the top of the cornice, standing with its back 5 mm off
the front wall. The doors leave a 4 cm slit between them -- the peek Mark
looks out through, 15 cm behind them (main.js's look bounds sweep it).

THREE NODES the game reaches by name:
  Wardrobe_Carcass  everything that does not move: sides, back, top, plinth,
                    cornice and crest. Its inside faces are the dark interior,
                    not walnut -- an unfinished inside, and nothing to catch
                    the light when Mark is in there.
  Door_L, Door_R    inset, fielded-panel doors, each with its ORIGIN ON ITS
                    HINGE, so a turn about the vertical axis swings it open
                    from the right place: Door_L positive, Door_R negative.
  Wardrobe_Coats    two old coats on the rail, either side of where Mark stands.

No mirrors on the doors, whatever a real one would have had: the study mirror
is the only unbroken one in the house (CLAUDE.md).
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

NAME = 'study_wardrobe'

W, D, H = 1.2, 0.6, 2.1
HW, HD = W / 2, D / 2
SIDE = 0.025          # carcass side thickness
BACK = 0.015
PLINTH_H = 0.10
BOTTOM_TOP = 0.13     # the floor of the inside
TOP_UNDER = 2.07      # the ceiling of the inside
OPEN_X = HW - SIDE    # the door opening, either side of the centre line
DOOR_Z = (0.205, 1.975)
DOOR_BACK, DOOR_FRONT = 0.255, 0.285   # 15 mm behind the carcass front edge
SLAB_FRONT = 0.268
FIELD_FRONT = 0.276
GAP = 0.04            # the slit
CLEAR = 0.003         # door-to-carcass clearance


def materials():
    walnut = kit.material('Wardrobe walnut', (0.20, 0.11, 0.06), roughness=0.75)
    interior = kit.material('Wardrobe interior', (0.035, 0.025, 0.02), roughness=1.0)
    brass = kit.material('Wardrobe brass', (0.62, 0.47, 0.22), roughness=0.42, metallic=0.85)
    charcoal = kit.material('Coat charcoal wool', (0.06, 0.06, 0.065), roughness=1.0)
    tweed = kit.material('Coat brown tweed', (0.15, 0.10, 0.065), roughness=1.0)
    return walnut, interior, brass, charcoal, tweed


def build_carcass(walnut, interior):
    bm = bmesh.new()
    # Sides, back, inside floor and ceiling.
    kit.box_into(bm, (-HW, -HD, PLINTH_H), (-HW + SIDE, HD, H))
    kit.box_into(bm, (HW - SIDE, -HD, PLINTH_H), (HW, HD, H))
    kit.box_into(bm, (-OPEN_X, -HD, PLINTH_H), (OPEN_X, -HD + BACK, H))
    kit.box_into(bm, (-OPEN_X, -HD + BACK, PLINTH_H), (OPEN_X, HD, BOTTOM_TOP))
    kit.box_into(bm, (-OPEN_X, -HD + BACK, TOP_UNDER), (OPEN_X, HD, H))
    # The front rails above and below the doors, set back 2 cm from the edge.
    kit.box_into(bm, (-OPEN_X, HD - 0.02, DOOR_Z[1] + 0.005), (OPEN_X, HD, TOP_UNDER))
    kit.box_into(bm, (-OPEN_X, HD - 0.02, BOTTOM_TOP), (OPEN_X, HD, DOOR_Z[0] - 0.005))
    # The plinth, 1.5 cm proud at the front and 2 cm at the sides.
    kit.box_into(bm, (-HW - 0.02, -HD, 0.0), (HW + 0.02, HD + 0.015, PLINTH_H))
    # A stepped cornice, each step further out; and a low arched crest on it.
    for i, (out, z0, z1) in enumerate(((0.02, H, H + 0.03), (0.035, H + 0.03, H + 0.06), (0.045, H + 0.06, H + 0.09))):
        kit.box_into(bm, (-HW - out, -HD, z0), (HW + out, HD + out, z1))
    crest = []
    span, rise, base = 0.30, 0.11, H + 0.09
    for i in range(13):
        x = -span + 2 * span * i / 12
        crest.append((x, base + 0.025 + rise * math.cos(math.pi * x / (2 * span)) ** 1.5))
    outline = [(-span, base)] + crest + [(span, base)]
    front_y, back_y = HD + 0.035, HD + 0.005
    front = [bm.verts.new((x, front_y, z)) for x, z in outline]
    back = [bm.verts.new((x, back_y, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # The inside is dark: every face on the inner surfaces of the box.
    for f in bm.faces:
        c = f.calc_center_median()
        inside = (abs(c.x) <= OPEN_X + 1e-4 and -HD + BACK - 1e-4 <= c.y <= HD - 0.02 + 1e-4
                  and BOTTOM_TOP - 1e-4 <= c.z <= TOP_UNDER + 1e-4)
        f.material_index = 1 if inside else 0
    obj = kit.mesh_object('Wardrobe_Carcass', bm, [walnut, interior])
    kit.bevel(obj, width=0.003)
    return obj


def build_door(side, walnut, interior, brass):
    """side -1 is the left door (hinge at -x), +1 the right."""
    outer = side * (OPEN_X - CLEAR)
    inner = side * GAP / 2
    x0, x1 = min(outer, inner), max(outer, inner)
    z0, z1 = DOOR_Z
    stile, rail_top, rail_mid, rail_bottom = 0.07, 0.10, 0.08, 0.11
    bm = bmesh.new()
    # The slab: its back is the inside face Mark sees.
    for f in kit.box_into(bm, (x0, DOOR_BACK, z0), (x1, SLAB_FRONT, z1)):
        f.normal_update()   # a new face has no normal until asked
        if f.normal.y < -0.5:
            f.material_index = 1
    # The frame on the front: two stiles and three rails.
    kit.box_into(bm, (x0, SLAB_FRONT, z0), (x0 + stile, DOOR_FRONT, z1))
    kit.box_into(bm, (x1 - stile, SLAB_FRONT, z0), (x1, DOOR_FRONT, z1))
    fx0, fx1 = x0 + stile, x1 - stile
    mid = (0.82, 0.82 + rail_mid)
    kit.box_into(bm, (fx0, SLAB_FRONT, z1 - rail_top), (fx1, DOOR_FRONT, z1))
    kit.box_into(bm, (fx0, SLAB_FRONT, mid[0]), (fx1, DOOR_FRONT, mid[1]))
    kit.box_into(bm, (fx0, SLAB_FRONT, z0), (fx1, DOOR_FRONT, z0 + rail_bottom))
    # Two raised fields, 9 mm below the frame's face.
    for lo, hi in ((mid[1], z1 - rail_top), (z0 + rail_bottom, mid[0])):
        kit.box_into(bm, (fx0 + 0.025, SLAB_FRONT, lo + 0.025), (fx1 - 0.025, FIELD_FRONT, hi - 0.025))
    # The knob, by the meeting edge, and the keyhole plate on the right door.
    knob_x = side * (GAP / 2 + 0.035)
    cone = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.008, radius2=0.015, depth=0.026,
                                 matrix=Matrix.Translation((knob_x, DOOR_FRONT + 0.013, 1.05)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
    for f in {f for v in cone['verts'] for f in v.link_faces}:
        f.material_index = 2
    if side > 0:
        for f in kit.box_into(bm, (knob_x - 0.013, DOOR_FRONT, 1.115), (knob_x + 0.013, DOOR_FRONT + 0.006, 1.17)):
            f.material_index = 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    name = 'Door_L' if side < 0 else 'Door_R'
    obj = kit.mesh_object(name, bm, [walnut, interior, brass])
    for poly in obj.data.polygons:
        poly.use_smooth = poly.material_index == 2
    kit.bevel(obj, width=0.002)
    # The origin on the hinge: the outer edge, at the door's front face, on the floor.
    kit.set_origin(obj, (outer, DOOR_FRONT, 0.0))
    return obj


def build_coats(brass, charcoal, tweed):
    """A rail across the inside and two coats hanging from it, either side of the middle."""
    bm = bmesh.new()
    rail = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.011, radius2=0.011, depth=2 * OPEN_X - 0.002,
                                 matrix=Matrix.Translation((0, -0.05, 1.80)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    for f in {f for v in rail['verts'] for f in v.link_faces}:
        f.material_index = 0

    def smoothstep(a, b, t):
        t = min(1.0, max(0.0, (t - a) / (b - a)))
        return t * t * (3 - 2 * t)

    for index, (cx, turn, mat, length) in enumerate(((-0.30, 0.12, 1, 0.95), (0.33, -0.18, 2, 0.88))):
        coat = bmesh.new()
        bmesh.ops.create_cube(coat, size=1.0)
        bmesh.ops.subdivide_edges(coat, edges=coat.edges, cuts=4, use_grid_fill=True)
        for v in coat.verts:
            x, y, z = v.co
            t = z + 0.5
            shoulder = smoothstep(0.80, 1.0, t)
            width = (0.48 - 0.06 * t) * (1 - 0.42 * shoulder)
            depth = (0.17 - 0.03 * abs(t - 0.6)) * (1 - 0.35 * shoulder)
            fold = 0.012 * math.sin(x * 26 + index * 1.7 + t * 2.5) * (1 - t) if abs(y) > 0.49 else 0.0
            X = x * width
            Y = y * depth + math.copysign(fold, y)
            v.co = (X * math.cos(turn) - Y * math.sin(turn) + cx, X * math.sin(turn) + Y * math.cos(turn) - 0.05,
                    1.78 - length + t * length)
        for f in coat.faces:
            f.material_index = mat
        # Into the one mesh.
        mesh = bpy.data.meshes.new('tmp')
        coat.to_mesh(mesh)
        coat.free()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = kit.mesh_object('Wardrobe_Coats', bm, [brass, charcoal, tweed], smooth=True)
    return obj


def main():
    kit.clear_scene()
    walnut, interior, brass, charcoal, tweed = materials()
    carcass = build_carcass(walnut, interior)
    door_l = build_door(-1, walnut, interior, brass)
    door_r = build_door(1, walnut, interior, brass)
    coats = build_coats(brass, charcoal, tweed)
    objects = [carcass, door_l, door_r, coats]
    kit.report(objects)
    return objects


if __name__ == '__main__':
    OBJECTS = main()
    if os.environ.get('STUDY_EXPORT', '1') == '1' and bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
