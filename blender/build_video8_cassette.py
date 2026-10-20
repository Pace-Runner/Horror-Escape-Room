"""
Generates video8_cassette.glb: the Session 14 tape from the camcorder in the
basement lab, after a photo of a Sony P6-90 Video8 cassette.

A Video8 cassette is the size of an audio cassette -- 95 x 62.5 x 15 mm --
in dark grey plastic, with a window across its face onto the two reels, a
hinged dust lid along the front edge where the tape runs, and a red record
tab. This one has a paper label stuck under the window, written in marker:
SESSION 14 and the date it was recorded, 14.1.87.

No maker's name is printed on it, on purpose: only the format's own marks.

Axes: lying flat with its face up, built on Blender's XY plane -- length
along X, the lid edge toward -Y (the model's front), origin at the centre of
the whole cassette. The glTF Y-up conversion stands that on y = 0 facing +Z.

The other props that hold a tape -- the camcorder's cassette well, the deck
and the stack of session tapes -- are sized against the CASSETTE_* numbers
below, which the level mirrors as VIDEO8_CASSETTE.

Run headless: blender --background --python blender/build_video8_cassette.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

# The cassette's outside, in metres.
CASSETTE_LENGTH = 0.095
CASSETTE_DEPTH = 0.0625
CASSETTE_THICKNESS = 0.015

# The window across the face onto the reels: x from, x to, y from, y to.
WINDOW = (-0.032, 0.032, -0.003, 0.015)
WINDOW_RECESS = 0.0045
# The two reel hubs, either side of the middle, and how much tape is on each.
REEL_X = 0.0215
REEL_Y = (WINDOW[2] + WINDOW[3]) / 2
HUB_RADIUS = 0.0056
TAPE_PACK_RADII = (0.0142, 0.0098)

# The handwritten paper label, under the window toward the lid edge.
LABEL = (-0.037, 0.037, -0.0278, -0.0072)
LABEL_TEXT = ('SESSION 14', '14.1.87')
# Stuck on by hand, so not quite square to the cassette.
LABEL_TILT_IN_RADIANS = -0.02

SHELL = (0.04, 0.04, 0.043)
# Inside the shell, under the window: what the reels are seen against.
INTERIOR = (0.012, 0.012, 0.013)
PRINT = (0.78, 0.8, 0.84)
PAPER = (0.86, 0.83, 0.74)
INK = (0.04, 0.05, 0.11)

FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
HAND_FONT = os.path.join(FONTS, 'Inkfree.ttf')
# How much each stroke of the handwriting is fattened: Ink Free is a fine
# nib, and this was written in marker.
MARKER_WEIGHT = 0.00024
PRINT_FONT = os.path.join(FONTS, 'arialbi.ttf')


def build_shell():
    """
    The body as one closed box, cut by planes along the window's four sides
    so the window's own face can be pushed down into a recess the reels sit
    in. One mesh rather than a frame of four boxes, so the bevel runs round
    the recess's lip without leaving seams where pieces met.

    The recess's walls and floor are material slot 1, the dark inside of the
    shell, so the reels read against it rather than against grey plastic.
    """
    bm = bmesh.new()
    add_box(bm, (0, 0, 0), (CASSETTE_LENGTH, CASSETTE_DEPTH, CASSETTE_THICKNESS))
    x0, x1, y0, y1 = WINDOW
    for co, no in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0)),
                   ((0, y0, 0), (0, 1, 0)), ((0, y1, 0), (0, 1, 0))):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    top = CASSETTE_THICKNESS / 2
    window_faces = [
        f for f in bm.faces
        if f.normal.z > 0.9 and abs(f.calc_center_median().z - top) < 1e-6
        and x0 < f.calc_center_median().x < x1 and y0 < f.calc_center_median().y < y1
    ]
    extruded = bmesh.ops.extrude_face_region(bm, geom=window_faces)
    verts = [g for g in extruded['geom'] if isinstance(g, bmesh.types.BMVert)]
    for face in (g for g in extruded['geom'] if isinstance(g, bmesh.types.BMFace)):
        face.material_index = 1
    bmesh.ops.translate(bm, verts=verts, vec=(0, 0, -WINDOW_RECESS))
    bmesh.ops.delete(bm, geom=window_faces, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_lid():
    """The dust lid along the front edge, standing just proud of it, and the seam above it."""
    bm = bmesh.new()
    front = -CASSETTE_DEPTH / 2
    add_box(bm, (0, front - 0.0004, -0.0006), (CASSETTE_LENGTH - 0.008, 0.0012, CASSETTE_THICKNESS - 0.004))
    return bm


def build_reels():
    """The two hubs, white with a dark bore, on the floor of the window's recess."""
    floor = CASSETTE_THICKNESS / 2 - WINDOW_RECESS
    hubs, bores, packs = bmesh.new(), bmesh.new(), bmesh.new()
    for side, pack in zip((-1, 1), TAPE_PACK_RADII):
        x = side * REEL_X
        add_cylinder(packs, (x, REEL_Y, floor + 0.0012), pack, 0.0024, 'Z', 32)
        add_cylinder(hubs, (x, REEL_Y, floor + 0.0018), HUB_RADIUS, 0.0036, 'Z', 24)
        add_cylinder(bores, (x, REEL_Y, floor + 0.0021), HUB_RADIUS * 0.45, 0.0036, 'Z', 6)
    return hubs, bores, packs


