"""
Generates audio_cassette.glb: the Session 14 tape from the cassette recorder
in the basement lab -- a compact cassette, the kind every lab of 1987 kept its
dictation on.

A compact cassette is 100.4 x 63.8 x 12 mm, here in black plastic: a window
across the middle onto the two reels and the tape wound on them, five screws
holding the halves together, and along the bottom edge -- where the tape runs
past the openings for the heads -- a raised trapezoid. A paper label covers the
top two thirds round the window, written on in marker: SESSION 14 and the
date it was recorded, 14.1.87.

No maker's name is printed on it, on purpose: only the side and the length.

Axes: lying flat with its face up, built on Blender's XY plane -- length
along X, the tape edge toward -Y (the model's front), origin at the centre of
the whole cassette. The glTF Y-up conversion stands that on y = 0 facing +Z.

The other props that hold a tape -- the recorder's well and the deck's door --
are sized against the CASSETTE_* numbers below. The two hubs are their own
objects, CassetteReelLeft and CassetteReelRight, each with its origin on its
spindle, so the deck can turn them while the tape plays.

Run headless: blender --background --python blender/build_audio_cassette.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

# The cassette's outside, in metres.
CASSETTE_LENGTH = 0.1004
CASSETTE_DEPTH = 0.0638
CASSETTE_THICKNESS = 0.012

# The window across the face onto the reels: x from, x to, y from, y to.
WINDOW = (-0.03, 0.03, -0.013, 0.012)
WINDOW_RECESS = 0.0035
# The two reel hubs, 42.5 mm apart, and how much tape is wound on each: most
# of it still on the left, the recording having stopped part way through.
REEL_X = 0.02125
REEL_Y = -0.0005
HUB_RADIUS = 0.0105
BORE_RADIUS = 0.0042
TAPE_PACK_RADII = (0.0215, 0.0135)

# The paper label round the window: x from, x to, y from, y to.
LABEL = (-0.0465, 0.0465, -0.0185, 0.0235)
# The strip above the window the session was written on.
WRITE_STRIP = (WINDOW[3] + 0.0012, LABEL[3] - 0.0012)
LABEL_TEXT = ('SESSION 14', '14.1.87')

# The raised trapezoid along the tape edge: its width at the edge and at its top, and its height.
TRAPEZOID = (0.07, 0.056, 0.0125)
# The five screws: four corners and one under the window.
SCREWS = ((-0.0455, -0.0262), (0.0455, -0.0262), (-0.0455, 0.0274), (0.0455, 0.0274), (0, -0.0262))

SHELL = (0.025, 0.025, 0.027)
# Inside the shell, under the window: what the reels are seen against.
INTERIOR = (0.008, 0.008, 0.009)
PAPER = (0.86, 0.83, 0.74)
RULE = (0.62, 0.12, 0.1)
PRINT = (0.2, 0.2, 0.22)
INK = (0.04, 0.05, 0.11)
TAPE = (0.16, 0.09, 0.05)

FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
HAND_FONT = os.path.join(FONTS, 'Inkfree.ttf')
# How much each stroke of the handwriting is fattened: Ink Free is a fine
# nib, and this was written in marker.
MARKER_WEIGHT = 0.00024
PRINT_FONT = os.path.join(FONTS, 'arialbd.ttf')


def build_shell():
    """
    The body as one closed box, cut by planes along the window's four sides
    so the window's own face can be pushed down into a recess the reels sit
    in. One mesh rather than a frame of four boxes, so the bevel runs round
    the recess's lip without leaving seams where pieces met.

    The recess's walls and floor are material slot 1, the dark inside of the
    shell, so the reels read against it rather than against the plastic.
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


