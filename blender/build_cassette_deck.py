"""
Generates cassette_deck.glb: the cassette player on the basement lab's CCTV
desk -- a compact front-loading deck the lab kept beside the monitor to play
back its session tapes.

Front panel, left to right:
  * the cassette door, hinged along its bottom edge: it tips open, the tape
    clips into it standing up, and it shuts with the tape behind its window;
  * the counter display, with the power lamp and POWER beside it;
  * four big transport keys under them: rewind, PLAY, fast-forward and
    STOP/EJECT -- a playback deck, with nothing on it to record with, and
    keys a hand finds without looking.
Vent slots across the top, and on the back the line-out sockets and the
power lead's grommet.

No maker's name, on purpose.

Four parts are separate objects because the level moves or lights them:
DeckFlap (the door, tipped on its bottom edge, which is its origin),
DeckPlayButton and DeckEjectButton (pushed in when pressed), and DeckPowerLamp
(lit while the desk has power). The counter is NOT in this file: the level
paints it onto a plane set into the DeckDisplayWindow recess, at the DISPLAY
position it mirrors. Neither is the tape: the level clips a copy of
audio_cassette.glb into the door at TAPE_IN_DOOR.

Axes: built facing Blender -Y, origin at the centre of the underside -- the
point that sits on the desk. The glTF Y-up conversion turns that into a model
facing +Z, standing on y = 0.

Run headless: blender --background --python blender/build_cassette_deck.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

DECK_WIDTH = 0.26
DECK_DEPTH = 0.22
DECK_BODY_HEIGHT = 0.095
FOOT_HEIGHT = 0.006
FRONT_Y = -DECK_DEPTH / 2
BODY_BOTTOM = FOOT_HEIGHT
BODY_TOP = FOOT_HEIGHT + DECK_BODY_HEIGHT

# The cassette well behind the door: its opening, x from/to and height from/to, and its depth.
WELL = (-0.119, -0.005, 0.016, 0.09)
WELL_DEPTH = 0.03
# The door, inside the opening with a little clearance all round.
DOOR_CLEARANCE = 0.0015
DOOR_THICKNESS = 0.0025
DOOR_HINGE = ((WELL[0] + WELL[1]) / 2, FRONT_Y, WELL[2] + DOOR_CLEARANCE)
DOOR_SIZE = (WELL[1] - WELL[0] - 2 * DOOR_CLEARANCE, WELL[3] - WELL[2] - 2 * DOOR_CLEARANCE)
# Where the tape's middle sits in the door's own frame (Blender axes): just
# behind the plate, its bottom edge a couple of millimetres off the hinge.
TAPE_IN_DOOR = (0.0, DOOR_THICKNESS + 0.007, 0.002 + 0.0319)
# The window in the door, round the tape's own window: half-width, and
# heights from/to in the door's frame.
DOOR_WINDOW = (0.037, TAPE_IN_DOOR[2] - 0.016, TAPE_IN_DOOR[2] + 0.015)

# The counter: the window's x from/to and height from/to.
DISPLAY = (0.012, 0.07, 0.07, 0.086)
DISPLAY_DEPTH = 0.003
POWER_BUTTON = (0.108, 0.078)
POWER_BUTTON_SIZE = (0.024, 0.011)
POWER_LAMP = (0.084, 0.078)
# The transport row, left to right, and each key's size.
TRANSPORT = ('rewind', 'play', 'forward', 'stop')
TRANSPORT_LABELS = ('REW', 'PLAY', 'F.FWD', 'STOP/EJECT')
KEY_SIZE = (0.026, 0.021)
KEY_GAP = 0.003
TRANSPORT_X = tuple(0.005 + KEY_SIZE[0] / 2 + i * (KEY_SIZE[0] + KEY_GAP) for i in range(len(TRANSPORT)))
TRANSPORT_HEIGHT = 0.04
BUTTON_PROUD = 0.0045
# The power lead's grommet on the back panel: (x, height above the desk).
POWER_LEAD = (-0.09, 0.03)

BODY = (0.028, 0.028, 0.03)
FASCIA = (0.05, 0.05, 0.053)
KEYS = (0.5, 0.5, 0.52)
PRINT = (0.72, 0.74, 0.78)

FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
PRINT_FONT = os.path.join(FONTS, 'arial.ttf')
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
    The case as one closed box, with the cassette well and the counter window
    pushed back into it as recesses. Their walls and floors take material slot
    1, the black inside the deck.
    """
    bm = bmesh.new()
    add_box(bm, (0, 0, (BODY_BOTTOM + BODY_TOP) / 2), (DECK_WIDTH, DECK_DEPTH, DECK_BODY_HEIGHT))
    for (x0, x1, z0, z1), depth in ((WELL, WELL_DEPTH), (DISPLAY, DISPLAY_DEPTH)):
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
    """Every key that does not move: POWER and the transport row bar PLAY and STOP/EJECT."""
    bm = bmesh.new()
    front_button(bm, POWER_BUTTON, POWER_BUTTON_SIZE)
    for name, x in zip(TRANSPORT, TRANSPORT_X):
        if name not in ('play', 'stop'):
            front_button(bm, (x, TRANSPORT_HEIGHT), KEY_SIZE)
    return bm


