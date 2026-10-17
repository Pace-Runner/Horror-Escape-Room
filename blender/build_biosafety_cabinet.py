"""
Generates biosafety_cabinet.glb: the cell culture workstation against the
east wall of the Level 2 basement lab, in the place the middle shelving unit
used to stand.

After the user's references: a Class II biological safety cabinet -- a white
and light-grey steel body with a deep blue fascia band and blue accents down
its front edges, a glass sash raised part way, a stainless interior with
perforated grilles front, back and overhead and a light panel in the ceiling,
a control panel on the fascia, and a lower cabinet with louvred access doors
and dark blue trim, on levelling feet.

On the tray, the work someone walked away from: a jar of serological
pipettes, glass droppers, media bottles and reagent bottles -- one knocked
over into a dried spill -- culture flasks, a six-well plate, a tube rack, and
petri dishes in stacks and on their own. The medium in most of them is still
phenol-red pink; a couple have gone yellow, and one has grown something dark.

What is NOT in here, because the level drives it:
  * the light itself, and the three buttons -- light, air flow, incubation
    heat: the light panel (HoodLamp), the display (HoodLcd) and each button's
    indicator (HoodLedLight, HoodLedAirflow, HoodLedHeat) are their own
    materials so the level can light them;
  * the buttons' click targets -- Interaction raycasts non-recursively, so
    nothing inside a loaded .glb can be hit;
  * the textures. HoodPaint, HoodPaintGrey, HoodBlue and HoodDarkBlue take the
    lab's white-rust photo tinted, HoodSteel the bare-steel set; the glass and
    clear plastics are replaced.

Every part sharing a material is built into one mesh -- one draw call each.

Axes: standing on the origin at the middle of its footprint, its back on
y = BACK_Y against the wall and its open front toward Blender -Y (glTF +Z).
The level's BIOSAFETY_CABINET constants mirror HALF_W, DEPTH, WORK_Z, LAMP,
BUTTONS, BUTTON_Z and BAND_FRONT_Y.

Run headless: blender --background --python blender/build_biosafety_cabinet.py
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from common import add_band, add_blob, add_box, add_cylinder, add_lathe  # noqa: E402

# The body. Its top, with the exhaust collar on it, comes to OVERALL_H: the
# height of the shelving either side of it, so the three line up along the wall.
HALF_W = 0.70
FRONT_Y = -0.40
BACK_Y = 0.40
DEPTH = BACK_Y - FRONT_Y
OVERALL_H = 1.83
COLLAR_H = 0.05
TOP_Z = OVERALL_H - COLLAR_H
SIDE_T = 0.06
BODY_BOTTOM = 0.72                      # where the body sits on the lower cabinet

# The lower cabinet, set in a little from the body, on levelling feet.
BASE_HALF_W = 0.68
BASE_FRONT_Y = -0.37
BASE_BACK_Y = 0.38
FEET_H = 0.05

# The work zone.
WORK_Z = 0.86                           # the top of the stainless tray
INNER_HALF_W = HALF_W - SIDE_T - 0.01   # the side liners' faces
INNER_BACK_Y = 0.30                     # the rear liner's face
CEILING_Z = 1.48
FASCIA_BOTTOM = 1.40
FASCIA_BACK_Y = -0.30
TRAY_FRONT_Y = -0.25                    # in front of it, the perforated intake strip

# The sash: glass in a frame, slid up into the fascia and left part open.
SASH_Y = -0.35
SASH_BOTTOM = 1.06

# The blue band across the fascia, and the controls on it at eye level: the
# player's eye is 1.6 m up.
BAND_Z = (1.50, 1.70)
BAND_FRONT_Y = -0.418
CONTROLS_Z = 1.60
# Three buttons, left to right -- the light, the air flow, the incubation heat
# -- each with an indicator over it that the level lights green while that
# function runs. Each is its own material so the level can light it alone.
BUTTONS = (('HoodLedLight', 0.30), ('HoodLedAirflow', 0.375), ('HoodLedHeat', 0.45))
BUTTON_R = 0.0125
BUTTON_Z = CONTROLS_Z - 0.005
LED_Z = CONTROLS_Z + 0.032

# The light panel under the front of the ceiling, facing down onto the tray,
# just behind the bottom edge of the fascia so it lights the tray and not the
# player's eyes.
LAMP = {'centre': (0.0, -0.23, FASCIA_BOTTOM + 0.009), 'half_w': 0.56, 'half_d': 0.052}

# Labware.
DISH_R = 0.045                          # a 90 mm petri dish
DISH_H = 0.0135
WALL = 0.0012                           # moulded polystyrene
LID_R = DISH_R + 0.0018
LID_SKIRT = 0.0085

# Material name -> (colour, roughness, metallic, alpha or None). Alpha means blended.
MATERIALS = {
    'HoodPaint': ((0.82, 0.83, 0.80), 0.55, 0.1, None),
    'HoodPaintGrey': ((0.62, 0.64, 0.64), 0.55, 0.1, None),
    'HoodBlue': ((0.12, 0.26, 0.48), 0.45, 0.0, None),
    'HoodDarkBlue': ((0.05, 0.09, 0.18), 0.5, 0.0, None),
    'HoodSteel': ((0.62, 0.63, 0.63), 0.3, 0.8, None),
    'HoodSlot': ((0.012, 0.012, 0.012), 0.8, 0.0, None),
    'HoodRubber': ((0.04, 0.045, 0.05), 0.85, 0.0, None),
    'HoodLamp': ((0.95, 0.92, 0.82), 0.4, 0.0, None),
    'HoodLcd': ((0.02, 0.05, 0.05), 0.15, 0.0, None),
    'HoodButton': ((0.55, 0.57, 0.58), 0.5, 0.0, None),
    'HoodLedLight': ((0.03, 0.10, 0.04), 0.3, 0.0, None),
    'HoodLedAirflow': ((0.03, 0.10, 0.04), 0.3, 0.0, None),
    'HoodLedHeat': ((0.03, 0.10, 0.04), 0.3, 0.0, None),
    'HoodGlass': ((0.75, 0.85, 0.85), 0.05, 0.0, 0.15),
    'LabPlastic': ((0.85, 0.90, 0.95), 0.15, 0.0, 0.25),
    'LabGlass': ((0.75, 0.85, 0.85), 0.05, 0.0, 0.2),
    'LabMedium': ((0.70, 0.08, 0.16), 0.15, 0.0, None),         # phenol red: healthy medium
    'LabMediumSpent': ((0.80, 0.50, 0.12), 0.2, 0.0, None),     # gone yellow: acid, dead cells
    'LabMold': ((0.06, 0.08, 0.04), 0.9, 0.0, None),
    'LabReagent': ((0.80, 0.90, 0.95), 0.05, 0.0, 0.35),
    'LabAmber': ((0.45, 0.20, 0.03), 0.1, 0.0, 0.8),
    'LabRed': ((0.65, 0.05, 0.04), 0.5, 0.0, None),
    'LabBlue': ((0.06, 0.25, 0.65), 0.5, 0.0, None),
    'LabOrange': ((0.90, 0.42, 0.05), 0.5, 0.0, None),
    'LabYellow': ((0.95, 0.80, 0.08), 0.6, 0.0, None),
    'LabPaper': ((0.88, 0.87, 0.82), 0.9, 0.0, None),
    'LabStain': ((0.06, 0.03, 0.01), 0.4, 0.0, None),
}
# Rounded off by a Bevel modifier: the big painted panels.
BEVELLED = {'HoodPaint': 0.004, 'HoodPaintGrey': 0.004, 'HoodBlue': 0.008, 'HoodDarkBlue': 0.002}
# Shaded smooth, with their hard edges kept: the round things.
SMOOTHED = {'LabPlastic', 'LabGlass', 'LabMedium', 'LabMediumSpent', 'LabReagent', 'LabAmber',
            'LabRed', 'LabBlue', 'LabOrange', 'LabPaper', 'HoodRubber', 'HoodButton', 'HoodSteel'}

IDENTITY = Matrix.Identity(4)

# One bmesh per material; every part is built into the one its material names.
parts = {name: bmesh.new() for name in MATERIALS}


# ---------------------------------------------------------------------------
# Building blocks, each placed by an optional matrix
# ---------------------------------------------------------------------------

def built(bm, build):
    """Runs `build` and returns the verts it added to `bm`."""
    before = set(bm.verts)
    build()
    return [v for v in bm.verts if v not in before]


def box(material, centre, size, matrix=IDENTITY):
    add_box(parts[material], centre, size, transform=matrix)


def box_between(material, lo, hi, matrix=IDENTITY):
    """A box given by two opposite corners."""
    centre = tuple((a + b) / 2 for a, b in zip(lo, hi))
    size = tuple(abs(b - a) for a, b in zip(lo, hi))
    box(material, centre, size, matrix)


def cylinder(material, centre, radius, depth, axis='Z', segments=16, radius2=None, matrix=IDENTITY):
    add_cylinder(parts[material], centre, radius, depth, axis, segments, radius2=radius2, transform=matrix)


def faces_of(bm, verts):
    vset = set(verts)
    return [f for f in bm.faces if all(v in vset for v in f.verts)]


def lathe(material, profile, matrix=IDENTITY, segments=24):
    """
    A solid of revolution about the local Z axis, then placed by `matrix`.
    Its normals are set outward here, on its own faces only: a pass over a
    whole material would also turn the single-faced slots and stains, which
    have no inside to tell it which way is out.
    """
    bm = parts[material]
    verts = built(bm, lambda: add_lathe(bm, profile, segments=segments))
    bmesh.ops.transform(bm, matrix=matrix, verts=verts)
    bmesh.ops.recalc_face_normals(bm, faces=faces_of(bm, verts))


def band(material, inner_radius, outer_radius, width, matrix, arc=None, segments=10):
    """common.add_band, its normals set outward."""
    bm = parts[material]
    verts = built(bm, lambda: add_band(bm, inner_radius, outer_radius, width, segments=segments,
                                       transform=matrix, arc=arc))
    bmesh.ops.recalc_face_normals(bm, faces=faces_of(bm, verts))


def rounded_box(material, centre, size, radius, matrix=IDENTITY, segments=2):
    """A box with every edge rounded off, for moulded plastic."""
    bm = parts[material]

    def build():
        cube = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(centre) @ Matrix.Diagonal((*size, 1.0)))
        corners = set(cube['verts'])
        edges = [e for e in bm.edges if e.verts[0] in corners and e.verts[1] in corners]
        bmesh.ops.bevel(bm, geom=list(corners) + edges, offset=radius, segments=segments, profile=0.5,
                        affect='EDGES', clamp_overlap=True)

    bmesh.ops.transform(bm, matrix=matrix, verts=built(bm, build))


def blob(material, centre, radius, seed, stretch=(1.0, 1.0), wobble=0.6, points=16, matrix=IDENTITY):
    add_blob(parts[material], centre, radius, seed=seed, points=points, wobble=wobble, stretch=stretch, transform=matrix)


def quad(material, centre, half_u, half_v, facing):
    """
    One flat face -- a slot, a seam, a perforation -- facing along `facing`,
    one of '+X', '-X', '+Y', '-Y', '+Z', '-Z'. u runs along the first other
    axis and v along the second, in x, y, z order.
    """
    bm = parts[material]
    axis = 'XYZ'.index(facing[1])
    u_axis, v_axis = [a for a in range(3) if a != axis]
    corners = []
    for du, dv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        point = list(centre)
        point[u_axis] += du * half_u
        point[v_axis] += dv * half_v
        corners.append(bm.verts.new(point))
    face = bm.faces.new(corners)
    face.normal_update()
    wanted = Vector([1.0 if a == axis else 0.0 for a in range(3)]) * (1 if facing[0] == '+' else -1)
    if face.normal.dot(wanted) < 0:
        face.normal_flip()


def placed(x, y, z=WORK_Z, yaw=0.0):
    """Stands a piece of labware at (x, y) on the tray, turned by `yaw`."""
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z')


# ---------------------------------------------------------------------------
# The cabinet
# ---------------------------------------------------------------------------

def build_lower_cabinet():
    """The stand: a grey steel cabinet with two louvred access doors, dark blue trim, on four feet."""
    box_between('HoodPaintGrey', (-BASE_HALF_W, BASE_FRONT_Y, FEET_H), (BASE_HALF_W, BASE_BACK_Y, BODY_BOTTOM))
    proud = BASE_FRONT_Y - 0.007
    for z0, z1 in ((FEET_H, FEET_H + 0.06), (BODY_BOTTOM - 0.04, BODY_BOTTOM)):
        box_between('HoodDarkBlue', (-BASE_HALF_W - 0.002, proud, z0), (BASE_HALF_W + 0.002, BASE_FRONT_Y, z1))
        for side in (-1, 1):
            box_between('HoodDarkBlue', (side * BASE_HALF_W, BASE_FRONT_Y, z0),
                        (side * (BASE_HALF_W + 0.007), BASE_BACK_Y, z1))
    door_z = (FEET_H + 0.075, BODY_BOTTOM - 0.055)
    for side in (-1, 1):
        x0, x1 = sorted((side * 0.012, side * (BASE_HALF_W - 0.015)))
        box_between('HoodPaintGrey', (x0, BASE_FRONT_Y - 0.006, door_z[0]), (x1, BASE_FRONT_Y, door_z[1]))
        mid = (x0 + x1) / 2
        door_face = BASE_FRONT_Y - 0.0065
        # Louvres across the top of each door.
        for k in range(7):
            quad('HoodSlot', (mid, door_face, 0.47 + k * 0.022), 0.11, 0.004, '-Y')
        # A pull beside the meeting edge, and a screw in each corner.
        box('HoodSteel', (side * 0.06, door_face - 0.004, 0.40), (0.08, 0.008, 0.018))
        for sx in (x0 + 0.025, x1 - 0.025):
            for sz in (door_z[0] + 0.025, door_z[1] - 0.025):
                cylinder('HoodSteel', (sx, door_face - 0.0012, sz), 0.0055, 0.0025, 'Y', 10)
    # The gap between the doors.
    quad('HoodSlot', (0.0, BASE_FRONT_Y - 0.0005, sum(door_z) / 2), 0.011, (door_z[1] - door_z[0]) / 2, '-Y')
    # Levelling feet: a threaded stem and a rubber pad.
    for fx in (-0.6, 0.6):
        for fy in (-0.30, 0.32):
            cylinder('HoodSteel', (fx, fy, 0.035), 0.011, 0.04, 'Z', 12)
            cylinder('HoodSteel', (fx, fy, 0.05), 0.018, 0.008, 'Z', 6)
            cylinder('HoodRubber', (fx, fy, 0.01), 0.028, 0.02, 'Z', 20)


def build_body():
    """The painted shell: sides, back, top, the apron under the opening and the fascia over it."""
    for side in (-1, 1):
        x0, x1 = sorted((side * (HALF_W - SIDE_T), side * HALF_W))
        box_between('HoodPaint', (x0, FRONT_Y, BODY_BOTTOM), (x1, BACK_Y, TOP_Z - 0.06))
        # A seam where the side is two sheets, and screws down its front and back edges.
        quad('HoodSlot', (side * (HALF_W + 0.0005), 0.02, (BODY_BOTTOM + TOP_Z) / 2), 0.0015,
             (TOP_Z - BODY_BOTTOM) / 2 - 0.06, '+X' if side > 0 else '-X')
        for sy in (FRONT_Y + 0.03, BACK_Y - 0.03):
            for sz in (BODY_BOTTOM + 0.08, (BODY_BOTTOM + TOP_Z) / 2, TOP_Z - 0.14):
                cylinder('HoodSteel', (side * (HALF_W + 0.001), sy, sz), 0.005, 0.003, 'X', 10)
        # The blue accent down the front edge.
        box_between('HoodBlue', (side * (HALF_W - SIDE_T + 0.008), FRONT_Y - 0.007, BODY_BOTTOM + 0.04),
                    (side * (HALF_W - 0.008), FRONT_Y, BAND_Z[0] - 0.03))
    inner = HALF_W - SIDE_T
    box_between('HoodPaint', (-inner, BACK_Y - 0.06, BODY_BOTTOM), (inner, BACK_Y, TOP_Z - 0.06))
    box_between('HoodPaint', (-HALF_W, FRONT_Y, TOP_Z - 0.06), (HALF_W, BACK_Y, TOP_Z))
    box_between('HoodPaint', (-inner, FRONT_Y, BODY_BOTTOM), (inner, FASCIA_BACK_Y, WORK_Z))
    box_between('HoodPaint', (-inner, FRONT_Y, FASCIA_BOTTOM), (inner, FASCIA_BACK_Y, TOP_Z - 0.06))
    # The blue band across the fascia, standing proud of it.
    box_between('HoodBlue', (-HALF_W + 0.005, BAND_FRONT_Y, BAND_Z[0]), (HALF_W - 0.005, FRONT_Y + 0.001, BAND_Z[1]))
    # The padded arm rest along the front of the opening.
    cylinder('HoodRubber', (0.0, FRONT_Y - 0.004, WORK_Z + 0.016), 0.022, 2 * inner - 0.06, 'X', 20)
    # The exhaust collar on top, with its grille.
    cylinder('HoodPaintGrey', (0.0, 0.08, TOP_Z + COLLAR_H / 2), 0.13, COLLAR_H, 'Z', 40)
    cylinder('HoodSlot', (0.0, 0.08, TOP_Z + COLLAR_H + 0.0005), 0.112, 0.002, 'Z', 40)


def build_interior():
    """The stainless work zone: tray, intake strip, liners, ceiling, light housing and the grilles."""
    w = INNER_HALF_W
    box_between('HoodSteel', (-w - 0.01, FASCIA_BACK_Y, BODY_BOTTOM), (w + 0.01, BACK_Y - 0.06, WORK_Z - 0.02))
    box_between('HoodSteel', (-w, TRAY_FRONT_Y, WORK_Z - 0.02), (w, INNER_BACK_Y, WORK_Z))
    # The intake strip along the front, a little below the tray, perforated.
    strip_top = WORK_Z - 0.008
    box_between('HoodSteel', (-w, FASCIA_BACK_Y, WORK_Z - 0.025), (w, TRAY_FRONT_Y, strip_top))
    for k in range(48):
        x = -w + 0.02 + k * (2 * w - 0.04) / 47
        for y in (-0.288, -0.263):
            quad('HoodSlot', (x, y, strip_top + 0.0006), 0.0045, 0.008, '+Z')
    # Liners: back and both sides.
    box_between('HoodSteel', (-w, INNER_BACK_Y, WORK_Z), (w, BACK_Y - 0.06, CEILING_Z))
    for side in (-1, 1):
        x0, x1 = sorted((side * w, side * (w + 0.01)))
        box_between('HoodSteel', (x0, FASCIA_BACK_Y, WORK_Z), (x1, BACK_Y - 0.06, CEILING_Z))
    # The return grille low on the back wall.
    for row in range(2):
        for k in range(28):
            x = -w + 0.04 + k * (2 * w - 0.08) / 27
            quad('HoodSlot', (x, INNER_BACK_Y - 0.0006, WORK_Z + 0.025 + row * 0.022), 0.013, 0.005, '-Y')
    # The ceiling: the filter's diffuser plate, slotted, and the light housing in front of it.
    housing_back = -0.16
    box_between('HoodSteel', (-w, housing_back, CEILING_Z), (w, INNER_BACK_Y, CEILING_Z + 0.02))
    for row in range(14):
        y = housing_back + 0.025 + row * 0.03
        for k in range(4):
            x = -w + 0.04 + (k + 0.5) * (2 * w - 0.08) / 4
            quad('HoodSlot', (x, y, CEILING_Z - 0.0006), 0.13, 0.004, '-Z')
    box_between('HoodSteel', (-w, FASCIA_BACK_Y, LAMP['centre'][2] + 0.001), (w, housing_back, CEILING_Z + 0.02))
    lx, ly, lz = LAMP['centre']
    box('HoodLamp', (lx, ly, lz), (2 * LAMP['half_w'], 2 * LAMP['half_d'], 0.008))
    # Sockets on the right-hand wall, and a warning sticker by the opening.
    box('HoodButton', (w - 0.004, 0.12, 1.02), (0.008, 0.075, 0.075))
    for dy in (-0.012, 0.012):
        quad('HoodSlot', (w - 0.0085, 0.12 + dy, 1.022), 0.003, 0.009, '-X')
    sticker = Matrix.Translation((w - 0.0008, -0.2, CEILING_Z - 0.15))
    triangle(sticker, 0.07, 'HoodSlot')
    triangle(Matrix.Translation((-0.0006, 0, 0)) @ sticker, 0.058, 'LabYellow')


def triangle(matrix, side, material):
    """A flat warning triangle facing -X, point up."""
    bm = parts[material]
    h = side * math.sqrt(3) / 2
    corners = [(0.0, -side / 2, -h / 3), (0.0, side / 2, -h / 3), (0.0, 0.0, 2 * h / 3)]
    face = bm.faces.new([bm.verts.new(matrix @ Vector(c)) for c in corners])
    face.normal_update()
    if face.normal.x > 0:
        face.normal_flip()


def build_sash():
    """The glass sash, raised into the fascia, with its frame and handle."""
    x = INNER_HALF_W - 0.01
    box_between('HoodGlass', (-x, SASH_Y - 0.003, SASH_BOTTOM), (x, SASH_Y + 0.003, FASCIA_BOTTOM + 0.12))
    box_between('HoodPaintGrey', (-x - 0.005, SASH_Y - 0.02, SASH_BOTTOM - 0.032), (x + 0.005, SASH_Y + 0.02, SASH_BOTTOM + 0.004))
    for side in (-1, 1):
        x0, x1 = sorted((side * (x - 0.016), side * (x + 0.006)))
        box_between('HoodPaintGrey', (x0, SASH_Y - 0.012, SASH_BOTTOM), (x1, SASH_Y + 0.012, FASCIA_BOTTOM + 0.05))
    cylinder('HoodSteel', (0.0, SASH_Y - 0.038, SASH_BOTTOM - 0.016), 0.008, 0.8, 'X', 14)
    for hx in (-0.38, 0.38):
        cylinder('HoodSteel', (hx, SASH_Y - 0.028, SASH_BOTTOM - 0.016), 0.006, 0.022, 'Y', 10)


def build_control_panel():
    """The display, the three buttons and their indicators on the blue band; a key switch and a maker's plate."""
    face = BAND_FRONT_Y
    z = CONTROLS_Z
    box_between('HoodButton', (0.03, face - 0.003, z - 0.04), (0.23, face, z + 0.04))
    box_between('HoodLcd', (0.045, face - 0.0045, z - 0.027), (0.215, face - 0.002, z + 0.027))
    for led, x in BUTTONS:
        cylinder('HoodButton', (x, face - 0.004, BUTTON_Z), BUTTON_R, 0.008, 'Y', 20)
        cylinder(led, (x, face - 0.002, LED_Z), 0.0045, 0.004, 'Y', 12)
    cylinder('HoodSteel', (-0.45, face - 0.005, z + 0.01), 0.014, 0.01, 'Y', 20)
    box('HoodSlot', (-0.45, face - 0.0102, z + 0.01), (0.003, 0.001, 0.014))
    box_between('HoodSteel', (-0.34, face - 0.003, z - 0.01), (-0.10, face, z + 0.03))


