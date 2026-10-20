"""
Generates video8_deck.glb: the Video8 player on the basement lab's CCTV desk,
after a photo of a Sony EV-C3 -- a compact black deck the lab would have kept
beside the monitor to review its session tapes.

Front panel, left to right:
  * POWER and EJECT, stacked, with the power lamp beside POWER;
  * the cassette flap, a door hinged along its top edge that tips inward as a
    tape goes in;
  * the counter display over a row of five transport buttons:
    rewind, PLAY, fast-forward, stop, pause.
Vent slots across the top, the format's mark on the flap and the top, and
the video and audio sockets on the back, which the level's cable to the
monitor plugs into.

No maker's name, on purpose: only the format's own marks.

Four parts are separate objects because the level moves or lights them:
DeckFlap (swung on its top edge, which is its origin), DeckPlayButton and
DeckEjectButton (pushed in when pressed), and DeckPowerLamp (lit while the
desk has power). The counter is NOT in this file: the level paints it onto a
plane set into the DeckDisplayWindow recess, at the DECK_DISPLAY position it
mirrors.

Axes: built facing Blender -Y, origin at the centre of the underside -- the
point that sits on the desk. The glTF Y-up conversion turns that into a model
facing +Z, standing on y = 0.

Run headless: blender --background --python blender/build_video8_deck.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

DECK_WIDTH = 0.25
DECK_DEPTH = 0.26
DECK_BODY_HEIGHT = 0.082
FOOT_HEIGHT = 0.006
FRONT_Y = -DECK_DEPTH / 2
BODY_BOTTOM = FOOT_HEIGHT
BODY_TOP = FOOT_HEIGHT + DECK_BODY_HEIGHT

# Everything on the front panel, as (centre x, centre height above the desk).
POWER_BUTTON = (-0.1, 0.064)
EJECT_BUTTON = (-0.1, 0.036)
SIDE_BUTTON_SIZE = (0.026, 0.012)
POWER_LAMP = (-0.081, 0.064)
# The cassette flap: its opening, x from/to and height from/to.
SLOT = (-0.079, 0.031, 0.038, 0.064)
SLOT_DEPTH = 0.006
# The counter: the window's x from/to and height from/to.
DISPLAY = (0.044, 0.114, 0.056, 0.074)
DISPLAY_DEPTH = 0.003
# The transport row, left to right, and each button's size.
TRANSPORT = ('rewind', 'play', 'forward', 'stop', 'pause')
TRANSPORT_X = (0.049, 0.0655, 0.082, 0.0985, 0.115)
TRANSPORT_HEIGHT = 0.034
TRANSPORT_SIZE = (0.0135, 0.0095)
BUTTON_PROUD = 0.0032
# The sockets on the back panel: (x, height above the desk).
PORT_VIDEO = (0.055, 0.045)
PORT_AUDIO = (0.075, 0.045)

BODY = (0.022, 0.022, 0.024)
FASCIA = (0.034, 0.034, 0.037)
CAPS = (0.05, 0.05, 0.054)
PRINT = (0.72, 0.74, 0.78)

FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
PRINT_FONT = os.path.join(FONTS, 'arial.ttf')
LOGO_FONT = os.path.join(FONTS, 'arialbi.ttf')
# Lettering on the front panel stands in the XZ plane facing -Y.
UPRIGHT = (1.5708, 0, 0)


def front_rect_faces(bm, x0, x1, z0, z1):
    """The front-panel faces inside one rectangle, once the box has been cut along its edges."""
    return [
        f for f in bm.faces
        if f.normal.y < -0.9 and abs(f.calc_center_median().y - FRONT_Y) < 1e-6
        and x0 < f.calc_center_median().x < x1 and z0 < f.calc_center_median().z < z1
    ]


def build_body():
    """
    The case as one closed box, with the cassette slot and the counter window
    pushed back into it as recesses. Their walls and floors take material slot
    1, the black inside the deck. Same cut-and-extrude as the cassette's
    window, so the bevel runs round each lip without seams.
    """
    bm = bmesh.new()
    add_box(bm, (0, 0, (BODY_BOTTOM + BODY_TOP) / 2), (DECK_WIDTH, DECK_DEPTH, DECK_BODY_HEIGHT))
    for (x0, x1, z0, z1), depth in ((SLOT, SLOT_DEPTH), (DISPLAY, DISPLAY_DEPTH)):
        for co, no in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0)),
                       ((0, 0, z0), (0, 0, 1)), ((0, 0, z1), (0, 0, 1))):
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        faces = front_rect_faces(bm, x0, x1, z0, z1)
        extruded = bmesh.ops.extrude_face_region(bm, geom=faces)
        for face in (g for g in extruded['geom'] if isinstance(g, bmesh.types.BMFace)):
            face.material_index = 1
        verts = [g for g in extruded['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=verts, vec=(0, depth, 0))
        bmesh.ops.delete(bm, geom=faces, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_feet():
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_cylinder(bm, (sx * (DECK_WIDTH / 2 - 0.025), sy * (DECK_DEPTH / 2 - 0.03), FOOT_HEIGHT / 2),
                         0.011, FOOT_HEIGHT, 'Z', 16)
    return bm


def front_button(bm, centre, size, proud=BUTTON_PROUD):
    """A rectangular button standing `proud` out of the front panel."""
    x, z = centre
    add_box(bm, (x, FRONT_Y - proud / 2, z), (size[0], proud + 0.002, size[1]))


def build_caps():
    """Every button that does not move: POWER and the transport row bar PLAY."""
    bm = bmesh.new()
    front_button(bm, POWER_BUTTON, SIDE_BUTTON_SIZE)
    for name, x in zip(TRANSPORT, TRANSPORT_X):
        if name != 'play':
            front_button(bm, (x, TRANSPORT_HEIGHT), TRANSPORT_SIZE)
    return bm


def build_single_button(centre, size):
    bm = bmesh.new()
    front_button(bm, centre, size)
    return bm


def build_flap():
    """
    The cassette door, a thin plate filling the slot just behind its lip. Its
    origin is its top edge, so the level only has to turn it about X to tip it
    inward. Built at the origin and moved there by the object's location.
    """
    x0, x1, z0, z1 = SLOT
    bm = bmesh.new()
    add_box(bm, (0, 0, -(z1 - z0 - 0.002) / 2), (x1 - x0 - 0.003, 0.0018, z1 - z0 - 0.002))
    return bm


def build_vents():
    """Two banks of slots across the back half of the top, a hair proud of it."""
    bm = bmesh.new()
    for bank_x in (-0.06, 0.06):
        for row in range(7):
            add_box(bm, (bank_x, 0.012 + row * 0.014, BODY_TOP + 0.0002), (0.075, 0.0035, 0.0006))
    return bm


def build_lamp():
    bm = bmesh.new()
    add_cylinder(bm, (POWER_LAMP[0], FRONT_Y - 0.0008, POWER_LAMP[1]), 0.0022, 0.002, 'Y', 12)
    return bm


def build_ports():
    """The video and audio sockets, and the power lead's grommet, on the back panel."""
    jacks = bmesh.new()
    for x, z in (PORT_VIDEO, PORT_AUDIO):
        add_cylinder(jacks, (x, DECK_DEPTH / 2 + 0.004, z), 0.0042, 0.008, 'Y', 12)
    add_cylinder(jacks, (-0.09, DECK_DEPTH / 2 + 0.005, 0.03), 0.004, 0.01, 'Y', 10)
    return jacks


