"""
Generates crt_monitor.glb: the beige CRT on the basement lab's CCTV desk,
after four reference photos -- a square bezel with the picture set into a
sloped recess, a deeper chin carrying the controls, a seam where the bezel
meets the casing, a back that tapers in two steps to the tube's neck, arcs
of vent holes down both sides, and a round swivel stand.

Three things are NOT in this file, because the level drives them:

  * The picture. The screen is the level's static/feed shader on a curved
    plane, placed over the dark `CrtTubeBlack` face at the back of the recess.
  * The power button and its LED, which glow green when the monitor is on.
    They sit on the `CrtTrim` ring at the right of the chin.
  * The click targets. Interaction raycasts non-recursively, so nothing
    inside a loaded .glb can be hit.

The level's CRT_* constants mirror the screen and button positions below.

The vent holes are a texture, not geometry: the side faces carry their own
0..1 UVs across the whole casing, and the level paints the arcs of dots on
with a canvas (createCrtVentTexture). The cooling slots on top of the casing
work the same way, on the top face of its middle step (CrtTopVents). Over a
thousand real holes would cost more than the rest of the monitor put
together.

The back carries the three sockets the level's cables plug into -- power,
video and the remote -- at the CRT_PORTS positions the level mirrors.

Axes: built facing Blender -Y, origin at the centre of the stand's underside
-- the point that sits on the desk. The glTF Y-up conversion turns that into
a model facing +Z, standing on y = 0.

Run headless: blender --background --python blender/build_crt_monitor.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

PLASTIC = (0.62, 0.58, 0.47)    # aged beige; the level reads this back to tint the vent texture
TRIM = (0.5, 0.47, 0.38)        # the stand and the buttons, a shade darker
TUBE_BLACK = (0.012, 0.014, 0.013)
PORT_BLACK = (0.03, 0.03, 0.03)

STAND_H = 0.03                  # the casing's underside sits this far above the desk
BODY_W, BODY_H = 0.46, 0.39
FRONT_Y = -0.18

# The picture opening in the bezel, and the back of the recess it slopes into.
# Borders: 4.4 cm at the sides, 3.5 cm on top, a 7.3 cm chin for the controls.
OPENING = (0.372, 0.282)
OPENING_BOTTOM = STAND_H + 0.073
RECESS_DEPTH = 0.022
SCREEN = (0.36, 0.27)

BEZEL_DEPTH = 0.055
CHIN_Z = STAND_H + 0.036
POWER_BUTTON_X = 0.17

# The back panel, and the sockets on it: (x, height above the desk).
BACK_Y = 0.215
PORT_POWER = (0.06, 0.13)
PORT_VIDEO = (-0.06, 0.15)
PORT_REMOTE = (0.0, 0.12)


def rect(y, half_w, z_bottom, z_top):
    """Four corners in the X/Z plane at depth y: BL, BR, TR, TL seen from the front."""
    return [(-half_w, y, z_bottom), (half_w, y, z_bottom), (half_w, y, z_top), (-half_w, y, z_top)]


def build_shell():
    """
    The casing as one closed mesh, ring by ring from the front of the bezel
    to the back of the tube, so its normals can be made consistent in one go.
    Material slots: 0 plastic, 1 side vents, 2 the black behind the picture,
    3 the slotted top of the casing's middle step.
    """
    bm = bmesh.new()
    opening_top = OPENING_BOTTOM + OPENING[1]
    screen_bottom = OPENING_BOTTOM + (OPENING[1] - SCREEN[1]) / 2
    top = STAND_H + BODY_H

    rings_spec = {
        'front': rect(FRONT_Y, BODY_W / 2, STAND_H, top),
        'opening': rect(FRONT_Y, OPENING[0] / 2, OPENING_BOTTOM, opening_top),
        'recess': rect(FRONT_Y + RECESS_DEPTH, SCREEN[0] / 2, screen_bottom, screen_bottom + SCREEN[1]),
        'bezel_back': rect(FRONT_Y + BEZEL_DEPTH, BODY_W / 2, STAND_H, top),
        'groove': rect(FRONT_Y + BEZEL_DEPTH + 0.002, BODY_W / 2 - 0.006, STAND_H + 0.006, top - 0.006),
        'case_front': rect(FRONT_Y + BEZEL_DEPTH + 0.007, BODY_W / 2 - 0.004, STAND_H + 0.004, top - 0.004),
        # Three steps back to the neck, each falling away faster than the
        # last, so the casing curves off behind the bezel the way the
        # photographed ones do rather than tapering in one straight wedge.
        # The underside stays flat until it is past the stand, so the casing
        # sits down on the swivel instead of floating over it.
        'middle': rect(0.0, 0.205, STAND_H, top - 0.04),
        'shoulder': rect(0.11, 0.168, STAND_H + 0.006, top - 0.115),
        'back': rect(BACK_Y, 0.118, STAND_H + 0.035, STAND_H + 0.2),
    }
    rings = {k: [bm.verts.new(c) for c in v] for k, v in rings_spec.items()}

    def bridge(a, b, mats=(0, 0, 0, 0)):
        """Quads between two rings; mats per side: bottom, right, top, left."""
        for i in range(4):
            j = (i + 1) % 4
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = mats[i]

    bridge(rings['front'], rings['opening'])
    bridge(rings['opening'], rings['recess'])
    bm.faces.new(rings['recess']).material_index = 2
    bridge(rings['front'], rings['bezel_back'])
    bridge(rings['bezel_back'], rings['groove'])
    bridge(rings['groove'], rings['case_front'])
    vents = (0, 1, 0, 1)
    bridge(rings['case_front'], rings['middle'], vents)
    bridge(rings['middle'], rings['shoulder'], (0, 1, 3, 1))
    bridge(rings['shoulder'], rings['back'], vents)
    bm.faces.new(list(reversed(rings['back'])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # UVs: the vent faces get 0..1 across the whole casing so one texture
    # spans both of its steps; everything else is box projected as usual.
    uv = bm.loops.layers.uv.verify()
    case_y0 = rings_spec['case_front'][0][1]
    case_y1 = rings_spec['back'][0][1]
    for f in bm.faces:
        n = f.normal
        for loop in f.loops:
            co = loop.vert.co
            if f.material_index == 1:
                loop[uv].uv = ((co.y - case_y0) / (case_y1 - case_y0), (co.z - STAND_H) / BODY_H)
            elif f.material_index == 3:
                # 0..1 across the slotted panel, so the slots land on it whole.
                half_w = rings_spec['middle'][1][0]
                y0, y1 = rings_spec['middle'][0][1], rings_spec['shoulder'][0][1]
                loop[uv].uv = ((co.x + half_w) / (2 * half_w), (co.y - y0) / (y1 - y0))
            elif abs(n.z) >= abs(n.x) and abs(n.z) >= abs(n.y):
                loop[uv].uv = (co.x * 2.2, co.y * 2.2)
            elif abs(n.y) >= abs(n.x):
                loop[uv].uv = (co.x * 2.2, co.z * 2.2)
            else:
                loop[uv].uv = (co.y * 2.2, co.z * 2.2)
    return bm


def build_trim():
    bm = bmesh.new()
    # The swivel: a broad oval neck under the middle of the casing on an oval
    # foot. It runs 2 cm up INTO the casing, so where the underside lifts
    # toward the back there is still no daylight between the two.
    neck_bottom, neck_top = 0.012, STAND_H + 0.02
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=24, radius1=0.11, radius2=0.1,
        depth=neck_top - neck_bottom,
        matrix=Matrix.Translation((0, 0.01, (neck_bottom + neck_top) / 2)) @ Matrix.Diagonal((1.0, 0.8, 1.0, 1.0))
    )
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=32, radius1=0.15, radius2=0.14, depth=0.012,
        matrix=Matrix.Translation((0, 0.0, 0.006)) @ Matrix.Diagonal((1.0, 0.85, 1.0, 1.0))
    )
    # The chin: a rocker and two round buttons in the middle, as on the
    # photographed monitors, and the recessed ring the power button sits in.
    add_box(bm, (0, FRONT_Y - 0.0025, CHIN_Z), (0.032, 0.005, 0.009))
    for x in (-0.027, 0.027):
        add_cylinder(bm, (x, FRONT_Y - 0.002, CHIN_Z), 0.0045, 0.004, 'Y', 12)
    add_cylinder(bm, (POWER_BUTTON_X, FRONT_Y - 0.0012, CHIN_Z), 0.014, 0.0024, 'Y', 24)
    return bm


def build_ports():
    """The power inlet, the video socket and the remote's socket on the back."""
    bm = bmesh.new()
    add_box(bm, (PORT_POWER[0], BACK_Y + 0.003, PORT_POWER[1]), (0.028, 0.006, 0.02))
    add_cylinder(bm, (PORT_VIDEO[0], BACK_Y + 0.006, PORT_VIDEO[1]), 0.0065, 0.012, 'Y', 12)
    add_cylinder(bm, (PORT_REMOTE[0], BACK_Y + 0.004, PORT_REMOTE[1]), 0.0045, 0.008, 'Y', 10)
    return bm


def build():
    common.clear_scene()
    plastic = common.make_material('CrtPlastic', PLASTIC, roughness=0.55)
    vents = common.make_material('CrtVents', PLASTIC, roughness=0.6)
    tube = common.make_material('CrtTubeBlack', TUBE_BLACK, roughness=0.3)
    trim = common.make_material('CrtTrim', TRIM, roughness=0.5)
    top_vents = common.make_material('CrtTopVents', PLASTIC, roughness=0.6)
    ports = common.make_material('CrtPorts', PORT_BLACK, roughness=0.5)

    shell_bm = build_shell()
    mesh = bpy.data.meshes.new('CrtShell_mesh')
    shell_bm.to_mesh(mesh)
    shell_bm.free()
    shell = bpy.data.objects.new('CrtShell', mesh)
    bpy.context.collection.objects.link(shell)
    for mat in (plastic, vents, tube, top_vents):
        shell.data.materials.append(mat)
    bevel = shell.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.004
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'

    trim_obj = common.new_object('CrtTrim', build_trim(), trim)
    for p in trim_obj.data.polygons:
        p.use_smooth = True
    common.new_object('CrtPorts', build_ports(), ports)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'crt_monitor.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
