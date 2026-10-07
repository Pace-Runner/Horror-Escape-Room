"""
Generates breaker_panel.glb: the consumer unit on the basement lab's wall
that the generator feeds, after reference photos of modern consumer units
and an old side-mounted main lever.

A white enclosure with a window across its upper half, five black breaker
modules standing in it in one row -- spaced wider than a real unit, so each
is easy to pick out and aim at -- vent slots below, a smoked cover hinged
along the top that lifts up and away, and on the right-hand side a main
lever: a grey steel arm on a screwed plate, with a two-tone green-over-red
handle.

What is NOT in here, because the level drives it:

  * the five levers and their on/off flags, which flip with the puzzle;
  * the circuit labels under the modules, drawn from the level's own circuit
    table so they can never disagree with it;
  * every click target -- Interaction raycasts non-recursively, so nothing
    inside a loaded .glb can be hit.

Two moving parts, each parented to an empty on its hinge line so the level
turns ONE node to move it: `BreakerCoverPivot` (the cover, about the box's
X axis) and `BreakerLeverPivot` (the lever arm and handle, also about X,
since the lever swings in the plane of the box's side). At rest the cover
hangs closed and the lever arm points straight up.

The level's BREAKER_* constants mirror the dimensions below.

Axes: built facing Blender -Y with the back on the Y = 0 plane, so the origin
is the point that touches the wall. The glTF Y-up conversion turns that into
a model facing +Z with its back on Z = 0.

Run headless: blender --background --python blender/build_breaker_panel.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

PAINT = (0.62, 0.6, 0.52)
RECESS = (0.08, 0.08, 0.085)
MODULE = (0.02, 0.02, 0.022)
SLOT = (0.012, 0.012, 0.012)
STEEL = (0.38, 0.39, 0.4)
COVER = (0.25, 0.27, 0.28)
HANDLE_GREEN = (0.02, 0.45, 0.06)
HANDLE_RED = (0.6, 0.03, 0.02)

BOX_W, BOX_H, BOX_D = 0.44, 0.32, 0.10

# The window the modules stand in, and how deep it is set into the front.
WINDOW_HALF_W = 0.18
WINDOW_BOTTOM, WINDOW_TOP = -0.035, 0.085
WINDOW_DEPTH = 0.035

# Five modules in a row, centred, 6.6 cm apart.
MODULE_X = (-0.132, -0.066, 0.0, 0.066, 0.132)
MODULE_W, MODULE_H = 0.036, 0.11
MODULE_PROUD = 0.008            # how far a module's face stands in front of the box
MODULE_CENTRE_Z = (WINDOW_BOTTOM + WINDOW_TOP) / 2

COVER_HINGE_Z = 0.10
COVER_HINGE_Y = -0.165          # in front of the levers, even tilted
COVER_W, COVER_H = 0.40, 0.17

LEVER_PLATE_Y = -0.06
LEVER_PIVOT = (BOX_W / 2 + 0.008, LEVER_PLATE_Y, -0.01)
LEVER_ARM_LENGTH = 0.12


def rect(y, half_w, z_bottom, z_top):
    """Four corners in the X/Z plane at depth y: BL, BR, TR, TL seen from the front."""
    return [(-half_w, y, z_bottom), (half_w, y, z_bottom), (half_w, y, z_top), (-half_w, y, z_top)]


def build_enclosure():
    """
    The box as one closed mesh, front plate to back, with the window cut into
    the front and set back into a recess. Slots: 0 paint, 1 the dark recess.
    """
    bm = bmesh.new()
    rings_spec = {
        'front': rect(-BOX_D, BOX_W / 2, -BOX_H / 2, BOX_H / 2),
        'window': rect(-BOX_D, WINDOW_HALF_W, WINDOW_BOTTOM, WINDOW_TOP),
        'recess': rect(-BOX_D + WINDOW_DEPTH, WINDOW_HALF_W, WINDOW_BOTTOM, WINDOW_TOP),
        'back': rect(0.0, BOX_W / 2, -BOX_H / 2, BOX_H / 2),
    }
    rings = {k: [bm.verts.new(c) for c in v] for k, v in rings_spec.items()}

    def bridge(a, b, mat=0):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((a[i], a[j], b[j], b[i])).material_index = mat

    bridge(rings['front'], rings['window'])
    bridge(rings['window'], rings['recess'], 1)
    bm.faces.new(rings['recess']).material_index = 1
    bridge(rings['front'], rings['back'])
    bm.faces.new(list(reversed(rings['back'])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    common.box_project_uvs(bm)
    return bm


def build_modules():
    bm = bmesh.new()
    recess_y = -BOX_D + WINDOW_DEPTH
    face_y = -BOX_D - MODULE_PROUD
    depth = recess_y - face_y
    for x in MODULE_X:
        add_box(bm, (x, (recess_y + face_y) / 2, MODULE_CENTRE_Z), (MODULE_W, depth, MODULE_H))
        # The raised collar the toggle comes out of.
        add_box(bm, (x, face_y - 0.003, MODULE_CENTRE_Z), (0.03, 0.006, 0.04))
    return bm


def build_slots():
    bm = bmesh.new()
    for x in (-0.135, -0.045, 0.045, 0.135):
        add_box(bm, (x, -BOX_D - 0.0005, -0.1), (0.07, 0.002, 0.012))
    return bm


def build_static_steel():
    bm = bmesh.new()
    # The DIN rail the modules clip to, showing between them.
    add_box(bm, (0, -BOX_D + WINDOW_DEPTH - 0.002, MODULE_CENTRE_Z), (2 * WINDOW_HALF_W - 0.01, 0.004, 0.035))
    # Hinge brackets off the front plate, and their knuckles on the hinge line.
    for x in (-0.15, 0.15):
        add_box(bm, (x, (-BOX_D + COVER_HINGE_Y) / 2, COVER_HINGE_Z), (0.03, abs(COVER_HINGE_Y + BOX_D), 0.008))
        add_cylinder(bm, (x, COVER_HINGE_Y, COVER_HINGE_Z), 0.006, 0.04, 'X', 10)
    # The lever's mounting plate on the right-hand side, and its two screws.
    plate_x = BOX_W / 2 + 0.002
    add_box(bm, (plate_x, LEVER_PLATE_Y, 0.0), (0.004, 0.034, 0.17))
    for z in (-0.072, 0.072):
        add_cylinder(bm, (plate_x + 0.003, LEVER_PLATE_Y, z), 0.005, 0.003, 'X', 10)
    return bm


def parented(name, bm, material, pivot):
    obj = common.new_object(name, bm, material)
    obj.parent = pivot
    return obj


def make_pivot(name, location):
    pivot = bpy.data.objects.new(name, None)
    pivot.empty_display_type = 'ARROWS'
    pivot.empty_display_size = 0.05
    pivot.location = location
    bpy.context.collection.objects.link(pivot)
    return pivot


def build_cover(cover_mat):
    """
    The smoked cover, in its hinge's own space: it hangs down from the hinge
    line, with a lip along the bottom to lift it by and a cheek down each
    side closing the gap back to the box.
    """
    pivot = make_pivot('BreakerCoverPivot', (0, COVER_HINGE_Y, COVER_HINGE_Z))
    bm = bmesh.new()
    add_box(bm, (0, 0, -COVER_H / 2), (COVER_W, 0.004, COVER_H))
    add_box(bm, (0, -0.006, -COVER_H + 0.002), (COVER_W, 0.012, 0.004))
    cheek_depth = abs(COVER_HINGE_Y + BOX_D) - 0.003
    for x in (-COVER_W / 2, COVER_W / 2):
        add_box(bm, (x, cheek_depth / 2, -COVER_H / 2), (0.003, cheek_depth, COVER_H))
    parented('BreakerCover', bm, cover_mat, pivot)


def build_lever(steel_mat, green_mat, red_mat):
    """The main lever's arm and handle, in its pivot's space: pointing up."""
    pivot = make_pivot('BreakerLeverPivot', LEVER_PIVOT)
    arm = bmesh.new()
    add_cylinder(arm, (0, 0, 0), 0.016, 0.01, 'X', 16)
    add_box(arm, (0, 0, LEVER_ARM_LENGTH / 2 - 0.01), (0.008, 0.026, LEVER_ARM_LENGTH))
    parented('BreakerLeverArm', arm, steel_mat, pivot)

    tip_z = LEVER_ARM_LENGTH - 0.02
    for name, mat, dz in (('BreakerLeverGreen', green_mat, 0.0085), ('BreakerLeverRed', red_mat, -0.0085)):
        bm = bmesh.new()
        add_box(bm, (0.029, 0, tip_z + dz), (0.05, 0.03, 0.017))
        obj = parented(name, bm, mat, pivot)
        bevel = obj.modifiers.new('Bevel', type='BEVEL')
        bevel.width = 0.003
        bevel.segments = 2


def build():
    common.clear_scene()
    paint = common.make_material('BreakerPaint', PAINT, roughness=0.6, metallic=0.25)
    recess = common.make_material('BreakerRecess', RECESS, roughness=0.7)
    module = common.make_material('BreakerModule', MODULE, roughness=0.45)
    slot = common.make_material('BreakerSlot', SLOT, roughness=0.9)
    steel = common.make_material('BreakerSteel', STEEL, roughness=0.45, metallic=0.8)
    cover = common.make_material('BreakerCover', COVER, roughness=0.1)
    cover.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = 0.45
    green = common.make_material('BreakerLeverGreen', HANDLE_GREEN, roughness=0.35)
    red = common.make_material('BreakerLeverRed', HANDLE_RED, roughness=0.35)

    mesh = bpy.data.meshes.new('BreakerEnclosure_mesh')
    enclosure_bm = build_enclosure()
    enclosure_bm.to_mesh(mesh)
    enclosure_bm.free()
    enclosure = bpy.data.objects.new('BreakerEnclosure', mesh)
    bpy.context.collection.objects.link(enclosure)
    enclosure.data.materials.append(paint)
    enclosure.data.materials.append(recess)
    bevel = enclosure.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.003
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'

    modules = common.new_object('BreakerModules', build_modules(), module)
    bevel = modules.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.0015
    bevel.segments = 1
    common.new_object('BreakerSlots', build_slots(), slot)
    common.new_object('BreakerSteelParts', build_static_steel(), steel)
    build_cover(cover)
    build_lever(steel, green, red)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'breaker_panel.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
