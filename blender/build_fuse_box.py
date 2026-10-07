"""
Generates fuse_box.glb: the wall-mounted cartridge fuse box in the Level 2
basement lab, after an instructional illustration of a four-way cartridge
fuse board -- a deep enclosure whose inner walls slope in to a smaller back,
a screwed backplate, four pairs of copper spring clips with screw terminals,
and grey and blue wires leaving through grommets top and bottom.

The three fuses that never leave the box ARE in this file -- slots one, two
and four -- built by the same glass_fuse.py as the loose ones in fuse.glb,
and merged into this model's meshes so they cost no draw calls of their own.
The third slot is left empty: that is the one the player fills, with a loose
fuse the level places there.

The click target is NOT in this file. Interaction raycasts non-recursively,
so nothing inside a loaded .glb can ever be hit; the level puts an invisible
box over the front of this one.

The cover is the one moving part. Its frame, pane and latch are parented to
the empty `FuseBoxCoverPivot`, which sits on the hinge line, so the level
opens it by turning that single node about its own vertical axis.

Static parts are merged into one mesh PER MATERIAL rather than built as
dozens of small objects -- every separate mesh is a draw call every frame,
and the door model's 44 parts are the example of what that adds up to.

Axes: built facing Blender -Y with the back on the Y = 0 plane, so the origin
is the point that touches the wall. The glTF exporter's Y-up conversion turns
that into a model facing +Z with its back on Z = 0.

Run headless: blender --background --python blender/build_fuse_box.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import glass_fuse  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from common import add_box, add_cylinder, add_tube  # noqa: E402

PAINT = (0.62, 0.6, 0.52)       # yellowed white enamel; the level swaps in a rusted texture
STEEL = (0.32, 0.33, 0.33)      # galvanised backplate, screws, hinges
COPPER = (0.55, 0.27, 0.12)
WIRE_DARK = (0.035, 0.035, 0.038)
WIRE_BLUE = (0.03, 0.1, 0.32)

# The enclosure. Outer size, and the sloped inner walls: the front opening is
# a thin rim in from the outside, the back panel is smaller still.
BOX_W, BOX_H, BOX_D = 0.54, 0.50, 0.13
FRONT_RIM = 0.01
BACK_W, BACK_H = 0.46, 0.42
BACK_PANEL_T = 0.01

PLATE_W, PLATE_H, PLATE_T = 0.40, 0.34, 0.006
PLATE_STANDOFF = 0.004
PLATE_FRONT_Y = -(BACK_PANEL_T + PLATE_STANDOFF + PLATE_T)

# Where the four fuses sit. The fuse itself is glass_fuse.py's. The level's
# FUSE_BOX_* constants mirror these -- change one side and change the other.
FUSE_CAP_RADIUS = glass_fuse.CAP_RADIUS
SLOT_X = (-0.15, -0.05, 0.05, 0.15)
EMPTY_SLOT = 2
FUSE_AXIS_Y = -0.062
CAP_CENTRE_Z = (glass_fuse.FUSE_LENGTH - glass_fuse.CAP_LENGTH) / 2
TERMINAL_Z = 0.085

WIRE_RADIUS = 0.0045
GROMMET_Y = -0.07

COVER_FRAME_W = 0.03
COVER_FRAME_T = 0.008
COVER_GAP = 0.006   # cover sits just proud of the enclosure's front face
HINGE_Z = (-0.17, 0.17)


def build_enclosure(bm):
    """
    One block hollowed from the front: inset the front face to leave a rim,
    push the inside back to the back panel, then shrink it -- which is what
    slopes the four inner walls in, like the reference.
    """
    temp = bmesh.new()
    bmesh.ops.create_cube(temp, size=1.0)
    bmesh.ops.scale(temp, vec=(BOX_W, BOX_D, BOX_H), verts=temp.verts)
    bmesh.ops.translate(temp, vec=(0, -BOX_D / 2, 0), verts=temp.verts)
    temp.normal_update()
    front = next(f for f in temp.faces if f.normal.y < -0.9)
    bmesh.ops.inset_region(temp, faces=[front], thickness=FRONT_RIM, depth=0.0)
    inner_verts = list(front.verts)
    bmesh.ops.translate(temp, vec=(0, BOX_D - BACK_PANEL_T, 0), verts=inner_verts)
    back_centre = Vector((0, -BACK_PANEL_T, 0))
    bmesh.ops.scale(
        temp,
        vec=(BACK_W / (BOX_W - 2 * FRONT_RIM), 1.0, BACK_H / (BOX_H - 2 * FRONT_RIM)),
        space=Matrix.Translation(-back_centre),
        verts=inner_verts
    )
    bmesh.ops.recalc_face_normals(temp, faces=temp.faces)
    mesh = bpy.data.meshes.new('_enclosure_tmp')
    temp.to_mesh(mesh)
    temp.free()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)


def build_clips(copper, steel):
    """A pair of spring clips per slot, each strapped to a screw terminal."""
    base_y = PLATE_FRONT_Y - 0.006
    jaw_front_y = FUSE_AXIS_Y - 0.013
    jaw_depth = abs(jaw_front_y - (PLATE_FRONT_Y - 0.012))
    jaw_centre_y = (PLATE_FRONT_Y - 0.012 + jaw_front_y) / 2
    for x in SLOT_X:
        for end in (-1, 1):
            z = end * CAP_CENTRE_Z
            # The base spans both jaws. Narrower than that and the empty slot
            # -- the one place a clip is seen without a fuse in it -- shows
            # its jaws standing loose in the air beside it.
            jaw_offset = FUSE_CAP_RADIUS + 0.002
            add_box(copper, (x, base_y, z), (2 * jaw_offset + 0.006, 0.012, 0.022))
            for side in (-1, 1):
                jaw_x = x + side * jaw_offset
                add_box(copper, (jaw_x, jaw_centre_y, z), (0.004, jaw_depth, 0.016))
                # The curled lip that springs over the cap.
                add_cylinder(copper, (jaw_x - side * 0.001, jaw_front_y, z), 0.004, 0.016, 'Z', 8)
            # Strap out to the terminal block, then the block and its screw.
            add_box(copper, (x, PLATE_FRONT_Y - 0.003, end * (CAP_CENTRE_Z + TERMINAL_Z) / 2),
                    (0.014, 0.006, TERMINAL_Z - CAP_CENTRE_Z))
            add_box(copper, (x, PLATE_FRONT_Y - 0.008, end * TERMINAL_Z), (0.024, 0.016, 0.022))
            add_cylinder(steel, (x, PLATE_FRONT_Y - 0.018, end * TERMINAL_Z), 0.0075, 0.004, 'Y', 8)


def build_plate(steel):
    add_box(steel, (0, PLATE_FRONT_Y + PLATE_T / 2, 0), (PLATE_W, PLATE_T, PLATE_H))
    # Four corner screws and one in the middle, as on the reference. The
    # middle one lands between slots two and three, clear of both.
    screw_y = PLATE_FRONT_Y - 0.0015
    for sx in (-1, 1):
        for sz in (-1, 1):
            add_cylinder(steel, (sx * (PLATE_W / 2 - 0.02), screw_y, sz * (PLATE_H / 2 - 0.02)), 0.006, 0.003, 'Y', 10)
    add_cylinder(steel, (0, screw_y, 0), 0.006, 0.003, 'Y', 10)


def build_wires(dark, blue):
    """
    One wire up from every top terminal to the top grommet and one down from
    every bottom terminal to the bottom grommet. The fourth slot is wired in
    blue, as on the reference.
    """
    terminal_front_y = PLATE_FRONT_Y - 0.012
    for x in SLOT_X:
        bm = blue if x == SLOT_X[-1] else dark
        for end in (-1, 1):
            points = [
                (x, terminal_front_y, end * TERMINAL_Z),
                (x, terminal_front_y - 0.006, end * (TERMINAL_Z + 0.04)),
                (x * 0.55, -0.055, end * 0.185),
                (x * 0.15, GROMMET_Y, end * 0.232),
                (x * 0.08, GROMMET_Y, end * (BOX_H / 2 + 0.03)),
            ]
            add_tube(bm, points, WIRE_RADIUS)
    for end in (-1, 1):
        add_cylinder(dark, (0, GROMMET_Y, end * BOX_H / 2), 0.024, 0.022, 'Z', 16)


def build_hinges(steel):
    hinge_x = BOX_W / 2 + 0.004
    hinge_y = -BOX_D - COVER_GAP
    for z in HINGE_Z:
        add_cylinder(steel, (hinge_x, hinge_y, z), 0.006, 0.06, 'Z', 10)
        # The leaf screwed to the enclosure's side.
        add_box(steel, (BOX_W / 2 + 0.0015, hinge_y + 0.016, z), (0.003, 0.03, 0.05))
    return Vector((hinge_x, hinge_y, 0.0))


def build_cover(pivot_location, paint_mat, steel_mat, perspex_mat):
    """
    The hinged lid, built in the pivot's own space: the hinge line is x = 0
    and the lid reaches back along -X to its latch.
    """
    pivot = bpy.data.objects.new('FuseBoxCoverPivot', None)
    pivot.empty_display_type = 'ARROWS'
    pivot.empty_display_size = 0.1
    pivot.location = pivot_location
    bpy.context.collection.objects.link(pivot)

    cx = -BOX_W / 2
    frame = bmesh.new()
    for z in (-1, 1):
        add_box(frame, (cx, 0, z * (BOX_H - COVER_FRAME_W) / 2), (BOX_W, COVER_FRAME_T, COVER_FRAME_W))
    for x in (-1, 1):
        add_box(frame, (cx + x * (BOX_W - COVER_FRAME_W) / 2, 0, 0),
                (COVER_FRAME_W, COVER_FRAME_T, BOX_H - 2 * COVER_FRAME_W))
    bmesh.ops.remove_doubles(frame, verts=frame.verts, dist=0.0001)

    pane = bmesh.new()
    add_box(pane, (cx, 0, 0), (BOX_W - COVER_FRAME_W, 0.004, BOX_H - COVER_FRAME_W))

    latch = bmesh.new()
    add_box(latch, (-BOX_W + 0.012, -0.008, 0), (0.016, 0.012, 0.05))

    parts = []
    for name, bm, mat, uv in (
        ('FuseBoxCoverFrame', frame, paint_mat, 2.2),
        ('FuseBoxCoverPane', pane, perspex_mat, 1.0),
        ('FuseBoxCoverLatch', latch, steel_mat, 2.2),
    ):
        obj = common.new_object(name, bm, mat, uv_density=uv)
        obj.parent = pivot
        parts.append(obj)
    bevel = parts[0].modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.002
    bevel.segments = 2


def make_perspex_material():
    mat = common.make_material('FuseBoxPerspex', (0.85, 0.9, 0.88), roughness=0.08)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Alpha'].default_value = 0.2
    return mat


def build():
    common.clear_scene()
    paint_mat = common.make_material('FuseBoxPaint', PAINT, roughness=0.6, metallic=0.25)
    steel_mat = common.make_material('FuseBoxSteel', STEEL, roughness=0.45, metallic=0.8)
    copper_mat = common.make_material('FuseBoxCopper', COPPER, roughness=0.35, metallic=1.0)
    dark_mat = common.make_material('FuseBoxWireDark', WIRE_DARK, roughness=0.7)
    blue_mat = common.make_material('FuseBoxWireBlue', WIRE_BLUE, roughness=0.6)
    perspex_mat = make_perspex_material()

    paint = bmesh.new()
    steel = bmesh.new()
    copper = bmesh.new()
    dark = bmesh.new()
    blue = bmesh.new()

    build_enclosure(paint)
    build_plate(steel)
    build_clips(copper, steel)
    build_wires(dark, blue)
    pivot_location = build_hinges(steel)

    enclosure = common.new_object('FuseBoxEnclosure', paint, paint_mat)
    bevel = enclosure.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.003
    bevel.segments = 2
    common.new_object('FuseBoxSteelParts', steel, steel_mat, uv_density=4.0)
    common.new_object('FuseBoxCopperParts', copper, copper_mat)
    for name, bm, mat in (('FuseBoxWiresDark', dark, dark_mat), ('FuseBoxWiresBlue', blue, blue_mat)):
        obj = common.new_object(name, bm, mat)
        for p in obj.data.polygons:
            p.use_smooth = True

    build_cover(pivot_location, paint_mat, steel_mat, perspex_mat)

    fuse_parts = glass_fuse.new_parts()
    for slot, x in enumerate(SLOT_X):
        if slot != EMPTY_SLOT:
            glass_fuse.add_glass_fuse(fuse_parts, (x, FUSE_AXIS_Y, 0.0))
    glass_fuse.finish_objects('FuseBoxSeated', fuse_parts, glass_fuse.make_materials())

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'fuse_box.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