def transport_icon(bm, name, x, z, face_y):
    """
    The printed symbol on a transport button: triangles and bars, as flat
    geometry just in front of the cap's face.
    """
    s = 0.0021

    def tri(cx, pointing):
        d = s * pointing
        verts = [bm.verts.new((cx - d, face_y, z - s)), bm.verts.new((cx + d, face_y, z)),
                 bm.verts.new((cx - d, face_y, z + s))]
        if pointing < 0:
            verts.reverse()
        bm.faces.new(verts)

    def bar(cx, half_width):
        verts = [bm.verts.new((cx - half_width, face_y, z - s)), bm.verts.new((cx - half_width, face_y, z + s)),
                 bm.verts.new((cx + half_width, face_y, z + s)), bm.verts.new((cx + half_width, face_y, z - s))]
        bm.faces.new(verts)

    if name == 'rewind':
        tri(x - s, -1)
        tri(x + s, -1)
    elif name == 'forward':
        tri(x - s, 1)
        tri(x + s, 1)
    elif name == 'play':
        tri(x, 1)
    elif name == 'stop':
        bar(x, s)
    elif name == 'pause':
        bar(x - s * 0.8, s * 0.35)
        bar(x + s * 0.8, s * 0.35)


def build_icons():
    bm = bmesh.new()
    # Just in front of the caps' faces, which stand BUTTON_PROUD + 1 mm out
    # (see front_button: the extra millimetre is buried in the panel).
    face_y = FRONT_Y - BUTTON_PROUD - 0.0016
    for name, x in zip(TRANSPORT, TRANSPORT_X):
        transport_icon(bm, name, x, TRANSPORT_HEIGHT, face_y)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        if face.normal.y > 0:
            face.normal_flip()
    return bm