# ---------------------------------------------------------------------------
# Labware
# ---------------------------------------------------------------------------

def petri_dish(x, y, z0, medium='LabMedium', lid=True, colonies=0, seed=0):
    """
    A 90 mm dish with a layer of medium in it, and its lid on if `lid`.
    Returns the height of its top, for stacking.
    """
    at = Matrix.Translation((x, y, z0))
    lathe('LabPlastic', [(0.0, 0.0), (DISH_R, 0.0), (DISH_R, DISH_H), (DISH_R - WALL, DISH_H),
                         (DISH_R - WALL, WALL), (0.0, WALL)], at)
    depth = 0.0045
    lathe(medium, [(0.0, WALL + 0.0002), (DISH_R - WALL - 0.0004, WALL + 0.0002),
                   (DISH_R - WALL - 0.0004, WALL + depth), (0.0, WALL + depth)], at)
    rng = random.Random(seed)
    for _ in range(colonies):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.0, DISH_R - 0.012)
        blob('LabMold', (r * math.cos(a), r * math.sin(a), WALL + depth + 0.0003), rng.uniform(0.004, 0.013),
             seed=rng.randrange(1000), wobble=0.8, matrix=at)
    if not lid:
        return z0 + DISH_H
    top = DISH_H + 0.0016
    lathe('LabPlastic', [(0.0, top), (LID_R, top), (LID_R, top - LID_SKIRT), (LID_R - WALL, top - LID_SKIRT),
                         (LID_R - WALL, top - WALL), (0.0, top - WALL)], at)
    return z0 + top