def build_window_pane():
    """The smoked plastic over the reels, flush with the face."""
    bm = bmesh.new()
    x0, x1, y0, y1 = WINDOW
    add_box(bm, ((x0 + x1) / 2, (y0 + y1) / 2, CASSETTE_THICKNESS / 2 - 0.0006),
            (x1 - x0, y1 - y0, 0.0008))
    return bm


def build_tab():
    """The red record tab, at the right-hand end of the face."""
    bm = bmesh.new()
    add_box(bm, (CASSETTE_LENGTH / 2 - 0.0045, 0.022, CASSETTE_THICKNESS / 2 + 0.0002), (0.0034, 0.0075, 0.0006))
    return bm


def build_label():
    """The paper the session was written on, stuck on a little crooked."""
    bm = bmesh.new()
    x0, x1, y0, y1 = LABEL
    add_box(bm, ((x0 + x1) / 2, (y0 + y1) / 2, CASSETTE_THICKNESS / 2 + 0.00015), (x1 - x0, y1 - y0, 0.0003))
    bmesh.ops.rotate(bm, verts=bm.verts, cent=((x0 + x1) / 2, (y0 + y1) / 2, 0),
                     matrix=Matrix.Rotation(LABEL_TILT_IN_RADIANS, 3, 'Z'))
    return bm


def add_lettering(print_mat, ink_mat):
    """
    The format's marks across the top of the face, and the handwriting on the
    label. Lettering lies on the face, so it is laid in XY facing +Z already.
    """
    face = CASSETTE_THICKNESS / 2
    common.make_text_mesh('CassetteFormatMark', 'Video 8', print_mat, 0.0068, PRINT_FONT,
                          location=(0.006, 0.0235, face + 0.0001), align_x='CENTER')
    common.make_text_mesh('CassetteLengthMark', 'P6-90', print_mat, 0.0042, PRINT_FONT,
                          location=(0.0315, 0.0235, face + 0.0001), align_x='CENTER')
    x0, x1, y0, y1 = LABEL
    paper_top = face + 0.00032
    common.make_text_mesh('CassetteHandwritingTitle', LABEL_TEXT[0], ink_mat, 0.0084, HAND_FONT,
                          location=(x0 + 0.0035, (y0 + y1) / 2 + 0.0002, paper_top),
                          rotation=(0, 0, LABEL_TILT_IN_RADIANS), align_x='LEFT', weight=MARKER_WEIGHT)
    common.make_text_mesh('CassetteHandwritingDate', LABEL_TEXT[1], ink_mat, 0.0068, HAND_FONT,
                          location=(x1 - 0.004, (y0 + y1) / 2 - 0.0004, paper_top),
                          rotation=(0, 0, -0.035), align_x='RIGHT', weight=MARKER_WEIGHT)


def make_glass_material(name, colour, alpha, roughness=0.15):
    """A see-through plastic. Alpha comes through the glTF exporter as BLEND."""
    mat = common.make_material(name, colour, roughness=roughness)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Alpha'].default_value = alpha
    if hasattr(mat, 'surface_render_method'):
        mat.surface_render_method = 'BLENDED'
    else:
        mat.blend_method = 'BLEND'
    return mat


def build_into_scene():
    """
    Builds every part of the cassette into the current scene, centred on the
    origin, and returns nothing. Split from build() so the stack of session
    tapes can reuse the same tape without exporting this one.
    """
    shell_mat = common.make_material('CassetteShell', SHELL, roughness=0.42)
    lid_mat = common.make_material('CassetteLid', tuple(c * 0.85 for c in SHELL), roughness=0.38)
    hub_mat = common.make_material('CassetteHub', (0.82, 0.82, 0.8), roughness=0.45)
    bore_mat = common.make_material('CassetteHubBore', (0.02, 0.02, 0.02), roughness=0.6)
    pack_mat = common.make_material('CassetteTapePack', (0.14, 0.085, 0.05), roughness=0.22)
    interior_mat = common.make_material('CassetteInterior', INTERIOR, roughness=0.7)
    pane_mat = make_glass_material('CassetteWindow', (0.12, 0.12, 0.13), 0.18, roughness=0.08)
    tab_mat = common.make_material('CassetteTab', (0.7, 0.05, 0.04), roughness=0.4)
    paper_mat = common.make_material('CassetteLabelPaper', PAPER, roughness=0.85)
    print_mat = common.make_material('CassettePrint', PRINT, roughness=0.5)
    ink_mat = common.make_material('CassetteInk', INK, roughness=0.7)

    shell = common.new_object('CassetteShell', build_shell(), shell_mat, uv_density=20)
    shell.data.materials.append(interior_mat)
    bevel = shell.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.0012
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    common.new_object('CassetteLid', build_lid(), lid_mat)
    hubs, bores, packs = build_reels()
    for name, bm, mat in (('CassetteHubs', hubs, hub_mat), ('CassetteHubBores', bores, bore_mat),
                          ('CassetteTapePacks', packs, pack_mat)):
        obj = common.new_object(name, bm, mat)
        for p in obj.data.polygons:
            p.use_smooth = True
    common.new_object('CassetteWindow', build_window_pane(), pane_mat)
    common.new_object('CassetteTab', build_tab(), tab_mat)
    common.new_object('CassetteLabel', build_label(), paper_mat, uv_density=20)
    add_lettering(print_mat, ink_mat)


def build():
    common.clear_scene()
    build_into_scene()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'video8_cassette.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