def build_single_button(name):
    bm = bmesh.new()
    front_button(bm, (TRANSPORT_X[TRANSPORT.index(name)], TRANSPORT_HEIGHT), KEY_SIZE)
    return bm


def build_door():
    """
    The cassette door: a plate with a window in it, built about its hinge --
    its bottom edge -- so the object's origin is the hinge and the level only
    has to turn it about X to tip it open. It sits a hair behind the front so
    it reads as set into the opening.
    """
    width, height = DOOR_SIZE
    half = width / 2
    wx = DOOR_WINDOW[0]
    wz0, wz1 = DOOR_WINDOW[1], DOOR_WINDOW[2]
    y = DOOR_THICKNESS / 2 + 0.0004
    bm = bmesh.new()
    for x0, x1, z0, z1 in ((-half, half, wz1, height), (-half, half, 0, wz0), (-half, -wx, wz0, wz1), (wx, half, wz0, wz1)):
        add_box(bm, ((x0 + x1) / 2, y, (z0 + z1) / 2), (x1 - x0, DOOR_THICKNESS, z1 - z0))
    # The finger recess along its top edge, as a dark lip.
    return bm


def build_door_pane():
    bm = bmesh.new()
    add_box(bm, (0, DOOR_THICKNESS * 0.6, (DOOR_WINDOW[1] + DOOR_WINDOW[2]) / 2),
            (DOOR_WINDOW[0] * 2, 0.0008, DOOR_WINDOW[2] - DOOR_WINDOW[1]))
    return bm


def build_door_lip():
    """The dark notch along the door's top edge that a finger pulls it open by."""
    bm = bmesh.new()
    add_box(bm, (0, 0.0002, DOOR_SIZE[1] - 0.004), (0.03, 0.0008, 0.0035))
    return bm


def build_vents():
    """Two banks of slots across the back half of the top, a hair proud of it."""
    bm = bmesh.new()
    for bank_x in (-0.065, 0.065):
        for row in range(6):
            add_box(bm, (bank_x, 0.02 + row * 0.014, BODY_TOP + 0.0002), (0.08, 0.0035, 0.0006))
    return bm


def build_lamp():
    bm = bmesh.new()
    add_cylinder(bm, (POWER_LAMP[0], FRONT_Y - 0.0008, POWER_LAMP[1]), 0.0022, 0.002, 'Y', 12)
    return bm


def build_ports():
    """The line-out sockets, and the power lead's grommet, on the back panel."""
    jacks = bmesh.new()
    for x in (0.06, 0.078):
        add_cylinder(jacks, (x, DECK_DEPTH / 2 + 0.004, 0.045), 0.0042, 0.008, 'Y', 12)
    add_cylinder(jacks, (POWER_LEAD[0], DECK_DEPTH / 2 + 0.005, POWER_LEAD[1]), 0.004, 0.01, 'Y', 10)
    return jacks


def transport_icon(bm, name, x, z, face_y):
    """
    The printed symbol on a transport key: triangles, bars and a dot, as flat
    geometry just in front of the key's face.
    """
    s = 0.0032

    def poly(points):
        bm.faces.new([bm.verts.new((px, face_y, pz)) for px, pz in points])

    def tri(cx, pointing):
        d = s * pointing
        points = [(cx - d, z - s), (cx + d, z), (cx - d, z + s)]
        poly(points if pointing > 0 else list(reversed(points)))

    def bar(cx, half_width):
        poly([(cx - half_width, z - s), (cx - half_width, z + s), (cx + half_width, z + s), (cx + half_width, z - s)])

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