def loose_lid(x, y):
    """A lid set down upside down beside its dish, as it would be while working."""
    lathe('LabPlastic', [(0.0, 0.0), (LID_R, 0.0), (LID_R, LID_SKIRT), (LID_R - WALL, LID_SKIRT),
                         (LID_R - WALL, WALL), (0.0, WALL)], Matrix.Translation((x, y, WORK_Z)))


def dish_stack(x, y, count, seed, spent=()):
    """A stack of dishes, lids on, the odd one gone yellow."""
    z = WORK_Z
    rng = random.Random(seed)
    for i in range(count):
        jitter = (rng.uniform(-0.002, 0.002), rng.uniform(-0.002, 0.002))
        z = petri_dish(x + jitter[0], y + jitter[1], z, 'LabMediumSpent' if i in spent else 'LabMedium') + 0.0003


def six_well_plate(x, y, yaw, spent=()):
    """A six-well plate with no lid, medium in every well."""
    at = placed(x, y, yaw=yaw)
    length, width, height = 0.127, 0.085, 0.0205
    box('LabPlastic', (0.0, 0.0, 0.001), (length, width, 0.002), at)
    for sx in (-1, 1):
        box('LabPlastic', (sx * (length / 2 - 0.0008), 0.0, height / 2), (0.0016, width, height), at)
    for sy in (-1, 1):
        box('LabPlastic', (0.0, sy * (width / 2 - 0.0008), height / 2), (length, 0.0016, height), at)
    well_r = 0.0175
    for i, (wx, wy) in enumerate((wx, wy) for wy in (-0.0195, 0.0195) for wx in (-0.039, 0.0, 0.039)):
        well = at @ Matrix.Translation((wx, wy, 0.002))
        lathe('LabPlastic', [(0.0, 0.0), (well_r, 0.0), (well_r, 0.0175), (well_r - WALL, 0.0175),
                             (well_r - WALL, WALL), (0.0, WALL)], well, segments=20)
        lathe('LabMediumSpent' if i in spent else 'LabMedium',
              [(0.0, WALL + 0.0002), (well_r - WALL - 0.0004, WALL + 0.0002),
               (well_r - WALL - 0.0004, 0.007), (0.0, 0.007)], well, segments=20)


