"""
Generates camcorder.glb: the shoulder camcorder that filmed Session 14 and
was knocked off the restraint table with it, after reference photos of a Sony
CCD-V8 -- the first Video8 camcorder, which is right for January 1987.

The shape, front to back: a long lens with a flared hood, a stubby block it
mounts on, and the main body behind, with a foam-covered microphone over the
lens, the viewfinder tube on top toward the left with its rubber eyecup at
the back, and a carrying handle over the rear half.

THE RIGHT-HAND SIDE is the one that matters, because the level lays the
camera on its LEFT side and this is what faces up: the hand strap toward the
front, the format's rainbow decal, and the cassette door with a smoked window
onto the tape inside. The rear panel carries the deck controls -- a counter,
the transport buttons and a red record button.

It fell: the front element of the lens is cracked and the viewfinder has been
knocked crooked on its mount.

No maker's name on it, on purpose: only the format's own marks.

Two things are NOT in this file:
  * the tape. The level puts a copy of video8_cassette.glb in the cassette
    well (WELL_CENTRE below, mirrored as CAMCORDER.wellCentre), so the tape the
    player takes out is the same object they then carry.
  * the click targets. Interaction raycasts non-recursively.

CassetteDoor is a separate object with its origin on its hinge, along its
bottom edge, so the level only has to turn it about that edge to open it.

Axes: built facing Blender -Y (the lens), origin at the centre of the main
body's underside. The glTF Y-up conversion turns that into a model facing +Z,
standing on y = 0, with its right-hand side toward +X.

Run headless: blender --background --python blender/build_camcorder.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from common import add_box, add_cylinder, add_lathe  # noqa: E402

# The main body: x across (+X is the camera's right), y front (-) to back, z up.
BODY_HALF_WIDTH = 0.0575
BODY_FRONT_Y = -0.06
BODY_BACK_Y = 0.2
BODY_HEIGHT = 0.15

# The block the lens mounts on, in front of the body's lower half.
LENS_BLOCK = {'half_width': 0.05, 'front_y': -0.115, 'bottom': 0.006, 'top': 0.11}
LENS_AXIS_Z = 0.058
# How finely the lens barrel is turned, and how many ribs its zoom ring has.
LENS_SEGMENTS = 28
LENS_RIBS = 12

# The cassette well in the right-hand side, and the door over it.
WELL = {'y0': 0.082, 'y1': 0.19, 'z0': 0.028, 'z1': 0.112, 'depth': 0.019}
WELL_CENTRE = (BODY_HALF_WIDTH - 0.0095, (WELL['y0'] + WELL['y1']) / 2, (WELL['z0'] + WELL['z1']) / 2)
DOOR = {'y0': 0.076, 'y1': 0.196, 'z0': 0.022, 'z1': 0.118, 'thickness': 0.003}
DOOR_HINGE = (BODY_HALF_WIDTH + DOOR['thickness'] / 2, (DOOR['y0'] + DOOR['y1']) / 2, DOOR['z0'])
# The window in the door, inset from its edges: across, then up.
DOOR_WINDOW_INSET = (0.022, 0.03)

# The viewfinder's mount on top of the body, which it was knocked crooked about:
# tipped toward the left, twisted a little toward the handle, its eyecup end
# lifted. Small on purpose -- any more twist and the eyecup goes through the
# handle's front post, any more tip and it goes into the top of the body.
VIEWFINDER_MOUNT = (-0.03, -0.03, BODY_HEIGHT)
VIEWFINDER_KNOCK = (math.radians(4), math.radians(-9), math.radians(-6))
# The carrying handle's posts stand this far right of the middle, clear of the
# knocked viewfinder.
HANDLE_X = 0.022

PLASTIC = (0.02, 0.02, 0.022)
RUBBER = (0.008, 0.008, 0.008)
TRIM = (0.05, 0.05, 0.053)
PRINT = (0.74, 0.75, 0.78)
# The format's rainbow, top stripe first, after the decal on the reference camera.
RAINBOW = ((0.93, 0.75, 0.1), (0.93, 0.45, 0.08), (0.85, 0.12, 0.1), (0.62, 0.1, 0.45), (0.18, 0.25, 0.7))

FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
PRINT_FONT = os.path.join(FONTS, 'arial.ttf')
LOGO_FONT = os.path.join(FONTS, 'arialbi.ttf')
# Lettering on the right-hand side stands in the YZ plane facing +X, reading
# front to back -- the way the camera's own decals do.
ON_RIGHT_SIDE = (math.pi / 2, 0, math.pi / 2)
ON_FRONT = (math.pi / 2, 0, 0)


def right_side_faces(bm, y0, y1, z0, z1):
    """The right-hand faces inside one rectangle, once the box has been cut along its edges."""
    return [
        f for f in bm.faces
        if f.normal.x > 0.9 and abs(f.calc_center_median().x - BODY_HALF_WIDTH) < 1e-6
        and y0 < f.calc_center_median().y < y1 and z0 < f.calc_center_median().z < z1
    ]


def build_body():
    """
    The main body as one box with the cassette well pushed into its right-hand
    side. The well's walls and floor are material slot 1, the dark inside.
    """
    bm = bmesh.new()
    add_box(bm, (0, (BODY_FRONT_Y + BODY_BACK_Y) / 2, BODY_HEIGHT / 2),
            (BODY_HALF_WIDTH * 2, BODY_BACK_Y - BODY_FRONT_Y, BODY_HEIGHT))
    y0, y1, z0, z1 = WELL['y0'], WELL['y1'], WELL['z0'], WELL['z1']
    for co, no in (((0, y0, 0), (0, 1, 0)), ((0, y1, 0), (0, 1, 0)),
                   ((0, 0, z0), (0, 0, 1)), ((0, 0, z1), (0, 0, 1))):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    faces = right_side_faces(bm, y0, y1, z0, z1)
    extruded = bmesh.ops.extrude_face_region(bm, geom=faces)
    for face in (g for g in extruded['geom'] if isinstance(g, bmesh.types.BMFace)):
        face.material_index = 1
    verts = [g for g in extruded['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=verts, vec=(-WELL['depth'], 0, 0))
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_lens_block():
    bm = bmesh.new()
    b = LENS_BLOCK
    add_box(bm, (0, (b['front_y'] + BODY_FRONT_Y) / 2 - 0.001, (b['bottom'] + b['top']) / 2),
            (b['half_width'] * 2, BODY_FRONT_Y - b['front_y'] + 0.002, b['top'] - b['bottom']))
    return bm


def lens_transform(bm, verts, start_y):
    """Turns a lathe built up the Z axis to point forward along -Y, starting at `start_y`."""
    bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, verts=verts, vec=(0, start_y, LENS_AXIS_Z))


def build_lens():
    """
    The barrel, as one lathe from the mount forward: a plain collar, a ribbed
    zoom ring, the focus scale, and the hood flaring out round the front
    element. Distances are forward of the lens block's face.
    """
    bm = bmesh.new()
    profile = [(0.0, 0.0), (0.036, 0.0), (0.036, 0.018)]
    # The zoom ring's ribs: shallow grooves, the costliest part of the camera
    # in triangles, so only as many as still read as ribbed.
    rib_start, rib_pitch = 0.02, 0.0028
    for i in range(LENS_RIBS):
        z = rib_start + i * rib_pitch
        profile += [(0.0338, z), (0.0352, z + rib_pitch * 0.3), (0.0352, z + rib_pitch * 0.7), (0.0338, z + rib_pitch)]
    focus_start = rib_start + LENS_RIBS * rib_pitch + 0.002
    profile += [(0.0345, focus_start), (0.0345, focus_start + 0.02), (0.036, focus_start + 0.021),
                (0.04, focus_start + 0.03), (0.0425, focus_start + 0.05), (0.0405, focus_start + 0.051),
                (0.034, focus_start + 0.04), (0.0, focus_start + 0.04)]
    before = set(bm.verts)
    add_lathe(bm, profile, segments=LENS_SEGMENTS)
    lens_transform(bm, [v for v in bm.verts if v not in before], LENS_BLOCK['front_y'])
    return bm, focus_start + 0.04


def build_glass(glass_distance):
    """The front element, set back inside the hood."""
    bm = bmesh.new()
    add_cylinder(bm, (0, LENS_BLOCK['front_y'] - glass_distance - 0.0006, LENS_AXIS_Z), 0.0335, 0.001, 'Y', 40)
    return bm


def build_cracks(glass_distance):
    """
    The fracture in the front element: lines from a point off-centre where it
    hit the floor, and a ring of them round it. Pale, because fractured glass
    catches light white -- dark lines vanished against the dark glass.
    """
    bm = bmesh.new()
    face_y = LENS_BLOCK['front_y'] - glass_distance - 0.0013
    impact = Vector((0.011, 0.0, LENS_AXIS_Z + 0.008))
    spokes = ((0.2, 0.024), (1.1, 0.03), (1.9, 0.019), (2.6, 0.033), (3.4, 0.026), (4.3, 0.022), (5.3, 0.028))
    for angle, length in spokes:
        direction = Vector((math.cos(angle), 0, math.sin(angle)))
        end = impact + direction * length
        # Clipped to the glass, so no crack runs off it into the hood.
        offset = end - Vector((0, 0, LENS_AXIS_Z))
        offset.y = 0
        if offset.length > 0.032:
            end = Vector((0, 0, LENS_AXIS_Z)) + offset.normalized() * 0.032
        mid = (impact + end) / 2
        mid += Vector((-direction.z, 0, direction.x)) * 0.0025
        for a, b in ((impact, mid), (mid, end)):
            seg = b - a
            centre = (a + b) / 2
            add_box(bm, (centre.x, face_y, centre.z), (seg.length, 0.0002, 0.00045),
                    transform=Matrix.Translation((centre.x, face_y, centre.z))
                    @ Matrix.Rotation(-math.atan2(seg.z, seg.x), 4, 'Y')
                    @ Matrix.Translation((-centre.x, -face_y, -centre.z)))
    for i in range(9):
        a0, a1 = i * 2 * math.pi / 9, (i + 0.8) * 2 * math.pi / 9
        p0 = impact + Vector((math.cos(a0), 0, math.sin(a0))) * 0.006
        p1 = impact + Vector((math.cos(a1), 0, math.sin(a1))) * 0.0065
        seg, centre = p1 - p0, (p0 + p1) / 2
        add_box(bm, (centre.x, face_y, centre.z), (seg.length, 0.0002, 0.0004),
                transform=Matrix.Translation((centre.x, face_y, centre.z))
                @ Matrix.Rotation(-math.atan2(seg.z, seg.x), 4, 'Y')
                @ Matrix.Translation((-centre.x, -face_y, -centre.z)))
    return bm


def build_microphone():
    """The microphone over the lens: a short body on a bracket, and the foam over its tip."""
    body, foam = bmesh.new(), bmesh.new()
    x, z = -0.012, 0.128
    add_box(body, (x, BODY_FRONT_Y - 0.012, z - 0.012), (0.018, 0.024, 0.016))
    add_cylinder(body, (x, BODY_FRONT_Y - 0.04, z), 0.0105, 0.05, 'Y', 20)
    add_cylinder(foam, (x, BODY_FRONT_Y - 0.092, z), 0.0165, 0.06, 'Y', 20)
    return body, foam


def build_viewfinder():
    """
    The viewfinder: a rounded tube along the top toward the left, standing on a
    post, with its eyecup at the back. Built around its mount, which is the
    object's origin, so the knock it took is one rotation.
    """
    tube, cup = bmesh.new(), bmesh.new()
    add_box(tube, (0, 0, 0.012), (0.026, 0.03, 0.024))
    add_box(tube, (0, 0.045, 0.048), (0.046, 0.17, 0.05))
    add_box(cup, (0, 0.144, 0.044), (0.054, 0.034, 0.058))
    add_box(cup, (0, 0.165, 0.041), (0.046, 0.012, 0.05))
    return tube, cup


def build_handle():
    """The carrying handle over the back half: two posts and a bar."""
    bm = bmesh.new()
    x = HANDLE_X
    for y in (0.07, 0.185):
        add_box(bm, (x, y, BODY_HEIGHT + 0.035), (0.03, 0.018, 0.07))
    add_box(bm, (x, 0.1275, BODY_HEIGHT + 0.074), (0.032, 0.135, 0.02))
    return bm


def build_strap():
    """The padded hand strap down the right-hand side, toward the front."""
    bm = bmesh.new()
    x = BODY_HALF_WIDTH
    add_box(bm, (x + 0.004, -0.05, 0.075), (0.008, 0.016, 0.07))
    add_box(bm, (x + 0.004, 0.03, 0.075), (0.008, 0.016, 0.07))
    add_box(bm, (x + 0.014, -0.01, 0.075), (0.012, 0.075, 0.058))
    return bm


def build_door():
    """
    The cassette door as a frame round a window, so the tape shows through.
    Built about its own hinge -- the object's origin -- and moved onto it.
    """
    frame = bmesh.new()
    t = DOOR['thickness']
    length = DOOR['y1'] - DOOR['y0']
    height = DOOR['z1'] - DOOR['z0']
    inset_y, inset_z = DOOR_WINDOW_INSET
    add_box(frame, (0, 0, inset_z / 2), (t, length, inset_z))
    add_box(frame, (0, 0, height - inset_z / 2), (t, length, inset_z))
    add_box(frame, (0, -length / 2 + inset_y / 2, height / 2), (t, inset_y, height - 2 * inset_z))
    add_box(frame, (0, length / 2 - inset_y / 2, height / 2), (t, inset_y, height - 2 * inset_z))
    # A ridged thumb-catch along the top edge.
    add_box(frame, (t / 2 + 0.0008, 0, height - 0.006), (0.0016, 0.03, 0.004))
    pane = bmesh.new()
    add_box(pane, (0, 0, height / 2), (t * 0.5, length - 2 * inset_y + 0.002, height - 2 * inset_z + 0.002))
    return frame, pane


def build_rear_panel():
    """The deck controls on the back: a counter window, five buttons, record and pause."""
    panel, counter, buttons, record, pause = (bmesh.new() for _ in range(5))
    back = BODY_BACK_Y
    add_box(panel, (0, back + 0.001, 0.075), (0.098, 0.002, 0.11))
    add_box(counter, (-0.012, back + 0.0025, 0.112), (0.05, 0.002, 0.016))
    for i in range(5):
        add_box(buttons, (-0.034 + i * 0.016, back + 0.004, 0.06), (0.012, 0.005, 0.008))
    add_box(record, (0.033, back + 0.004, 0.096), (0.012, 0.005, 0.01))
    add_box(pause, (0.033, back + 0.004, 0.06), (0.012, 0.005, 0.008))
    return panel, counter, buttons, record, pause


def build_rainbow():
    """The format's decal on the right-hand side: five diagonal stripes, top first."""
    stripes = []
    x = BODY_HALF_WIDTH + 0.0003
    for i, _ in enumerate(RAINBOW):
        bm = bmesh.new()
        y, z = 0.05 + i * 0.0035, 0.104 - i * 0.0035
        add_box(bm, (x, y, z), (0.0004, 0.006, 0.05),
                transform=Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(-38), 4, 'X')
                @ Matrix.Translation((-x, -y, -z)))
        stripes.append(bm)
    return stripes


