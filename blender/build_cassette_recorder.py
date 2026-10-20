"""
Generates cassette_recorder.glb: the handheld recorder that took down Session
14, knocked off the instrument trolley onto the lab floor -- an early-80s
black dictation recorder, the kind that sat on a lab bench and went into a
coat pocket, after a photo of a Panasonic RQ-series machine.

A flat slab in black plastic, lying on its back. Down its face, from the far
end: a strip with the tape counter and its reset button, the TAPE SPEED slide
switch and the volume thumbwheel; then the cassette door, a plate with a
window onto the tape's reels and a 0-50-100 scale printed beside it; then a
plain panel the speaker sits behind. The keys run down its left side in two
black blocks -- record, play, rewind and fast-forward, then stop/eject -- and
a wrist strap hangs off the far right corner.

It fell: the case is cracked across its near left corner, and the PLAY key is
jammed down into the side -- which is why the tape has to be taken to the deck
on the desk to be heard.

No maker's name on it, on purpose.

Two things are NOT in this file:
  * the tape. The level puts a copy of audio_cassette.glb in the well under
    the door (WELL_CENTRE below, mirrored as CASSETTE_RECORDER.wellCentre),
    lengthwise down the recorder with its tape edge toward the keys, so the
    tape the player takes out is the same object they then carry.
  * the click targets. Interaction raycasts non-recursively.

CassetteDoor is a separate object with its origin on its hinge, along its near
edge, so the level only has to turn it about that edge to lift its far end.
RecorderBody is the case and everything on it bar the strap, which the level
measures for the recorder's collider.

Axes: built with its length along Blender Y -- the near end, below the door,
toward -Y -- its face up, origin at the middle of its underside. The glTF Y-up
conversion lays that on y = 0 with the near end toward +Z.

Run headless: blender --background --python blender/build_cassette_recorder.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
from common import add_box, add_cylinder, add_tube  # noqa: E402

WIDTH = 0.108
LENGTH = 0.175
THICKNESS = 0.03
NEAR_Y = -LENGTH / 2
FAR_Y = LENGTH / 2
TOP = THICKNESS

# The cassette well under the door: x from/to, y from/to, depth below the face.
WELL = (-0.035, 0.035, -0.037, 0.067, 0.017)
# Where the tape lies in it: lengthwise down the recorder, face up.
WELL_CENTRE = (0.0, 0.015, TOP - 0.0085)
# The door over it: x from/to, y from/to (its near edge is the hinge), thickness.
DOOR = (-0.0415, 0.0415, -0.04, 0.07, 0.0022)
# The window in the door, over the tape's own window: x from/to, and y from/to
# about the tape's middle.
DOOR_WINDOW = (-0.017, 0.017, -0.036, 0.036)

# The strip across the far end: the counter's window, its reset button, the
# speed switch's slot and the volume wheel's slot, each as x from/to.
STRIP_Y = (0.073, 0.0845)
COUNTER = (-0.043, -0.024)
COUNTER_RESET = -0.018
SPEED_SWITCH = (-0.006, 0.014)
VOLUME_WHEEL = (0.022, 0.042)
# The battery lamp, in the margin right of the door.
BATTERY_LAMP = (0.047, 0.058)

# The keys down the left side, near end first: (name, y from, y to). The
# first block is the transport, the second stop/eject on its own.
KEYS = (('stop', -0.043, -0.018), ('forward', 0.0015, 0.0135), ('rewind', 0.0145, 0.0265),
        ('play', 0.0275, 0.0395), ('rec', 0.0405, 0.0525))
KEY_HEIGHT = (0.008, 0.023)
KEY_PROUD = 0.0035
# How far into the side the jammed PLAY key has gone, and how far it has twisted.
JAMMED_DEPTH = 0.0028
JAMMED_TWIST_IN_RADIANS = math.radians(6)

# The strap's lug on the far right corner.
STRAP_LUG = (WIDTH / 2 + 0.003, FAR_Y - 0.006, 0.016)

# Black all over, the door a shade lighter and glossier than the case, the
# keys a matt charcoal so they still read against it, the printing white.
CASE = (0.018, 0.018, 0.02)
DOOR_BLACK = (0.03, 0.03, 0.033)
KEY_CHARCOAL = (0.06, 0.06, 0.065)
PRINT = (0.78, 0.78, 0.8)

FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
PRINT_FONT = os.path.join(FONTS, 'arial.ttf')
DIGIT_FONT = os.path.join(FONTS, 'arialbd.ttf')


def top_rect_faces(bm, x0, x1, y0, y1):
    """The face's polygons inside one rectangle, once the box has been cut along its edges."""
    return [
        f for f in bm.faces
        if f.normal.z > 0.9 and abs(f.calc_center_median().z - TOP) < 1e-6
        and x0 < f.calc_center_median().x < x1 and y0 < f.calc_center_median().y < y1
    ]