def build_icons():
    bm = bmesh.new()
    # Just in front of the keys' faces, which stand BUTTON_PROUD + 1 mm out
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
    """Printed marks: the keys' names under them, POWER, COUNTER and the deck's own name."""
    front = FRONT_Y - 0.0004
    common.make_text_mesh('DeckPowerLabel', 'POWER', print_mat, 0.0032, PRINT_FONT,
                          location=(POWER_BUTTON[0], front, POWER_BUTTON[1] - 0.0105), rotation=UPRIGHT)
    common.make_text_mesh('DeckCounterLabel', 'COUNTER', print_mat, 0.0026, PRINT_FONT,
                          location=((DISPLAY[0] + DISPLAY[1]) / 2, front, DISPLAY[2] - 0.0045), rotation=UPRIGHT)
    common.make_text_mesh('DeckModelLabel', 'CASSETTE DECK', print_mat, 0.0034, PRINT_FONT,
                          location=((WELL[0] + WELL[1]) / 2, front, (WELL[3] + BODY_TOP) / 2), rotation=UPRIGHT)
    for name, label, x in zip(TRANSPORT, TRANSPORT_LABELS, TRANSPORT_X):
        common.make_text_mesh(f'DeckKeyLabel_{name}', label, print_mat, 0.0028, PRINT_FONT,
                              location=(x, front, TRANSPORT_HEIGHT - KEY_SIZE[1] / 2 - 0.0048), rotation=UPRIGHT)


def build():
    common.clear_scene()
    body_mat = common.make_material('DeckBody', BODY, roughness=0.42)
    inside_mat = common.make_material('DeckInside', (0.006, 0.006, 0.007), roughness=0.8)
    caps_mat = common.make_material('DeckCaps', KEYS, roughness=0.4, metallic=0.2)
    flap_mat = common.make_material('DeckFlap', FASCIA, roughness=0.3)
    lip_mat = common.make_material('DeckFlapLip', (0.006, 0.006, 0.007), roughness=0.8)
    print_mat = common.make_material('DeckPrint', PRINT, roughness=0.5)
    icon_mat = common.make_material('DeckIcons', (0.05, 0.05, 0.05), roughness=0.6)
    vent_mat = common.make_material('DeckVents', (0.004, 0.004, 0.004), roughness=0.9)
    lamp_mat = common.make_material('DeckPowerLamp', (0.3, 0.02, 0.015), roughness=0.3)
    foot_mat = common.make_material('DeckFeet', (0.01, 0.01, 0.01), roughness=0.9)
    jack_mat = common.make_material('DeckJacks', (0.55, 0.5, 0.35), roughness=0.35, metallic=0.8)
    pane_mat = common.make_material('DeckDoorWindow', (0.1, 0.1, 0.11), roughness=0.06)
    bsdf = pane_mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Alpha'].default_value = 0.28
    if hasattr(pane_mat, 'surface_render_method'):
        pane_mat.surface_render_method = 'BLENDED'

    body = common.new_object('DeckBody', build_body(), body_mat, uv_density=8)
    body.data.materials.append(inside_mat)
    bevel = body.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.0025
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    common.new_object('DeckFeet', build_feet(), foot_mat)
    common.new_object('DeckCaps', build_caps(), caps_mat)
    common.new_object('DeckPlayButton', build_single_button('play'), caps_mat)
    common.new_object('DeckEjectButton', build_single_button('stop'), caps_mat)
    flap = common.new_object('DeckFlap', build_door(), flap_mat)
    flap.location = DOOR_HINGE
    # The window and the lip are built in the door's own frame, so they ride on it.
    pane = common.new_object('DeckDoorWindow', build_door_pane(), pane_mat)
    pane.parent = flap
    lip = common.new_object('DeckFlapLip', build_door_lip(), lip_mat)
    lip.parent = flap
    common.new_object('DeckVents', build_vents(), vent_mat)
    common.new_object('DeckPowerLamp', build_lamp(), lamp_mat)
    common.new_object('DeckJacks', build_ports(), jack_mat)
    common.new_object('DeckIcons', build_icons(), icon_mat)
    add_lettering(print_mat)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'cassette_deck.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