def build_trapezoid():
    """The raised plate along the tape edge, on the face, as a low prism."""
    bm = bmesh.new()
    bottom_w, top_w, height = TRAPEZOID
    y0 = -CASSETTE_DEPTH / 2 + 0.0004
    y1 = y0 + height
    z0 = CASSETTE_THICKNESS / 2 - 0.0002
    z1 = CASSETTE_THICKNESS / 2 + 0.0006
    outline = ((-bottom_w / 2, y0), (bottom_w / 2, y0), (top_w / 2, y1), (-top_w / 2, y1))
    low = [bm.verts.new((x, y, z0)) for x, y in outline]
    high = [bm.verts.new((x, y, z1)) for x, y in outline]
    bm.faces.new(high)
    bm.faces.new(list(reversed(low)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((low[i], low[j], high[j], high[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_screws():
    bm = bmesh.new()
    face = CASSETTE_THICKNESS / 2
    for x, y in SCREWS:
        add_cylinder(bm, (x, y, face + 0.0003), 0.0019, 0.0006, 'Z', 12)
    return bm


def build_tape_edge():
    """The brown of the tape itself, showing through the three openings along the front edge."""
    bm = bmesh.new()
    for x, width in ((-0.022, 0.009), (0, 0.016), (0.022, 0.009)):
        add_box(bm, (x, -CASSETTE_DEPTH / 2 - 0.0002, -0.0005), (width, 0.0006, 0.0028))
    return bm


def build_packs():
    """The tape wound on the two reels: round, so they never need to be seen turning."""
    floor = CASSETTE_THICKNESS / 2 - WINDOW_RECESS
    packs = bmesh.new()
    for side, pack in zip((-1, 1), TAPE_PACK_RADII):
        add_cylinder(packs, (side * REEL_X, REEL_Y, floor + 0.0012), pack, 0.0024, 'Z', 40)
    return packs


def build_hub():
    """
    One reel's hub, white with a dark six-sided bore, built about its own
    spindle -- the six sides are what show it turning, so each hub is its own
    object the deck can spin. Material slot 1 is the bore.
    """
    bm = bmesh.new()
    add_cylinder(bm, (0, 0, 0), HUB_RADIUS, 0.0032, 'Z', 28)
    before = set(bm.faces)
    add_cylinder(bm, (0, 0, 0.0003), BORE_RADIUS, 0.0032, 'Z', 6)
    for face in bm.faces:
        if face not in before:
            face.material_index = 1
    return bm


def build_window_pane():
    """The clear plastic over the reels, flush with the face."""
    bm = bmesh.new()
    x0, x1, y0, y1 = WINDOW
    add_box(bm, ((x0 + x1) / 2, (y0 + y1) / 2, CASSETTE_THICKNESS / 2 - 0.0006),
            (x1 - x0, y1 - y0, 0.0008))
    return bm


def build_label():
    """
    The paper, as a frame round the window: a strip above it, one below and
    one at each end -- a label is printed with the window cut out of it.
    """
    bm = bmesh.new()
    x0, x1, y0, y1 = LABEL
    wx0, wx1, wy0, wy1 = (WINDOW[0] - 0.0012, WINDOW[1] + 0.0012, WINDOW[2] - 0.0012, WINDOW[3] + 0.0012)
    z = CASSETTE_THICKNESS / 2 + 0.00015
    for cx0, cx1, cy0, cy1 in ((x0, x1, wy1, y1), (x0, x1, y0, wy0), (x0, wx0, wy0, wy1), (wx1, x1, wy0, wy1)):
        add_box(bm, ((cx0 + cx1) / 2, (cy0 + cy1) / 2, z), (cx1 - cx0, cy1 - cy0, 0.0003))
    return bm


def build_rules():
    """The printed red lines across the write strip, the way a blank label comes."""
    bm = bmesh.new()
    z = CASSETTE_THICKNESS / 2 + 0.00032
    for y in (WRITE_STRIP[0] + 0.0004, WRITE_STRIP[1] - 0.0004):
        add_box(bm, (0, y, z), (LABEL[1] - LABEL[0] - 0.004, 0.0005, 0.00005))
    return bm


def add_lettering(print_mat, ink_mat):
    """
    The side and length printed on the label, and the handwriting on its
    strip. Lettering lies on the face, so it is laid in XY facing +Z already.
    """
    paper_top = CASSETTE_THICKNESS / 2 + 0.00034
    common.make_text_mesh('CassetteSideMark', 'A', print_mat, 0.0075, PRINT_FONT,
                          location=(LABEL[0] + 0.0055, (WINDOW[2] + WINDOW[3]) / 2, paper_top))
    common.make_text_mesh('CassetteLengthMark', 'C60', print_mat, 0.0036, PRINT_FONT,
                          location=(LABEL[1] - 0.0065, (WINDOW[2] + WINDOW[3]) / 2, paper_top))
    strip_mid = (WRITE_STRIP[0] + WRITE_STRIP[1]) / 2
    common.make_text_mesh('CassetteHandwritingTitle', LABEL_TEXT[0], ink_mat, 0.0084, HAND_FONT,
                          location=(LABEL[0] + 0.004, strip_mid + 0.0003, paper_top),
                          rotation=(0, 0, 0.012), align_x='LEFT', weight=MARKER_WEIGHT)
    common.make_text_mesh('CassetteHandwritingDate', LABEL_TEXT[1], ink_mat, 0.0068, HAND_FONT,
                          location=(LABEL[1] - 0.004, strip_mid - 0.0002, paper_top),
                          rotation=(0, 0, -0.03), align_x='RIGHT', weight=MARKER_WEIGHT)


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


def build():
    common.clear_scene()
    shell_mat = common.make_material('CassetteShell', SHELL, roughness=0.4)
    hub_mat = common.make_material('CassetteHub', (0.85, 0.85, 0.83), roughness=0.45)
    bore_mat = common.make_material('CassetteHubBore', (0.02, 0.02, 0.02), roughness=0.6)
    pack_mat = common.make_material('CassetteTapePack', TAPE, roughness=0.22)
    interior_mat = common.make_material('CassetteInterior', INTERIOR, roughness=0.7)
    pane_mat = make_glass_material('CassetteWindow', (0.25, 0.25, 0.27), 0.1, roughness=0.05)
    paper_mat = common.make_material('CassetteLabelPaper', PAPER, roughness=0.85)
    rule_mat = common.make_material('CassetteLabelRule', RULE, roughness=0.8)
    print_mat = common.make_material('CassettePrint', PRINT, roughness=0.6)
    ink_mat = common.make_material('CassetteInk', INK, roughness=0.7)
    screw_mat = common.make_material('CassetteScrews', (0.5, 0.5, 0.52), roughness=0.35, metallic=0.8)
    tape_mat = common.make_material('CassetteTapeEdge', TAPE, roughness=0.3)

    shell = common.new_object('CassetteShell', build_shell(), shell_mat, uv_density=20)
    shell.data.materials.append(interior_mat)
    bevel = shell.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.001
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    common.new_object('CassetteTrapezoid', build_trapezoid(), shell_mat)
    common.new_object('CassetteScrews', build_screws(), screw_mat)
    common.new_object('CassetteTapeEdge', build_tape_edge(), tape_mat)
    packs = common.new_object('CassetteTapePacks', build_packs(), pack_mat)
    for p in packs.data.polygons:
        p.use_smooth = True
    # The hubs, each at its spindle: CassetteReelLeft and CassetteReelRight.
    floor = CASSETTE_THICKNESS / 2 - WINDOW_RECESS
    for side, name in ((-1, 'CassetteReelLeft'), (1, 'CassetteReelRight')):
        hub = common.new_object(name, build_hub(), hub_mat)
        hub.data.materials.append(bore_mat)
        hub.location = (side * REEL_X, REEL_Y, floor + 0.0016)
    common.new_object('CassetteWindow', build_window_pane(), pane_mat)
    common.new_object('CassetteLabel', build_label(), paper_mat, uv_density=20)
    common.new_object('CassetteLabelRules', build_rules(), rule_mat)
    add_lettering(print_mat, ink_mat)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'audio_cassette.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