def add_lettering(print_mat):
    side = BODY_HALF_WIDTH + 0.0004
    common.make_text_mesh('CamcorderSideMark', 'Video 8', print_mat, 0.009, LOGO_FONT,
                          location=(side, 0.135, 0.132), rotation=ON_RIGHT_SIDE)
    common.make_text_mesh('CamcorderDecalEight', '8', print_mat, 0.03, LOGO_FONT,
                          location=(side + 0.0006, 0.058, 0.077), rotation=ON_RIGHT_SIDE)
    common.make_text_mesh('CamcorderDecalAF', 'AF', print_mat, 0.008, LOGO_FONT,
                          location=(side + 0.0002, 0.07, 0.11), rotation=ON_RIGHT_SIDE)
    common.make_text_mesh('CamcorderBadge', 'CCD', print_mat, 0.007, LOGO_FONT,
                          location=(0.03, BODY_FRONT_Y - 0.0004, 0.126), rotation=ON_FRONT)


def build_badge_dots():
    """The red, green and blue dots over the CCD badge on the front."""
    dots = []
    for i, _ in enumerate(('r', 'g', 'b')):
        bm = bmesh.new()
        add_cylinder(bm, (0.024 + i * 0.006, BODY_FRONT_Y - 0.0004, 0.136), 0.0022, 0.0006, 'Y', 12)
        dots.append(bm)
    return dots