def cut_recess(bm, x0, x1, y0, y1, depth):
    """Pushes one rectangle of the face down into a recess whose walls and floor take material slot 1."""
    for co, no in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0)),
                   ((0, y0, 0), (0, 1, 0)), ((0, y1, 0), (0, 1, 0))):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    faces = top_rect_faces(bm, x0, x1, y0, y1)
    extruded = bmesh.ops.extrude_face_region(bm, geom=faces)
    for face in (g for g in extruded['geom'] if isinstance(g, bmesh.types.BMFace)):
        face.material_index = 1
    verts = [g for g in extruded['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=verts, vec=(0, 0, -depth))
    bmesh.ops.delete(bm, geom=faces, context='FACES')


def build_body():
    """
    The case as one closed box, with the cassette well, the counter's window
    and the two control slots pushed down into it.
    """
    bm = bmesh.new()
    add_box(bm, (0, 0, TOP / 2), (WIDTH, LENGTH, THICKNESS))
    strip_mid = (STRIP_Y[0] + STRIP_Y[1]) / 2
    cut_recess(bm, *WELL)
    for (x0, x1), depth in ((COUNTER, 0.0015), (SPEED_SWITCH, 0.003), (VOLUME_WHEEL, 0.004)):
        cut_recess(bm, x0, x1, strip_mid - 0.0035, strip_mid + 0.0035, depth)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_controls():
    """The counter's reset button, the speed switch's knob (at ON) and the volume wheel's ridged edge."""
    bm = bmesh.new()
    strip_mid = (STRIP_Y[0] + STRIP_Y[1]) / 2
    add_box(bm, (COUNTER_RESET, strip_mid, TOP + 0.0012), (0.004, 0.006, 0.0034))
    add_box(bm, (SPEED_SWITCH[1] - 0.0045, strip_mid, TOP - 0.0005), (0.0065, 0.0055, 0.004))
    wheel_x = (VOLUME_WHEEL[0] + VOLUME_WHEEL[1]) / 2
    for i in range(9):
        add_box(bm, (VOLUME_WHEEL[0] + 0.002 + i * 0.002, strip_mid, TOP - 0.0008), (0.0011, 0.0062, 0.0042))
    add_cylinder(bm, (wheel_x, strip_mid, TOP - 0.003), 0.004, 0.018, 'X', 12)
    return bm


def build_side_vents():
    """The notches cut into the left side at the far end."""
    bm = bmesh.new()
    for y in (0.07, 0.077):
        add_box(bm, (-WIDTH / 2 - 0.0002, y, 0.018), (0.0008, 0.0035, 0.008))
    return bm


def key_transform(name, y0, y1):
    """Where a key stands out of the left side: or, for PLAY, jammed into it and twisted."""
    centre = (-WIDTH / 2 - KEY_PROUD / 2 + 0.0005, (y0 + y1) / 2, (KEY_HEIGHT[0] + KEY_HEIGHT[1]) / 2)
    if name != 'play':
        return Matrix.Translation(centre)
    return Matrix.Translation((centre[0] + JAMMED_DEPTH, centre[1], centre[2])) @ Matrix.Rotation(JAMMED_TWIST_IN_RADIANS, 4, 'Z')


def build_keys():
    """The black keys down the left side, each a block standing out of a dark slot."""
    keys, slots = bmesh.new(), bmesh.new()
    for name, y0, y1 in KEYS:
        add_box(keys, (0, 0, 0), (KEY_PROUD + 0.001, y1 - y0, KEY_HEIGHT[1] - KEY_HEIGHT[0]),
                transform=key_transform(name, y0, y1))
    for y0, y1 in ((KEYS[0][1] - 0.001, KEYS[0][2] + 0.001), (KEYS[1][1] - 0.001, KEYS[-1][2] + 0.001)):
        add_box(slots, (-WIDTH / 2 - 0.0002, (y0 + y1) / 2, (KEY_HEIGHT[0] + KEY_HEIGHT[1]) / 2),
                (0.0008, y1 - y0, KEY_HEIGHT[1] - KEY_HEIGHT[0] + 0.002))
    return keys, slots


def build_door():
    """
    The cassette door: a plate with a window cut in it, built about its hinge
    -- its near edge -- so the object's origin is the hinge and it reaches
    toward +Y from there.
    """
    x0, x1, y0, y1, thickness = DOOR
    length = y1 - y0
    half = (x1 - x0) / 2
    tape_y = WELL_CENTRE[1] - y0
    wx0, wx1 = DOOR_WINDOW[0], DOOR_WINDOW[1]
    wy0, wy1 = tape_y + DOOR_WINDOW[2], tape_y + DOOR_WINDOW[3]
    bm = bmesh.new()
    z = thickness / 2
    for cx0, cx1, cy0, cy1 in ((-half, half, 0, wy0), (-half, half, wy1, length),
                               (-half, wx0, wy0, wy1), (wx1, half, wy0, wy1)):
        add_box(bm, ((cx0 + cx1) / 2, (cy0 + cy1) / 2, z), (cx1 - cx0, cy1 - cy0, thickness))
    return bm


def build_door_pane():
    x0, x1, y0, y1, thickness = DOOR
    tape_y = WELL_CENTRE[1] - y0
    bm = bmesh.new()
    add_box(bm, ((DOOR_WINDOW[0] + DOOR_WINDOW[1]) / 2, tape_y, thickness * 0.4),
            (DOOR_WINDOW[1] - DOOR_WINDOW[0], DOOR_WINDOW[3] - DOOR_WINDOW[2], 0.0008))
    return bm


def build_door_print():
    """
    What is printed on the door, in its own frame: the 0-50-100 scale of how
    much tape is left, ticked, beside the window, and the arrow the tape runs.
    """
    bm = bmesh.new()
    tape_y = WELL_CENTRE[1] - DOOR[2]
    z = DOOR[4] + 0.00005
    rail_x = DOOR_WINDOW[0] - 0.0035
    add_box(bm, (rail_x, tape_y, z), (0.0004, 0.05, 0.0001))
    for i in range(13):
        y = tape_y - 0.018 + i * 0.003
        add_box(bm, (rail_x + 0.0022, y, z), (0.0045, 0.00035, 0.0001))
    for y in (tape_y - 0.025, tape_y + 0.025):
        add_box(bm, (rail_x + 0.002, y, z), (0.004, 0.0004, 0.0001))
    # The arrow: a shaft and a head, pointing toward the near end.
    arrow_x = rail_x - 0.013
    add_box(bm, (arrow_x, tape_y + 0.006, z), (0.0016, 0.014, 0.0001))
    head = [bm.verts.new((arrow_x - 0.0035, tape_y - 0.001, z)), bm.verts.new((arrow_x, tape_y - 0.006, z)),
            bm.verts.new((arrow_x + 0.0035, tape_y - 0.001, z))]
    bm.faces.new(head)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return bm


def build_lamp():
    bm = bmesh.new()
    add_cylinder(bm, (*BATTERY_LAMP, TOP + 0.0005), 0.0018, 0.001, 'Z', 12)
    return bm


def build_crack():
    """The split across the near left corner where it hit the floor, over the face and down the side."""
    bm = bmesh.new()
    top = TOP + 0.0003
    cx, cy = -WIDTH / 2, NEAR_Y
    add_tube(bm, [(cx + 0.0, cy + 0.006, top), (cx + 0.006, cy + 0.01, top), (cx + 0.009, cy + 0.016, top),
                  (cx + 0.016, cy + 0.019, top), (cx + 0.019, cy + 0.027, top)], 0.0004, sides=4, samples_per_segment=1)
    add_tube(bm, [(cx - 0.0003, cy + 0.006, TOP), (cx - 0.0003, cy + 0.009, TOP - 0.009),
                  (cx - 0.0003, cy + 0.007, TOP - 0.016), (cx - 0.0003, cy + 0.012, TOP - 0.026)],
             0.0004, sides=4, samples_per_segment=1)
    return bm


def build_strap():
    """
    The wrist strap: a lug on the far right corner and a loop of black cord,
    fallen out flat on the floor beside the recorder.
    """
    lug, cord = bmesh.new(), bmesh.new()
    add_box(lug, STRAP_LUG, (0.006, 0.008, 0.006))
    lx, ly, lz = STRAP_LUG
    add_tube(cord, [(lx + 0.002, ly, lz), (lx + 0.012, ly + 0.004, 0.006), (lx + 0.04, ly + 0.012, 0.0025),
                    (lx + 0.085, ly + 0.0, 0.0025), (lx + 0.11, ly - 0.03, 0.0025), (lx + 0.1, ly - 0.06, 0.0025),
                    (lx + 0.07, ly - 0.055, 0.0025), (lx + 0.045, ly - 0.025, 0.0025), (lx + 0.02, ly - 0.006, 0.005),
                    (lx + 0.002, ly - 0.002, lz - 0.002)], 0.0024, sides=6, samples_per_segment=4)
    return lug, cord


def add_lettering(print_mat, digit_mat, door):
    top = TOP + 0.0002
    strip_mid = (STRIP_Y[0] + STRIP_Y[1]) / 2
    common.make_text_mesh('RecorderCounterDigits', '0 4 7', digit_mat, 0.0042, DIGIT_FONT,
                          location=((COUNTER[0] + COUNTER[1]) / 2, strip_mid, TOP - 0.0012))
    common.make_text_mesh('RecorderSpeedLabel', 'TAPE SPEED', print_mat, 0.0024, PRINT_FONT,
                          location=((SPEED_SWITCH[0] + SPEED_SWITCH[1]) / 2, STRIP_Y[0] - 0.0005, top))
    common.make_text_mesh('RecorderSpeedOff', 'OFF', print_mat, 0.0019, PRINT_FONT,
                          location=(SPEED_SWITCH[0] - 0.004, strip_mid + 0.0035, top))
    common.make_text_mesh('RecorderSpeedOn', 'ON', print_mat, 0.0019, PRINT_FONT,
                          location=(SPEED_SWITCH[1] + 0.0035, strip_mid + 0.0035, top))
    common.make_text_mesh('RecorderVolumeMinus', '-', print_mat, 0.003, PRINT_FONT,
                          location=(VOLUME_WHEEL[0] - 0.003, STRIP_Y[0] - 0.0005, top))
    common.make_text_mesh('RecorderVolumePlus', '+', print_mat, 0.003, PRINT_FONT,
                          location=(VOLUME_WHEEL[1] + 0.003, STRIP_Y[0] - 0.0005, top))
    common.make_text_mesh('RecorderModelMark', 'CASSETTE RECORDER', print_mat, 0.0028, PRINT_FONT,
                          location=(0.008, NEAR_Y + 0.016, top), align_x='LEFT')
    common.make_text_mesh('RecorderLampLabel', 'BATT', print_mat, 0.0017, PRINT_FONT,
                          location=(BATTERY_LAMP[0], BATTERY_LAMP[1] - 0.0045, top))
    # The scale's figures, printed on the door and riding on it.
    tape_y = WELL_CENTRE[1] - DOOR[2]
    for figure, offset in (('100', 0.0195), ('50', 0.0045), ('0', -0.0105)):
        obj = common.make_text_mesh(f'RecorderDoorScale{figure}', figure, print_mat, 0.0024, PRINT_FONT,
                                    location=(DOOR_WINDOW[0] - 0.0095, tape_y + offset, DOOR[4] + 0.0001),
                                    align_x='RIGHT')
        obj.parent = door


def build():
    common.clear_scene()
    body_mat = common.make_material('RecorderBody', CASE, roughness=0.42)
    inside_mat = common.make_material('RecorderInside', (0.02, 0.02, 0.022), roughness=0.85)
    door_mat = common.make_material('RecorderDoor', DOOR_BLACK, roughness=0.25)
    black_mat = common.make_material('RecorderKeys', KEY_CHARCOAL, roughness=0.6)
    slot_mat = common.make_material('RecorderSlots', (0.004, 0.004, 0.004), roughness=0.9)
    lamp_mat = common.make_material('RecorderBatteryLamp', (0.3, 0.02, 0.015), roughness=0.3)
    print_mat = common.make_material('RecorderPrint', PRINT, roughness=0.6)
    digit_mat = common.make_material('RecorderCounterDigits', (0.85, 0.85, 0.8), roughness=0.5)
    # On black plastic a split shows pale, where it whitened as it gave.
    crack_mat = common.make_material('RecorderCrack', (0.3, 0.3, 0.31), roughness=0.9)
    cord_mat = common.make_material('RecorderStrap', (0.01, 0.01, 0.011), roughness=0.85)
    pane_mat = common.make_material('RecorderDoorWindow', (0.2, 0.2, 0.21), roughness=0.06)
    bsdf = pane_mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Alpha'].default_value = 0.22
    if hasattr(pane_mat, 'surface_render_method'):
        pane_mat.surface_render_method = 'BLENDED'

    body = common.new_object('RecorderBody', build_body(), body_mat, uv_density=8)
    body.data.materials.append(inside_mat)
    bevel = body.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.0025
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'
    keys, slots = build_keys()
    parts = [
        common.new_object('RecorderControls', build_controls(), black_mat),
        common.new_object('RecorderSideVents', build_side_vents(), slot_mat),
        common.new_object('RecorderKeys', keys, black_mat),
        common.new_object('RecorderKeySlots', slots, slot_mat),
        common.new_object('RecorderBatteryLamp', build_lamp(), lamp_mat),
        common.new_object('RecorderCrack', build_crack(), crack_mat),
    ]
    for part in parts:
        part.parent = body

    door = common.new_object('CassetteDoor', build_door(), door_mat)
    door.location = ((DOOR[0] + DOOR[1]) / 2, DOOR[2], TOP + 0.0002)
    door.parent = body
    # Built in the door's own frame, so they ride on the door as it lifts.
    for name, bm, mat in (('CassetteDoorWindow', build_door_pane(), pane_mat),
                          ('CassetteDoorPrint', build_door_print(), print_mat)):
        common.new_object(name, bm, mat).parent = door

    lug, cord = build_strap()
    common.new_object('RecorderStrapLug', lug, black_mat).parent = body
    common.new_object('RecorderStrap', cord, cord_mat)

    add_lettering(print_mat, digit_mat, door)
    # The lettering on the case rides with it.
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith('Recorder') and obj.type == 'MESH' and obj.parent is None \
                and obj is not body and obj.name != 'RecorderStrap':
            obj.parent = body

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'cassette_recorder.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