def culture_flask(matrix, medium='LabMedium'):
    """A T-75 flask lying flat: long side along y, angled neck toward -y with a red vented cap."""
    body = (0.095, 0.155, 0.036)
    rounded_box('LabPlastic', (0.0, 0.0, body[2] / 2), body, 0.008, matrix)
    rounded_box(medium, (0.0, 0.004, 0.0045), (body[0] - 0.008, body[1] - 0.016, 0.006), 0.0025, matrix)
    # The frosted writing patch on top.
    box('LabPaper', (0.0, 0.02, body[2] + 0.0003), (0.06, 0.07, 0.0006), matrix)
    neck = matrix @ Matrix.Translation((0.0, -body[1] / 2 + 0.004, 0.022)) @ Matrix.Rotation(-math.radians(25), 4, 'X')
    cylinder('LabPlastic', (0.0, -0.016, 0.0), 0.0155, 0.032, 'Y', 16, matrix=neck)
    cylinder('LabRed', (0.0, -0.041, 0.0), 0.019, 0.022, 'Y', 20, matrix=neck)


def media_bottle(x, y, yaw, fill):
    """A square bottle of culture medium, white cap, its label to the front."""
    at = placed(x, y, yaw=yaw)
    side, height = 0.072, 0.14
    rounded_box('LabPlastic', (0.0, 0.0, height / 2), (side, side, height), 0.011, at)
    rounded_box('LabMedium', (0.0, 0.0, 0.002 + fill / 2), (side - 0.006, side - 0.006, fill), 0.008, at)
    cylinder('LabPlastic', (0.0, 0.0, height + 0.009), 0.03, 0.018, 'Z', 24, radius2=0.019, matrix=at)
    cylinder('LabPlastic', (0.0, 0.0, height + 0.024), 0.019, 0.012, 'Z', 24, matrix=at)
    cylinder('LabPaper', (0.0, 0.0, height + 0.036), 0.023, 0.024, 'Z', 24, matrix=at)
    box('LabPaper', (0.0, -side / 2 - 0.0008, 0.065), (side - 0.014, 0.0016, 0.075), at)
    box('LabYellow', (0.0, -side / 2 - 0.0011, 0.094), (side - 0.014, 0.0016, 0.016), at)