def build():
    common.clear_scene()
    plastic = common.make_material('CamcorderBody', PLASTIC, roughness=0.42)
    inside = common.make_material('CamcorderInside', (0.004, 0.004, 0.004), roughness=0.85)
    rubber = common.make_material('CamcorderRubber', RUBBER, roughness=0.9)
    trim = common.make_material('CamcorderTrim', TRIM, roughness=0.5)
    lens_mat = common.make_material('CamcorderLensBarrel', (0.012, 0.012, 0.013), roughness=0.38)
    glass = common.make_material('CamcorderLensGlass', (0.02, 0.025, 0.035), roughness=0.04)
    crack = common.make_material('CamcorderLensCrack', (0.62, 0.64, 0.66), roughness=0.3)
    foam = common.make_material('CamcorderFoam', (0.018, 0.018, 0.018), roughness=1.0)
    print_mat = common.make_material('CamcorderPrint', PRINT, roughness=0.5)
    pane_mat = common.make_material('CamcorderDoorWindow', (0.08, 0.08, 0.09), roughness=0.08)
    bsdf = pane_mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Alpha'].default_value = 0.3
    if hasattr(pane_mat, 'surface_render_method'):
        pane_mat.surface_render_method = 'BLENDED'
    else:
        pane_mat.blend_method = 'BLEND'

    body = common.new_object('CamcorderBody', build_body(), plastic, uv_density=8)
    body.data.materials.append(inside)
    bevel = body.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.005
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    block = common.new_object('CamcorderLensBlock', build_lens_block(), plastic)
    block_bevel = block.modifiers.new('Bevel', type='BEVEL')
    block_bevel.width = 0.004
    block_bevel.segments = 2

    lens_bm, glass_distance = build_lens()
    lens = common.new_object('CamcorderLens', lens_bm, lens_mat)
    for p in lens.data.polygons:
        p.use_smooth = True
    common.new_object('CamcorderLensGlass', build_glass(glass_distance), glass)
    common.new_object('CamcorderLensCracks', build_cracks(glass_distance), crack)

    mic_body, mic_foam = build_microphone()
    common.new_object('CamcorderMicrophone', mic_body, trim)
    foam_obj = common.new_object('CamcorderMicFoam', mic_foam, foam)
    for p in foam_obj.data.polygons:
        p.use_smooth = True

    tube_bm, cup_bm = build_viewfinder()
    tube = common.new_object('CamcorderViewfinder', tube_bm, plastic)
    tube_bevel = tube.modifiers.new('Bevel', type='BEVEL')
    tube_bevel.width = 0.006
    tube_bevel.segments = 3
    cup = common.new_object('CamcorderEyecup', cup_bm, rubber)
    cup_bevel = cup.modifiers.new('Bevel', type='BEVEL')
    cup_bevel.width = 0.006
    cup_bevel.segments = 2
    cup.parent = tube
    tube.location = VIEWFINDER_MOUNT
    tube.rotation_euler = VIEWFINDER_KNOCK

    handle = common.new_object('CamcorderHandle', build_handle(), plastic)
    handle_bevel = handle.modifiers.new('Bevel', type='BEVEL')
    handle_bevel.width = 0.004
    handle_bevel.segments = 2
    strap = common.new_object('CamcorderStrap', build_strap(), rubber)
    strap_bevel = strap.modifiers.new('Bevel', type='BEVEL')
    strap_bevel.width = 0.003
    strap_bevel.segments = 2

    frame_bm, pane_bm = build_door()
    door = common.new_object('CassetteDoor', frame_bm, trim)
    pane = common.new_object('CassetteDoorWindow', pane_bm, pane_mat)
    pane.parent = door
    door.location = DOOR_HINGE

    panel, counter, buttons, record, pause = build_rear_panel()
    common.new_object('CamcorderRearPanel', panel, trim)
    common.new_object('CamcorderCounter', counter, common.make_material('CamcorderCounterGlass', (0.05, 0.07, 0.05), roughness=0.1))
    common.new_object('CamcorderButtons', buttons, common.make_material('CamcorderButtonCaps', (0.06, 0.06, 0.065), roughness=0.5))
    common.new_object('CamcorderRecordButton', record, common.make_material('CamcorderRecordRed', (0.6, 0.03, 0.03), roughness=0.4))
    common.new_object('CamcorderPauseButton', pause, common.make_material('CamcorderPauseOrange', (0.85, 0.35, 0.05), roughness=0.4))

    for i, (bm, colour) in enumerate(zip(build_rainbow(), RAINBOW)):
        common.new_object(f'CamcorderRainbow{i}', bm, common.make_material(f'CamcorderRainbow{i}', colour, roughness=0.45))
    for bm, (name, colour) in zip(build_badge_dots(), (('Red', (0.8, 0.05, 0.05)), ('Green', (0.1, 0.6, 0.15)), ('Blue', (0.1, 0.2, 0.8)))):
        common.new_object(f'CamcorderBadge{name}', bm, common.make_material(f'CamcorderBadge{name}', colour, roughness=0.4))
    add_lettering(print_mat)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'camcorder.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
