"""
Generates containment_chamber.glb: the specimen tank in the back-west corner
of the Level 2 basement lab -- what the torn notes on the workbench mean by
CONTAINMENT REQUIRED, and broken open from the inside.

After the user's reference of a stasis tank: a glass cylinder standing between
a heavy base and a stepped cap, on an octagonal plinth, with hazard-striped
feet round the base and a feed pipe out of the top. Here something has broken
out of it: a jagged hole most of the way up the front and round one side,
teeth of glass left standing in the collars, cracks running off the hole into
what is left, torn hoses hanging inside, and the glass that came out
scattered across the floor in front of it.

The glass is medium green and thin -- 9 mm. Its broken edges are their own
material, ChamberGlassEdge, because the edge of a pane is where glass shows
its colour most.

HOW THE HOLE IS MADE. The tube is a closed shell, and cutters -- the hole's
outline pushed out radially through the wall, in two overlapping pieces --
are subtracted from it with exact booleans. The cutters' walls become the
broken edges, square to the glass, so they are as thin as the glass is.

What is NOT in here, because the level builds it:
  * the pipe from the outlet on top to the pipe run on the back wall -- its
    length depends on where the chamber stands;
  * the textures. Material names are the hook: ChamberPaint takes the lab's
    white-rust photo tinted to the reference's pale blue, ChamberSteel and
    ChamberDarkSteel the bare-steel set, and the two hazard materials the
    white-rust photo, light and dark. The glass materials are replaced.

Axes: standing on the origin at the centre of the plinth; the hole and the
spilled glass face Blender -Y (glTF +Z). The level's CONTAINMENT_CHAMBER
constants mirror PLINTH_R, PLINTH_FLAT, OUTLET_TOP and OUTLET_R.

Run headless: blender --background --python blender/build_containment_chamber.py
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, geometry

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from common import add_cylinder, add_lathe  # noqa: E402

# The plinth and the base.
PLINTH_R = 0.78                         # to the octagon's corners; its flats face the four feet
PLINTH_FLAT = PLINTH_R * math.cos(math.pi / 8)
PLINTH_H = 0.10
PLINTH_BOLT_R = 0.69                    # one bolt head in toward each corner
HOUSING_R = 0.56                        # at its foot; it tapers in toward the collar
HOUSING_TOP = 0.40

# The collars the glass stands between. Both ends of the glass are buried in them.
COLLAR_R = 0.53
COLLAR_INNER_R = 0.43
BOTTOM_COLLAR = (0.40, 0.53)
TANK_FLOOR = 0.50
TOP_COLLAR = (1.95, 2.07)
CAP_UNDERSIDE = 1.97

# The glass.
GLASS_INNER_R = 0.452
GLASS_OUTER_R = 0.461                   # 9 mm thick
GLASS_MID_R = (GLASS_INNER_R + GLASS_OUTER_R) / 2
GLASS_BOTTOM = 0.49
GLASS_TOP = 1.99
GLASS_SEGMENTS = 72

# The stepped cap and the outlet the level's pipe connects to.
CAP_TOP = 2.355
NECK_TOP = 2.45
OUTLET_R = 0.05
OUTLET_TOP = 2.52

# The feet: four wedges round the base, one under the middle of the hole,
# standing well out from the housing as on the reference.
FOOT_INNER = 0.46                       # buried in the housing
FOOT_OUTER = 0.71                       # just short of the plinth's flat
FOOT_HALF_THICKNESS = 0.07
FOOT_TOE = PLINTH_H + 0.07              # the height of its outer end
FOOT_TOP = 0.45
STRIPE_WIDTH = 0.04
# Across the foot (u out from the tank, v round it, w up): a slant in all
# three, so the stripes run diagonally on every face.
STRIPE_NORMAL = Vector((1.0, 0.7, 1.0)).normalized()

# The hole, as (s, z): s metres round the glass from the front, toward +X,
# and z up. Walked bottom edge, right side, top edge, left side. What is left
# standing: a broad piece low on the left, spikes up from the bottom collar,
# a wide flap hanging from the top on the right, teeth down from the top
# collar and in from either side.
#
# On the right it bites round well past the side of the tube, so the tube's
# outline itself is broken wherever in the room it is seen from -- the
# outline is always a quarter turn either side of the eye, and the hole spans
# more than half a turn. A hole that stays inside the outline only ever shows
# against the glass behind it, which is the same green, and from more than a
# few steps away reads as a whole tank.
HOLE = [
    (-0.46, 0.98), (-0.40, 0.90), (-0.36, 0.95), (-0.31, 0.82), (-0.27, 0.86),
    (-0.22, 0.70), (-0.17, 0.74), (-0.13, 0.60), (-0.08, 0.57), (-0.02, 0.62),
    (0.03, 0.56), (0.08, 0.59), (0.12, 0.74), (0.14, 0.93), (0.17, 0.70),
    (0.21, 0.60), (0.27, 0.63), (0.32, 0.58), (0.38, 0.67), (0.43, 0.72),
    (0.52, 0.76), (0.60, 0.74), (0.70, 0.86), (0.80, 0.90), (0.92, 0.98),
    (1.02, 1.06), (1.06, 1.16), (0.98, 1.24), (1.03, 1.32), (0.94, 1.38),
    (0.84, 1.36), (0.72, 1.33), (0.62, 1.32), (0.74, 1.40), (0.80, 1.47),
    (0.66, 1.50), (0.54, 1.45), (0.44, 1.38),
    (0.37, 1.42), (0.30, 1.40),
    (0.24, 1.47), (0.19, 1.58), (0.22, 1.66), (0.17, 1.76), (0.12, 1.84),
    (0.06, 1.88), (-0.01, 1.85), (-0.05, 1.70), (-0.07, 1.52), (-0.10, 1.72),
    (-0.15, 1.87), (-0.22, 1.90), (-0.29, 1.86), (-0.34, 1.75), (-0.37, 1.86),
    (-0.43, 1.83), (-0.47, 1.70), (-0.50, 1.56), (-0.46, 1.45), (-0.50, 1.33),
    (-0.47, 1.22), (-0.39, 1.16), (-0.32, 1.12), (-0.43, 1.07), (-0.49, 1.03),
]
# A cutter reaches from well inside the glass to well outside it -- outside,
# far enough that a flat face across its whole width still clears the glass.
# That only holds for a cutter spanning well under half a turn, so the hole
# is cut in two pieces either side of HOLE_SPLIT, overlapping by twice
# HOLE_OVERLAP so no sliver of glass is left standing between them.
CUTTER_INNER_R = 0.30
CUTTER_OUTER_R = 2.5
HOLE_SPLIT = 0.31
HOLE_OVERLAP = 0.025

# Cracks run off the hole into the glass that is left, in the same (s, z).
# Each starts on the hole's edge; the short ones branch off a longer one.
CRACKS = [
    [(-0.50, 1.33), (-0.58, 1.38), (-0.67, 1.34), (-0.76, 1.41), (-0.87, 1.38), (-0.97, 1.44)],
    [(-0.67, 1.34), (-0.72, 1.24), (-0.80, 1.18), (-0.86, 1.08)],
    [(-0.49, 1.03), (-0.57, 0.98), (-0.64, 0.88), (-0.73, 0.84), (-0.77, 0.73)],
    [(-0.47, 1.70), (-0.56, 1.76), (-0.62, 1.86), (-0.65, 1.95)],
    [(-0.46, 0.98), (-0.52, 0.90), (-0.55, 0.78), (-0.62, 0.70)],
    [(-0.31, 0.82), (-0.36, 0.72), (-0.42, 0.66), (-0.45, 0.55)],
    [(1.06, 1.16), (1.14, 1.13), (1.23, 1.18), (1.31, 1.12), (1.40, 1.16)],
    [(1.23, 1.18), (1.27, 1.29), (1.34, 1.35), (1.39, 1.46)],
    [(1.03, 1.32), (1.12, 1.40), (1.19, 1.38), (1.27, 1.50)],
    [(0.70, 0.86), (0.76, 0.76), (0.82, 0.68), (0.85, 0.56)],
    [(0.92, 0.98), (1.00, 0.90), (1.08, 0.85), (1.14, 0.74)],
    [(0.19, 1.58), (0.27, 1.62), (0.33, 1.70), (0.42, 1.68), (0.50, 1.76), (0.58, 1.73)],
    [(0.80, 1.47), (0.86, 1.58), (0.92, 1.66), (0.97, 1.80), (1.00, 1.95)],
]
CRACK_WIDTH = 0.004

# The jets round the floor of the tank, and its drain.
JET_RING_R = 0.32
JET_COUNT = 6
DRAIN_R = 0.075

# The hub under the cap the hoses and the sensor rod hang from.
HUB_R = 0.075
HUB_BOTTOM = 1.86
HOSE_R = 0.018

PAINT = (0.48, 0.58, 0.60)              # the reference's pale blue
DARK_STEEL = (0.16, 0.17, 0.18)
STEEL = (0.45, 0.46, 0.46)
HAZARD_LIGHT = (0.85, 0.85, 0.80)
HAZARD_DARK = (0.03, 0.03, 0.03)
RUBBER = (0.025, 0.025, 0.025)
FIXTURE = (0.05, 0.07, 0.07)
GLASS = (0.30, 0.62, 0.38)
GLASS_EDGE = (0.22, 0.66, 0.32)
CRACK = (0.85, 0.95, 0.88)


def wrap(s, z, radius):
    """A point `s` metres round the glass from the front (toward +X), at height z and the given radius."""
    theta = s / GLASS_MID_R
    return Vector((radius * math.sin(theta), -radius * math.cos(theta), z))


def lathe(profile, segments=48):
    bm = bmesh.new()
    add_lathe(bm, profile, segments=segments)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def smooth_by_angle(obj, max_degrees=40):
    """Smooth shading, with every edge sharper than `max_degrees` kept hard, so a lathe's corners stay crisp."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    limit = math.radians(max_degrees)
    for edge in bm.edges:
        edge.smooth = len(edge.link_faces) == 2 and edge.calc_face_angle(math.pi) < limit
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def bevel(obj, width):
    modifier = obj.modifiers.new('Bevel', type='BEVEL')
    modifier.width = width
    modifier.segments = 2
    modifier.limit_method = 'ANGLE'
    return obj