def add_lettering(print_mat):
    """Printed marks: the button names, the flap's and the top's format mark."""
    front = FRONT_Y - 0.0004
    common.make_text_mesh('DeckPowerLabel', 'POWER', print_mat, 0.0032, PRINT_FONT,
                          location=(POWER_BUTTON[0], front, POWER_BUTTON[1] + 0.0105), rotation=UPRIGHT)
    common.make_text_mesh('DeckEjectLabel', 'EJECT', print_mat, 0.0032, PRINT_FONT,
                          location=(EJECT_BUTTON[0], front, EJECT_BUTTON[1] + 0.0105), rotation=UPRIGHT)
    common.make_text_mesh('DeckCounterLabel', 'COUNTER', print_mat, 0.0026, PRINT_FONT,
                          location=((DISPLAY[0] + DISPLAY[1]) / 2, front, DISPLAY[3] + 0.0045), rotation=UPRIGHT)
    common.make_text_mesh('DeckModelLabel', 'VIDEO CASSETTE PLAYER', print_mat, 0.0024, PRINT_FONT,
                          location=((SLOT[0] + SLOT[1]) / 2, front, SLOT[2] - 0.0075), rotation=UPRIGHT)
    common.make_text_mesh('DeckTopMark', 'Video 8', print_mat, 0.011, LOGO_FONT,
                          location=(-0.07, -0.085, BODY_TOP + 0.0002))
    # Only PLAY is named under its button: it is the one the player is after,
    # and the symbols on the caps already say what the other four do.
    play_x = TRANSPORT_X[TRANSPORT.index('play')]
    common.make_text_mesh('DeckPlayLabel', 'PLAY', print_mat, 0.0026, PRINT_FONT,
                          location=(play_x, front, TRANSPORT_HEIGHT - 0.0092), rotation=UPRIGHT)


def build():
    common.clear_scene()
    body_mat = common.make_material('DeckBody', BODY, roughness=0.42)
    inside_mat = common.make_material('DeckInside', (0.006, 0.006, 0.007), roughness=0.8)
    caps_mat = common.make_material('DeckCaps', CAPS, roughness=0.5)
    flap_mat = common.make_material('DeckFlap', FASCIA, roughness=0.3)
    print_mat = common.make_material('DeckPrint', PRINT, roughness=0.5)
    vent_mat = common.make_material('DeckVents', (0.004, 0.004, 0.004), roughness=0.9)
    lamp_mat = common.make_material('DeckPowerLamp', (0.3, 0.02, 0.015), roughness=0.3)
    foot_mat = common.make_material('DeckFeet', (0.01, 0.01, 0.01), roughness=0.9)
    jack_mat = common.make_material('DeckJacks', (0.55, 0.5, 0.35), roughness=0.35, metallic=0.8)

    body = common.new_object('DeckBody', build_body(), body_mat, uv_density=8)
    body.data.materials.append(inside_mat)
    bevel = body.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.0025
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    common.new_object('DeckFeet', build_feet(), foot_mat)
    common.new_object('DeckCaps', build_caps(), caps_mat)
    common.new_object('DeckPlayButton', build_single_button(
        (TRANSPORT_X[TRANSPORT.index('play')], TRANSPORT_HEIGHT), TRANSPORT_SIZE), caps_mat)
    common.new_object('DeckEjectButton', build_single_button(EJECT_BUTTON, SIDE_BUTTON_SIZE), caps_mat)
    flap = common.new_object('DeckFlap', build_flap(), flap_mat)
    flap.location = ((SLOT[0] + SLOT[1]) / 2, FRONT_Y + 0.0018, SLOT[3] - 0.001)
    # The format's mark is printed on the flap, so it rides on it when it tips.
    flap_mark = common.make_text_mesh('DeckFlapMark', 'Video 8', print_mat, 0.0075, LOGO_FONT,
                                      location=(0.022, -0.001, -0.0125), rotation=UPRIGHT)
    flap_mark.parent = flap
    common.new_object('DeckVents', build_vents(), vent_mat)
    common.new_object('DeckPowerLamp', build_lamp(), lamp_mat)
    common.new_object('DeckJacks', build_ports(), jack_mat)
    common.new_object('DeckIcons', build_icons(), print_mat)
    add_lettering(print_mat)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'video8_deck.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