def reagent_bottle(matrix, radius, height, liquid, fill, cap=True):
    """A round glass bottle with a blue screw cap and a label: a lab's reagents come in these."""
    neck = 0.021
    lathe('LabGlass', [(0.0, 0.0), (radius, 0.0), (radius, height), (radius * 0.8, height + 0.014),
                       (neck + 0.002, height + 0.032), (neck, height + 0.034), (neck, height + 0.052),
                       (0.0, height + 0.052)], matrix, segments=28)
    if liquid and fill > 0:
        lathe(liquid, [(0.0, 0.003), (radius - 0.002, 0.003), (radius - 0.002, fill), (0.0, fill)], matrix, segments=28)
    band('LabPaper', radius + 0.0002, radius + 0.0012, height * 0.45,
         matrix @ Matrix.Translation((0.0, 0.0, height * 0.42)), arc=(math.radians(235), math.radians(305)))
    if cap:
        cylinder('LabBlue', (0.0, 0.0, height + 0.047), neck + 0.005, 0.024, 'Z', 24, matrix=matrix)
        cylinder('LabBlue', (0.0, 0.0, height + 0.036), neck + 0.007, 0.004, 'Z', 24, matrix=matrix)


def dropper(matrix):
    """A glass Pasteur pipette with its red rubber bulb, along local +X: bulb at the origin end."""
    cylinder('LabGlass', (0.05, 0.0, 0.0), 0.0035, 0.1, 'X', 10, matrix=matrix)
    cylinder('LabGlass', (0.125, 0.0, 0.0), 0.0035, 0.05, 'X', 10, radius2=0.0012, matrix=matrix)
    bulb = matrix @ Matrix.Translation((-0.03, 0.0, 0.0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    lathe('LabRed', [(0.0, 0.0), (0.006, 0.002), (0.0078, 0.008), (0.0078, 0.02), (0.005, 0.026),
                     (0.0042, 0.034), (0.0, 0.034)], bulb, segments=16)


def lying_dropper(x, y, yaw):
    """A dropper put down on the tray: it rests on its bulb and its tip."""
    tilt = math.atan2(0.0078 - 0.0012, 0.15 + 0.03)
    dropper(Matrix.Translation((x, y, WORK_Z + 0.0078)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'Y'))


def beaker_of_droppers(x, y):
    """A small beaker with a little water in it and two droppers stood tip down."""
    at = Matrix.Translation((x, y, WORK_Z))
    lathe('LabGlass', [(0.0, 0.0), (0.03, 0.0), (0.03, 0.075), (0.032, 0.077), (0.0295, 0.077),
                       (0.0285, 0.003), (0.0, 0.003)], at, segments=24)
    lathe('LabReagent', [(0.0, 0.0035), (0.0283, 0.0035), (0.0283, 0.022), (0.0, 0.022)], at, segments=24)
    for yaw, lean in ((0.4, 0.3), (2.6, 0.25)):
        # Tip down on the floor of the beaker, bulb up, leaning out over the rim:
        # moved back along its length so its tip is at the origin, then turned
        # so its +X -- toward the tip -- points down.
        dropper(at @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Translation((0.008, 0.0, 0.004))
                @ Matrix.Rotation(math.pi / 2 - lean, 4, 'Y') @ Matrix.Translation((-0.15, 0.0, 0.0)))


def pipette_jar(x, y, seed):
    """A tall jar of serological pipettes, each with its colour band and cotton plug."""
    at = Matrix.Translation((x, y, WORK_Z))
    lathe('LabPlastic', [(0.0, 0.0), (0.045, 0.0), (0.045, 0.18), (0.042, 0.18), (0.042, 0.004), (0.0, 0.004)], at, 28)
    rng = random.Random(seed)
    for band in ('LabOrange', 'LabOrange', 'LabRed', 'LabYellow', 'LabOrange', 'LabBlue', 'LabRed'):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.0, 0.016)
        lean = Matrix.Rotation(rng.uniform(0.05, 0.12), 4, Vector((math.cos(a + 1.3), math.sin(a + 1.3), 0.0)))
        tube = at @ Matrix.Translation((r * math.cos(a), r * math.sin(a), 0.005)) @ lean
        length = rng.uniform(0.31, 0.35)
        cylinder('LabPlastic', (0.0, 0.0, length / 2), 0.0045, length, 'Z', 10, matrix=tube)
        cylinder(band, (0.0, 0.0, length - 0.045), 0.0049, 0.012, 'Z', 10, matrix=tube)
        cylinder('LabPaper', (0.0, 0.0, length - 0.004), 0.0036, 0.012, 'Z', 10, matrix=tube)


def tube_rack(x, y, yaw):
    """A blue rack of 15 ml conical tubes, orange caps, some with something in them."""
    at = placed(x, y, yaw=yaw)
    length, width = 0.18, 0.065
    box('LabBlue', (0.0, 0.0, 0.002), (length, width, 0.004), at)
    box('LabBlue', (0.0, 0.0, 0.06), (length, width, 0.004), at)
    for sx in (-1, 1):
        box('LabBlue', (sx * (length / 2 - 0.002), 0.0, 0.031), (0.004, width, 0.058), at)
    for k, liquid in ((0, 'LabMedium'), (1, None), (3, 'LabMediumSpent'), (4, 'LabMedium')):
        tube = at @ Matrix.Translation((-0.075 + k * 0.03, 0.0, 0.004))
        lathe('LabPlastic', [(0.0, 0.0), (0.0085, 0.02), (0.0085, 0.118), (0.0, 0.118)], tube, 16)
        cylinder('LabOrange', (0.0, 0.0, 0.126), 0.0096, 0.016, 'Z', 16, matrix=tube)
        if liquid:
            lathe(liquid, [(0.0, 0.003), (0.0077, 0.021), (0.0077, 0.07), (0.0, 0.07)], tube, 16)


def build_labware():
    """
    What is on the tray, laid out so nothing stands in anything else:
    tall things at the back, dishes and droppers toward the front.
    """
    pipette_jar(-0.50, 0.19, seed=4)
    dish_stack(-0.37, 0.20, 5, seed=1, spent=(1,))
    dish_stack(-0.26, 0.10, 3, seed=2)
    # Two flasks, one on the other, necks to the front.
    culture_flask(placed(-0.12, 0.185, yaw=0.06))
    culture_flask(placed(-0.118, 0.19, z=WORK_Z + 0.0372, yaw=-0.04), 'LabMediumSpent')
    reagent_bottle(placed(0.03, 0.235), 0.034, 0.10, 'LabAmber', 0.06)
    reagent_bottle(placed(0.12, 0.225), 0.034, 0.10, 'LabReagent', 0.075)
    media_bottle(0.42, 0.205, yaw=0.15, fill=0.11)
    media_bottle(0.52, 0.09, yaw=-0.25, fill=0.05)
    beaker_of_droppers(0.30, 0.17)
    six_well_plate(0.17, 0.065, yaw=0.1, spent=(4,))
    tube_rack(0.42, -0.06, yaw=-0.08)
    # Knocked over, mouth toward the middle of the tray, its cap off and lying
    # beyond it, and what was in it dried across the steel.
    radius = 0.04
    tipped = Matrix.Translation((0.37, -0.165, WORK_Z + radius)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') \
        @ Matrix.Rotation(math.pi, 4, 'X')
    reagent_bottle(tipped, radius, 0.12, None, 0, cap=False)
    cylinder('LabBlue', (0.47, -0.215, WORK_Z + 0.012), 0.026, 0.024, 'Z', 24)
    for (bx, by), r, seed, stretch in (((0.165, -0.155), 0.04, 3, (1.6, 0.8)), ((0.09, -0.135), 0.035, 8, (1.3, 1.0)),
                                       ((0.03, -0.12), 0.02, 12, (1.0, 1.0)), ((0.215, -0.12), 0.012, 5, (1.0, 1.0))):
        blob('LabStain', (bx, by, WORK_Z + 0.0005), r, seed=seed, stretch=stretch, wobble=0.7, points=24)
    # Dishes on their own.
    petri_dish(-0.47, -0.08, WORK_Z)
    petri_dish(-0.34, -0.15, WORK_Z, 'LabMediumSpent', lid=False)
    loose_lid(-0.20, -0.19)
    petri_dish(-0.10, -0.07, WORK_Z, 'LabMediumSpent', colonies=11, seed=21)
    petri_dish(0.02, -0.20, WORK_Z)
    lying_dropper(-0.22, -0.04, yaw=0.5)
    lying_dropper(0.10, -0.03, yaw=0.0)
    # A few drops of medium dried on the steel.
    for (dx, dy), r, seed in (((-0.40, 0.04), 0.006, 31), ((0.06, 0.12), 0.005, 32), ((-0.08, -0.17), 0.007, 33)):
        blob('LabStain', (dx, dy, WORK_Z + 0.0005), r, seed=seed, wobble=0.6, points=12)


# ---------------------------------------------------------------------------

def smooth_by_angle(obj, max_degrees=40):
    """Smooth shading, with every edge sharper than `max_degrees` kept hard."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    limit = math.radians(max_degrees)
    for edge in bm.edges:
        edge.smooth = len(edge.link_faces) == 2 and edge.calc_face_angle(math.pi) < limit
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(obj.data)
    bm.free()


def build():
    common.clear_scene()
    build_lower_cabinet()
    build_body()
    build_interior()
    build_sash()
    build_control_panel()
    build_labware()

    for name, (colour, roughness, metallic, alpha) in MATERIALS.items():
        bm = parts[name]
        if not bm.faces:
            print(f'WARNING: nothing was built in {name}')
            continue
        material =common.make_material(name, colour, roughness=roughness, metallic=metallic)
        if alpha is not None:
            material.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = alpha
            material.surface_render_method = 'BLENDED'
        faces = len(bm.faces)
        obj = common.new_object(name, bm, material)
        if name in BEVELLED:
            modifier = obj.modifiers.new('Bevel', type='BEVEL')
            modifier.width = BEVELLED[name]
            modifier.segments = 2
            modifier.limit_method = 'ANGLE'
        if name in SMOOTHED:
            smooth_by_angle(obj)
        print(f'{name}: {faces} faces')

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'biosafety_cabinet.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