def new_multi_material_object(name, bm, materials):
    """common.new_object with more than one material slot; faces pick theirs by material_index."""
    obj = common.new_object(name, bm, materials[0])
    for material in materials[1:]:
        obj.data.materials.append(material)
    return obj


# ---------------------------------------------------------------------------
# The base
# ---------------------------------------------------------------------------

def build_plinth():
    """The octagonal plinth the tank stands on, flats toward the feet."""
    bm = bmesh.new()
    corners = [(PLINTH_R * math.cos(math.pi / 8 + k * math.pi / 4),
                PLINTH_R * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]
    bottom = [bm.verts.new((x, y, 0.0)) for x, y in corners]
    top = [bm.verts.new((x, y, PLINTH_H)) for x, y in corners]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    for k in range(8):
        j = (k + 1) % 8
        bm.faces.new((bottom[k], bottom[j], top[j], top[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_steel_details():
    """Bolt heads on the plinth and round both collars, the jets' rims, the drain ring, and the outlet."""
    bm = bmesh.new()
    for k in range(8):
        a = math.pi / 8 + k * math.pi / 4
        add_cylinder(bm, (PLINTH_BOLT_R * math.cos(a), PLINTH_BOLT_R * math.sin(a), PLINTH_H + 0.004),
                     0.014, 0.008, 'Z', 6)
    for low, high in (BOTTOM_COLLAR, TOP_COLLAR):
        z = (low + high) / 2
        for k in range(16):
            add_cylinder(bm, (COLLAR_R + 0.004, 0, z), 0.011, 0.01, 'X', 6,
                         transform=Matrix.Rotation(2 * math.pi * (k + 0.5) / 16, 4, 'Z'))
    for k in range(JET_COUNT):
        a = 2 * math.pi * (k + 0.5) / JET_COUNT
        add_cylinder(bm, (JET_RING_R * math.cos(a), JET_RING_R * math.sin(a), TANK_FLOOR + 0.003), 0.038, 0.006, 'Z', 20)
    add_cylinder(bm, (0, 0, TANK_FLOOR + 0.002), DRAIN_R, 0.004, 'Z', 24)
    # The outlet: a flange on the neck and a stub of pipe for the level's run to meet.
    add_cylinder(bm, (0, 0, NECK_TOP + 0.0125), 0.10, 0.025, 'Z', 24)
    stub_bottom = NECK_TOP + 0.02
    add_cylinder(bm, (0, 0, (stub_bottom + OUTLET_TOP) / 2), OUTLET_R, OUTLET_TOP - stub_bottom, 'Z', 20)
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        add_cylinder(bm, (0.078 * math.cos(a), 0.078 * math.sin(a), NECK_TOP + 0.03), 0.008, 0.012, 'Z', 6)
    return bm


def build_fixtures():
    """The lenses of the jets and the dark mouth of the drain, set in their steel rims."""
    bm = bmesh.new()
    for k in range(JET_COUNT):
        a = 2 * math.pi * (k + 0.5) / JET_COUNT
        add_cylinder(bm, (JET_RING_R * math.cos(a), JET_RING_R * math.sin(a), TANK_FLOOR + 0.004), 0.026, 0.008, 'Z', 20)
    add_cylinder(bm, (0, 0, TANK_FLOOR + 0.0025), DRAIN_R - 0.014, 0.005, 'Z', 24)
    return bm


def build_housing():
    """The painted drum under the glass, tapering in toward the collar, with one raised band."""
    return lathe([
        (0.0, PLINTH_H - 0.005),
        (HOUSING_R, PLINTH_H - 0.005),
        (HOUSING_R, PLINTH_H + 0.02),
        (HOUSING_R - 0.008, 0.20),
        (HOUSING_R + 0.001, 0.205),
        (HOUSING_R + 0.001, 0.235),
        (HOUSING_R - 0.011, 0.24),
        (HOUSING_R - 0.02, 0.34),
        (HOUSING_R - 0.026, 0.37),
        (HOUSING_R - 0.036, 0.39),
        (HOUSING_R - 0.05, HOUSING_TOP + 0.005),
        (0.0, HOUSING_TOP + 0.005),
    ], segments=64)


def build_collars():
    """
    The two heavy rings the glass stands between. The bottom one is also the
    floor of the tank, recessed inside its lip; the top one closes over it.
    """
    bm = bmesh.new()
    add_lathe(bm, [
        (0.0, TANK_FLOOR),
        (COLLAR_INNER_R, TANK_FLOOR),
        (COLLAR_INNER_R, BOTTOM_COLLAR[1]),
        (COLLAR_R - 0.02, BOTTOM_COLLAR[1]),
        (COLLAR_R, BOTTOM_COLLAR[1] - 0.01),
        (COLLAR_R, BOTTOM_COLLAR[0] + 0.01),
        (COLLAR_R - 0.015, BOTTOM_COLLAR[0]),
        (0.0, BOTTOM_COLLAR[0]),
    ], segments=64)
    add_lathe(bm, [
        (0.0, CAP_UNDERSIDE),
        (COLLAR_INNER_R, CAP_UNDERSIDE),
        (COLLAR_INNER_R, TOP_COLLAR[0]),
        (COLLAR_R - 0.02, TOP_COLLAR[0]),
        (COLLAR_R, TOP_COLLAR[0] + 0.01),
        (COLLAR_R, TOP_COLLAR[1] - 0.01),
        (COLLAR_R - 0.02, TOP_COLLAR[1]),
        (0.0, TOP_COLLAR[1]),
    ], segments=64)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_cap():
    """
    The cap over the top collar, after the reference: a deep rounded ring, then
    two smaller ones stacked on it, each step pinched in at the join so the
    stack reads as separate rings. The hub the hoses hang from is underneath.
    """
    bm = bmesh.new()
    add_lathe(bm, [
        (0.0, TOP_COLLAR[1] - 0.005),
        (0.50, TOP_COLLAR[1] - 0.005),
        (0.535, 2.08),
        (0.552, 2.10),
        (0.558, 2.135),
        (0.552, 2.17),
        (0.535, 2.19),
        (0.50, 2.20),
        (0.46, 2.205),
        (0.465, 2.215),
        (0.48, 2.225),
        (0.488, 2.245),
        (0.48, 2.265),
        (0.465, 2.275),
        (0.43, 2.28),
        (0.39, 2.285),
        (0.395, 2.295),
        (0.405, 2.305),
        (0.41, 2.32),
        (0.405, 2.335),
        (0.395, 2.345),
        (0.36, 2.35),
        (0.20, CAP_TOP),
        (0.0, CAP_TOP),
    ], segments=64)
    # The hub, hanging from the cap's underside.
    add_lathe(bm, [
        (0.0, CAP_UNDERSIDE + 0.005),
        (HUB_R, CAP_UNDERSIDE + 0.005),
        (HUB_R, HUB_BOTTOM + 0.015),
        (HUB_R - 0.015, HUB_BOTTOM),
        (0.0, HUB_BOTTOM),
    ], segments=24)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_neck():
    """The painted column the outlet stands on."""
    return lathe([
        (0.0, CAP_TOP - 0.005),
        (0.19, CAP_TOP - 0.005),
        (0.18, NECK_TOP - 0.02),
        (0.16, NECK_TOP),
        (0.0, NECK_TOP),
    ], segments=40)


def build_feet():
    """
    The four wedge feet round the base, striped black and white.

    Each is built square in its own frame -- u out from the tank, v round it,
    w up -- cut into bands by parallel planes, and only then turned to its
    place, so every face of every foot is striped the same way. A band's
    faces take material 0 (light) or 1 (dark) by which band they fall in.
    """
    bm = bmesh.new()
    profile = [
        (FOOT_INNER, PLINTH_H),
        (FOOT_OUTER, PLINTH_H),
        (FOOT_OUTER, FOOT_TOE),
        (COLLAR_R + 0.02, FOOT_TOP),
        (FOOT_INNER, FOOT_TOP),
    ]
    span = max(FOOT_OUTER, FOOT_TOP) * 2

    def local_to_blender(u, v, w):
        # The foot's frame, before it is turned: out from the tank is -Y, round it is +X.
        return Vector((v, -u, w))

    for k in range(4):
        before = set(bm.verts)
        near = [bm.verts.new(local_to_blender(u, -FOOT_HALF_THICKNESS, w)) for u, w in profile]
        far = [bm.verts.new(local_to_blender(u, FOOT_HALF_THICKNESS, w)) for u, w in profile]
        bm.faces.new(near)
        bm.faces.new(list(reversed(far)))
        for i in range(len(profile)):
            j = (i + 1) % len(profile)
            bm.faces.new((near[i], near[j], far[j], far[i]))

        def own_geometry():
            verts = [v for v in bm.verts if v not in before]
            vset = set(verts)
            edges = [e for e in bm.edges if e.verts[0] in vset and e.verts[1] in vset]
            faces = [f for f in bm.faces if all(v in vset for v in f.verts)]
            return verts, edges, faces

        normal = local_to_blender(*STRIPE_NORMAL)
        steps = int(span / STRIPE_WIDTH) + 1
        for step in range(-steps, steps + 1):
            verts, edges, faces = own_geometry()
            bmesh.ops.bisect_plane(bm, geom=verts + edges + faces,
                                   plane_co=normal * (step * STRIPE_WIDTH), plane_no=normal)
        verts, _, faces = own_geometry()
        for face in faces:
            band = math.floor(face.calc_center_median().dot(normal) / STRIPE_WIDTH)
            face.material_index = band % 2
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(k * math.pi / 2, 3, 'Z'))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ---------------------------------------------------------------------------
# The glass
# ---------------------------------------------------------------------------

def check_hole():
    """Warns if the hole's outline crosses itself, which would make the cutter a broken solid."""
    n = len(HOLE)
    points = [Vector((s, z)) for s, z in HOLE]
    for i in range(n):
        a1, a2 = points[i], points[(i + 1) % n]
        for j in range(i + 2, n):
            if (j + 1) % n == i:
                continue
            b1, b2 = points[j], points[(j + 1) % n]
            if geometry.intersect_line_line_2d(a1, a2, b1, b2):
                print(f'WARNING: the hole outline crosses itself at edges {i} and {j}')


def inside_hole(s, z):
    """Even-odd test: whether (s, z) lies in the hole."""
    inside = False
    n = len(HOLE)
    for i in range(n):
        s1, z1 = HOLE[i]
        s2, z2 = HOLE[(i + 1) % n]
        if (z1 > z) != (z2 > z) and s < s1 + (z - z1) * (s2 - s1) / (z2 - z1):
            inside = not inside
    return inside


def build_glass_shell():
    """The whole tube, a closed shell 9 mm thick, before the hole is cut."""
    return lathe([
        (GLASS_INNER_R, GLASS_BOTTOM),
        (GLASS_OUTER_R, GLASS_BOTTOM),
        (GLASS_OUTER_R, GLASS_TOP),
        (GLASS_INNER_R, GLASS_TOP),
        (GLASS_INNER_R, GLASS_BOTTOM),
    ], segments=GLASS_SEGMENTS)


def clip_outline(outline, keep):
    """
    The part of a closed outline where keep(point) >= 0, keep being a signed
    distance from a straight line (Sutherland-Hodgman, one edge). Clean for
    an outline the line crosses only twice, which HOLE is at HOLE_SPLIT.
    """
    clipped = []
    for i, a in enumerate(outline):
        b = outline[(i + 1) % len(outline)]
        da, db = keep(a), keep(b)
        if da >= 0:
            clipped.append(a)
        if (da >= 0) != (db >= 0):
            t = da / (da - db)
            clipped.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return clipped


def hole_pieces():
    """HOLE in the two overlapping pieces it is cut in. Warns if either is too wide for its cutter."""
    pieces = [
        clip_outline(HOLE, lambda p: HOLE_SPLIT + HOLE_OVERLAP - p[0]),
        clip_outline(HOLE, lambda p: p[0] - (HOLE_SPLIT - HOLE_OVERLAP)),
    ]
    for piece in pieces:
        span = math.degrees((max(s for s, _ in piece) - min(s for s, _ in piece)) / GLASS_MID_R)
        # Where a flat cap across the piece comes closest to the axis.
        if CUTTER_OUTER_R * math.cos(math.radians(span / 2)) < GLASS_OUTER_R + 0.05:
            print(f'WARNING: a hole piece spans {span:.0f} degrees -- its cutter would cut the glass behind')
    return pieces


def build_hole_cutter(outline):
    """
    One piece of the hole's outline pushed out radially through the glass: a
    solid whose side walls cut the broken edges. Its two caps are filled from
    the outline flat, then wrapped onto cylinders well inside and well outside
    the glass, where they cannot touch it.
    """
    bm = bmesh.new()
    inner = [bm.verts.new(wrap(s, z, CUTTER_INNER_R)) for s, z in outline]
    outer = [bm.verts.new(wrap(s, z, CUTTER_OUTER_R)) for s, z in outline]
    for a, b, c in geometry.tessellate_polygon([[Vector((s, z, 0.0)) for s, z in outline]]):
        bm.faces.new((inner[a], inner[b], inner[c]))
        bm.faces.new((outer[c], outer[b], outer[a]))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((inner[i], inner[j], outer[j], outer[i]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_broken_glass(glass, edge):
    """The tube with the hole cut out of it, one piece at a time. The cut walls take ChamberGlassEdge."""
    shell = common.new_object('ChamberGlassShell', build_glass_shell(), glass)
    cutters = []
    for k, piece in enumerate(hole_pieces()):
        cutter = common.new_object(f'ChamberHoleCutter{k}', build_hole_cutter(piece), edge)
        modifier = shell.modifiers.new(f'BrokenOut{k}', 'BOOLEAN')
        modifier.operation = 'DIFFERENCE'
        modifier.solver = 'EXACT'
        modifier.material_mode = 'TRANSFER'
        modifier.object = cutter
        cutters.append(cutter)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(shell.evaluated_get(depsgraph), preserve_all_data_layers=True,
                                           depsgraph=depsgraph)
    mesh.name = 'ChamberGlass_mesh'
    bpy.data.objects.remove(shell, do_unlink=True)
    for cutter in cutters:
        bpy.data.objects.remove(cutter, do_unlink=True)
    obj = bpy.data.objects.new('ChamberGlass', mesh)
    bpy.context.collection.objects.link(obj)
    edge_faces = sum(1 for p in mesh.polygons if mesh.materials[p.material_index] == edge)
    if edge_faces == 0:
        print('WARNING: the boolean cut no hole -- the glass is whole')
    # Round the tube, hard at the broken edges.
    return smooth_by_angle(obj, 30)


def jagged(path, rng, steps=3, wander=0.006):
    """A crack's path with points added between the given ones, each pushed a little to one side."""
    points = [Vector(p) for p in path]
    out = [points[0]]
    for a, b in zip(points, points[1:]):
        along = b - a
        across = Vector((-along.y, along.x)).normalized()
        for k in range(1, steps):
            out.append(a + along * (k / steps) + across * rng.uniform(-wander, wander))
        out.append(b)
    return out


def build_cracks(rng):
    """
    Thin ribbons on the outside of the glass along each crack, narrowing to
    their tips. Points that would fall in the hole are dropped.
    """
    bm = bmesh.new()
    radius = GLASS_OUTER_R + 0.0008
    for path in CRACKS:
        points = [p for p in jagged(path, rng) if not inside_hole(p.x, p.y)]
        if len(points) < 2:
            continue
        left, right = [], []
        for i, p in enumerate(points):
            tangent = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
            across = Vector((-tangent.y, tangent.x))
            half = CRACK_WIDTH / 2 * (1 - 0.65 * i / (len(points) - 1))
            left.append(bm.verts.new(wrap(*(p + across * half), radius)))
            right.append(bm.verts.new(wrap(*(p - across * half), radius)))
        for i in range(len(points) - 1):
            face = bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
            face.normal_update()
            centre = face.calc_center_median()
            if face.normal.dot(Vector((centre.x, centre.y, 0.0))) < 0:
                face.normal_flip()
    return bm


# ---------------------------------------------------------------------------
# What hangs inside
# ---------------------------------------------------------------------------

def add_hose(bm, points, radius, rib=0.0025, pitch=0.024, sides=8):
    """
    A corrugated rubber hose along `points`, capped flat at both ends: the
    ribs are its radius swelling and shrinking along it. Sampled evenly by
    length, so the ribs are evenly spaced however the path is drawn.
    """
    path = common.catmull_rom(points, samples_per_segment=10)
    lengths = [0.0]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    count = max(2, int(total / (pitch / 3)))
    samples = []
    segment = 0
    for i in range(count + 1):
        d = total * i / count
        while segment < len(path) - 2 and lengths[segment + 1] < d:
            segment += 1
        span = max(1e-9, lengths[segment + 1] - lengths[segment])
        samples.append((path[segment].lerp(path[segment + 1], (d - lengths[segment]) / span), d))

    rings = []
    normal = None
    for i, (p, d) in enumerate(samples):
        tangent = (samples[min(i + 1, len(samples) - 1)][0] - samples[max(i - 1, 0)][0]).normalized()
        if normal is None:
            seed = Vector((1, 0, 0)) if abs(tangent.x) < 0.9 else Vector((0, 1, 0))
            normal = tangent.cross(seed).normalized()
        else:
            normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal)
        r = radius + rib * (0.5 + 0.5 * math.cos(2 * math.pi * d / pitch))
        rings.append([bm.verts.new(p + r * (math.cos(a) * normal + math.sin(a) * binormal))
                      for a in (2 * math.pi * k / sides for k in range(sides))])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))


def build_hoses():
    """
    Three feed hoses from the hub: two torn off and hanging, one that came
    down with whatever was on the end of it and lies coiled on the floor of
    the tank.
    """
    bm = bmesh.new()
    floor = TANK_FLOOR + HOSE_R
    add_hose(bm, [(0.0, 0.0, 1.90), (0.10, 0.03, 1.88), (0.17, 0.06, 1.78), (0.19, 0.08, 1.60),
                  (0.18, 0.10, 1.42), (0.20, 0.09, 1.30)], HOSE_R)
    add_hose(bm, [(0.0, 0.0, 1.91), (-0.10, 0.04, 1.89), (-0.20, 0.08, 1.75), (-0.26, 0.12, 1.45),
                  (-0.27, 0.13, 1.10), (-0.25, 0.10, 0.85)], HOSE_R)
    add_hose(bm, [(0.0, 0.0, 1.89), (0.03, -0.10, 1.86), (0.08, -0.16, 1.70), (0.12, -0.17, 1.30),
                  (0.14, -0.12, 0.85), (0.10, -0.03, 0.60), (0.0, 0.06, floor + 0.01),
                  (-0.12, 0.13, floor), (-0.23, 0.06, floor)], HOSE_R)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_sensor():
    """The rod down the middle of the tank and the cluster of nozzles on its end, after the reference."""
    bm = bmesh.new()
    head_top = 1.52
    add_cylinder(bm, (0, 0, (HUB_BOTTOM + head_top) / 2 + 0.005), 0.014, HUB_BOTTOM - head_top + 0.01, 'Z', 14)
    add_cylinder(bm, (0, 0, head_top - 0.015), 0.045, 0.03, 'Z', 24)
    for k in range(5):
        if k == 0:
            x, y = 0.0, 0.0
        else:
            a = 2 * math.pi * k / 4
            x, y = 0.028 * math.cos(a), 0.028 * math.sin(a)
        add_cylinder(bm, (x, y, head_top - 0.03 - 0.011), 0.007, 0.022, 'Z', 10)
    return bm


# ---------------------------------------------------------------------------
# The glass on the floor
# ---------------------------------------------------------------------------

def shard_outline(rng, size):
    """
    An irregular, sharp-cornered outline round the origin, as (a, b) pairs,
    counter-clockwise. Its corners are spread round the origin with no gap of
    half a turn or more, so the origin is inside it and it can be filled as a
    fan from there.
    """
    count = rng.choice((3, 3, 4, 4, 4, 5))
    while True:
        angles = sorted(rng.uniform(0, 2 * math.pi) for _ in range(count))
        gaps = [(angles[(i + 1) % count] - angles[i]) % (2 * math.pi) for i in range(count)]
        if min(gaps) > 0.6 and max(gaps) < math.pi * 0.95:
            break
    stretch = rng.uniform(1.0, 2.4)
    turn = rng.uniform(0, 2 * math.pi)
    outline = []
    for a in angles:
        r = size * rng.uniform(0.5, 1.0)
        x, y = r * math.cos(a) * stretch, r * math.sin(a)
        outline.append((x * math.cos(turn) - y * math.sin(turn), x * math.sin(turn) + y * math.cos(turn)))
    return outline


def drop_onto(bm, verts, surface):
    """Lowers or raises the given verts so the lowest of them rests on `surface`."""
    lowest = min(v.co.z for v in verts)
    bmesh.ops.translate(bm, verts=verts, vec=(0, 0, surface - lowest + 0.0005))


def add_flat_shard(bm, outline, matrix, surface):
    """A flat piece: the outline as a slab as thick as the glass, faces glass, rim edge."""
    thickness = GLASS_OUTER_R - GLASS_INNER_R
    bottom = [bm.verts.new(matrix @ Vector((a, b, 0.0))) for a, b in outline]
    top = [bm.verts.new(matrix @ Vector((a, b, thickness))) for a, b in outline]
    bm.faces.new(top).material_index = 0
    bm.faces.new(list(reversed(bottom))).material_index = 0
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((bottom[i], bottom[j], top[j], top[i])).material_index = 1
    drop_onto(bm, bottom + top, surface)


def add_curved_shard(bm, outline, matrix, surface):
    """
    A piece of the tube wall itself: the outline wrapped onto the glass, with
    its curve, then laid on the floor by `matrix`. Each outline edge is split
    and the face is filled in rings toward its middle so the curve survives.
    """
    boundary = []
    for i in range(len(outline)):
        a, b = Vector(outline[i]), Vector(outline[(i + 1) % len(outline)])
        for k in range(3):
            boundary.append(a.lerp(b, k / 3))
    rings = (0.34, 0.67, 1.0)
    # Recentred on the piece, so `matrix` turns it about its own middle.
    to_centre = Vector((0.0, GLASS_MID_R, 0.0))
    created = []

    def surface_verts(radius):
        centre = bm.verts.new(matrix @ (wrap(0.0, 0.0, radius) + to_centre))
        layers = [[bm.verts.new(matrix @ (wrap(p.x * t, p.y * t, radius) + to_centre)) for p in boundary]
                  for t in rings]
        created.append(centre)
        created.extend(v for layer in layers for v in layer)
        return centre, layers

    n = len(boundary)
    rims = []
    for radius, facing in ((GLASS_OUTER_R, 1), (GLASS_INNER_R, -1)):
        centre, layers = surface_verts(radius)
        for k in range(n):
            j = (k + 1) % n
            fan = (centre, layers[0][k], layers[0][j])
            bm.faces.new(fan if facing > 0 else tuple(reversed(fan))).material_index = 0
            for inner, outer in zip(layers, layers[1:]):
                quad = (inner[k], outer[k], outer[j], inner[j])
                bm.faces.new(quad if facing > 0 else tuple(reversed(quad))).material_index = 0
        rims.append(layers[-1])
    outer_rim, inner_rim = rims
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((outer_rim[k], inner_rim[k], inner_rim[j], outer_rim[j])).material_index = 1
    # Lying hollow side up it rests on its middle, hollow side down on its rim.
    drop_onto(bm, created, surface)


def build_shards(rng):
    """
    The glass that came out of the hole, scattered in a fan in front of the
    tank: a few curved pieces of the wall and some bigger flat ones close in,
    smaller and smaller pieces further out. Some on the plinth, some on the
    floor of the tank where they fell back in.

    The fan stays inside 75 degrees of the front, and comes in closer at its
    sides, so the glass never runs under the walls of the corner the tank
    stands in (each about a metre away, behind it to either side).
    """
    bm = bmesh.new()
    # (x, y, reach) of everything a shard must not land on: to start with,
    # the bolt heads on the plinth.
    placed = [(PLINTH_BOLT_R * math.cos(a), PLINTH_BOLT_R * math.sin(a), 0.016)
              for a in (math.pi / 8 + k * math.pi / 4 for k in range(8))]
    bolt_count = len(placed)

    def free(x, y, reach):
        return all(math.hypot(x - px, y - py) > reach + pr for px, py, pr in placed)

    def try_place(kind, size, surface, choose_xy, tries=40):
        for _ in range(tries):
            outline = shard_outline(rng, size)
            reach = max(math.hypot(a, b) for a, b in outline)
            x, y = choose_xy(reach)
            if x is None or not free(x, y, reach):
                continue
            yaw = Matrix.Rotation(rng.uniform(0, 2 * math.pi), 4, 'Z')
            if kind == 'curved':
                lay = Matrix.Rotation(-math.pi / 2 if rng.random() < 0.6 else math.pi / 2, 4, 'X')
                add_curved_shard(bm, outline, Matrix.Translation((x, y, 0.0)) @ yaw @ lay, surface)
            else:
                tilt = Matrix.Rotation(rng.uniform(-0.08, 0.08), 4, 'X') @ Matrix.Rotation(rng.uniform(-0.08, 0.08), 4, 'Y')
                add_flat_shard(bm, outline, Matrix.Translation((x, y, 0.0)) @ yaw @ tilt, surface)
            placed.append((x, y, reach))
            return True
        return False

    def front_of(azimuth, distance):
        return distance * math.sin(azimuth), -distance * math.cos(azimuth)

    def on_floor(reach):
        azimuth = math.radians(rng.uniform(-75, 75))
        furthest = 2.0 - 0.6 * (abs(azimuth) / math.radians(75)) ** 2
        nearest = PLINTH_R + 0.03 + reach
        distance = nearest + (furthest - nearest) * rng.random() ** 1.6
        return front_of(azimuth, distance)

    def on_plinth(reach):
        azimuth = math.radians(rng.uniform(-110, 110))
        distance = rng.uniform(HOUSING_R + 0.02 + reach, PLINTH_FLAT - 0.015 - reach)
        if distance < HOUSING_R + 0.02 + reach:
            return None, None
        # Clear of the feet.
        for foot in (-math.pi / 2, 0.0, math.pi / 2):
            if abs(azimuth - foot) * distance < FOOT_HALF_THICKNESS + reach + 0.01:
                return None, None
        return front_of(azimuth, distance)

    def in_tank(reach):
        distance = rng.uniform(0.0, COLLAR_INNER_R - 0.02 - reach)
        azimuth = rng.uniform(-math.pi / 2, math.pi / 2)
        x, y = front_of(azimuth, distance)
        # In the front half, off the drain and the jets; the coiled hose lies behind.
        if y > -0.06 or math.hypot(x, y) < DRAIN_R + reach:
            return None, None
        for k in range(JET_COUNT):
            a = 2 * math.pi * (k + 0.5) / JET_COUNT
            if math.hypot(x - JET_RING_R * math.cos(a), y - JET_RING_R * math.sin(a)) < 0.04 + reach:
                return None, None
        return x, y

    plan = [
        # kind, size, how many, surface, where
        ('curved', 0.16, 3, 0.0, on_floor),
        ('flat', 0.10, 5, 0.0, on_floor),
        ('flat', 0.055, 16, 0.0, on_floor),
        ('flat', 0.028, 40, 0.0, on_floor),
        ('flat', 0.025, 12, PLINTH_H, on_plinth),
        ('curved', 0.10, 1, TANK_FLOOR, in_tank),
        ('flat', 0.045, 3, TANK_FLOOR, in_tank),
        ('flat', 0.02, 6, TANK_FLOOR, in_tank),
    ]
    for kind, size, how_many, surface, where in plan:
        for _ in range(how_many):
            try_place(kind, size * rng.uniform(0.7, 1.3), surface, where)
    print(f'shards placed: {len(placed) - bolt_count}')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build():
    common.clear_scene()
    check_hole()
    rng = random.Random(1983)

    paint = common.make_material('ChamberPaint', PAINT, roughness=0.6, metallic=0.1)
    dark_steel = common.make_material('ChamberDarkSteel', DARK_STEEL, roughness=0.45, metallic=0.6)
    steel = common.make_material('ChamberSteel', STEEL, roughness=0.4, metallic=0.8)
    hazard_light = common.make_material('ChamberHazardLight', HAZARD_LIGHT, roughness=0.6)
    hazard_dark = common.make_material('ChamberHazardDark', HAZARD_DARK, roughness=0.6)
    rubber = common.make_material('ChamberRubber', RUBBER, roughness=0.85)
    fixture = common.make_material('ChamberFixture', FIXTURE, roughness=0.2)
    glass = common.make_material('ChamberGlass', GLASS, roughness=0.05)
    edge = common.make_material('ChamberGlassEdge', GLASS_EDGE, roughness=0.15)
    crack = common.make_material('ChamberGlassCrack', CRACK, roughness=0.3)
    for material, alpha in ((glass, 0.25), (edge, 0.7), (crack, 0.6)):
        material.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = alpha
        material.surface_render_method = 'BLENDED'

    bevel(common.new_object('ChamberPlinth', build_plinth(), steel), 0.012)
    common.new_object('ChamberSteelDetails', build_steel_details(), steel)
    common.new_object('ChamberFixtures', build_fixtures(), fixture)
    smooth_by_angle(common.new_object('ChamberHousing', build_housing(), paint))
    smooth_by_angle(common.new_object('ChamberCollars', build_collars(), dark_steel))
    smooth_by_angle(common.new_object('ChamberCap', build_cap(), dark_steel))
    smooth_by_angle(common.new_object('ChamberNeck', build_neck(), paint))
    bevel(new_multi_material_object('ChamberFeet', build_feet(), [hazard_light, hazard_dark]), 0.008)
    build_broken_glass(glass, edge)
    common.new_object('ChamberGlassCracks', build_cracks(rng), crack)
    smooth_by_angle(common.new_object('ChamberHoses', build_hoses(), rubber), 60)
    smooth_by_angle(common.new_object('ChamberSensor', build_sensor(), steel))
    new_multi_material_object('ChamberShards', build_shards(rng), [glass, edge])

    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            print(f'{obj.name}: {len(obj.data.polygons)} faces')

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'containment_chamber.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
